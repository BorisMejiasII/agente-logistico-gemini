import { PendingOrder, PendingOrderState } from '../domain/inventory.types.js';
import { normalizeProductString } from '../domain/inventory.repository.js';

export class OrderValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'OrderValidationError';
  }
}

export interface UserConfirmationAnalysis {
  isCancellation: boolean;
  isAmbiguous: boolean;
  isConditional: boolean;
  hasQuestion: boolean;
  isUnequivocalConfirmation: boolean;
  reason: string;
}

export class OrderStateMachine {
  private pendingOrder: PendingOrder | null = null;
  private lastAnalysis: UserConfirmationAnalysis | null = null;
  private lastProcessedMessage: string = '';

  public getPendingOrder(): PendingOrder | null {
    return this.pendingOrder ? { ...this.pendingOrder } : null;
  }

  public getLastAnalysis(): UserConfirmationAnalysis | null {
    return this.lastAnalysis ? { ...this.lastAnalysis } : null;
  }

  /**
   * Registra o actualiza una operación pendiente al consultar stock o declarar una necesidad.
   * Regla de seguridad: Cualquier cambio en producto, cantidad o stock invalida cualquier
   * confirmación anterior y exige una nueva confirmación expresa.
   */
  public registerOrUpdateRequirement(
    product: string,
    requiredQuantity: number,
    canonicalProductKeyOrStock?: string | number,
    availableStock?: number
  ): PendingOrder {
    const normProduct = normalizeProductString(product);
    let canonicalKey: string;
    let availStock: number;

    if (typeof canonicalProductKeyOrStock === 'number') {
      availStock = canonicalProductKeyOrStock;
      canonicalKey = normProduct;
    } else {
      canonicalKey = canonicalProductKeyOrStock || normProduct;
      availStock = availableStock !== undefined ? availableStock : 0;
    }

    // Si es el mismo producto canónico y no se especificó nuevo stock, conservar stock previo
    if (this.pendingOrder && this.pendingOrder.canonicalProductKey === canonicalKey && availableStock === undefined && typeof canonicalProductKeyOrStock !== 'number') {
      availStock = this.pendingOrder.availableStock;
    }

    const missing = Math.max(0, requiredQuantity - availStock);

    // Cualquier registro nuevo o modificación invalida autorizaciones pasadas y pasa a AWAITING_CONFIRMATION
    const newState: PendingOrderState = missing > 0 ? 'AWAITING_CONFIRMATION' : 'NONE';

    this.pendingOrder = {
      normalizedProduct: normProduct,
      canonicalProductKey: canonicalKey,
      requiredQuantity,
      availableStock: availStock,
      missingQuantity: missing,
      state: newState,
      createdAt: this.pendingOrder?.createdAt ?? new Date(),
      updatedAt: new Date()
    };

    return { ...this.pendingOrder };
  }

  /**
   * Actualiza el stock disponible conocido de la operación pendiente actual.
   * Utiliza la clave canónica del producto para evitar cruces indebidos de existencias.
   */
  public updateAvailableStock(
    product: string,
    availableStock: number,
    canonicalProductKey?: string
  ): PendingOrder | null {
    if (!this.pendingOrder) {
      return null;
    }

    const normProduct = normalizeProductString(product);
    const resolvedCanonical = canonicalProductKey || normProduct;

    // Solo actualizar si coincide exactamente con la clave canónica del producto pendiente
    if (this.pendingOrder.canonicalProductKey === resolvedCanonical) {
      const stockChanged = this.pendingOrder.availableStock !== availableStock;
      this.pendingOrder.availableStock = availableStock;
      this.pendingOrder.missingQuantity = Math.max(0, this.pendingOrder.requiredQuantity - availableStock);

      // Si el stock cambió o si hay faltante, invalidar autorizaciones previas
      if (stockChanged || this.pendingOrder.state === 'CONFIRMED') {
        this.pendingOrder.state = this.pendingOrder.missingQuantity > 0 ? 'AWAITING_CONFIRMATION' : 'NONE';
      }

      this.pendingOrder.updatedAt = new Date();
      return { ...this.pendingOrder };
    }

    return null;
  }

