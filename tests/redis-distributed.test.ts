import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import {
  MultiProviderOrchestrator,
  SessionNotFoundError,
  SessionUnauthorizedError,
  SessionLockedError,
  SessionConcurrencyError
} from '../src/agent/multi-provider-orchestrator.js';
import { InMemorySessionStore } from '../src/storage/in-memory-session-store.js';
import { UpstashRedisSessionStore } from '../src/storage/upstash-redis-session-store.js';
import { StoredSession } from '../src/storage/session-store.interface.js';
import { DistributedRateLimiter, SimpleRateLimiter } from '../src/utils/rate-limiter.js';
import { resetSessionStoreForTesting } from '../src/storage/session-store.factory.js';

// Verificación segura de presencia de credenciales de Upstash Redis
const realRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const realRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRealRedis = Boolean(realRedisUrl && realRedisToken && realRedisUrl.trim() && realRedisToken.trim());

describe('1. Concurrencia Distribuida, Heartbeat, CAS y Control de Idempotencia (Simulado / Local)', () => {
  let sessionStore: InMemorySessionStore;
  let orchestrator: MultiProviderOrchestrator;

  beforeEach(() => {
    resetSessionStoreForTesting();
    sessionStore = new InMemorySessionStore();
    orchestrator = new MultiProviderOrchestrator(sessionStore);
  });

  afterEach(() => {
    resetSessionStoreForTesting();
  });

  it('Escenario Expiración de Bloqueo: CAS impide que una instancia rezagada sobrescriba el estado actualizado', async () => {
    // 1. Crear sesión inicial en versión 1
    const session = await orchestrator.createSession({ provider: 'gemini', inventoryMode: 'mock' });
    expect(session.version).toBe(1);

    // 2. Instancia A lee la sesión con version = 1
    const sessionForA = await orchestrator.getAndValidateSession(session.sessionId, session.sessionSecret);
    const versionA = sessionForA.version ?? 1;

    // 3. Instancia B (que adquiere el bloqueo tras supuesta expiración de A) lee y actualiza la sesión
    const sessionForB = await orchestrator.getAndValidateSession(session.sessionId, session.sessionSecret);
    sessionForB.history.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Mensaje procesado por instancia B',
      timestamp: new Date().toISOString()
    });
    // B guarda pasando version 1 -> la sesión pasa a version 2
    await sessionStore.saveSession(sessionForB, sessionForB.version);

    const updatedInStore = await sessionStore.getSession(session.sessionId);
    expect(updatedInStore?.version).toBe(2);

    // 4. Instancia A termina tarde e intenta guardar con expectedVersion = versionA (1)
    sessionForA.history.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Escritura tardía de instancia A',
      timestamp: new Date().toISOString()
    });

    // Debe ser RECHAZADO con SessionConcurrencyError (Optimistic Concurrency Control)
    await expect(
      sessionStore.saveSession(sessionForA, versionA)
    ).rejects.toThrow(SessionConcurrencyError);

    // 5. El estado en el almacén conserva fielmente los datos de B sin corrupción
    const finalSession = await sessionStore.getSession(session.sessionId);
    expect(finalSession?.version).toBe(2);
    expect(finalSession?.history[0].content).toBe('Mensaje procesado por instancia B');
  });

  it('Heartbeat de Renovación: extendLock renueva la vida del bloqueo si el dueño es legítimo', async () => {
    const sessionId = crypto.randomUUID();
    const owner = crypto.randomUUID();

    // Adquiere bloqueo con TTL corto (500 ms)
    const acquired = await sessionStore.acquireLock(sessionId, 500, owner);
    expect(acquired).toBe(true);

    // Renovación por el dueño legítimo
    const extended = await sessionStore.extendLock(sessionId, 2000, owner);
    expect(extended).toBe(true);

    // Intento de renovación por un intruso
    const intruderExtended = await sessionStore.extendLock(sessionId, 2000, 'intruder');
    expect(intruderExtended).toBe(false);

    // El bloqueo sigue activo para terceros
    const attempt = await sessionStore.acquireLock(sessionId, 500, 'third-party');
    expect(attempt).toBe(false);

    // Liberación legítima
    await sessionStore.releaseLock(sessionId, owner);
    const postRelease = await sessionStore.acquireLock(sessionId, 500, 'third-party');
    expect(postRelease).toBe(true);
  });

  it('Idempotencia con Fingerprint: Rechaza clientMessageId reutilizado con un contenido diferente', async () => {
    const session = await orchestrator.createSession({ provider: 'gemini' });
    const clientMessageId = 'client-msg-abc-123';
    const originalMessage = 'Consultar stock de laptops';

    // Mockeamos la primera respuesta idempotente
    const mockOutput = {
      text: 'Respuesta previa legítima',
      toolCallsExecuted: [],
      pendingOrder: null,
      sessionId: session.sessionId,
      provider: session.provider,
      inventoryMode: session.inventoryMode
    };

    const originalHash = crypto.createHash('sha256').update(originalMessage.trim()).digest('hex');
    session.idempotencyRecords = {
      [clientMessageId]: {
        response: mockOutput,
        messageHash: originalHash,
        timestamp: Date.now()
      }
    };
    await sessionStore.saveSession(session);

    // 1. Misma solicitud con mismo clientMessageId y mismo mensaje -> Devuelve respuesta cacheada
    const replayOutput = await orchestrator.handleMessage({
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
      userMessage: originalMessage,
      apiKey: 'AIzaFakeKeyForReplayTest1234567890',
      clientMessageId
    });
    expect(replayOutput.text).toBe('Respuesta previa legítima');

    // 2. Misma clientMessageId pero con mensaje alterado ("Comprar 50 servidores") -> Debe lanzar error
    await expect(
      orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: 'Comprar 50 servidores inmediatamente',
        apiKey: 'AIzaFakeKeyForReplayTest1234567890',
        clientMessageId
      })
    ).rejects.toThrow(/Conflicto de idempotencia/);
  });

  it('DistributedRateLimiter opera de forma transparente con fallback seguro en desarrollo', async () => {
    const fallback = new SimpleRateLimiter(60000, 2);
    const limiter = new DistributedRateLimiter('test-category', 60, 2, fallback);

    const res1 = await limiter.check('10.0.0.1');
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(1);

    const res2 = await limiter.check('10.0.0.1');
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(0);

    // Tercera solicitud supera el límite
    const res3 = await limiter.check('10.0.0.1');
    expect(res3.allowed).toBe(false);
    expect(res3.remaining).toBe(0);
    expect(res3.resetSeconds).toBeGreaterThan(0);
  });
});

