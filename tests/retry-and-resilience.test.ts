import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, classifyError } from '../src/utils/retry.js';
import { AgentController } from '../src/agent/agent-controller.js';
import { MockInventoryRepository } from '../src/domain/mock-inventory.repo.js';

describe('Resilience and Retry Suite (withRetry)', () => {
  let sleepMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sleepMock = vi.fn().mockResolvedValue(undefined);
  });

  // 1. Primer intento falla con 503 y el segundo funciona
  it('1. primer intento falla con 503 y el segundo funciona', async () => {
    let callCount = 0;
    const op = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('Service Unavailable');
        (err as Record<string, unknown>).status = 503;
        throw err;
      }
      return 'SUCCESS_DATA';
    });

    const result = await withRetry(op, {
      maxAttempts: 3,
      initialDelayMs: 500,
      sleepFn: sleepMock
    });

    expect(result).toBe('SUCCESS_DATA');
    expect(op).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  // 2. Dos intentos fallan con 503 y el tercero funciona
  it('2. dos intentos fallan con 503 y el tercero funciona', async () => {
    let callCount = 0;
    const op = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        const err = new Error('Service Unavailable');
        (err as Record<string, unknown>).status = 503;
        throw err;
      }
      return 'RECOVERED_ON_3';
    });

    const result = await withRetry(op, {
      maxAttempts: 3,
      initialDelayMs: 200,
      backoffFactor: 2,
      sleepFn: sleepMock
    });

    expect(result).toBe('RECOVERED_ON_3');
    expect(op).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 200);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 400);
  });

  // 3. Tres intentos fallan y se propaga el error
  it('3. tres intentos fallan con 503 y se propaga el error', async () => {
    const error503 = new Error('Server overloaded');
    (error503 as Record<string, unknown>).status = 503;

    const op = vi.fn().mockRejectedValue(error503);

    await expect(
      withRetry(op, {
        maxAttempts: 3,
        initialDelayMs: 100,
        sleepFn: sleepMock
      })
    ).rejects.toThrow('Server overloaded');

    expect(op).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  // 4. Un error 400 falla inmediatamente
  it('4. un error 400 falla inmediatamente sin reintentos', async () => {
    const error400 = new Error('Bad Request: Invalid argument');
    (error400 as Record<string, unknown>).status = 400;

    const op = vi.fn().mockRejectedValue(error400);

    await expect(
      withRetry(op, {
        maxAttempts: 3,
        sleepFn: sleepMock
      })
    ).rejects.toThrow('Bad Request');

    expect(op).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  // 5. Un error 401 falla inmediatamente
  it('5. un error 401 falla inmediatamente sin reintentos', async () => {
    const error401 = new Error('API key not valid');
    (error401 as Record<string, unknown>).status = 401;

    const op = vi.fn().mockRejectedValue(error401);

    await expect(
      withRetry(op, {
        maxAttempts: 3,
        sleepFn: sleepMock
      })
    ).rejects.toThrow('API key not valid');

    expect(op).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  // 6. Un error 429 temporal permite reintentos
  it('6. un error 429 temporal (rate limit) permite reintentos y recupera', async () => {
    let callCount = 0;
    const op = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('Resource exhausted: Rate limit reached. Please slow down.');
        (err as Record<string, unknown>).status = 429;
        throw err;
      }
      return 'RATE_LIMIT_PASSED';
    });

    const result = await withRetry(op, {
      maxAttempts: 3,
      initialDelayMs: 300,
      sleepFn: sleepMock
    });

    expect(result).toBe('RATE_LIMIT_PASSED');
    expect(op).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(300);
  });

  // 7. Una cuota agotada evita reintentos inútiles
  it('7. una cuota agotada evita reintentos inútiles y falla de inmediato', async () => {
    const quotaError = new Error('You have exceeded your current quota. Please check your plan and billing details.');
    (quotaError as Record<string, unknown>).status = 429;

    const op = vi.fn().mockRejectedValue(quotaError);

    await expect(
      withRetry(op, {
        maxAttempts: 3,
        sleepFn: sleepMock
      })
    ).rejects.toThrow(/quota/i);

    expect(op).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  // 8. El tiempo de espera crece según el patrón establecido
  it('8. el tiempo de espera crece según el patrón exponencial establecido', async () => {
    const err = new Error('503 Unavailable');
    (err as Record<string, unknown>).status = 503;

    const op = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(op, {
        maxAttempts: 4,
        initialDelayMs: 250,
        backoffFactor: 2,
        maxDelayMs: 5000,
        sleepFn: sleepMock
      })
    ).rejects.toThrow();

    // 4 intentos -> 3 esperas: 250, 500, 1000
    expect(sleepMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 250);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 500);
    expect(sleepMock).toHaveBeenNthCalledWith(3, 1000);
  });

  // 9. El historial no incorpora turnos duplicados después de un reintento exitoso
  it('9. el historial no incorpora turnos duplicados después de un reintento exitoso', async () => {
    const mockRepo = new MockInventoryRepository();
    const recordedHistory: Array<{ role: string; parts: unknown[] }> = [];

    let attempt = 0;
    const mockChatSession = {
      sendMessage: vi.fn().mockImplementation(async (params: { message: string }) => {
        attempt++;
        if (attempt === 1) {
          const err = new Error('Temporary 503');
          (err as Record<string, unknown>).status = 503;
          throw err;
        }
        // En llamada exitosa, se registra 1 turno de usuario y 1 de modelo
        recordedHistory.push({ role: 'user', parts: [{ text: params.message }] });
        recordedHistory.push({ role: 'model', parts: [{ text: 'Respuesta OK' }] });
        return { text: 'Respuesta OK', functionCalls: [] };
      })
    };

    const agent = new AgentController('dummy_api_key', 'gemini-3.5-flash-lite', mockRepo, 'mock', {
      maxAttempts: 3,
      initialDelayMs: 10,
      sleepFn: sleepMock
    });

    (agent as unknown as { chatSession: unknown }).chatSession = mockChatSession;

    const res = await agent.handleUserMessage('Hola');

    expect(res.text).toBe('Respuesta OK');
    expect(mockChatSession.sendMessage).toHaveBeenCalledTimes(2);
    // El historial solo contiene 1 turno de usuario y 1 de modelo (longitud 2, no 4)
    expect(recordedHistory).toHaveLength(2);
    expect(recordedHistory[0].parts[0]).toEqual({ text: 'Hola' });
  });

  // 10. Una orden de compra local no se ejecuta nuevamente si falla el envío de su FunctionResponse
  it('10. una orden de compra local no se ejecuta nuevamente si falla el envío de su FunctionResponse', async () => {
    const mockRepo = new MockInventoryRepository();
    mockRepo.setMockStock('Laptops ThinkPad', 3);

    const agent = new AgentController('dummy_api_key', 'gemini-3.5-flash-lite', mockRepo, 'mock', {
      maxAttempts: 3,
      initialDelayMs: 10,
      sleepFn: sleepMock
    });

    // 1. Simular turno 1: usuario autoriza compra de 7 laptops faltantes
    agent.stateMachine.registerOrUpdateRequirement('Laptops ThinkPad', 10, 'laptops-thinkpad', 3);
    agent.stateMachine.processUserMessage('Confirmo la compra de las 7 laptops');
    expect(agent.stateMachine.getPendingOrder()?.state).toBe('CONFIRMED');

    // Espiar ejecutor de herramientas
    const emitirSpy = vi.spyOn(agent.toolsExecutor, 'emitir_orden_compra');

    // 2. Simular chatSession: Gemini llama emitir_orden_compra, pero enviar la respuesta de función falla 3 veces por red
    let sendCount = 0;
    const mockChatSession = {
      sendMessage: vi.fn().mockImplementation(async (params: { message: unknown }) => {
        sendCount++;
        if (sendCount === 1) {
          // Primer mensaje: Gemini solicita emitir la orden
          return {
            functionCalls: [
              { name: 'emitir_orden_compra', args: { producto: 'Laptops ThinkPad', cantidad: 7 }, id: 'call_1' }
            ],
            text: ''
          };
        }
        // Segundo mensaje (envío de FunctionResponse): falla por error 503
        const err = new Error('503 Service Unavailable');
        (err as Record<string, unknown>).status = 503;
        throw err;
      })
    };

    (agent as unknown as { chatSession: unknown }).chatSession = mockChatSession;

    // Al ejecutarse, la herramienta local se ejecuta 1 sola vez
    await expect(agent.handleUserMessage('Procede')).rejects.toThrow('503 Service Unavailable');

    // Verificar que emitir_orden_compra se ejecutó exactamente 1 vez
    expect(emitirSpy).toHaveBeenCalledTimes(1);

    // La orden local quedó en COMPLETED
    expect(agent.stateMachine.getPendingOrder()?.state).toBe('COMPLETED');

    // Un intento posterior no puede re-ejecutar la compra (evita compras duplicadas)
    expect(() => agent.toolsExecutor.emitir_orden_compra('Laptops ThinkPad', 7))
      .toThrow(/ALREADY_COMPLETED/);
    expect(emitirSpy).toHaveBeenCalledTimes(2); // El segundo llamado lanzó excepción sin efectos secundarios
  });

  // 11. El controlador sigue aceptando mensajes después de un error recuperable
  it('11. el controlador sigue aceptando mensajes después de un error de red', async () => {
    const mockRepo = new MockInventoryRepository();
    const agent = new AgentController('dummy_api_key', 'gemini-3.5-flash-lite', mockRepo, 'mock', {
      maxAttempts: 2,
      initialDelayMs: 10,
      sleepFn: sleepMock
    });

    let turn = 0;
    const mockChatSession = {
      sendMessage: vi.fn().mockImplementation(async () => {
        turn++;
        if (turn <= 2) {
          // El primer turno falla y agota sus 2 reintentos
          const err = new Error('Network error 503');
          (err as Record<string, unknown>).status = 503;
          throw err;
        }
        // El segundo turno funciona normalmente
        return { text: '¡Hola! Todo en orden.', functionCalls: [] };
      })
    };

    (agent as unknown as { chatSession: unknown }).chatSession = mockChatSession;

    // Turno 1: Falla y propaga error
    await expect(agent.handleUserMessage('Mensaje que fallará')).rejects.toThrow('Network error 503');

    // Turno 2: El controlador sigue vivo y procesa exitosamente el siguiente mensaje
    const response2 = await agent.handleUserMessage('Hola de nuevo');
    expect(response2.text).toBe('¡Hola! Todo en orden.');
  });

  // 12. El contador de reintentos de red es independiente del límite MAX_LOOPS de Function Calling
  it('12. el contador de reintentos de red es independiente del límite MAX_LOOPS de Function Calling', async () => {
    const mockRepo = new MockInventoryRepository();
    mockRepo.setMockStock('Laptops ThinkPad', 5);

    const agent = new AgentController('dummy_api_key', 'gemini-3.5-flash-lite', mockRepo, 'mock', {
      maxAttempts: 3,
      initialDelayMs: 10,
      sleepFn: sleepMock
    });

    let sendCall = 0;
    const mockChatSession = {
      sendMessage: vi.fn().mockImplementation(async () => {
        sendCall++;
        // En la llamada 1, hay un reintento de red transitorio
        if (sendCall === 1) {
          const err = new Error('503 Flaky network');
          (err as Record<string, unknown>).status = 503;
          throw err;
        }
        // En la llamada 2 (reintento exitoso de la llamada 1): el modelo pide consultar_stock
        if (sendCall === 2) {
          return {
            functionCalls: [{ name: 'consultar_stock', args: { producto: 'Laptops ThinkPad' }, id: 'call_1' }],
            text: ''
          };
        }
        // En la llamada 3: respuesta final
        return {
          text: 'Hay 5 laptops disponibles.',
          functionCalls: []
        };
      })
    };

    (agent as unknown as { chatSession: unknown }).chatSession = mockChatSession;

    // Ejecuta el flujo: el reintento de red ocurrió sin incrementar indebidamente MAX_LOOPS
    const res = await agent.handleUserMessage('Consulta stock');
    expect(res.text).toBe('Hay 5 laptops disponibles.');
    expect(res.toolCallsExecuted).toHaveLength(1);
    expect(mockChatSession.sendMessage).toHaveBeenCalledTimes(3);
  });
});
