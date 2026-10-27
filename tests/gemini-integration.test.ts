import { describe, it, expect, beforeAll } from 'vitest';
import { AgentController } from '../src/agent/agent-controller.js';
import { MockInventoryRepository } from '../src/domain/mock-inventory.repo.js';
import { config } from '../src/config/env.config.js';

describe('Gemini Integration Test (Multi-Turn Workflow)', () => {
  const apiKey = config.geminiApiKey;
  const hasApiKey = Boolean(apiKey && apiKey.length > 5);

  beforeAll(() => {
    if (!hasApiKey) {
      console.warn(
        '\n[AVISO INTEGRACIÓN] Omitiendo pruebas en vivo con Gemini: GEMINI_API_KEY no está definida en .env o entorno.' +
        '\nTodas las pruebas unitarias y de máquina de estados ya se validaron en tests/inventory-and-state.test.ts.\n'
      );
    }
  });

  it.runIf(hasApiKey)('flujo conversacional multi-turno obligatorio con Gemini', async () => {
    const mockRepo = new MockInventoryRepository();
    // Fijar stock en 3 para tener un resultado predecible: 10 - 3 = 7 faltantes
    mockRepo.setMockStock('Laptops ThinkPad', 3);

    const agent = new AgentController(apiKey!, config.geminiModel, mockRepo, 'mock');

    // TURNO 1: Solicitud inicial del usuario
    const turn1Prompt = 'Hola, necesitamos equipar a 10 nuevos empleados con laptops ThinkPad. ¿Tenemos suficiente stock?';
    const turn1Res = await agent.handleUserMessage(turn1Prompt);

    // Debe haber consultado stock
    const stockCall = turn1Res.toolCallsExecuted.find(c => c.name === 'consultar_stock');
    expect(stockCall).toBeDefined();
    expect(stockCall?.success).toBe(true);

    // NO debe haber emitido la orden todavía
    const purchaseCallTurn1 = turn1Res.toolCallsExecuted.find(c => c.name === 'emitir_orden_compra');
    expect(purchaseCallTurn1).toBeUndefined();

    // La máquina de estados debe estar esperando confirmación por 7 unidades
    const orderStateTurn1 = agent.stateMachine.getPendingOrder();
    expect(orderStateTurn1).not.toBeNull();
    expect(orderStateTurn1?.missingQuantity).toBe(7);
    expect(orderStateTurn1?.state).toBe('AWAITING_CONFIRMATION');

    // TURNO 2: Respuesta ambigua / pregunta del usuario
    const turn2Prompt = 'Hmm, tal vez. ¿Cuánto tardan en llegar las laptops si las compramos hoy?';
    const turn2Res = await agent.handleUserMessage(turn2Prompt);

    // NO debe llamar a emitir_orden_compra ante ambigüedad
    const purchaseCallTurn2 = turn2Res.toolCallsExecuted.find(c => c.name === 'emitir_orden_compra');
    expect(purchaseCallTurn2).toBeUndefined();
    expect(agent.stateMachine.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');

    // TURNO 3: Confirmación inequívoca del usuario
    const turn3Prompt = 'Entendido. Sí, autorizo y confirmo la orden de compra por los 7 equipos faltantes. Procede.';
    const turn3Res = await agent.handleUserMessage(turn3Prompt);

    // Debe haber ejecutado emitir_orden_compra por 7 unidades
    const purchaseCallTurn3 = turn3Res.toolCallsExecuted.find(c => c.name === 'emitir_orden_compra');
    expect(purchaseCallTurn3).toBeDefined();
    expect(purchaseCallTurn3?.success).toBe(true);
    expect(purchaseCallTurn3?.args.cantidad).toBe(7);

    // La máquina de estados debe quedar en COMPLETED
    expect(agent.stateMachine.getPendingOrder()?.state).toBe('COMPLETED');
  }, 40000); // 40s timeout para llamadas de red a Gemini
});
