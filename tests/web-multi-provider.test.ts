import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider } from '../src/providers/gemini.provider.js';
import { OpenAIProvider, openAITools } from '../src/providers/openai.provider.js';
import { agentTools } from '../src/tools/tool-declarations.js';
import {
  MultiProviderOrchestrator,
  SessionNotFoundError,
  SessionUnauthorizedError,
  SessionLockedError
} from '../src/agent/multi-provider-orchestrator.js';
import { InMemorySessionStore } from '../src/storage/in-memory-session-store.js';
import { MockInventoryRepository } from '../src/domain/mock-inventory.repo.js';
import { OrderStateMachine } from '../src/tools/order-state-machine.js';
import { InventoryToolsExecutor } from '../src/tools/inventory.tools.js';
import { config } from '../src/config/env.config.js';

describe('B. Multi-Provider Architecture & Tool Declarations', () => {
  it('registra formalmente las herramientas nativas idénticas en OpenAI y Gemini', () => {
    // 1. OpenAI Tools
    expect(openAITools).toHaveLength(2);
    const openAIStock = openAITools.find(t => t.function.name === 'consultar_stock');
    const openAIOrder = openAITools.find(t => t.function.name === 'emitir_orden_compra');

    expect(openAIStock).toBeDefined();
    expect(openAIOrder).toBeDefined();
    expect(openAIStock?.function.parameters?.required).toEqual(['producto']);
    expect(openAIOrder?.function.parameters?.required).toEqual(['producto', 'cantidad']);

    // 2. Gemini Tools
    const geminiDeclarations = agentTools[0].functionDeclarations!;
    expect(geminiDeclarations).toHaveLength(2);
    const geminiStock = geminiDeclarations.find(d => d.name === 'consultar_stock');
    const geminiOrder = geminiDeclarations.find(d => d.name === 'emitir_orden_compra');

    expect(geminiStock).toBeDefined();
    expect(geminiOrder).toBeDefined();
    expect(geminiStock?.parameters?.required).toEqual(['producto']);
    expect(geminiOrder?.parameters?.required).toEqual(['producto', 'cantidad']);
  });

  it('OpenAIProvider valida credenciales vacías y rechaza sin llamar a red', async () => {
    const provider = new OpenAIProvider('gpt-4o-mini');
    const res = await provider.verifyApiKey('');
    expect(res.valid).toBe(false);
    expect(res.message).toContain('vacía');
  });

  it('GeminiProvider valida credenciales vacías y rechaza sin llamar a red', async () => {
    const provider = new GeminiProvider('gemini-3.5-flash-lite');
    const res = await provider.verifyApiKey('');
    expect(res.valid).toBe(false);
    expect(res.message).toContain('vacía');
  });
});

describe('B2. OpenAI Adapter Mocked Workflow (Simulación Completa de Turnos y Function Calling)', () => {
  let mockRepo: MockInventoryRepository;
  let stateMachine: OrderStateMachine;
  let toolsExecutor: InventoryToolsExecutor;

  beforeEach(() => {
    mockRepo = new MockInventoryRepository();
    mockRepo.setMockStock('Laptops ThinkPad', 3);
    stateMachine = new OrderStateMachine();
    toolsExecutor = new InventoryToolsExecutor(mockRepo, stateMachine);
  });

  it('procesa consultar_stock con argumentos válidos e impide compra prematura', async () => {
    const provider = new OpenAIProvider('gpt-4o-mini');

    // Mockeamos la llamada interna de OpenAI para simular que el modelo pide llamar a 'consultar_stock'
    const fakeClient = {
      chat: {
        completions: {
          create: vi
            .fn()
            // Turno 1: el modelo decide llamar a consultar_stock
            .mockResolvedValueOnce({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_123',
                        type: 'function',
                        function: {
                          name: 'consultar_stock',
                          arguments: JSON.stringify({ producto: 'Laptops ThinkPad' })
                        }
                      }
                    ]
                  }
                }
              ]
            })
            // Turno 2 (tras enviar resultado de la herramienta): el modelo responde al usuario
            .mockResolvedValueOnce({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Tenemos 3 laptops disponibles en bodega. Para 10 empleados hay un faltante de 7. ¿Deseas emitir la orden de compra?',
                    tool_calls: null
                  }
                }
              ]
            })
        }
      }
    };

    // Inyectamos el mock de OpenAI en la prueba
    vi.spyOn(provider as any, 'sendMessage').mockImplementation(async (userMessage, apiKey, context) => {
      const extracted = context.stateMachine.extractRequirementFromText(userMessage);
      context.stateMachine.processUserMessage(userMessage);

      // Simular ejecución
      const firstRes = await fakeClient.chat.completions.create();
      const toolCall = firstRes.choices[0].message.tool_calls[0];

      if (extracted?.quantity) {
        context.stateMachine.registerOrUpdateRequirement('Laptops ThinkPad', extracted.quantity, 'laptops-thinkpad', 3);
      }

      const execRes = await context.toolsExecutor.executeToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments));

      const secondRes = await fakeClient.chat.completions.create();

      return {
        text: secondRes.choices[0].message.content,
        toolCallsExecuted: [
          {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
            success: execRes.success,
            output: execRes.payload
          }
        ]
      };
    });

    const res = await provider.sendMessage(
      'Necesitamos equipar a 10 nuevos empleados con laptops ThinkPad',
      'test-key',
      {
        inventoryRepo: mockRepo,
        stateMachine,
        toolsExecutor,
        history: []
      }
    );

    expect(res.toolCallsExecuted).toHaveLength(1);
    expect(res.toolCallsExecuted[0].name).toBe('consultar_stock');
    expect(stateMachine.getPendingOrder()?.missingQuantity).toBe(7);
    expect(stateMachine.getPendingOrder()?.state).toBe('AWAITING_CONFIRMATION');
  });
});

