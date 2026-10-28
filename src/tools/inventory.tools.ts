import { IInventoryRepository, ProductNotFoundError, normalizeProductString } from '../domain/inventory.repository.js';
import { OrderStateMachine, OrderValidationError } from './order-state-machine.js';
import { StockQueryResult } from '../domain/inventory.types.js';

const META_CATALOG_KEYWORDS = [
  'catalogo',
  'catalogos',
  'el catalogo',
  'catalogo general',
  'catalogo completo',
  'todo el catalogo',
  'todos los productos',
  'todos los productos del inventario',
  'inventario',
  'el inventario',
  'inventario general',
  'inventario completo',
  'todo el inventario',
  'productos disponibles',
  'lista de productos',
  'listado de productos',
  'todos'
];

function isCatalogOrMetaQuery(str: string): boolean {
  const norm = normalizeProductString(str);
  return META_CATALOG_KEYWORDS.some(k => norm === k || norm === normalizeProductString(k));
}

const AMBIGUOUS_CATEGORIES: Record<string, string[]> = {
  'servidor': ['Servidor Dell R740', 'Servidor HP ProLiant'],
  'servidores': ['Servidor Dell R740', 'Servidor HP ProLiant'],
  'switch': ['Switch Cisco 48p', 'Switch Ubiquiti 24p'],
  'switches': ['Switch Cisco 48p', 'Switch Ubiquiti 24p'],
  'telefono': ['iPhone 15', 'Samsung Galaxy S24'],
  'telefonos': ['iPhone 15', 'Samsung Galaxy S24'],
  'celular': ['iPhone 15', 'Samsung Galaxy S24'],
  'celulares': ['iPhone 15', 'Samsung Galaxy S24'],
  'licencia': ['Licencias físicas Windows Server 2022', 'Licencias físicas Office 2021'],
  'licencias': ['Licencias físicas Windows Server 2022', 'Licencias físicas Office 2021']
};

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  rawOutput: number | string | null;
  payload: Record<string, unknown>;
}

export class InventoryToolsExecutor {
  constructor(
    private readonly repository: IInventoryRepository,
    private readonly stateMachine: OrderStateMachine
  ) {}

  /**
   * Firma exacta exigida en el PDF:
   * consultar_stock(producto: string): number
   * Devuelve un entero con el stock disponible para asignación.
   */
  public async consultar_stock(producto: string): Promise<{ stock: number; queryResult: StockQueryResult }> {
    const queryResult = await this.repository.consultarStock(producto);
    const stock = queryResult.availableStock;
    const canonicalKey = this.repository.getCanonicalProductKey(producto) ?? queryResult.metadata.productKey;

    this.stateMachine.updateAvailableStock(producto, stock, canonicalKey);

    return { stock, queryResult };
  }

  /**
   * Firma exacta exigida en el PDF:
   * emitir_orden_compra(producto: string, cantidad: number): string
   * Imprime en consola un log del sistema confirmando la compra y retorna un string de status OK al agente.
   */
  public emitir_orden_compra(producto: string, cantidad: number): string {
    const canonicalKey = this.repository.getCanonicalProductKey(producto) ?? undefined;
    // Valida con la máquina de estados determinista y clave canónica
    const { pendingOrder } = this.stateMachine.validateAndExecuteOrder(producto, cantidad, canonicalKey);

    const logMessage = `[SISTEMA - LOGÍSTICA] ORDEN DE COMPRA EMITIDA CON ÉXITO: ` +
      `${cantidad} unidad(es) de '${producto}'. ` +
      `Stock previo disponible: ${pendingOrder.availableStock}, ` +
      `Total requerido: ${pendingOrder.requiredQuantity}. Fecha: ${new Date().toISOString()}`;

    console.log(`\n\x1b[32m${logMessage}\x1b[0m\n`);

    return `STATUS_OK: Orden de compra emitida satisfactoriamente por ${cantidad} unidades de ${producto}.`;
  }

  /*
   Valida estrictamente y ejecuta cualquier llamada a herramienta proveniente del LLM.
   */
  public async executeToolCall(
    callName: string,
    rawArgs: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (callName !== 'consultar_stock' && callName !== 'emitir_orden_compra') {
      return {
        toolName: callName,
        success: false,
        rawOutput: null,
        payload: {
          error: `Herramienta desconocida: '${callName}'. Solo se permiten 'consultar_stock' y 'emitir_orden_compra'.`,
          allowedTools: ['consultar_stock', 'emitir_orden_compra']
        }
      };
    }

    try {
      if (callName === 'consultar_stock') {
        const allowedKeys = ['producto'];
        const extraKeys = Object.keys(rawArgs).filter(k => !allowedKeys.includes(k));
        if (extraKeys.length > 0) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `Argumentos no permitidos o alucinados detectados: ${extraKeys.join(', ')}. Solo se acepta 'producto'.`
            }
          };
        }

