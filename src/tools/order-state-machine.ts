import { PendingOrder, PendingOrderState } from '../domain/inventory.types.js';
import { normalizeProductString } from '../domain/inventory.repository.js';

export class OrderValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
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
   */
  public registerOrUpdateRequirement(
    product: string,
    requiredQuantity: number,
    availableStock?: number
  ): PendingOrder {
    const normProduct = normalizeProductString(product);
    const avail = availableStock !== undefined ? availableStock : (this.pendingOrder?.availableStock ?? 0);
    const missing = Math.max(0, requiredQuantity - avail);

    const isDifferentProduct = this.pendingOrder && this.pendingOrder.normalizedProduct !== normProduct;
    const isDifferentQuantity = this.pendingOrder && this.pendingOrder.requiredQuantity !== requiredQuantity;

    // Si cambia el producto o la cantidad, o si no existía orden, se exige nueva confirmación
    const newState: PendingOrderState = missing > 0 ? 'AWAITING_CONFIRMATION' : 'NONE';

    this.pendingOrder = {
      normalizedProduct: normProduct,
      requiredQuantity,
      availableStock: avail,
      missingQuantity: missing,
      state: (isDifferentProduct || isDifferentQuantity) ? newState : (this.pendingOrder?.state ?? newState),
      createdAt: this.pendingOrder?.createdAt ?? new Date(),
      updatedAt: new Date()
    };

    return { ...this.pendingOrder };
  }

  /**
   * Actualiza el stock disponible conocido de la operación pendiente actual.
   */
  public updateAvailableStock(product: string, availableStock: number): PendingOrder | null {
    const normProduct = normalizeProductString(product);
    if (!this.pendingOrder) {
      return null;
    }

    if (this.pendingOrder.normalizedProduct === normProduct ||
        this.pendingOrder.normalizedProduct.includes(normProduct) ||
        normProduct.includes(this.pendingOrder.normalizedProduct)) {
      this.pendingOrder.availableStock = availableStock;
      this.pendingOrder.missingQuantity = Math.max(0, this.pendingOrder.requiredQuantity - availableStock);
      this.pendingOrder.state = this.pendingOrder.missingQuantity > 0 ? 'AWAITING_CONFIRMATION' : 'NONE';
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

    // 1. Detección de preguntas: signos de interrogación o pronombres interrogativos
    const hasQuestionMark = /[?¿]/.test(raw);
    const questionWords = /\b(cuanto|cuantos|cuanta|cuantas|cuando|donde|por que|precio|costo|tardan|demoran|que pasa|como|quien)\b/i;
    const hasQuestion = hasQuestionMark || questionWords.test(normalized);

    // 2. Detección de ambigüedad o duda
    // Ej: "tal vez", "quizás", "déjame ver", "creo que sí pero no estoy seguro", "lo voy a pensar"
    const ambiguityPattern = /\b(tal vez|quizas|quizás|dejame ver|d[eé]jame ver|dejame pensar|d[eé]jame pensar|creo que|no estoy seguro|no estoy segura|lo voy a pensar|lo pensar[eé]|a lo mejor|puede ser|no s[eé]|no se|depende|probablemente|en duda)\b/i;
    const isAmbiguous = ambiguityPattern.test(cleanLower);

    // 3. Detección de cancelación o rechazo
    // Ej: "no", "cancela", "cancelar", "mejor no", "olvídalo", "abortar", "no quiero", "no compres"
    // Cuidado: Si el usuario dice "no estoy seguro", eso es ambigüedad, NO cancelación
    const pureCancelKeywords = /\b(cancelar?|cancela|cancelalo|abortar?|olvidalo|olv[ií]dalo|deten|detente|mejor no|desiste|rechaza|no compres|no emitas|no hacer la orden|no la hagas)\b/i;
    const directNegative = /^(no|nop|noup|no gracias|no por favor|para nada)([.!,]|$)/i.test(cleanLower) ||
      /\b(no quiero|no autorizo|no procedas)\b/i.test(cleanLower);
    
    // Si contiene duda ("no estoy seguro"), no es cancelación
    const isCancellation = (pureCancelKeywords.test(cleanLower) || directNegative) && !isAmbiguous;

    // 4. Detección de condicionalidad
    // Ej: "sí, pero solo si llegan mañana", "siempre y cuando", "a condición de"
    const conditionalPattern = /\b(pero solo si|pero si|solo si|siempre y cuando|a condicion de|a condici[oó]n de|siempre que|con la condicion|con la condici[oó]n|a menos que)\b/i;
    const isConditional = conditionalPattern.test(cleanLower);

    // 5. Detección de confirmación inequívoca
    // Frases explícitas afirmativas de autorización
    const explicitAffirmatives = [
      'procede', 'proceder', 'adelante', 'hazlo', 'emite la orden', 'emitir orden',
      'confirmo', 'confirmado', 'autorizo', 'autorizado', 'de acuerdo', 'dale',
      'procede con la compra', 'procede a comprar', 'haz la compra', 'compra los faltantes',
      'compra las unidades', 'compralas', 'compralos', 'aprobado', 'afirmativo',
      'por favor', 'si por favor', 'si procede', 'si adelante', 'si autorizo',
      'si compra', 'si emite', 'si de acuerdo', 'si confirmado', 'está bien', 'esta bien'
    ];

    const containsExplicitAffirmative = explicitAffirmatives.some(phrase => {
      const normPhrase = normalizeProductString(phrase);
      return normalized.includes(normPhrase);
    });

    // También considerar respuestas directas cortas afirmativas inequívocas (ej. "sí", "si", "claro", "por supuesto")
    // ÚNICAMENTE cuando NO están contaminadas por preguntas, ambigüedades, condiciones o negaciones
    const isShortAffirmative = /^(s[ií]|claro|por supuesto|ok|dale|adelante|afirmativo|procede|de acuerdo)(\s+por\s+favor)?$/i.test(raw.replace(/[.,!]/g, '').trim());

    // La confirmación es inequívoca SOLO si:
    // - Hay afirmación explícita o respuesta directa
    // - NO hay cancelación
    // - NO hay ambigüedad
    // - NO hay condicionalidad
    // - NO hay nuevas preguntas
    const isUnequivocalConfirmation =
      (containsExplicitAffirmative || isShortAffirmative) &&
      !isCancellation &&
      !isAmbiguous &&
      !isConditional &&
      !hasQuestion;

    let reason = 'Mensaje procesado.';
    if (isCancellation) {
      reason = 'El usuario indicó cancelación o negación.';
    } else if (hasQuestion) {
      reason = 'El mensaje contiene una pregunta o duda sobre costo/tiempo; requiere respuesta previa antes de autorizar.';
    } else if (isConditional) {
      reason = 'El usuario estableció una condición previa a la compra; no es autorización inequívoca.';
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

    // Reglas de transición deterministas
    if (analysis.isCancellation) {
      this.pendingOrder.state = 'CANCELLED';
      this.pendingOrder.updatedAt = new Date();
    } else if (this.pendingOrder.state === 'AWAITING_CONFIRMATION') {
      if (analysis.isUnequivocalConfirmation) {
        this.pendingOrder.state = 'CONFIRMED';
        this.pendingOrder.updatedAt = new Date();
      } else {
        // Si hay ambigüedad, condiciones o preguntas, permanece en AWAITING_CONFIRMATION
        this.pendingOrder.state = 'AWAITING_CONFIRMATION';
      }
    }
  }

  /**
   * Intenta extraer una necesidad declarada por el usuario en lenguaje natural
   * (ej. "Necesitamos equipar a 10 nuevos empleados con laptops ThinkPad").
   */
  public extractRequirementFromText(text: string): { product?: string; quantity?: number } | null {
    // Buscar patrones numéricos asociados a productos o personas
    const qtyRegex = /(?:necesitamos|requerimos|equipar\s+a|para|comprar|pedir|solicitar)?\s*(\d+)\s*(?:nuevos?\s+empleados?\s+(?:con|de)|unidades?\s+de|equipos?\s+de|laptops?|notebooks?|monitores?|mouses?|teclados?)/i;
    const match = text.match(qtyRegex);
    let quantity: number | undefined;

    if (match && match[1]) {
      quantity = parseInt(match[1], 10);
    } else {
      // Buscar simplemente cualquier entero positivo en el mensaje si viene de una frase de solicitud
      const simpleNum = text.match(/\b(\d+)\b/);
      if (simpleNum && simpleNum[1]) {
        quantity = parseInt(simpleNum[1], 10);
      }
    }

    return quantity && Number.isInteger(quantity) && quantity > 0 ? { quantity } : null;
  }

  /**
   * Valida estrictamente si `emitir_orden_compra` puede ejecutarse según las 6 reglas obligatorias.
   */
  public validateAndExecuteOrder(product: string, quantity: number): { success: true; pendingOrder: PendingOrder } {
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

    // Regla 3: El producto solicitado coincida exactamente (tras normalización) con normalizedProduct
    const normProduct = normalizeProductString(product);
    const matchesProduct =
      normProduct === this.pendingOrder.normalizedProduct ||
      this.pendingOrder.normalizedProduct.includes(normProduct) ||
      normProduct.includes(this.pendingOrder.normalizedProduct);

    if (!matchesProduct) {
      throw new OrderValidationError(
        'PRODUCT_MISMATCH',
        `El producto solicitado para la orden ('${product}') no coincide con la solicitud pendiente ('${this.pendingOrder.normalizedProduct}').`
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