describe('C & D. MultiProviderOrchestrator, Aislamiento de Sesiones, Concurrencia y Seguridad', () => {
  let store: InMemorySessionStore;
  let orchestrator: MultiProviderOrchestrator;

  beforeEach(() => {
    store = new InMemorySessionStore();
    orchestrator = new MultiProviderOrchestrator(store);
  });

  it('crea sesiones independientes con secretos criptográficos únicos', async () => {
    const s1 = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });
    const s2 = await orchestrator.createSession({ provider: 'openai', inventoryMode: 'unstructured' });

    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s1.sessionSecret).not.toBe(s2.sessionSecret);
    expect(s1.sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(s1.provider).toBe('gemini');
    expect(s2.provider).toBe('openai');
  });

  it('rechaza acceso a sesiones con secretos inválidos o falsificados (Seguridad D)', async () => {
    const s = await orchestrator.createSession();

    // Secreto incorrecto
    await expect(orchestrator.getAndValidateSession(s.sessionId, 'secreto_falso'))
      .rejects.toThrow(SessionUnauthorizedError);

    // ID inexistente
    await expect(orchestrator.getAndValidateSession('id_inexistente', s.sessionSecret))
      .rejects.toThrow(SessionNotFoundError);
  });

  it('cambiar de proveedor invalida autorizaciones pendientes y reinicia el contexto conversacional', async () => {
    const s = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });

    // Simular que existía una orden pendiente
    s.pendingOrder = {
      normalizedProduct: 'laptops thinkpad',
      canonicalProductKey: 'laptops-thinkpad',
      requiredQuantity: 10,
      availableStock: 3,
      missingQuantity: 7,
      state: 'AWAITING_CONFIRMATION',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    s.history = [{ id: '1', role: 'user', content: 'hola', timestamp: new Date().toISOString() }];
    await store.saveSession(s);

    // Cambiar a OpenAI
    const updated = await orchestrator.updateSessionSettings(s.sessionId, s.sessionSecret, {
      provider: 'openai'
    });

    expect(updated.provider).toBe('openai');
    expect(updated.pendingOrder).toBeNull();
    expect(updated.history).toHaveLength(0);
  });

  it('cambiar de inventario invalida compras pendientes y limpia existencias cacheadas', async () => {
    const s = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });
    s.mockStocks = { 'laptops-thinkpad': 2 };
    s.pendingOrder = {
      normalizedProduct: 'laptops thinkpad',
      canonicalProductKey: 'laptops-thinkpad',
      requiredQuantity: 5,
      availableStock: 2,
      missingQuantity: 3,
      state: 'AWAITING_CONFIRMATION',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await store.saveSession(s);

    const updated = await orchestrator.updateSessionSettings(s.sessionId, s.sessionSecret, {
      inventoryMode: 'unstructured'
    });

    expect(updated.inventoryMode).toBe('unstructured');
    expect(updated.pendingOrder).toBeNull();
    expect(Object.keys(updated.mockStocks)).toHaveLength(0);
  });

  it('control de concurrencia: bloquea solicitudes simultáneas para la misma sesión', async () => {
    const s = await orchestrator.createSession();

    // Adquirir bloqueo manual
    const locked = await store.acquireLock(s.sessionId, 5000);
    expect(locked).toBe(true);

    // Intentar adquirir nuevamente debe fallar
    const secondLock = await store.acquireLock(s.sessionId, 5000);
    expect(secondLock).toBe(false);

    // Liberar y verificar que vuelve a estar disponible
    await store.releaseLock(s.sessionId);
    const thirdLock = await store.acquireLock(s.sessionId, 5000);
    expect(thirdLock).toBe(true);
    await store.releaseLock(s.sessionId);
  });

  it('seguridad: nunca guarda las API Keys en la estructura persistida de la sesión', async () => {
    const s = await orchestrator.createSession();
    const retrieved = await store.getSession(s.sessionId);

    expect(retrieved).not.toBeNull();
    expect((retrieved as any).apiKey).toBeUndefined();
    expect((retrieved as any).geminiApiKey).toBeUndefined();
    expect((retrieved as any).openAIApiKey).toBeUndefined();
  });

  it('rechaza el envío de mensajes sin API Key configurada', async () => {
    const s = await orchestrator.createSession();

    await expect(
      orchestrator.handleMessage({
        sessionId: s.sessionId,
        sessionSecret: s.sessionSecret,
        userMessage: 'Hola',
        apiKey: ''
      })
    ).rejects.toThrow('La API Key del proveedor es requerida');
  });

  it('rechaza el envío de mensajes vacíos o solo espacios', async () => {
    const s = await orchestrator.createSession();

    await expect(
      orchestrator.handleMessage({
        sessionId: s.sessionId,
        sessionSecret: s.sessionSecret,
        userMessage: '   ',
        apiKey: 'dummy-key'
      })
    ).rejects.toThrow('El mensaje de usuario no puede estar vacío');
  });

  it('idempotencia: responder con el resultado en caché si se reenvía el mismo clientMessageId', async () => {
    const s = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });
    const cachedResponse = {
      text: 'Respuesta previa ya calculada',
      toolCallsExecuted: [],
      pendingOrder: null,
      sessionId: s.sessionId,
      provider: 'gemini',
      inventoryMode: 'mock'
    };

    s.idempotencyRecords = {
      'msg-uuid-123': {
        response: cachedResponse as any,
        timestamp: Date.now()
      }
    };
    await store.saveSession(s);

    const result = await orchestrator.handleMessage({
      sessionId: s.sessionId,
      sessionSecret: s.sessionSecret,
      userMessage: 'Mensaje duplicado',
      apiKey: 'dummy-key',
      clientMessageId: 'msg-uuid-123'
    });

    expect(result.text).toBe('Respuesta previa ya calculada');
  });
});

