import { describe, it, expect, beforeEach } from 'vitest';
import { MockInventoryRepository } from '../src/domain/mock-inventory.repo.js';
import { DocumentInventoryRepository } from '../src/domain/document-inventory.repo.js';
import { ProductNotFoundError } from '../src/domain/inventory.repository.js';
import { OrderStateMachine, OrderValidationError } from '../src/tools/order-state-machine.js';
import { InventoryToolsExecutor } from '../src/tools/inventory.tools.js';

describe('1. MockInventoryRepository (PDF Scenario)', () => {
  let mockRepo: MockInventoryRepository;

  beforeEach(() => {
    mockRepo = new MockInventoryRepository();
  });

  it('devuelve stock aleatorio entre 1 y 5 para productos válidos', async () => {
    const res = await mockRepo.consultarStock('Laptops ThinkPad');
    expect(res.availableStock).toBeGreaterThanOrEqual(1);
    expect(res.availableStock).toBeLessThanOrEqual(5);
  });

  it('mantiene coherencia y consistencia en la misma sesión para el mismo producto', async () => {
    const res1 = await mockRepo.consultarStock('Laptops ThinkPad');
    const res2 = await mockRepo.consultarStock('Laptops ThinkPad');
    const res3 = await mockRepo.consultarStock('laptops thinkpad');
    expect(res1.availableStock).toBe(res2.availableStock);
    expect(res1.availableStock).toBe(res3.availableStock);
  });

  it('rechaza productos que no pertenecen al catálogo de dominio', async () => {
    await expect(mockRepo.consultarStock('unicornio volador'))
      .rejects.toThrow(ProductNotFoundError);
    await expect(mockRepo.consultarStock('pizza cuatro quesos'))
      .rejects.toThrow(ProductNotFoundError);
  });
});

