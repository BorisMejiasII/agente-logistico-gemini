import { IInventoryRepository, ProductNotFoundError, normalizeProductString } from './inventory.repository.js';
import { InventoryRecord, StockQueryResult } from './inventory.types.js';

export class DocumentInventoryRepository implements IInventoryRepository {
  private readonly records: InventoryRecord[] = [
    {
      productKey: 'laptops-thinkpad',
      displayName: 'Laptops ThinkPad',
      aliases: [
        'laptop', 'laptops', 'thinkpad', 'notebook', 'notebooks',
        'computador', 'computadores', 'laptop thinkpad', 'laptops thinkpad'
      ],
      physicalStock: 15,
      availableStock: 15,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 3,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Logs Marcos T. (Lunes 12 y Lunes 19) y Guardia (Sábado 17)',
      uncertaintyNotes: '15 en manifiesto inicial (-3 con pantalla trizada devueltas al proveedor TechGlobal + 5 devueltas por Marketing - 2 robadas en la bóveda el fin de semana = 15 disponibles físicas para asignación). Las 3 defectuosas fueron devueltas al proveedor TechGlobal (no se encuentran en reparación).'
    },
    {
      productKey: 'mouses-logitech',
      displayName: 'Mouses inalámbricos Logitech',
      aliases: [
        'mouse', 'mouses', 'raton', 'ratones', 'mouse logitech',
        'mouses logitech', 'mouse inalambrico', 'mouses inalambricos logitech'
      ],
      physicalStock: 47,
      availableStock: 47,
      reservedStock: 0,
      dispatchedStock: 15,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Log Marcos T. (Lunes 12, 11:15)',
      uncertaintyNotes: '12 sueltos + 50 en palet - 15 despachados a Viña del Mar por valija interna = 47 disponibles.'
    },
    {
      productKey: 'monitores-dell-27',
      displayName: 'Monitores Dell 27"',
      aliases: [
        'monitor', 'monitores', 'pantalla', 'pantallas', 'dell 27',
        'monitor dell', 'monitores dell', 'monitor dell 27', 'monitores dell 27'
      ],
      physicalStock: 18,
      availableStock: 18,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Log Julieta R. (Martes 13) y Correo RRHH (19 Oct)',
      uncertaintyNotes: '8 en Sector B + 10 camión ElectroTech = 18 físicos. Las 2 unidades reservadas originalmente por RRHH fueron liberadas el 19 Oct tras caerse las contrataciones.'
    },
    {
      productKey: 'teclados-keyclickers',
      displayName: 'Teclados mecánicos KeyClickers',
      aliases: [
        'teclado', 'teclados', 'teclado mecanico', 'teclados mecanicos',
        'keyclickers', 'teclados keyclickers'
      ],
      physicalStock: 15,
      availableStock: 15,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 10,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Logs Marcos T. (Miércoles 14 y Lunes 19) y Guardia (Sábado 17)',
      uncertaintyNotes: '25 contados - 4 con tecla Espacio atascada dados de baja - 6 arruinados por filtración de agua y desechados = 15 operativos en bodega.'
    },
    {
      productKey: 'cables-hdmi',
      displayName: 'Cables HDMI',
      aliases: ['cable hdmi', 'cables hdmi', 'hdmi'],
      physicalStock: 40,
      availableStock: 40,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: true,
      requiresSpecialAuth: false,
      sourceTrace: 'Log Marcos T. (Miércoles 14)',
      uncertaintyNotes: 'Cifra estimada no verificada: "hay un enredo en el cajón 3, asumamos que hay 40 por ahora".'
    },
    {
      productKey: 'sillas-ergonomicas',
      displayName: 'Sillas de oficina ergonómicas',
      aliases: [
        'silla', 'sillas', 'silla de oficina', 'sillas de oficina',
        'silla ergonomica', 'sillas ergonomicas', 'mueblescorp'
      ],
      physicalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 10,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Log Julieta R. (Jueves 15)',
      uncertaintyNotes: 'Stock físico actual 0 en bodega. 10 unidades pedidas a MueblesCorp retenidas en aduana hasta el próximo mes.'
    },
    {
      productKey: 'headsets-jabra',
      displayName: 'Headsets Jabra',
      aliases: [
        'headset', 'headsets', 'jabra', 'auricular', 'auriculares',
        'audifono', 'audifonos', 'headsets jabra'
      ],
      physicalStock: 19,
      availableStock: 19,
      reservedStock: 0,
      dispatchedStock: 81,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Log Marcos T. (Viernes 16)',
      uncertaintyNotes: '100 recibidos: 80 despachados a operaciones piso 4 + 1 retirado por Marcos T. = 19 unidades restantes disponibles.'
    },
    {
      productKey: 'docking-stations-lenovo',
      displayName: 'Docking Stations Lenovo',
      aliases: [
        'docking', 'dockings', 'docking station', 'docking stations',
        'docking lenovo', 'docking stations lenovo'
      ],
      physicalStock: 2,
      availableStock: 2,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 8,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correo Soporte TI c.gonzalez (15 Oct)',
      uncertaintyNotes: '2 unidades físicas en bodega; 8 despachadas en camión desde sucursal Norte sin confirmación de recepción aún.'
    },
    {
      productKey: 'proyectores-epson',
      displayName: 'Proyectores Epson',
      aliases: ['proyector', 'proyectores', 'proyector epson', 'proyectores epson'],
      physicalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 1,
      pendingReceiptStock: 2,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correo Soporte TI c.gonzalez (15 Oct)',
      uncertaintyNotes: '3 despachados en camión desde sucursal Norte pendientes de recepción física; 2 operativos y 1 sin lámpara que requiere repuesto (reparable, no destruido).'
    },
    {
      productKey: 'maquina-cafe-nespresso',
      displayName: 'Máquina de café Nespresso',
      aliases: [
        'cafetera', 'cafeteras', 'nespresso', 'maquina de cafe',
        'maquina cafe', 'maquina de cafe nespresso'
      ],
      physicalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correo Soporte TI (15 Oct)',
      uncertaintyNotes: 'Excluida del inventario de TI. Va directo a la cocina del piso 4 en camión desde sucursal Norte.'
    },
    {
      productKey: 'cartucho-tinta-negra',
      displayName: 'Cartuchos de Tinta Epson - Tinta Negra',
      aliases: [
        'tinta negra', 'tintas negras', 'cartucho negro', 'cartuchos negros',
        'cartucho de tinta negra', 'cartuchos de tinta epson negra'
      ],
      physicalStock: 13,
      availableStock: 13,
      reservedStock: 0,
      dispatchedStock: 4,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correos Compras (16 Oct) y Marketing (18 Oct)',
      uncertaintyNotes: '12 en Excel viejo + 5 recibidas - 4 retiradas por Marketing = 13 disponibles.'
    },
    {
      productKey: 'cartucho-tinta-magenta',
      displayName: 'Cartuchos de Tinta Epson - Tinta Magenta',
      aliases: [
        'tinta magenta', 'tintas magenta', 'cartucho magenta',
        'cartuchos magenta', 'cartuchos de tinta epson magenta'
      ],
      physicalStock: 6,
      availableStock: 6,
      reservedStock: 0,
      dispatchedStock: 2,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correos Compras (16 Oct) y Marketing (18 Oct)',
      uncertaintyNotes: '3 en Excel viejo + 5 recibidas - 2 retiradas por Marketing = 6 disponibles.'
    },
    {
      productKey: 'cartucho-tinta-cyan',
      displayName: 'Cartuchos de Tinta Epson - Tinta Cyan',
      aliases: [
        'tinta cyan', 'tintas cyan', 'cartucho cyan', 'cartuchos cyan',
        'cartuchos de tinta epson cyan', 'tinta cian'
      ],
      physicalStock: 5,
      availableStock: 5,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correos Compras (16 Oct) y Marketing (18 Oct)',
      uncertaintyNotes: '0 en Excel viejo + 5 nuevas recibidas = 5 disponibles.'
    },
    {
      productKey: 'cartucho-tinta-amarilla',
      displayName: 'Cartuchos de Tinta Epson - Tinta Amarilla',
      aliases: [
        'tinta amarilla', 'tintas amarillas', 'cartucho amarillo',
        'cartuchos amarillos', 'cartuchos de tinta epson amarilla'
      ],
      physicalStock: 5,
      availableStock: 5,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correos Compras (16 Oct) y Marketing (18 Oct)',
      uncertaintyNotes: '0 en Excel viejo + 5 nuevas recibidas = 5 disponibles.'
    },
    {
      productKey: 'ssd-1tb-kingston',
      displayName: 'Discos Duros SSD 1TB Kingston',
      aliases: [
        'ssd', 'disco ssd', 'discos ssd', 'disco duro', 'discos duros',
        'ssd kingston', 'ssd 1tb', 'disco duro ssd 1tb kingston'
      ],
      physicalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 20,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Correo Compras (16 Oct)',
      uncertaintyNotes: 'Comprados el 16 de Octubre por M. Lucero, pero ningún registro posterior confirma su recepción efectiva en bodega.'
    },
    {
      productKey: 'adaptadores-usbc-hdmi',
      displayName: 'Adaptadores USB-C a HDMI',
      aliases: [
        'adaptador usb-c a hdmi', 'adaptadores usb-c a hdmi',
        'adaptador usbc hdmi', 'adaptadores usbc hdmi',
        'adaptador usb-c', 'adaptadores usb-c'
      ],
      physicalStock: 15,
      availableStock: 15,
      reservedStock: 0,
      dispatchedStock: 15,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: true,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Jueves 15)',
      uncertaintyNotes: 'Cifra inicial estimada ("teníamos como 20") - 15 llevados por Ventas + 10 exactos encontrados en bolsa sellada = ~15 disponibles.'
    },
    {
      productKey: 'standing-desks',
      displayName: 'Standing Desks (Escritorios ajustables)',
      aliases: [
        'standing desk', 'standing desks', 'escritorio ajustable',
        'escritorios ajustables', 'escritorio', 'escritorios'
      ],
      physicalStock: 3,
      availableStock: 3,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 1,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Viernes 16)',
      uncertaintyNotes: '4 cajas recibidas; 1 con motor eléctrico destruido y madera rota dada de baja = 3 disponibles en Sector C.'
    },
    {
      productKey: 'iphone-15',
      displayName: 'iPhone 15',
      aliases: ['iphone', 'iphone 15', 'telefonos iphone', 'telefono iphone 15'],
      physicalStock: 9,
      availableStock: 9,
      reservedStock: 0,
      dispatchedStock: 3,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '12 iniciales en vitrina fuerte - 3 entregados a Desarrollo anotados en su centro de costos (despachados) = 9 disponibles.'
    },
    {
      productKey: 'samsung-galaxy-s24',
      displayName: 'Samsung Galaxy S24',
      aliases: [
        'galaxy', 'galaxy s24', 'samsung galaxy', 'samsung galaxy s24',
        'telefono samsung', 'telefonos samsung'
      ],
      physicalStock: 3,
      availableStock: 3,
      reservedStock: 0,
      dispatchedStock: 2,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '5 iniciales - 2 entregados a Desarrollo anotados en su centro de costos (despachados) = 3 disponibles.'
    },
    {
      productKey: 'poleras-logo-viejo',
      displayName: 'Poleras logo viejo (azul)',
      aliases: ['poleras logo viejo', 'polera azul', 'poleras azules', 'polera vieja'],
      physicalStock: 100,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '100 unidades físicas destinadas a donación a caridad; stock disponible = 0 para inventario interno.'
    },
    {
      productKey: 'poleras-logo-nuevo',
      displayName: 'Poleras logo nuevo (verde)',
      aliases: [
        'polera', 'poleras', 'poleras logo nuevo', 'polera verde',
        'poleras verdes', 'polera nueva', 'remera', 'remeras'
      ],
      physicalStock: 125,
      availableStock: 125,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '125 unidades disponibles (desglose: 50 talla S, 45 talla M, 30 talla L).'
    },
    {
      productKey: 'tazas-termicas',
      displayName: 'Tazas térmicas',
      aliases: ['taza', 'tazas', 'taza termica', 'tazas termicas'],
      physicalStock: 62,
      availableStock: 62,
      reservedStock: 0,
      dispatchedStock: 20,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '82 contadas inicialmente - 20 retiradas por Ventas para clientes = 62 disponibles.'
    },
    {
      productKey: 'cuadernos-institucionales',
      displayName: 'Cuadernos institucionales',
      aliases: ['cuaderno', 'cuadernos', 'cuaderno institucional', 'cuadernos institucionales'],
      physicalStock: 100,
      availableStock: 100,
      reservedStock: 0,
      dispatchedStock: 20,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '120 contados - 20 retirados por Ventas para clientes = 100 disponibles.'
    },
    {
      productKey: 'mochilas-corporativas',
      displayName: 'Mochilas corporativas',
      aliases: ['mochila', 'mochilas', 'mochila corporativa', 'mochilas corporativas'],
      physicalStock: 30,
      availableStock: 30,
      reservedStock: 0,
      dispatchedStock: 10,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Slack #bodega-ops (Lunes 19)',
      uncertaintyNotes: '40 contadas - 10 retiradas por Ventas para clientes = 30 disponibles.'
    },
    {
      productKey: 'webcams-logitech-c920',
      displayName: 'Webcams Logitech C920',
      aliases: [
        'webcam', 'webcams', 'camara', 'camaras', 'logitech c920',
        'webcam logitech', 'webcams logitech c920'
      ],
      physicalStock: 6,
      availableStock: 6,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 1,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Post-It 1 en monitor de Julieta',
      uncertaintyNotes: '7 en nota física - 1 rota por Felipe M. = 6 disponibles.'
    },
    {
      productKey: 'licencias-windows-server-2022',
      displayName: 'Licencias físicas Windows Server 2022',
      aliases: [
        'windows server', 'windows server 2022', 'licencia windows server',
        'licencias windows server 2022', 'licencias windows server'
      ],
      physicalStock: 4,
      availableStock: 4,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: true,
      sourceTrace: 'Post-It 2 en puerta de bóveda',
      uncertaintyNotes: '4 sobres. ADVERTENCIA: NO SACAR SIN FIRMA DEL GERENTE TI.'
    },
    {
      productKey: 'licencias-office-2021',
      displayName: 'Licencias físicas Office 2021',
      aliases: [
        'office', 'office 2021', 'licencia office', 'licencias office',
        'licencias office 2021', 'microsoft office 2021'
      ],
      physicalStock: 15,
      availableStock: 15,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: true,
      sourceTrace: 'Post-It 2 en puerta de bóveda',
      uncertaintyNotes: '15 cajas. ADVERTENCIA: NO SACAR SIN FIRMA DEL GERENTE TI.'
    },
    {
      productKey: 'cable-red-cat6',
      displayName: 'Cable de red Cat6 (metros)',
      aliases: [
        'cable de red', 'cables de red', 'cable cat6', 'cable red cat6',
        'cat6', 'rollo de red', 'bobina cat6'
      ],
      physicalStock: 700,
      availableStock: 700,
      reservedStock: 0,
      dispatchedStock: 300,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: true,
      requiresSpecialAuth: false,
      sourceTrace: 'Post-It 3 arrugado en el suelo',
      uncertaintyNotes: 'Rollo de 1000m - ~300m cortados para piso 2 = ~700m aprox (estimación no exacta).'
    },
    {
      productKey: 'conectores-rj45',
      displayName: 'Conectores RJ45',
      aliases: ['conector rj45', 'conectores rj45', 'rj45', 'conectores de red'],
      physicalStock: 50,
      availableStock: 50,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: true,
      requiresSpecialAuth: false,
      sourceTrace: 'Post-It 3 arrugado en el suelo',
      uncertaintyNotes: 'Estimación: "quedan como 50 sueltos nada más".'
    },
    {
      productKey: 'switch-cisco-48p',
      displayName: 'Switch Cisco 48p',
      aliases: [
        'switch cisco', 'switch cisco 48p', 'cisco 48p',
        'cisco switch', 'switches cisco', 'net-01'
      ],
      physicalStock: 4,
      availableStock: 3,
      reservedStock: 1,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Tabla Legacy recuperada (RACK 1)',
      uncertaintyNotes: '4 físicas en Rack 1; 1 unidad reservada para instalación el viernes en piso 3 -> 3 disponibles para asignación.'
    },
    {
      productKey: 'switch-ubiquiti-24p',
      displayName: 'Switch Ubiquiti 24p',
      aliases: [
        'switch ubiquiti', 'switch ubiquiti 24p', 'ubiquiti 24p',
        'ubiquiti switch', 'switches ubiquiti', 'net-02', 'net-03'
      ],
      physicalStock: 2,
      availableStock: 2,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 1,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Tabla Legacy recuperada (NET-02 y NET-03)',
      uncertaintyNotes: '2 unidades OK en Rack 1; 1 unidad QUEMADA en pasillo (dada de baja definitiva).'
    },
    {
      productKey: 'servidor-dell-r740',
      displayName: 'Servidor Dell R740',
      aliases: [
        'servidor dell', 'servidor dell r740', 'dell r740',
        'servidores dell', 'srv-01'
      ],
      physicalStock: 3,
      availableStock: 3,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Tabla Legacy recuperada (SRV-01, RACK 2)',
      uncertaintyNotes: '3 unidades OK en Rack 2 operativas y disponibles.'
    },
    {
      productKey: 'servidor-hp-proliant',
      displayName: 'Servidor HP ProLiant',
      aliases: [
        'servidor hp', 'servidor hp proliant', 'hp proliant',
        'servidores hp', 'srv-02'
      ],
      physicalStock: 0,
      availableStock: 0,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 2,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Tabla Legacy recuperada (SRV-02)',
      uncertaintyNotes: 'Stock físico en bodega 0. 2 unidades en servicio externo EN REPARACIÓN (reparables, no destruidas).'
    },
    {
      productKey: 'router-mikrotik',
      displayName: 'Router Mikrotik',
      aliases: ['router mikrotik', 'mikrotik', 'routers mikrotik', 'rtr-01'],
      physicalStock: 5,
      availableStock: 5,
      reservedStock: 0,
      dispatchedStock: 0,
      defectiveStock: 0,
      inRepairStock: 0,
      pendingReceiptStock: 0,
      isEstimated: false,
      requiresSpecialAuth: false,
      sourceTrace: 'Tabla Legacy recuperada (RTR-01, Bodega B)',
      uncertaintyNotes: '5 unidades OK en Bodega B operativas y disponibles.'
    }
  ];

  public normalizeProductName(producto: string): string {
    return normalizeProductString(producto);
  }

  public findRecord(producto: string): InventoryRecord | undefined {
    const query = this.normalizeProductName(producto);
    if (!query) return undefined;

    // 1. Coincidencia exacta con productKey
    let match = this.records.find(r => r.productKey === query);
    if (match) return match;

    // 2. Coincidencia exacta con displayName normalizado
    match = this.records.find(r => this.normalizeProductName(r.displayName) === query);
    if (match) return match;

    // 3. Coincidencia exacta con algún alias normalizado
    match = this.records.find(r => r.aliases.some(a => this.normalizeProductName(a) === query));
    if (match) return match;

    // 4. Búsqueda donde la consulta está contenida en el displayName o alias
    // Ej: "thinkpad" está en "laptops thinkpad", "logitech" en "mouses logitech", "hdmi" en "cables hdmi"
    const substringMatches = this.records.filter(r => {
      const normDisplay = this.normalizeProductName(r.displayName);
      if (normDisplay.includes(query)) return true;
      return r.aliases.some(a => this.normalizeProductName(a).includes(query));
    });

    if (substringMatches.length === 1) {
      return substringMatches[0];
    }
    if (substringMatches.length > 1) {
      return substringMatches.sort((a, b) => a.displayName.length - b.displayName.length)[0];
    }

    // 5. Coincidencia si las palabras clave del alias multi-palabra están completas en el query
    // Ej: query = "necesito monitores dell 27 para el piso 2" -> contiene "monitor dell 27"
    const words = query.split(' ');
    const wordMatches = this.records.filter(r => {
      return r.aliases.some(alias => {
        const normAlias = this.normalizeProductName(alias);
        const aliasWords = normAlias.split(' ');
        if (aliasWords.length > 1) {
          return aliasWords.every(aw => words.includes(aw));
        }
        return false;
      });
    });

    if (wordMatches.length === 1) {
      return wordMatches[0];
    }

    return undefined;
  }

  public existsProduct(producto: string): boolean {
    return this.findRecord(producto) !== undefined;
  }

  public getCanonicalProductKey(producto: string): string | null {
    const record = this.findRecord(producto);
    return record ? record.productKey : null;
  }

  public async consultarStock(producto: string): Promise<StockQueryResult> {
    const record = this.findRecord(producto);
    if (!record) {
      throw new ProductNotFoundError(producto);
    }

    return {
      availableStock: record.availableStock,
      metadata: {
        productKey: record.productKey,
        displayName: record.displayName,
        physicalStock: record.physicalStock,
        availableStock: record.availableStock,
        reservedStock: record.reservedStock,
        dispatchedStock: record.dispatchedStock,
        defectiveStock: record.defectiveStock,
        inRepairStock: record.inRepairStock,
        pendingReceiptStock: record.pendingReceiptStock,
        isEstimated: record.isEstimated,
        requiresSpecialAuth: record.requiresSpecialAuth,
        sourceTrace: record.sourceTrace,
        uncertaintyNotes: record.uncertaintyNotes,
        source: 'unstructured'
      }
    };
  }

  public getAllProducts(): InventoryRecord[] {
    return [...this.records];
  }
}