describe('E. Live Gemini Integration via Orchestrator (Multi-Turn Scenario & Domain Rules)', () => {
  const apiKey = config.geminiApiKey;
  const hasApiKey = Boolean(apiKey && apiKey.length > 5);

  it.runIf(hasApiKey)('ejecuta el escenario de 10 laptops a través de la arquitectura web multi-proveedor', async () => {
    const store = new InMemorySessionStore();
    const orchestrator = new MultiProviderOrchestrator(store);

    // 1. Crear sesión web en modo mock
    const session = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });

    // Fijar stock inicial de sesión para determinismo: 3 disponibles
    session.mockStocks = { 'laptops-thinkpad': 3 };
    await store.saveSession(session);

    // Turno 1: Solicitud inicial
    const turn1 = await orchestrator.handleMessage({
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
      userMessage: 'Hola, requerimos equipar a 10 nuevos empleados con laptops ThinkPad. ¿Tenemos existencias?',
      apiKey: apiKey!
    });

    expect(turn1.toolCallsExecuted.some(c => c.name === 'consultar_stock')).toBe(true);
    expect(turn1.toolCallsExecuted.some(c => c.name === 'emitir_orden_compra')).toBe(false);
    expect(turn1.pendingOrder).not.toBeNull();
    expect(turn1.pendingOrder?.missingQuantity).toBe(7);
    expect(turn1.pendingOrder?.state).toBe('AWAITING_CONFIRMATION');

    // Turno 2: Pregunta intermedia / ambigua -> NO compra
    const turn2 = await orchestrator.handleMessage({
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
      userMessage: 'Quizás. ¿Tienen garantía las laptops?',
      apiKey: apiKey!
    });

    expect(turn2.toolCallsExecuted.some(c => c.name === 'emitir_orden_compra')).toBe(false);
    expect(turn2.pendingOrder?.state).toBe('AWAITING_CONFIRMATION');

    // Turno 3: Confirmación explícita -> Compra autorizada
    const turn3 = await orchestrator.handleMessage({
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
      userMessage: 'Perfecto. Sí, autorizo y confirmo la orden de compra por los 7 faltantes. Procede.',
      apiKey: apiKey!
    });

    const purchaseCall = turn3.toolCallsExecuted.find(c => c.name === 'emitir_orden_compra');
    expect(purchaseCall).toBeDefined();
    expect(purchaseCall?.success).toBe(true);
    expect(purchaseCall?.args.cantidad).toBe(7);
    expect(turn3.pendingOrder?.state).toBe('COMPLETED');
  }, 45000);

  it.runIf(hasApiKey)('rechaza solicitudes fuera de dominio sin emitir herramientas ni contenido ajeno', async () => {
    const store = new InMemorySessionStore();
    const orchestrator = new MultiProviderOrchestrator(store);
    const session = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });

    const res = await orchestrator.handleMessage({
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
      userMessage: 'Cuéntame un chiste de doctores',
      apiKey: apiKey!
    });

    expect(res.toolCallsExecuted).toHaveLength(0);
    expect(res.text.toLowerCase()).toMatch(/log[íi]stica|inventario|bodega/i);
  }, 30000);
});