describe('2. DocumentInventoryRepository (Inventario Desestructurado y Trazabilidad)', () => {
  let docRepo: DocumentInventoryRepository;

  beforeEach(() => {
    docRepo = new DocumentInventoryRepository();
  });

  it('auditoría: Laptops ThinkPad (15 disponibles, 3 defectuosas devueltas, 0 despachadas, 2 robadas)', async () => {
    const res = await docRepo.consultarStock('Laptops ThinkPad');
    expect(res.availableStock).toBe(15);
    expect(res.metadata.physicalStock).toBe(15);
    expect(res.metadata.defectiveStock).toBe(3);
    expect(res.metadata.dispatchedStock).toBe(0);
    expect(res.metadata.sourceTrace).toContain('Marcos T.');
  });

  it('auditoría: Mouses Logitech (47 disponibles, 15 despachados a Viña)', async () => {
    const res = await docRepo.consultarStock('mouse logitech');
    expect(res.availableStock).toBe(47);
    expect(res.metadata.dispatchedStock).toBe(15);
  });

  it('auditoría: Monitores Dell 27" (18 físicos y disponibles, 0 reservados tras liberación RRHH)', async () => {
    const res = await docRepo.consultarStock('Monitores Dell 27');
    expect(res.availableStock).toBe(18);
    expect(res.metadata.physicalStock).toBe(18);
    expect(res.metadata.reservedStock).toBe(0);
  });

  it('auditoría: Teclados KeyClickers (15 disponibles, 10 defectuosos)', async () => {
    const res = await docRepo.consultarStock('teclados mecanicos');
    expect(res.availableStock).toBe(15);
    expect(res.metadata.defectiveStock).toBe(10);
  });

  it('auditoría: Cables HDMI (40 disponibles, estimado)', async () => {
    const res = await docRepo.consultarStock('cables hdmi');
    expect(res.availableStock).toBe(40);
    expect(res.metadata.isEstimated).toBe(true);
  });

  it('auditoría: Sillas ergonómicas (0 disponibles, 10 retenidas en aduana)', async () => {
    const res = await docRepo.consultarStock('sillas de oficina');
    expect(res.availableStock).toBe(0);
    expect(res.metadata.pendingReceiptStock).toBe(10);
  });

  it('auditoría: Headsets Jabra (19 disponibles, 81 despachados)', async () => {
    const res = await docRepo.consultarStock('headsets jabra');
    expect(res.availableStock).toBe(19);
    expect(res.metadata.dispatchedStock).toBe(81);
  });

  it('auditoría: Docking Stations Lenovo (2 físicas en bodega, 8 en camión pendiente recepción)', async () => {
    const res = await docRepo.consultarStock('docking station lenovo');
    expect(res.availableStock).toBe(2);
    expect(res.metadata.pendingReceiptStock).toBe(8);
  });

  it('auditoría: Proyectores Epson (0 disponibles, 2 pendientes recepción, 1 en reparación no destruido)', async () => {
    const res = await docRepo.consultarStock('proyectores epson');
    expect(res.availableStock).toBe(0);
    expect(res.metadata.pendingReceiptStock).toBe(2);
    expect(res.metadata.inRepairStock).toBe(1);
  });

  it('auditoría: Máquina de café Nespresso (0 física, 0 disponible, excluida de TI)', async () => {
    const res = await docRepo.consultarStock('maquina de cafe nespresso');
    expect(res.availableStock).toBe(0);
    expect(res.metadata.physicalStock).toBe(0);
    expect(res.metadata.uncertaintyNotes).toContain('cocina del piso 4');
  });

  it('auditoría: Cartuchos de Tinta Epson (Negra: 13, Magenta: 6, Cyan: 5, Amarilla: 5)', async () => {
    const negra = await docRepo.consultarStock('tinta negra');
    const magenta = await docRepo.consultarStock('tinta magenta');
    const cyan = await docRepo.consultarStock('tinta cyan');
    const amarilla = await docRepo.consultarStock('tinta amarilla');

    expect(negra.availableStock).toBe(13);
    expect(negra.metadata.dispatchedStock).toBe(4);

    expect(magenta.availableStock).toBe(6);
    expect(magenta.metadata.dispatchedStock).toBe(2);

    expect(cyan.availableStock).toBe(5);
    expect(amarilla.availableStock).toBe(5);
  });

  it('auditoría: Discos Duros SSD Kingston (0 disponibles, 20 comprados sin confirmación recepción)', async () => {
    const res = await docRepo.consultarStock('ssd kingston');
    expect(res.availableStock).toBe(0);
    expect(res.metadata.pendingReceiptStock).toBe(20);
  });

  it('auditoría: Adaptadores USB-C a HDMI (15 disponibles, 15 despachados, estimado)', async () => {
    const res = await docRepo.consultarStock('adaptador usb-c a hdmi');
    expect(res.availableStock).toBe(15);
    expect(res.metadata.dispatchedStock).toBe(15);
    expect(res.metadata.isEstimated).toBe(true);
  });

  it('auditoría: Standing Desks (3 disponibles, 1 defectuoso con motor roto)', async () => {
    const res = await docRepo.consultarStock('standing desk');
    expect(res.availableStock).toBe(3);
    expect(res.metadata.defectiveStock).toBe(1);
  });

  it('auditoría: Teléfonos de prueba iPhone 15 y Samsung Galaxy S24 (clasificados como despachados)', async () => {
    const iphone = await docRepo.consultarStock('iphone 15');
    const galaxy = await docRepo.consultarStock('samsung galaxy s24');

    expect(iphone.availableStock).toBe(9);
    expect(iphone.metadata.dispatchedStock).toBe(3);

    expect(galaxy.availableStock).toBe(3);
    expect(galaxy.metadata.dispatchedStock).toBe(2);
  });

  it('auditoría: Merchandising corporativo (Poleras viejo: 0 disponible / 100 físico para caridad)', async () => {
    const viejo = await docRepo.consultarStock('poleras logo viejo');
    const nuevo = await docRepo.consultarStock('poleras logo nuevo');
    const tazas = await docRepo.consultarStock('tazas termicas');
    const cuadernos = await docRepo.consultarStock('cuadernos institucionales');
    const mochilas = await docRepo.consultarStock('mochilas corporativas');

    expect(viejo.availableStock).toBe(0);
    expect(viejo.metadata.physicalStock).toBe(100);

    expect(nuevo.availableStock).toBe(125);
    expect(tazas.availableStock).toBe(62);
    expect(cuadernos.availableStock).toBe(100);
    expect(mochilas.availableStock).toBe(30);
  });

  it('auditoría: Licencias físicas Windows Server y Office (requieren autorización especial)', async () => {
    const win = await docRepo.consultarStock('windows server 2022');
    const off = await docRepo.consultarStock('office 2021');

    expect(win.availableStock).toBe(4);
    expect(win.metadata.requiresSpecialAuth).toBe(true);

    expect(off.availableStock).toBe(15);
    expect(off.metadata.requiresSpecialAuth).toBe(true);
  });

  it('auditoría: Networking y Servidores (Switch Cisco tiene 1 reservada)', async () => {
    const cisco = await docRepo.consultarStock('switch cisco 48p');
    const ubiquiti = await docRepo.consultarStock('switch ubiquiti 24p');
    const dellSrv = await docRepo.consultarStock('servidor dell r740');
    const hpSrv = await docRepo.consultarStock('servidor hp proliant');
    const mikrotik = await docRepo.consultarStock('router mikrotik');

    expect(cisco.metadata.physicalStock).toBe(4);
    expect(cisco.availableStock).toBe(3);
    expect(cisco.metadata.reservedStock).toBe(1);

    expect(ubiquiti.availableStock).toBe(2);
    expect(ubiquiti.metadata.defectiveStock).toBe(1);

    expect(dellSrv.availableStock).toBe(3);

    expect(hpSrv.availableStock).toBe(0);
    expect(hpSrv.metadata.inRepairStock).toBe(2);

    expect(mikrotik.availableStock).toBe(5);
  });

  it('lanza ProductNotFoundError para productos inexistentes', async () => {
    await expect(docRepo.consultarStock('pantalla holografica 8k'))
      .rejects.toThrow(ProductNotFoundError);
  });
});

