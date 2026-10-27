import { IInventoryRepository, ProductNotFoundError, normalizeProductString } from './inventory.repository.js';
import { StockQueryResult } from './inventory.types.js';

/**
 * Repositorio de inventario Mock que simula el escenario del PDF:
 * Devuelve un stock aleatorio entre 1 y 5 memorizado por producto en la sesión
 * para asegurar la consistencia durante el cálculo del faltante y la orden de compra.
 */
export class MockInventoryRepository implements IInventoryRepository {
  private readonly sessionStockCache = new Map<string, number>();

  // Lista canónica de categorías y palabras clave válidas del dominio logístico IT / Oficina
  private readonly validCatalogKeywords = [
    'laptop', 'thinkpad', 'notebook', 'computador',
    'mouse', 'raton', 'logitech',
    'monitor', 'dell', 'pantalla',
    'teclado', 'keyclickers',
    'cable', 'hdmi', 'cat6', 'red', 'rj45',
    'silla', 'ergonomica', 'mueblescorp',
    'headset', 'jabra', 'auricular', 'audifono',
    'docking', 'lenovo',
    'proyector', 'epson',
    'cafe', 'nespresso', 'cafetera',
    'tinta', 'cartucho', 'cyan', 'magenta', 'amarillo', 'negro',
    'disco', 'ssd', 'kingston', 'almacenamiento',
    'adaptador', 'usb-c', 'usbc',
    'escritorio', 'standing desk',
    'iphone', 'galaxy', 'telefono', 'smartphone',
    'polera', 'taza', 'cuaderno', 'mochila', 'merchandising',
    'webcam', 'camara',
    'licencia', 'windows', 'office',
    'switch', 'cisco', 'ubiquiti',
    'servidor', 'dell r740', 'hp proliant',
    'router', 'mikrotik'
  ];

  public normalizeProductName(producto: string): string {
    return normalizeProductString(producto);
  }

  public existsProduct(producto: string): boolean {
    const normalized = this.normalizeProductName(producto);
    if (!normalized || normalized.length < 2) {
      return false;
    }
    // Verificar si contiene al menos una palabra clave del catálogo
    return this.validCatalogKeywords.some(keyword => {
      const normKeyword = normalizeProductString(keyword);
      return normalized.includes(normKeyword) || normKeyword.includes(normalized);
    });
  }

  public async consultarStock(producto: string): Promise<StockQueryResult> {
    const normalized = this.normalizeProductName(producto);
    if (!this.existsProduct(producto)) {
      throw new ProductNotFoundError(producto);
    }

    // Si ya fue consultado en esta sesión, devolver el mismo valor
    let stock = this.sessionStockCache.get(normalized);
    if (stock === undefined) {
      // Stock aleatorio entre 1 y 5 para reproducir fielmente el escenario del PDF
      stock = Math.floor(Math.random() * 5) + 1;
      this.sessionStockCache.set(normalized, stock);
    }

    return {
      availableStock: stock,
      metadata: {
        productKey: normalized,
        displayName: producto,
        physicalStock: stock,
        availableStock: stock,
        reservedStock: 0,
        dispatchedStock: 0,
        defectiveStock: 0,
        inRepairStock: 0,
        pendingReceiptStock: 0,
        isEstimated: false,
        requiresSpecialAuth: false,
        sourceTrace: 'Mock Inventory Repository (PDF Test Scenario: 1-5 aleatorio consistente por sesión)',
        source: 'mock'
      }
    };
  }

  /**
   * Permite fijar un stock específico para pruebas deterministas
   */
  public setMockStock(producto: string, stock: number): void {
    const normalized = this.normalizeProductName(producto);
    this.sessionStockCache.set(normalized, stock);
  }

  /**
   * Limpia la memoria de sesión
   */
  public reset(): void {
    this.sessionStockCache.clear();
  }
}
