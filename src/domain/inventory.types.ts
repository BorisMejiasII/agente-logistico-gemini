/*
 Estados posibles del ciclo de vida de una orden de compra pendiente.
 */
export type PendingOrderState =
  | 'NONE'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED';

/*
 Operación de orden pendiente gestionada por la máquina de estados determinista.
 */
export interface PendingOrder {
  normalizedProduct: string;
  canonicalProductKey: string;
  requiredQuantity: number;
  availableStock: number;
  missingQuantity: number;
  state: PendingOrderState;
  createdAt: Date;
  updatedAt: Date;
}

/*
 Registro de inventario detallado con desglose estricto de estados físicos y trazabilidad.
 */
export interface InventoryRecord {
  productKey: string;
  displayName: string;
  aliases: string[];
  physicalStock: number;
  availableStock: number;
  reservedStock: number;
  dispatchedStock: number;
  defectiveStock: number;
  inRepairStock: number;
  pendingReceiptStock: number;
  isEstimated: boolean;
  requiresSpecialAuth: boolean;
  sourceTrace: string;
  uncertaintyNotes?: string;
}

/*
 Resultado enriquecido de una consulta de stock.
 */
export interface StockQueryResult {
  availableStock: number;
  metadata: {
    productKey: string;
    displayName: string;
    physicalStock: number;
    availableStock: number;
    reservedStock: number;
    dispatchedStock: number;
    defectiveStock: number;
    inRepairStock: number;
    pendingReceiptStock: number;
    isEstimated: boolean;
    requiresSpecialAuth: boolean;
    sourceTrace: string;
    uncertaintyNotes?: string;
    source: 'mock' | 'unstructured';
  };
}

/*
 Resultado estructurado devuelto por la ejecución de herramientas.
 */
export interface ToolExecutionResponse<T = unknown> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