describe('3. OrderStateMachine (Máquina de Estados Determinista)', () => {
  let sm: OrderStateMachine;

  beforeEach(() => {
    sm = new OrderStateMachine();
  });

  it('extrae requerimiento y calcula faltante Math.max(0, required - available)', () => {
    const text = 'Necesitamos equipar a 10 nuevos empleados con laptops ThinkPad';
    const req = sm.extractRequirementFromText(text);
    expect(req).not.toBeNull();
    expect(req?.quantity).toBe(10);

    const pending = sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    expect(pending.requiredQuantity).toBe(10);
    expect(pending.availableStock).toBe(3);
    expect(pending.missingQuantity).toBe(7);
    expect(pending.state).toBe('AWAITING_CONFIRMATION');
  });

  it('transición a CONFIRMED ante confirmación inequívoca', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('Sí, procede con la compra');
    expect(sm.getPendingOrder()?.state).toBe('CONFIRMED');
  });

  it('permanece en AWAITING_CONFIRMATION ante respuesta ambigua', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('tal vez, déjame ver');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');

    sm.processUserMessage('creo que sí pero no estoy seguro');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
  });

  it('permanece en AWAITING_CONFIRMATION ante respuesta condicional', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('sí, pero solo si llegan mañana');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
  });

  it('permanece en AWAITING_CONFIRMATION si el usuario hace preguntas', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('¿sí, pero cuánto cuestan?');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');

    sm.processUserMessage('¿cuánto tardan en llegar?');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
  });

  it('transición a CANCELLED si el usuario niega o cancela', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('sí, mejor no');
    expect(sm.getPendingOrder()?.state).toBe('CANCELLED');

    // Intentar validar orden cancelada lanza error
    expect(() => sm.validateAndExecuteOrder('Laptops ThinkPad', 7))
      .toThrow(OrderValidationError);
  });

  it('validateAndExecuteOrder: valida regla de cantidad exacta y evita duplicados', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3); // faltante: 7
    sm.processUserMessage('De acuerdo, adelante con la orden');

    // Cantidad errónea es rechazada
    expect(() => sm.validateAndExecuteOrder('Laptops ThinkPad', 10))
      .toThrow(OrderValidationError);

    expect(() => sm.validateAndExecuteOrder('Laptops ThinkPad', 5))
      .toThrow(OrderValidationError);

    // Producto diferente es rechazado
    expect(() => sm.validateAndExecuteOrder('Monitores Dell', 7))
      .toThrow(OrderValidationError);

    // Cantidad exacta y producto correcto: éxito
    const result = sm.validateAndExecuteOrder('Laptops ThinkPad', 7, 'laptops-thinkpad');
    expect(result.success).toBe(true);
    expect(result.pendingOrder.state).toBe('COMPLETED');

    // Reintento de ejecutar la misma orden completada es rechazado (evita órdenes duplicadas)
    expect(() => sm.validateAndExecuteOrder('Laptops ThinkPad', 7, 'laptops-thinkpad'))
      .toThrow(OrderValidationError);
  });

  it('auditoría: rechaza confirmaciones accidentales en mensajes informativos o preguntas', () => {
    // 1. "Muéstrame el inventario, por favor" -> NO debe confirmar
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 3);
    sm.processUserMessage('Muéstrame el inventario, por favor');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
    expect(sm.getLastAnalysis()?.isUnequivocalConfirmation).toBe(false);

    // 2. "Sí, pero antes dime el precio" -> NO debe confirmar (condición / pregunta)
    sm.processUserMessage('Sí, pero antes dime el precio');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
    expect(sm.getLastAnalysis()?.isUnequivocalConfirmation).toBe(false);

    // 3. "¿Podrías revisar otra vez el stock?" -> NO debe confirmar (pregunta)
    sm.processUserMessage('¿Podrías revisar otra vez el stock?');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
    expect(sm.getLastAnalysis()?.isUnequivocalConfirmation).toBe(false);

    // 4. "No, todavía no compres" -> debe cancelar / no autorizar
    sm.processUserMessage('No, todavía no compres');
    expect(sm.getPendingOrder()?.state).toBe('CANCELLED');
    expect(sm.getLastAnalysis()?.isCancellation).toBe(true);
    expect(sm.getLastAnalysis()?.isUnequivocalConfirmation).toBe(false);

    // 5. "Confirmo la compra de las 6 laptops faltantes" -> confirmación válida y explícita
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 4); // Faltante: 6
    sm.processUserMessage('Confirmo la compra de las 6 laptops faltantes');
    expect(sm.getPendingOrder()?.state).toBe('CONFIRMED');
    expect(sm.getLastAnalysis()?.isUnequivocalConfirmation).toBe(true);
  });

  it('auditoría: extracción de cantidades no confunde características con cantidades', () => {
    // 1. "¿Tenemos monitores Dell de 27 pulgadas?" -> NO debe ser 27
    const spec1 = sm.extractRequirementFromText('¿Tenemos monitores Dell de 27 pulgadas?');
    expect(spec1).toBeNull();

    // 2. "¿Hay switches de 48 puertos o cables de 1000 metros?" -> NO debe ser 48 ni 1000
    const spec2 = sm.extractRequirementFromText('¿Hay switches de 48 puertos o cables de 1000 metros?');
    expect(spec2).toBeNull();

    // 3. "¿Podrías revisar otra vez el stock?" -> null
    const spec3 = sm.extractRequirementFromText('¿Podrías revisar otra vez el stock?');
    expect(spec3).toBeNull();

    // 4. "Muéstrame el inventario, por favor" -> null
    const spec4 = sm.extractRequirementFromText('Muéstrame el inventario, por favor');
    expect(spec4).toBeNull();

    // 5. Escenario obligatorio: "Necesitamos equipar a 10 nuevos empleados con laptops" -> 10
    const req1 = sm.extractRequirementFromText('Necesitamos equipar a 10 nuevos empleados con laptops');
    expect(req1?.quantity).toBe(10);

    // 6. "Requerimos 6 laptops ThinkPad adicionales" -> 6
    const req2 = sm.extractRequirementFromText('Requerimos 6 laptops ThinkPad adicionales');
    expect(req2?.quantity).toBe(6);

    // 7. "Comprar 15 unidades de cables HDMI" -> 15
    const req3 = sm.extractRequirementFromText('Comprar 15 unidades de cables HDMI');
    expect(req3?.quantity).toBe(15);
  });

  it('auditoría: identidad canónica estricta del producto impide coincidencias indebidas', () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 3);
    sm.processUserMessage('Confirmo la compra de los faltantes');
    expect(sm.getPendingOrder()?.state).toBe('CONFIRMED');

    // Intentar validar con producto canónico distinto lanza PRODUCT_MISMATCH
    expect(() => sm.validateAndExecuteOrder('Monitores Dell 27', 7, 'monitores-dell-27'))
      .toThrowError(/PRODUCT_MISMATCH/);

    // Validar con la clave canónica correcta tiene éxito
    const ok = sm.validateAndExecuteOrder('Laptops ThinkPad', 7, 'laptops-thinkpad');
    expect(ok.success).toBe(true);
  });

  it('auditoría: invalidación de autorizaciones anteriores al modificar producto, cantidad o stock', () => {
    // 1. Establecer orden y confirmarla
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 3);
    sm.processUserMessage('Confirmo la compra de los 7 faltantes');
    expect(sm.getPendingOrder()?.state).toBe('CONFIRMED');

    // 2. Modificar la necesidad a 12 unidades: DEBE invalidar CONFIRMED y pasar a AWAITING_CONFIRMATION
    const updated = sm.registerOrUpdateRequirement('Laptops ThinkPad', 12, 'laptops-thinkpad', 3);
    expect(updated.state).toBe('AWAITING_CONFIRMATION');
    expect(updated.missingQuantity).toBe(9);

    // 3. Si se actualiza el stock disponible conocido de 3 a 5, debe invalidar y recalcular
    sm.processUserMessage('Confirmo la compra de las 9 unidades');
    expect(sm.getPendingOrder()?.state).toBe('CONFIRMED');

    sm.updateAvailableStock('Laptops ThinkPad', 5, 'laptops-thinkpad');
    expect(sm.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
    expect(sm.getPendingOrder()?.missingQuantity).toBe(7); // 12 - 5 = 7

    // 4. Cambiar de producto a Monitores Dell: no debe heredar stock de Laptops
    const newProd = sm.registerOrUpdateRequirement('Monitores Dell 27', 5, 'monitores-dell-27');
    expect(newProd.availableStock).toBe(0); // No reutiliza el stock de laptops (5)
    expect(newProd.state).toBe('AWAITING_CONFIRMATION');
  });
});

