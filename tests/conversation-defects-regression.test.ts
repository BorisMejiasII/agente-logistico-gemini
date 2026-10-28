import { describe, it, expect, beforeEach } from 'vitest';
import { OrderStateMachine, OrderValidationError } from '../src/tools/order-state-machine.js';
import { InventoryToolsExecutor } from '../src/tools/inventory.tools.js';
import { MockInventoryRepository } from '../src/domain/mock-inventory.repo.js';
import { DocumentInventoryRepository } from '../src/domain/document-inventory.repo.js';
import { MultiProviderOrchestrator } from '../src/agent/multi-provider-orchestrator.js';
import { InMemorySessionStore } from '../src/storage/in-memory-session-store.js';

describe('Auditoría y Regresión — Defectos en Conversaciones Largas', () => {
  let mockRepo: MockInventoryRepository;
  let docRepo: DocumentInventoryRepository;
  let stateMachine: OrderStateMachine;
  let toolsExecutor: InventoryToolsExecutor;

  beforeEach(() => {
    mockRepo = new MockInventoryRepository();
    docRepo = new DocumentInventoryRepository();
    stateMachine = new OrderStateMachine();
    toolsExecutor = new InventoryToolsExecutor(mockRepo, stateMachine);
  });

  // =========================================================================
  // 1. HALLAZGO 1: Secuencia de compra de 15 laptops, "si quiero" y no duplicación
  // =========================================================================
  describe('Hallazgo 1: Secuencia de 15 laptops, "si quiero" y emisión única', () => {
    it('Secuencia completa: "si quiero" NO emite compra, confirmación explícita sí emite, y reconfirmación se rechaza', async () => {
      // Paso 1: Usuario requiere 15 laptops
      stateMachine.registerOrUpdateRequirement('Laptops ThinkPad', 15, 'laptops-thinkpad');
      // Stock disponible simulado: 1 unidad
      stateMachine.updateAvailableStock('Laptops ThinkPad', 1, 'laptops-thinkpad');

      const initialPending = stateMachine.getPendingOrder();
      expect(initialPending).not.toBeNull();
      expect(initialPending?.requiredQuantity).toBe(15);
      expect(initialPending?.availableStock).toBe(1);
      expect(initialPending?.missingQuantity).toBe(14);
      expect(initialPending?.state).toBe('AWAITING_CONFIRMATION');

      // Paso 2: Usuario responde "si quiero" (respuesta coloquial / no inequívoca)
      const analysisColloquial = stateMachine.analyzeUserMessage('si quiero');
      expect(analysisColloquial.isUnequivocalConfirmation).toBe(false);

      stateMachine.processUserMessage('si quiero');
      expect(stateMachine.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');

      // Intento de emisión en este estado (ejecución de herramienta por LLM prematuro):
      // Debe fallar con success: false y NO registrar compra
      const prematureExecution = await toolsExecutor.executeToolCall('emitir_orden_compra', {
        producto: 'Laptops ThinkPad',
        cantidad: 14
      });

      expect(prematureExecution.success).toBe(false);
      expect(prematureExecution.rawOutput).toBeNull();
      expect((prematureExecution.payload.error as string)).toContain('No se puede emitir la orden de compra');
      expect(prematureExecution.payload.errorCode).toBe('NOT_CONFIRMED');
      // La orden sigue en espera y NO ha sido completada
      expect(stateMachine.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');

      // Paso 3: Usuario entrega confirmación explícita e inequívoca
      const explicitMsg = 'Autorizo la emisión de la orden de compra por las 14';
      const analysisExplicit = stateMachine.analyzeUserMessage(explicitMsg);
      expect(analysisExplicit.isUnequivocalConfirmation).toBe(true);

      stateMachine.processUserMessage(explicitMsg);
      expect(stateMachine.getPendingOrder()?.state).toBe('CONFIRMED');

      // Ejecución real y autorizada de la compra
      const validExecution = await toolsExecutor.executeToolCall('emitir_orden_compra', {
        producto: 'Laptops ThinkPad',
        cantidad: 14
      });

      expect(validExecution.success).toBe(true);
      expect(typeof validExecution.rawOutput).toBe('string');
      expect((validExecution.rawOutput as string)).toContain('STATUS_OK');
      expect(validExecution.payload.cantidadComprada).toBe(14);
      expect(stateMachine.getPendingOrder()?.state).toBe('COMPLETED');

      // Paso 4: Reconfirmación o repetición posterior después de COMPLETED
      stateMachine.processUserMessage('Autorizo la emisión de la orden de compra por las 14');
      // El estado debe permanecer en COMPLETED (no regresar a CONFIRMED)
      expect(stateMachine.getPendingOrder()?.state).toBe('COMPLETED');

      const duplicateExecution = await toolsExecutor.executeToolCall('emitir_orden_compra', {
        producto: 'Laptops ThinkPad',
        cantidad: 14
      });

      expect(duplicateExecution.success).toBe(false);
      expect(duplicateExecution.rawOutput).toBeNull();
      expect(duplicateExecution.payload.errorCode).toBe('ALREADY_COMPLETED');
      expect((duplicateExecution.payload.error as string)).toContain('ya fue emitida y completada');
      expect(stateMachine.getPendingOrder()?.state).toBe('COMPLETED');
    });
  });

  // =========================================================================
  // 2. HALLAZGO 2: Errores sin representación [object Object] y tipado estricto
  // =========================================================================
  describe('Hallazgo 2: Errores de herramientas sin [object Object]', () => {
    it('consultar_stock con producto inexistente devuelve payload estructurado con mensaje string legible', async () => {
      const result = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'producto_inexistente_xyz'
      });

      expect(result.success).toBe(false);
      expect(result.rawOutput).toBeNull();
      expect(typeof result.payload.error).toBe('string');
      expect(result.payload.errorCode).toBe('PRODUCT_NOT_FOUND');
      // stockDisponible no debe existir en fallos
      expect(result.payload.stockDisponible).toBeUndefined();
    });

    it('consultar_stock exitoso devuelve un número entero estrictamente válido', async () => {
      const result = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'Laptops ThinkPad'
      });

      expect(result.success).toBe(true);
      expect(typeof result.rawOutput).toBe('number');
      expect(Number.isInteger(result.rawOutput)).toBe(true);
      expect(typeof result.payload.stockDisponible).toBe('number');
      expect(Number.isInteger(result.payload.stockDisponible)).toBe(true);
    });

    it('simula la lógica de renderizado del frontend para asegurar que jamás muestre [object Object]', () => {
      // Función pura espejo de la lógica implementada en ChatMessageItem.tsx
      const renderBadgeStock = (call: { success: boolean; output: unknown }) => {
        if (!call.success) {
          const outputObj =
            typeof call.output === 'object' && call.output !== null
              ? (call.output as Record<string, unknown>)
              : {};
          const errCode = outputObj.errorCode as string | undefined;
          return errCode === 'AMBIGUOUS_PRODUCT'
            ? 'Término ambiguo'
            : errCode === 'CATALOG_QUERY_NOT_A_PRODUCT'
            ? 'Consulta general'
            : 'No encontrado';
        }

        let stock: number | null = null;
        if (typeof call.output === 'object' && call.output !== null && 'stockDisponible' in call.output) {
          const parsed = Number((call.output as { stockDisponible: unknown }).stockDisponible);
          if (Number.isInteger(parsed)) stock = parsed;
        } else if (typeof call.output === 'number' && Number.isInteger(call.output)) {
          stock = call.output;
        }

        return stock !== null ? `${stock} u. disp.` : 'Consultado';
      };

      // Caso 1: Error con objeto de error
      const badCall = {
        success: false,
        output: { error: 'No existe producto', errorCode: 'PRODUCT_NOT_FOUND' }
      };
      const renderedBad = renderBadgeStock(badCall);
      expect(renderedBad).not.toContain('[object Object]');
      expect(renderedBad).toBe('No encontrado');

      // Caso 2: Error ambiguo
      const ambigCall = {
        success: false,
        output: { error: 'Múltiples modelos', errorCode: 'AMBIGUOUS_PRODUCT' }
      };
      const renderedAmbig = renderBadgeStock(ambigCall);
      expect(renderedAmbig).not.toContain('[object Object]');
      expect(renderedAmbig).toBe('Término ambiguo');

      // Caso 3: Éxito con 3 unidades
      const goodCall = {
        success: true,
        output: { stockDisponible: 3 }
      };
      const renderedGood = renderBadgeStock(goodCall);
      expect(renderedGood).toBe('3 u. disp.');
    });
  });

  // =========================================================================
  // 3. HALLAZGO 3: Consultas generales de catálogo
  // =========================================================================
  describe('Hallazgo 3: Consultas generales sobre catálogo', () => {
    const metaQueries = [
      'catalogo',
      'el catalogo',
      'catalogo general',
      'todos los productos',
      'todos los productos del inventario',
      'inventario',
      'inventario general'
    ];

    metaQueries.forEach(term => {
      it(`detecta '${term}' como consulta general de catálogo y no como producto individual`, async () => {
        const result = await toolsExecutor.executeToolCall('consultar_stock', {
          producto: term
        });

        expect(result.success).toBe(false);
        expect(result.payload.errorCode).toBe('CATALOG_QUERY_NOT_A_PRODUCT');
        expect((result.payload.error as string)).toContain('no para consultas generales');
        expect(result.payload.instruccionParaAgente).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 4. HALLAZGO 4: Nombres de productos ambiguos y resolución de licencias
  // =========================================================================
  describe('Hallazgo 4: Manejo de ambigüedad y resolución de licencias', () => {
    it('detecta término ambiguo "servidor" y retorna los dos modelos reales existentes', async () => {
      const result = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'servidor'
      });

      expect(result.success).toBe(false);
      expect(result.payload.errorCode).toBe('AMBIGUOUS_PRODUCT');
      const opciones = result.payload.opcionesDisponibles as string[];
      expect(opciones).toContain('Servidor Dell R740');
      expect(opciones).toContain('Servidor HP ProLiant');
    });

    it('detecta término ambiguo "switch" y retorna los dos modelos reales existentes', async () => {
      const result = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'switch'
      });

      expect(result.success).toBe(false);
      expect(result.payload.errorCode).toBe('AMBIGUOUS_PRODUCT');
      const opciones = result.payload.opcionesDisponibles as string[];
      expect(opciones).toContain('Switch Cisco 48p');
      expect(opciones).toContain('Switch Ubiquiti 24p');
    });

    it('resuelve correctamente modelos específicos de servidor sin ambigüedad', async () => {
      // Servidor Dell R740
      const dellResult = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'servidor dell r740'
      });
      expect(dellResult.success).toBe(true);
      expect(Number.isInteger(dellResult.payload.stockDisponible)).toBe(true);

      // Servidor HP ProLiant
      const hpResult = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'servidor hp proliant'
      });
      expect(hpResult.success).toBe(true);
      expect(Number.isInteger(hpResult.payload.stockDisponible)).toBe(true);
    });

    it('resuelve "licencia de windows" correctamente en MockInventoryRepository', async () => {
      const result = await toolsExecutor.executeToolCall('consultar_stock', {
        producto: 'licencia de windows'
      });

      expect(result.success).toBe(true);
      expect(result.payload.stockDisponible).toBeGreaterThan(0);
      expect(result.payload.metadatos).toBeDefined();
    });

    it('resuelve "licencia de windows" correctamente en DocumentInventoryRepository', async () => {
      const docExecutor = new InventoryToolsExecutor(docRepo, stateMachine);
      const result = await docExecutor.executeToolCall('consultar_stock', {
        producto: 'licencia de windows'
      });

      expect(result.success).toBe(true);
      // En document inventory hay 4 licencias físicas de Windows Server 2022
      expect(result.payload.stockDisponible).toBe(4);
      expect((result.payload.metadatos as { productKey: string }).productKey).toBe('licencias-windows-server-2022');
    });
  });

  // =========================================================================
  // 5. CAMBIO DE INVENTARIO Y AISLAMIENTO ENTRE SESIONES
  // =========================================================================
  describe('Persistencia: Cambio de inventario y aislamiento entre sesiones', () => {
    let sessionStore: InMemorySessionStore;
    let orchestrator: MultiProviderOrchestrator;

    beforeEach(() => {
      sessionStore = new InMemorySessionStore();
      orchestrator = new MultiProviderOrchestrator(sessionStore);
    });

    it('cambiar de inventario invalida compras pendientes e historial', async () => {
      const session = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });

      // Simular orden pendiente activa en la sesión
      session.pendingOrder = {
        rawProduct: 'Laptops ThinkPad',
        normalizedProduct: 'laptops thinkpad',
        canonicalProductKey: 'laptops-thinkpad',
        requiredQuantity: 10,
        availableStock: 3,
        missingQuantity: 7,
        state: 'AWAITING_CONFIRMATION',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await sessionStore.saveSession(session);

      // Cambio a inventario no estructurado
      const updated = await orchestrator.updateSessionSettings(session.sessionId, session.sessionSecret, {
        inventoryMode: 'unstructured'
      });

      expect(updated.inventoryMode).toBe('unstructured');
      expect(updated.pendingOrder).toBeNull();
      expect(updated.history.length).toBe(0);
    });

    it('dos sesiones diferentes tienen aislamiento total de estado y autorizaciones', async () => {
      const session1 = await orchestrator.createSession({ provider: 'gemini' });
      const session2 = await orchestrator.createSession({ provider: 'gemini' });

      session1.pendingOrder = {
        rawProduct: 'Monitores Dell 27',
        normalizedProduct: 'monitores dell 27',
        canonicalProductKey: 'monitores-dell-27',
        requiredQuantity: 5,
        availableStock: 2,
        missingQuantity: 3,
        state: 'CONFIRMED',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await sessionStore.saveSession(session1);

      const s1FromStore = await sessionStore.getSession(session1.sessionId);
      const s2FromStore = await sessionStore.getSession(session2.sessionId);

      expect(s1FromStore?.pendingOrder?.state).toBe('CONFIRMED');
      expect(s2FromStore?.pendingOrder).toBeNull();
    });
  });
});