        const producto = rawArgs.producto;
        if (typeof producto !== 'string' || producto.trim().length === 0) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `El argumento 'producto' debe ser una cadena de texto no vacía.`
            }
          };
        }

        const trimmed = producto.trim();

        // 1. Detección determinista de consultas generales de catálogo (no representan productos individuales)
        if (isCatalogOrMetaQuery(trimmed)) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `No existe un producto denominado '${trimmed}'. La herramienta 'consultar_stock' debe invocarse para productos físicos específicos, no para consultas generales de catálogo.`,
              errorCode: 'CATALOG_QUERY_NOT_A_PRODUCT',
              instruccionParaAgente: `Explica al usuario que no existe una función para listar todo el inventario de una sola vez, pero que puedes consultar productos específicos si te indica cuál necesita (por ejemplo: Laptops ThinkPad, Monitores Dell 27", Mouses Logitech, Teclados mecánicos, Servidores Dell R740 o HP ProLiant, Licencias Windows Server 2022 u Office 2021).`
            }
          };
        }

        // 2. Detección determinista de categorías ambiguas con múltiples modelos en bodega
        const norm = normalizeProductString(trimmed);
        if (AMBIGUOUS_CATEGORIES[norm]) {
          const options = AMBIGUOUS_CATEGORIES[norm];
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `El término '${trimmed}' es ambiguo porque en bodega existen múltiples modelos: ${options.join(' y ')}.`,
              errorCode: 'AMBIGUOUS_PRODUCT',
              opcionesDisponibles: options,
              instruccionParaAgente: `No asumas un modelo por tu cuenta. Pregunta al usuario cuál modelo específico necesita aclarando: "¿Te refieres a ${options.join(' o a ')}?".`
            }
          };
        }

        const { stock, queryResult } = await this.consultar_stock(trimmed);

        return {
          toolName: callName,
          success: true,
          rawOutput: stock,
          payload: {
            stockDisponible: stock,
            productoConsultado: producto,
            metadatos: queryResult.metadata,
            instruccionParaAgente:
              stock === 0
                ? `No hay stock disponible para asignación inmediata. Si el usuario requiere unidades, calcula el faltante y solicita su confirmación inequívoca para emitir la orden de compra.`
                : `Hay ${stock} unidades disponibles para asignación inmediata. Compara con la necesidad del usuario para determinar si existe faltante.`
          }
        };
      }

      if (callName === 'emitir_orden_compra') {
        const allowedKeys = ['producto', 'cantidad'];
        const extraKeys = Object.keys(rawArgs).filter(k => !allowedKeys.includes(k));
        if (extraKeys.length > 0) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `Argumentos no permitidos o alucinados detectados: ${extraKeys.join(', ')}. Solo se aceptan 'producto' y 'cantidad'.`
            }
          };
        }

        const producto = rawArgs.producto;
        if (typeof producto !== 'string' || producto.trim().length === 0) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `El argumento 'producto' debe ser una cadena de texto no vacía.`
            }
          };
        }

        const cantidad = rawArgs.cantidad;
        if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
          return {
            toolName: callName,
            success: false,
            rawOutput: null,
            payload: {
              error: `El argumento 'cantidad' debe ser un número entero positivo mayor a cero (recibido: ${JSON.stringify(cantidad)}).`
            }
          };
        }

        const statusOk = this.emitir_orden_compra(producto.trim(), cantidad);

        return {
          toolName: callName,
          success: true,
          rawOutput: statusOk,
          payload: {
            status: statusOk,
            producto,
            cantidadComprada: cantidad,
            mensaje: `La orden de compra ha sido emitida y registrada en el sistema logístico.`
          }
        };
      }

      throw new Error(`Inalcanzable`);
    } catch (error: unknown) {
      if (error instanceof ProductNotFoundError) {
        return {
          toolName: callName,
          success: false,
          rawOutput: null,
          payload: {
            error: error.message,
            errorCode: 'PRODUCT_NOT_FOUND',
            instruccionParaAgente: `Informa al usuario que el producto no existe en el catálogo de inventario ni en los registros. No inventes existencias ni permitas órdenes de compra sobre él.`
          }
        };
      }

      if (error instanceof OrderValidationError) {
        return {
          toolName: callName,
          success: false,
          rawOutput: null,
          payload: {
            error: error.message,
            errorCode: error.code,
            instruccionParaAgente: `No se pudo emitir la orden de compra debido a reglas de negocio y seguridad: ${error.message}. Explica la situación claramente al usuario y no finjas que la compra se realizó.`
          }
        };
      }

      const unexpected = error instanceof Error ? error.message : String(error);
      return {
        toolName: callName,
        success: false,
        rawOutput: null,
        payload: {
          error: `Error interno durante la ejecución de la herramienta: ${unexpected}`,
          errorCode: 'INTERNAL_TOOL_ERROR'
        }
      };
    }
  }
}