describe('5. Auditoría de Integración y Repositorios en AgentController', () => {
  it('auditoría: setRepository invalida operaciones pendientes y reinicia máquina de estados', async () => {
    const { AgentController } = await import('../src/agent/agent-controller.js');
    const mockRepo = new MockInventoryRepository();
    const docRepo = new DocumentInventoryRepository();

    const agent = new AgentController('dummy_api_key_test', 'gemini-2.5-flash', mockRepo, 'mock');

    // Crear una orden pendiente en modo mock
    agent.stateMachine.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 3);
    expect(agent.stateMachine.getPendingOrder()).not.toBeNull();

    // Cambiar a modo unstructured
    agent.setRepository(docRepo, 'unstructured');

    // La orden pendiente debe haberse reseteado a null
    expect(agent.stateMachine.getPendingOrder()).toBeNull();
    expect(agent.currentMode).toBe('unstructured');
  });
});

describe('4. InventoryToolsExecutor (Validación de Herramientas y Function Calling)', () => {
  let mockRepo: MockInventoryRepository;
  let sm: OrderStateMachine;
  let executor: InventoryToolsExecutor;

  beforeEach(() => {
    mockRepo = new MockInventoryRepository();
    mockRepo.setMockStock('Laptops ThinkPad', 3);
    sm = new OrderStateMachine();
    executor = new InventoryToolsExecutor(mockRepo, sm);
  });

  it('rechaza herramientas que no sean consultar_stock o emitir_orden_compra', async () => {
    const res = await executor.executeToolCall('borrar_base_datos', {});
    expect(res.success).toBe(false);
    expect(res.payload.error).toContain('Herramienta desconocida');
  });

  it('rechaza argumentos alucinados o no permitidos', async () => {
    const res = await executor.executeToolCall('consultar_stock', {
      producto: 'Laptops ThinkPad',
      color: 'azul',
      descuento: 20
    });
    expect(res.success).toBe(false);
    expect(res.payload.error).toContain('Argumentos no permitidos');
  });

  it('rechaza emitir_orden_compra si no hay confirmación previa', async () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    // Sin confirmación
    const res = await executor.executeToolCall('emitir_orden_compra', {
      producto: 'Laptops ThinkPad',
      cantidad: 7
    });
    expect(res.success).toBe(false);
    expect(res.payload.errorCode).toBe('NOT_CONFIRMED');
  });

  it('ejecuta emitir_orden_compra exitosamente con confirmación inequívoca', async () => {
    sm.registerOrUpdateRequirement('Laptops ThinkPad', 10, 3);
    sm.processUserMessage('Sí, confirmo la compra de las 7 unidades');

    const res = await executor.executeToolCall('emitir_orden_compra', {
      producto: 'Laptops ThinkPad',
      cantidad: 7
    });
    expect(res.success).toBe(true);
    expect(typeof res.rawOutput).toBe('string');
    expect(res.rawOutput).toContain('STATUS_OK');
  });
});
