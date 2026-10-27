import { IInventoryRepository, ProductNotFoundError, normalizeProductString } from './inventory.repository.js';
import { StockQueryResult } from './inventory.types.js';

/**
 * Repositorio de inventario Mock que simula el escenario del PDF:
 * Devuelve un stock aleatorio entre 1 y 5 memorizado por producto en la sesión
 * para asegurar la consistencia durante el cálculo del faltante y la orden de compra.
 */
export class MockInventoryRepository implements IInventoryRepository {
  private readonly sessionStockCache = new Map<string, number>();

  private readonly canonicalCategoryMap: Array<{ key: string; keywords: string[] }> = [
    { key: 'laptops-thinkpad', keywords: ['laptop', 'thinkpad', 'notebook', 'computador'] },
    { key: 'mouses-logitech', keywords: ['mouse', 'raton', 'logitech'] },
    { key: 'monitores-dell-27', keywords: ['monitor', 'dell', 'pantalla'] },
    { key: 'teclados-keyclickers', keywords: ['teclado', 'keyclickers'] },
    { key: 'cables-hdmi', keywords: ['hdmi'] },
    { key: 'sillas-ergonomicas', keywords: ['silla', 'ergonomica', 'mueblescorp'] },
    { key: 'headsets-jabra', keywords: ['headset', 'jabra', 'auricular', 'audifono'] },
    { key: 'docking-stations-lenovo', keywords: ['docking', 'lenovo'] },
    { key: 'proyectores-epson', keywords: ['proyector', 'epson'] },
    { key: 'maquina-cafe-nespresso', keywords: ['cafe', 'nespresso', 'cafetera'] },
    { key: 'tinta-epson', keywords: ['tinta', 'cartucho', 'cyan', 'magenta', 'amarillo', 'negro'] },
    { key: 'ssd-kingston', keywords: ['ssd', 'kingston', 'disco'] },
    { key: 'adaptadores-usbc-hdmi', keywords: ['adaptador', 'usb-c', 'usbc'] },
    { key: 'standing-desks', keywords: ['standing desk', 'escritorio'] },
    { key: 'iphone-15', keywords: ['iphone'] },
    { key: 'samsung-galaxy-s24', keywords: ['galaxy', 'samsung'] },
    { key: 'poleras-corporativas', keywords: ['polera', 'remera'] },
    { key: 'tazas-termicas', keywords: ['taza'] },
    { key: 'cuadernos-institucionales', keywords: ['cuaderno'] },
    { key: 'mochilas-corporativas', keywords: ['mochila'] },
    { key: 'webcams-logitech', keywords: ['webcam', 'camara'] },
    { key: 'licencias-windows-server', keywords: ['windows server'] },
    { key: 'licencias-office', keywords: ['office'] },
    { key: 'cable-red-cat6', keywords: ['cat6', 'cable de red'] },
    { key: 'conectores-rj45', keywords: ['rj45', 'conector'] },
    { key: 'switch-cisco', keywords: ['switch cisco', 'cisco'] },
    { key: 'switch-ubiquiti', keywords: ['switch ubiquiti', 'ubiquiti'] },
    { key: 'servidor-dell', keywords: ['servidor dell', 'r740'] },
    { key: 'servidor-hp', keywords: ['servidor hp', 'proliant'] },
    { key: 'router-mikrotik', keywords: ['router', 'mikrotik'] }
  ];

  public normalizeProductName(producto: string): string {
    return normalizeProductString(producto);
  }

  public getCanonicalProductKey(producto: string): string | null {
    const normalized = this.normalizeProductName(producto);
    if (!normalized || normalized.length < 2) {
      return null;
    }
    for (const cat of this.canonicalCategoryMap) {
      if (cat.keywords.some(k => normalized.includes(normalizeProductString(k)))) {
        return cat.key;
      }
    }
    return null;
  }

  public existsProduct(producto: string): boolean {
    return this.getCanonicalProductKey(producto) !== null;
  }

  public async consultarStock(producto: string): Promise<StockQueryResult> {
    const canonicalKey = this.getCanonicalProductKey(producto);
    if (!canonicalKey) {
      throw new ProductNotFoundError(producto);
    }

    // Memorizar por clave canónica para coherencia absoluta en la sesión
    let stock = this.sessionStockCache.get(canonicalKey);
    if (stock === undefined) {
      // Stock aleatorio entre 1 y 5 para reproducir fielmente el escenario del PDF
      stock = Math.floor(Math.random() * 5) + 1;
      this.sessionStockCache.set(canonicalKey, stock);
    }

    return {
      availableStock: stock,
      metadata: {
        productKey: canonicalKey,
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
    const canonicalKey = this.getCanonicalProductKey(producto) ?? this.normalizeProductName(producto);
    this.sessionStockCache.set(canonicalKey, stock);
  }

  /**
   * Limpia la memoria de sesión
   */
  public reset(): void {
    this.sessionStockCache.clear();
  }
}
