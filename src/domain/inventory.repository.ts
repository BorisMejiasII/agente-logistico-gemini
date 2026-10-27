import { InventoryRecord, StockQueryResult } from './inventory.types.js';

export class ProductNotFoundError extends Error {
  constructor(public readonly productName: string) {
    super(`El producto '${productName}' no fue encontrado en el catálogo de inventario.`);
    this.name = 'ProductNotFoundError';
  }
}

export class InvalidProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductError';
  }
}

export interface IInventoryRepository {
  consultarStock(producto: string): Promise<StockQueryResult>;
  existsProduct(producto: string): boolean;
  normalizeProductName(producto: string): string;
  getAllProducts?(): InventoryRecord[];
}

/**
 * Normaliza cadenas de texto para búsqueda insensible a acentos, mayúsculas y caracteres especiales.
 */
export function normalizeProductString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[^a-z0-9\s-]/g, '')     // Remueve caracteres no alfanuméricos
    .trim()
    .replace(/\s+/g, ' ');           // Colapsa espacios
}