  /**
   * Analiza el mensaje del usuario con reglas léxicas deterministas para detectar confirmación,
   * ambigüedad, condicionalidad, preguntas o cancelación.
   */
  public analyzeUserMessage(message: string): UserConfirmationAnalysis {
    const raw = message.trim();
    const cleanLower = raw.toLowerCase();
    const normalized = normalizeProductString(raw);

    // 1. Detección de preguntas, consultas o solicitudes de información
    const hasQuestionMark = /[?¿]/.test(raw);
    const questionWords = /\b(cuanto|cuantos|cuanta|cuantas|cuando|donde|por que|precio|costo|tardan|demoran|que pasa|como|quien|podrias|podr[ií]as|puedes)\b/i;
    // Solicitudes informativas que jamás deben considerarse confirmaciones (ej. "Muéstrame el inventario, por favor")
    const infoRequestWords = /\b(muestrame|mu[eé]strame|muestra|dime|revisa|revisar|ver|consulta|consultar|inventario|catalogo|stock)\b/i;
    const isInfoRequest = infoRequestWords.test(normalized) && !/\b(compra|comprar|orden|pedido)\b/i.test(normalized);
    const hasQuestion = hasQuestionMark || questionWords.test(normalized) || isInfoRequest;

    // 2. Detección de ambigüedad o duda
    // Ej: "tal vez", "quizás", "déjame ver", "creo que sí pero no estoy seguro", "lo voy a pensar"
    const ambiguityPattern = /\b(tal vez|quizas|quizás|dejame ver|d[eé]jame ver|dejame pensar|d[eé]jame pensar|creo que|no estoy seguro|no estoy segura|lo voy a pensar|lo pensar[eé]|a lo mejor|puede ser|no s[eé]|no se|depende|probablemente|en duda)\b/i;
    const isAmbiguous = ambiguityPattern.test(cleanLower);

    // 3. Detección de condicionalidad o prerrequisitos
    // Ej: "sí, pero solo si llegan mañana", "sí, pero antes dime el precio", "siempre y cuando"
    const conditionalPattern = /\b(pero solo si|pero si|solo si|siempre y cuando|a condicion de|a condici[oó]n de|siempre que|con la condicion|con la condici[oó]n|a menos que|pero antes|antes dime|antes de)\b/i;
    const isConditional = conditionalPattern.test(cleanLower);

    // 4. Detección de cancelación, rechazo o postergación
    // Ej: "no", "cancela", "cancelar", "mejor no", "olvídalo", "no todavía no compres", "todavía no"
    const pureCancelKeywords = /\b(cancelar?|cancela|cancelalo|abortar?|olvidalo|olv[ií]dalo|deten|detente|mejor no|desiste|rechaza|no compres|no emitas|no hacer la orden|no la hagas|todavia no|todav[ií]a no|aun no|a[uú]n no|espera|esperate)\b/i;
    const directNegative = /^(no|nop|noup)([.!,]|$)/i.test(cleanLower) ||
      /\b(no quiero|no autorizo|no procedas|no gracias|no por favor|para nada)\b/i.test(cleanLower);

    // Si contiene duda ("no estoy seguro"), no es cancelación definitiva
    const isCancellation = (pureCancelKeywords.test(cleanLower) || directNegative) && !isAmbiguous;

    // 5. Detección de confirmación explícita e inequívoca
    // Exige frases explícitas de autorización para la compra/orden (NO frases sueltas como "por favor")
    const explicitPurchasePhrases = [
      'confirmo la compra',
      'confirmo el pedido',
      'autorizo la compra',
      'autorizo el pedido',
      'procede con la compra',
      'procede a comprar',
      'emite la orden',
      'emitir la orden',
      'emite la orden de compra',
      'haz la compra',
      'proceder con la compra',
      'compra los faltantes',
      'comprar los faltantes',
      'compra las unidades',
      'comprar las unidades',
      'compralas',
      'compralos'
    ];

    const hasExplicitPurchasePhrase = explicitPurchasePhrases.some(phrase => {
      const normPhrase = normalizeProductString(phrase);
      return normalized.includes(normPhrase);
    });

    // Frases del tipo "Confirmo la compra de las 6 laptops faltantes", "Autorizo la compra", "Adelante con la orden", "De acuerdo, emite la orden"
    const hasAuthorizationPattern =
      /\b(confirmo|confirmado|autorizo|autorizado|aprobado|adelante|procede|dale|hazlo)\b/i.test(normalized) &&
      /\b(compra|comprar|orden|pedido|faltante|faltantes|unidades|laptops|equipos)\b/i.test(normalized);

    // Respuestas directas inequívocas y limpias al ser preguntado por confirmación
    const isCleanDirectDirective = /^(s[ií]|adelante|procede|hazlo|dale)(\s*,\s*(procede|adelante|hazlo|dale|emite la orden|por favor))?\.?$/i.test(raw);

    // Política estrictamente conservadora:
    // La confirmación SOLO es válida si hay autorización explícita Y NO existe ninguna ambigüedad,
    // pregunta, condición o cancelación.
    const isUnequivocalConfirmation =
      (hasExplicitPurchasePhrase || hasAuthorizationPattern || isCleanDirectDirective) &&
      !isCancellation &&
      !isAmbiguous &&
      !isConditional &&
      !hasQuestion;

    let reason = 'Mensaje procesado.';
    if (isCancellation) {
      reason = 'El usuario indicó cancelación, rechazo o postergación.';
    } else if (hasQuestion) {
      reason = 'El mensaje contiene una pregunta, consulta o solicitud informativa; requiere atención antes de autorizar.';
    } else if (isConditional) {
      reason = 'El usuario estableció una condición o prerrequisito previo a la compra; no es autorización inequívoca.';
    } else if (isAmbiguous) {
      reason = 'El usuario respondió con ambigüedad o duda; no constituye confirmación suficiente.';
    } else if (isUnequivocalConfirmation) {
      reason = 'El usuario confirmó inequívocamente la operación de compra.';
    } else {
      reason = 'El mensaje no contiene una confirmación inequívoca para emitir la orden.';
    }

    return {
      isCancellation,
      isAmbiguous,
      isConditional,
      hasQuestion,
      isUnequivocalConfirmation,
      reason
    };
  }

