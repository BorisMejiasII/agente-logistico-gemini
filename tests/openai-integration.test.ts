import { describe, it, expect, beforeAll } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai.provider.js';
import { MultiProviderOrchestrator } from '../src/agent/multi-provider-orchestrator.js';
import { InMemorySessionStore } from '../src/storage/in-memory-session-store.js';
import { config } from '../src/config/env.config.js';

describe('OpenAI Live Integration Test (Autenticación Real, Conectividad y Escenario)', () => {
  const apiKey = config.openAiApiKey;
  const hasApiKey = Boolean(apiKey && apiKey.trim().length > 10);
  let isCreditAvailable = false;
  let creditStatusMessage = '';

  beforeAll(async () => {
    if (!hasApiKey) {
      console.warn(
        '\n[AVISO INTEGRACIÓN OPENAI] Omitiendo pruebas: OPENAI_API_KEY no está definida en .env o entorno local.\n'
      );
      return;
    }

    // 1. Verificación de autenticidad de la clave ante la API oficial de OpenAI (llamada liviana a models.list)
    const provider = new OpenAIProvider(config.openAiModel);
    const verification = await provider.verifyApiKey(apiKey!);

    if (!verification.valid) {
      creditStatusMessage = `API Key rechazada por OpenAI: ${verification.message}`;
      console.warn(`\n[AVISO INTEGRACIÓN OPENAI] ${creditStatusMessage}\n`);
      return;
    }

    console.log(
      `\n[AUTENTICACIÓN OPENAI] Conexión establecida con éxito. Modelo configurado: ${config.openAiModel}.`
    );

    // 2. Comprobar si la cuenta dispone de créditos prepagados para inferencia
    const store = new InMemorySessionStore();
    const orchestrator = new MultiProviderOrchestrator(store, config.geminiModel, config.openAiModel);
    const testSession = await orchestrator.createSession({ provider: 'openai', inventoryMode: 'mock' });

    try {
      await orchestrator.handleMessage({
        sessionId: testSession.sessionId,
        sessionSecret: testSession.sessionSecret,
        userMessage: 'Ping de prueba de cuota',
        apiKey: apiKey!
      });
      isCreditAvailable = true;
      creditStatusMessage = 'Créditos disponibles para inferencia.';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('Cuota agotada') ||
        msg.includes('insufficient_quota') ||
        msg.includes('credit_balance_exhausted') ||
        msg.includes('no credits remaining')
      ) {
        isCreditAvailable = false;
        creditStatusMessage =
          'API Key auténtica y válida ante OpenAI, pero la cuenta no tiene créditos prepagados activos (credit_balance_exhausted). ' +
          'Se requiere saldo en https://platform.openai.com/settings/organization/billing/ para ejecutar inferencias.';
        console.warn(`\n[ESTADO CUOTA OPENAI] ${creditStatusMessage}\n`);
      } else {
        creditStatusMessage = `Error de comunicación: ${msg}`;
        console.warn(`\n[ESTADO CUOTA OPENAI] ${creditStatusMessage}\n`);
      }
    }
  });

  it('comprueba que la clave de OpenAI está configurada y se autentica exitosamente', async () => {
    expect(hasApiKey).toBe(true);
    const provider = new OpenAIProvider(config.openAiModel);
    const res = await provider.verifyApiKey(apiKey!);
    expect(res.valid).toBe(true);
    expect(res.model).toBe(config.openAiModel);
  });

  it('reporta de forma transparente el estado de facturación y cuota sin inventar aprobaciones', () => {
    expect(creditStatusMessage).not.toBe('');
    if (!isCreditAvailable) {
      console.log(`[INFORME TÉCNICO FACTURACIÓN OPENAI] ${creditStatusMessage}`);
      expect(creditStatusMessage).toMatch(/credit_balance_exhausted|créditos|cuota/i);
    } else {
      expect(isCreditAvailable).toBe(true);
    }
  });

  it.runIf(hasApiKey && isCreditAvailable)(
    'ejecuta el escenario multi-turno completo de 10 laptops con OpenAI en vivo',
    async () => {
      const store = new InMemorySessionStore();
      const orchestrator = new MultiProviderOrchestrator(store, config.geminiModel, config.openAiModel);
      const session = await orchestrator.createSession({ provider: 'openai', inventoryMode: 'mock' });

      // Fijar stock inicial de sesión: 3 unidades disponibles -> 7 faltantes
      session.mockStocks = { 'laptops-thinkpad': 3 };
      await store.saveSession(session);

      // TURNO 1: Solicitud inicial
      const turn1 = await orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: 'Necesitamos equipar a 10 nuevos empleados con laptops',
        apiKey: apiKey!
      });

      expect(turn1.toolCallsExecuted.some(c => c.name === 'consultar_stock')).toBe(true);
      expect(turn1.toolCallsExecuted.some(c => c.name === 'emitir_orden_compra')).toBe(false);
      expect(turn1.pendingOrder?.missingQuantity).toBe(7);
      expect(turn1.pendingOrder?.state).toBe('AWAITING_CONFIRMATION');

      // TURNO 2: Pregunta ambigua
      const turn2 = await orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: 'Tal vez, pero antes dime cuánto tardarían en llegar',
        apiKey: apiKey!
      });

      expect(turn2.toolCallsExecuted.some(c => c.name === 'emitir_orden_compra')).toBe(false);
      expect(turn2.pendingOrder?.state).toBe('AWAITING_CONFIRMATION');

      // TURNO 3: Confirmación explícita
      const turn3 = await orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: 'Sí, autorizo expresamente la compra de las unidades faltantes. Procede',
        apiKey: apiKey!
      });

      const orderCall = turn3.toolCallsExecuted.find(c => c.name === 'emitir_orden_compra');
      expect(orderCall).toBeDefined();
      expect(orderCall?.args.cantidad).toBe(7);
      expect(turn3.pendingOrder?.state).toBe('COMPLETED');

      // TURNO 4: Prevención de duplicados
      await expect(
        orchestrator.handleMessage({
          sessionId: session.sessionId,
          sessionSecret: session.sessionSecret,
          userMessage: 'Sí, confirmo la compra',
          apiKey: apiKey!
        })
      ).rejects.toThrow();
    },
    60000
  );

  it.runIf(hasApiKey && isCreditAvailable)(
    'valida la restricción de dominio con OpenAI (rechazo de chiste y aceptación de stock)',
    async () => {
      const store = new InMemorySessionStore();
      const orchestrator = new MultiProviderOrchestrator(store, config.geminiModel, config.openAiModel);
      const session = await orchestrator.createSession({ provider: 'openai', inventoryMode: 'mock' });

      // Chiste -> Rechazo
      const resChiste = await orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: 'Cuéntame un chiste de programadores',
        apiKey: apiKey!
      });
      expect(resChiste.toolCallsExecuted).toHaveLength(0);
      expect(resChiste.text.toLowerCase()).toMatch(/log[íi]stica|inventario|bodega/i);

      // Consulta legítima -> consultar_stock
      const resStock = await orchestrator.handleMessage({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        userMessage: '¿Cuántas laptops tenemos disponibles?',
        apiKey: apiKey!
      });
      expect(resStock.toolCallsExecuted.some(c => c.name === 'consultar_stock')).toBe(true);
    },
    45000
  );
});