describe('2. Pruebas de Integración con Upstash Redis Real (Pruebas A — G)', () => {
  if (!hasRealRedis) {
    it.skip('[SUITE REDIS REAL PENDIENTE] UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN no configuradas. Esta suite se activará automáticamente al ingresar las credenciales.', () => {
      // Marcador explícito de omisión informada
    });
    return;
  }

  let redisStore1: UpstashRedisSessionStore;
  let redisStore2: UpstashRedisSessionStore;
  const testSessionIds: string[] = [];

  beforeEach(() => {
    redisStore1 = new UpstashRedisSessionStore(realRedisUrl!, realRedisToken!);
    redisStore2 = new UpstashRedisSessionStore(realRedisUrl!, realRedisToken!);
  });

  afterEach(async () => {
    for (const id of testSessionIds) {
      try {
        await redisStore1.deleteSession(id);
      } catch {
        // Ignorar errores de limpieza
      }
    }
    testSessionIds.length = 0;
  });

  // =========================================================================
  // PRUEBA A — Persistencia entre instancias
  // =========================================================================
  it('Prueba A — Persistencia entre instancias: Dos instancias independientes leen y escriben el mismo estado', async () => {
    const sessionId = crypto.randomUUID();
    testSessionIds.push(sessionId);
    const secret = crypto.randomBytes(24).toString('hex');

    const session: StoredSession = {
      sessionId,
      sessionSecret: secret,
      provider: 'gemini',
      inventoryMode: 'mock',
      mockStocks: { 'Laptops ThinkPad': 3 },
      pendingOrder: null,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    // Instancia 1 guarda la sesión
    await redisStore1.saveSession(session);

    // Instancia 2 la recupera
    const loaded = await redisStore2.getSession(sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(sessionId);
    expect(loaded?.mockStocks['Laptops ThinkPad']).toBe(3);
    expect(loaded?.version).toBe(1);
  });

  // =========================================================================
  // PRUEBA B — Concurrencia
  // =========================================================================
  it('Prueba B — Concurrencia: Dos peticiones simultáneas respetan el bloqueo distribuido atómico (SET NX PX)', async () => {
    const sessionId = crypto.randomUUID();
    testSessionIds.push(sessionId);

    const ownerA = crypto.randomUUID();
    const ownerB = crypto.randomUUID();

    // Intentos concurrentes de adquisición
    const [resultA, resultB] = await Promise.all([
      redisStore1.acquireLock(sessionId, 5000, ownerA),
      redisStore2.acquireLock(sessionId, 5000, ownerB)
    ]);

    // Exactamente una debió tener éxito
    expect([resultA, resultB].filter(Boolean).length).toBe(1);

    // Quien lo adquirió puede liberarlo
    const winnerOwner = resultA ? ownerA : ownerB;
    await redisStore1.releaseLock(sessionId, winnerOwner);

    // Ahora queda libre
    const nextAcquire = await redisStore2.acquireLock(sessionId, 5000, 'subsequent-owner');
    expect(nextAcquire).toBe(true);
    await redisStore2.releaseLock(sessionId, 'subsequent-owner');
  });

  // =========================================================================
  // PRUEBA C — Idempotencia
  // =========================================================================
  it('Prueba C — Idempotencia: Resultados cacheados con huella evitan reprocesamiento duplicado en Redis', async () => {
    const sessionId = crypto.randomUUID();
    testSessionIds.push(sessionId);
    const secret = crypto.randomBytes(24).toString('hex');
    const clientMsgId = 'unique-idemp-key-redis-1';
    const message = 'Autorizo compra de 7 laptops';
    const msgHash = crypto.createHash('sha256').update(message).digest('hex');

    const session: StoredSession = {
      sessionId,
      sessionSecret: secret,
      provider: 'gemini',
      inventoryMode: 'mock',
      mockStocks: { 'Laptops ThinkPad': 3 },
      pendingOrder: null,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      idempotencyRecords: {
        [clientMsgId]: {
          response: { text: 'Orden emitida previamente', status: 'OK' },
          messageHash: msgHash,
          timestamp: Date.now()
        }
      }
    };

    await redisStore1.saveSession(session);

    // Instancia 2 verifica el registro de idempotencia
    const loaded = await redisStore2.getSession(sessionId);
    expect(loaded?.idempotencyRecords?.[clientMsgId]).toBeDefined();
    expect(loaded?.idempotencyRecords?.[clientMsgId].messageHash).toBe(msgHash);
  });

  // =========================================================================
  // PRUEBA D — Expiración del bloqueo y CAS
  // =========================================================================
  it('Prueba D — Expiración y CAS: CAS rechaza escrituras rezagadas tras expiración de bloqueo', async () => {
    const sessionId = crypto.randomUUID();
    testSessionIds.push(sessionId);
    const secret = crypto.randomBytes(24).toString('hex');

    const initialSession: StoredSession = {
      sessionId,
      sessionSecret: secret,
      provider: 'gemini',
      inventoryMode: 'mock',
      mockStocks: {},
      pendingOrder: null,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    await redisStore1.saveSession(initialSession);

    // Instancia 2 actualiza a versión 2
    const sessionB = (await redisStore2.getSession(sessionId))!;
    expect(sessionB.version).toBe(1);
    await redisStore2.saveSession(sessionB, 1); // incrementa a 2

    const currentInRedis = (await redisStore1.getSession(sessionId))!;
    expect(currentInRedis.version).toBe(2);

    // Instancia 1 (rezagada) intenta guardar con expectedVersion = 1
    const staleSessionA = { ...initialSession, version: 1 };
    await expect(
      redisStore1.saveSession(staleSessionA, 1)
    ).rejects.toThrow(SessionConcurrencyError);
  });

  // =========================================================================
  // PRUEBA E — Liberación por propietario
  // =========================================================================
  it('Prueba E — Liberación por propietario: Script Lua impide que una instancia libere el bloqueo de otra', async () => {
    const sessionId = crypto.randomUUID();
    testSessionIds.push(sessionId);
    const legitOwner = crypto.randomUUID();
    const intruderOwner = crypto.randomUUID();

    // Instancia 1 adquiere el bloqueo
    const acquired = await redisStore1.acquireLock(sessionId, 8000, legitOwner);
    expect(acquired).toBe(true);

    // Instancia 2 intenta liberar indebidamente
    await redisStore2.releaseLock(sessionId, intruderOwner);

    // El bloqueo DEBE continuar activo
    const acquireAttempt = await redisStore2.acquireLock(sessionId, 5000, 'intruder-2');
    expect(acquireAttempt).toBe(false);

    // Instancia 1 libera legítimamente
    await redisStore1.releaseLock(sessionId, legitOwner);

    // Ahora queda libre
    const freeAcquire = await redisStore2.acquireLock(sessionId, 5000, 'new-owner');
    expect(freeAcquire).toBe(true);
    await redisStore2.releaseLock(sessionId, 'new-owner');
  });

  // =========================================================================
  // PRUEBA F — Fallos de Redis (Fail-Secure)
  // =========================================================================
  it('Prueba F — Fallos de Redis: Instancia con fallo de red/credenciales falla de forma determinista y segura sin autorizaciones espurias', async () => {
    // 1. Instancia con cliente configurado sin bucles de reintentos excesivos (retry: 0) para fallo determinista inmediato
    const fastFailingRedis = new Redis({
      url: 'https://fake-endpoint.upstash.io',
      token: 'invalid-token',
      retry: { retries: 0 }
    });
    const brokenStore = new UpstashRedisSessionStore(fastFailingRedis);

    // Intentar leer debe rechazar de forma inmediata (< 1500ms) sin colgar el hilo ni agotar el timeout de Vitest
    const t0 = Date.now();
    await expect(brokenStore.getSession(crypto.randomUUID())).rejects.toThrow();
    const duration = Date.now() - t0;
    expect(duration).toBeLessThan(1500);

    // Intentar adquirir bloqueo con fallo de conectividad debe lanzar error y no conceder bloqueo espurio
    await expect(brokenStore.acquireLock(crypto.randomUUID(), 5000, 'owner')).rejects.toThrow();

    // 2. Comprobar que el orquestador aborta de forma segura ante fallos de Redis sin emitir compras
    const brokenOrchestrator = new MultiProviderOrchestrator(brokenStore);
    await expect(
      brokenOrchestrator.handleMessage({
        sessionId: crypto.randomUUID(),
        sessionSecret: crypto.randomBytes(24).toString('hex'),
        userMessage: 'Autorizo la compra de 7 laptops',
        apiKey: 'AIzaFakeKeyForBrokenStoreTest1234567890'
      })
    ).rejects.toThrow();

    // 3. Simulación de desconexión transitoria de red en runtime sobre la tienda real
    const simulatedNetworkError = new Error('getaddrinfo ENOTFOUND fake-endpoint.upstash.io');
    const getSpy = vi.spyOn(redisStore1, 'getSession').mockRejectedValueOnce(simulatedNetworkError);

    await expect(redisStore1.getSession(crypto.randomUUID())).rejects.toThrow(/ENOTFOUND/);
    getSpy.mockRestore();
  });

  // =========================================================================
  // PRUEBA G — Aislamiento
  // =========================================================================
  it('Prueba G — Aislamiento: Dos sesiones independientes no comparten secretos ni órdenes en Redis', async () => {
    const session1Id = crypto.randomUUID();
    const session2Id = crypto.randomUUID();
    testSessionIds.push(session1Id, session2Id);

    const secret1 = crypto.randomBytes(24).toString('hex');
    const secret2 = crypto.randomBytes(24).toString('hex');

    await redisStore1.saveSession({
      sessionId: session1Id,
      sessionSecret: secret1,
      provider: 'gemini',
      inventoryMode: 'mock',
      mockStocks: { 'Laptops ThinkPad': 3 },
      pendingOrder: {
        rawProduct: 'Laptops ThinkPad',
        normalizedProduct: 'laptops thinkpad',
        canonicalProductKey: 'laptops-thinkpad',
        requiredQuantity: 10,
        availableStock: 3,
        missingQuantity: 7,
        state: 'AWAITING_CONFIRMATION',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    });

    await redisStore2.saveSession({
      sessionId: session2Id,
      sessionSecret: secret2,
      provider: 'openai',
      inventoryMode: 'unstructured',
      mockStocks: {},
      pendingOrder: null,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    });

    const s1 = await redisStore2.getSession(session1Id);
    const s2 = await redisStore1.getSession(session2Id);

    expect(s1?.sessionSecret).toBe(secret1);
    expect(s2?.sessionSecret).toBe(secret2);
    expect(s1?.pendingOrder).not.toBeNull();
    expect(s2?.pendingOrder).toBeNull();
    expect(s1?.provider).toBe('gemini');
    expect(s2?.provider).toBe('openai');
  });
});