  /**
   * Procesa el mensaje del usuario en el turno actual para actualizar el estado determinista.
   */
  public processUserMessage(message: string): void {
    this.lastProcessedMessage = message;
    const analysis = this.analyzeUserMessage(message);
    this.lastAnalysis = analysis;

    if (!this.pendingOrder) {
      return;
    }

    if (analysis.isCancellation) {
      this.pendingOrder.state = 'CANCELLED';
      this.pendingOrder.updatedAt = new Date();
    } else if (this.pendingOrder.state === 'AWAITING_CONFIRMATION') {
      if (analysis.isUnequivocalConfirmation) {
        this.pendingOrder.state = 'CONFIRMED';
        this.pendingOrder.updatedAt = new Date();
      } else {
        // Ante cualquier ambigüedad, condiciones o preguntas, permanece en AWAIING_CONFIRMATION
        this.pendingOrder.state = 'AWAITING_CONFIRMATION';
      }
    }
  }

  /**
   * Extrae la necesidad de cantidad declarada por el usuario en lenguaje natural.
   * Evita confundir especificaciones del producto (ej. 27 pulgadas, 48 puertos, Cat6, etc.) con cantidades.
   */
  public extractRequirementFromText(text: string): { quantity?: number } | null {
    const clean = text.trim();

    // 1. Filtrar o descartar falsos positivos de especificaciones técnicas:
    // "27 pulgadas", "27"", "48 puertos", "24 puertos", "1000 metros", "cat6", "1tb", "office 2021", etc.
    // Solo extraemos si el número está asociado a una expresión explícita de requerimiento de dotación/compra:

    // Patrón A: "necesitamos / requerimos / hacen falta / equipar a X personas/empleados/laptops/..."
    const requirementPattern = /(?:necesitamos|requerimos|precisamos|hacen\s+falta|solicitamos|para\s+equipar\s+a|equipar\s+a)\s+(\d+)\s*(?:nuevos?\s+empleados?|empleados?|personas?|usuarios?|trabajadores?|colaboradores?|unidades?|equipos?|laptops?|notebooks?|monitores?|mouses?|teclados?|sillas?|headsets?)?/i;
    const matchA = clean.match(requirementPattern);
    if (matchA && matchA[1]) {
      const q = parseInt(matchA[1], 10);
      if (Number.isInteger(q) && q > 0) {
        return { quantity: q };
      }
    }

    // Patrón B: "comprar / pedir / solicitar X unidades / equipos de ..."
    const buyPattern = /(?:comprar|pedir|solicitar|adquirir|ordenar)\s+(\d+)\s*(?:unidades?|equipos?|piezas?|laptops?|notebooks?|monitores?|mouses?|teclados?|sillas?|headsets?)/i;
    const matchB = clean.match(buyPattern);
    if (matchB && matchB[1]) {
      const q = parseInt(matchB[1], 10);
      if (Number.isInteger(q) && q > 0) {
        return { quantity: q };
      }
    }

    // Patrón C: "X unidades de ..." o "X equipos de ..." explícitos
    const explicitUnitPattern = /\b(\d+)\s+(?:unidades|equipos)\s+(?:de\s+)?(?:laptops?|notebooks?|monitores?|mouses?|teclados?|sillas?|headsets?)/i;
    const matchC = clean.match(explicitUnitPattern);
    if (matchC && matchC[1]) {
      const q = parseInt(matchC[1], 10);
      if (Number.isInteger(q) && q > 0) {
        return { quantity: q };
      }
    }

    // No se realiza extracción numérica genérica para evitar alucinaciones con características del producto
    return null;
  }

