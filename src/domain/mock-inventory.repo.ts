import { IInventoryRepository, ProductNotFoundError, normalizeProductString } from './inventory.repository.js';
import { StockQueryResult } from './inventory.types.js';

/*
 Reositorio de inventario Mock que simula el escenario del PDF:
 Devuelve un stock aleatorio entre 1 y 5 memorizado por producto en la sesión
 para asegurar la consistencia durante el cálculo del faltante y la orden de compra.
 */
export class MockInventoryRepository implements IInventoryRepository {
  private readonly sessionStockCache = new Map<string, number>();

  private readonly canonicalCategoryMap: Array<{ key: string; keywords: string[] }> = [
    { key: 'laptops-thinkpad', keywords: ['laptop', 'thinkpad', 'notebook', 'computador', 'computadora', 'laptops'] },
    { key: 'mouses-logitech', keywords: ['mouse', 'raton', 'logitech', 'mouses'] },
    { key: 'monitores-dell-27', keywords: ['monitor', 'dell', 'pantalla', 'monitores', 'pantallas'] },
    { key: 'teclados-keyclickers', keywords: ['teclado', 'keyclickers', 'teclados'] },
    { key: 'cables-hdmi', keywords: ['hdmi', 'cable hdmi', 'cables hdmi'] },
    { key: 'sillas-ergonomicas', keywords: ['silla', 'ergonomica', 'mueblescorp', 'sillas'] },
    { key: 'headsets-jabra', keywords: ['headset', 'jabra', 'auricular', 'audifono', 'headsets'] },
    { key: 'docking-stations-lenovo', keywords: ['docking', 'lenovo'] },
    { key: 'proyectores-epson', keywords: ['proyector', 'epson'] },
    { key: 'maquina-cafe-nespresso', keywords: ['cafe', 'nespresso', 'cafetera'] },
    { key: 'tinta-epson', keywords: ['tinta', 'cartucho', 'cyan', 'magenta', 'amarillo', 'negro'] },
    { key: 'ssd-kingston', keywords: ['ssd', 'kingston', 'disco'] },
    { key: 'adaptadores-usbc-hdmi', keywords: ['adaptador', 'usb-c', 'usbc'] },
    { key: 'standing-desks', keywords: ['standing desk', 'escritorio', 'escritorios'] },
    { key: 'iphone-15', keywords: ['iphone', 'iphone 15'] },
    { key: 'samsung-galaxy-s24', keywords: ['galaxy', 'samsung', 'galaxy s24'] },
    { key: 'poleras-corporativas', keywords: ['polera', 'remera', 'poleras'] },
    { key: 'tazas-termicas', keywords: ['taza', 'tazas'] },
    { key: 'cuadernos-institucionales', keywords: ['cuaderno', 'cuadernos'] },
    { key: 'mochilas-corporativas', keywords: ['mochila', 'mochilas'] },
    { key: 'webcams-logitech', keywords: ['webcam', 'camara', 'webcams'] },
    { key: 'licencias-windows-server', keywords: ['windows server', 'licencia de windows', 'licencias de windows', 'licencia windows', 'licencias windows', 'licencia de windows server', 'licencias windows server', 'windows server 2022'] },
    { key: 'licencias-office', keywords: ['office', 'licencia office', 'licencias office', 'licencia de office', 'office 2021'] },
    { key: 'cable-red-cat6', keywords: ['cat6', 'cable de red', 'cables de red'] },
    { key: 'conectores-rj45', keywords: ['rj45', 'conector', 'conectores'] },
    { key: 'switch-cisco', keywords: ['switch cisco', 'cisco 48p', 'switch cisco 48p'] },
    { key: 'switch-ubiquiti', keywords: ['switch ubiquiti', 'ubiquiti 24p', 'switch ubiquiti 24p'] },
    { key: 'servidor-dell', keywords: ['servidor dell', 'dell r740', 'servidor dell r740', 'r740'] },
    { key: 'servidor-hp', keywords: ['servidor hp', 'hp proliant', 'servidor hp proliant', 'proliant'] },
    { key: 'router-mikrotik', keywords: ['router', 'mikrotik', 'router mikrotik'] }
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

    let stock = this.sessionStockCache.get(canonicalKey);
    if (stock === undefined) {
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

  /*
   Permite fijar un stock específico para pruebas deterministas
   */
  public setMockStock(producto: string, stock: number): void {
    const canonicalKey = this.getCanonicalProductKey(producto) ?? this.normalizeProductName(producto);
    this.sessionStockCache.set(canonicalKey, stock);
  }

  /*
   Obtiene el mapa de stocks fijados en la sesión para persistencia externa
   */
  public getStockMap(): Record<string, number> {
    return Object.fromEntries(this.sessionStockCache.entries());
  }

  /*
   Restaura el mapa de stocks fijados en la sesión desde persistencia externa
   */
  public loadStockMap(stocks: Record<string, number>): void {
    for (const [key, val] of Object.entries(stocks)) {
      this.sessionStockCache.set(key, val);
    }
  }

  /*
   Limpia la memoria de sesión
   */
  public reset(): void {
    this.sessionStockCache.clear();
  }
}