  /*
   Valida estrictamente si `emitir_orden_compra` puede ejecutarse según las 6 reglas obligatorias.
   */
  public validateAndExecuteOrder(
    product: string,
    quantity: number,
    canonicalProductKey?: string
  ): { success: true; pendingOrder: PendingOrder } {
    if (!this.pendingOrder) {
      throw new OrderValidationError(
        'NO_PENDING_ORDER',
        'No existe ninguna operación de compra pendiente de autorización.'
      );
    }

    // Regla 5: La operación no haya sido cancelada ni completada anteriormente
    if (this.pendingOrder.state === 'CANCELLED') {
      throw new OrderValidationError(
        'ORDER_CANCELLED',
        'La orden de compra fue cancelada por el usuario y no puede emitirse.'
      );
    }

    if (this.pendingOrder.state === 'COMPLETED') {
      throw new OrderValidationError(
        'ALREADY_COMPLETED',
        'Esta orden de compra ya fue emitida y completada anteriormente. No se permiten órdenes duplicadas.'
      );
    }

    // Regla 1 y 2: Debe haber pasado a CONFIRMED gracias a una confirmación inequívoca en el turno actual
    if (this.pendingOrder.state !== 'CONFIRMED') {
      const reason = this.lastAnalysis?.reason ?? 'No se ha recibido confirmación explícita del usuario.';
      throw new OrderValidationError(
        'NOT_CONFIRMED',
        `No se puede emitir la orden de compra: la operación está en estado '${this.pendingOrder.state}'. Razón: ${reason}`
      );
    }

    // Regla 3: Identidad estricta del producto mediante clave canónica controlada
    const normProduct = normalizeProductString(product);
    const resolvedCanonical = canonicalProductKey || normProduct;

    const matchesCanonical = resolvedCanonical === this.pendingOrder.canonicalProductKey;
    const matchesNormalized = normProduct === this.pendingOrder.normalizedProduct;

    if (!matchesCanonical && !matchesNormalized) {
      throw new OrderValidationError(
        'PRODUCT_MISMATCH',
        `El producto solicitado para la orden ('${product}' [${resolvedCanonical}]) no coincide exactamente con el producto autorizado ('${this.pendingOrder.normalizedProduct}' [${this.pendingOrder.canonicalProductKey}]).`
      );
    }

    // Regla 4: La cantidad sea un entero positivo y coincida exactamente con missingQuantity
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new OrderValidationError(
        'INVALID_QUANTITY',
        `La cantidad debe ser un entero positivo mayor a cero (recibido: ${quantity}).`
      );
    }

    if (quantity !== this.pendingOrder.missingQuantity) {
      throw new OrderValidationError(
        'QUANTITY_MISMATCH',
        `La cantidad solicitada (${quantity}) no coincide exactamente con el faltante calculado (${this.pendingOrder.missingQuantity}). Requeridos: ${this.pendingOrder.requiredQuantity}, Disponibles: ${this.pendingOrder.availableStock}.`
      );
    }

    // Regla 6: Consumir la autorización y pasar a COMPLETED
    this.pendingOrder.state = 'COMPLETED';
    this.pendingOrder.updatedAt = new Date();

    return {
      success: true,
      pendingOrder: { ...this.pendingOrder }
    };
  }

  public reset(): void {
    this.pendingOrder = null;
    this.lastAnalysis = null;
    this.lastProcessedMessage = '';
  }
}
