import crypto from 'crypto';
import { LLMProviderId, StoredChatMessage, ProviderToolExecution } from '../providers/provider.interface.js';
import { GeminiProvider } from '../providers/gemini.provider.js';
import { OpenAIProvider } from '../providers/openai.provider.js';
import { ISessionStore, StoredSession } from '../storage/session-store.interface.js';
import { getSessionStore } from '../storage/session-store.factory.js';
import { MockInventoryRepository } from '../domain/mock-inventory.repo.js';
import { DocumentInventoryRepository } from '../domain/document-inventory.repo.js';
import { OrderStateMachine } from '../tools/order-state-machine.js';
import { InventoryToolsExecutor } from '../tools/inventory.tools.js';
import { PendingOrder } from '../domain/inventory.types.js';
import { classifyError } from '../utils/retry.js';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`La sesión '${sessionId}' no existe o ha expirado.`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionUnauthorizedError extends Error {
  constructor() {
    super('Acceso no autorizado a la sesión. El token secreto de sesión es inválido.');
    this.name = 'SessionUnauthorizedError';
  }
}

export class SessionLockedError extends Error {
  constructor() {
    super('Existe una operación en curso para esta sesión. Por favor espera un momento.');
    this.name = 'SessionLockedError';
  }
}

export interface OrchestratorMessageInput {
  sessionId: string;
  sessionSecret: string;
  userMessage: string;
  apiKey: string;
  clientMessageId?: string;
  modelOverride?: string;
}

export interface OrchestratorMessageOutput {
  text: string;
  toolCallsExecuted: ProviderToolExecution[];
  pendingOrder: PendingOrder | null;
  sessionId: string;
  provider: LLMProviderId;
  inventoryMode: 'mock' | 'unstructured';
}

export class MultiProviderOrchestrator {
  private readonly geminiProvider: GeminiProvider;
  private readonly openAIProvider: OpenAIProvider;

  constructor(
    private readonly sessionStore: ISessionStore = getSessionStore(),
    geminiModel: string = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    openAIModel: string = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  ) {
    this.geminiProvider = new GeminiProvider(geminiModel);
    this.openAIProvider = new OpenAIProvider(openAIModel);
  }

  public getProvider(id: LLMProviderId) {
    return id === 'gemini' ? this.geminiProvider : this.openAIProvider;
  }

  /**
   * Crea una nueva sesión aislada con identificadores opacos y criptográficamente seguros.
   */
  public async createSession(options?: {
    provider?: LLMProviderId;
    inventoryMode?: 'mock' | 'unstructured';
  }): Promise<StoredSession> {
    const sessionId = crypto.randomUUID();
    const sessionSecret = crypto.randomBytes(24).toString('hex');
    const provider: LLMProviderId = options?.provider === 'openai' ? 'openai' : 'gemini';
    const inventoryMode = options?.inventoryMode === 'unstructured' ? 'unstructured' : 'mock';

    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId,
      sessionSecret,
      provider,
      inventoryMode,
      mockStocks: {},
      pendingOrder: null,
      history: [],
      createdAt: now,
      updatedAt: now,
      idempotencyRecords: {}
    };

    await this.sessionStore.saveSession(session);
    return session;
  }

  /**
   * Valida propiedad y existencia de una sesión.
   */
  public async getAndValidateSession(
    sessionId: string,
    sessionSecret: string
  ): Promise<StoredSession> {
    const session = await this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.sessionSecret !== sessionSecret) {
      throw new SessionUnauthorizedError();
    }
    return session;
  }

  /**
   * Cambia de proveedor o de inventario, invalidando deterministamente autorizaciones previas.
   */
  public async updateSessionSettings(
    sessionId: string,
    sessionSecret: string,
    updates: {
      provider?: LLMProviderId;
      inventoryMode?: 'mock' | 'unstructured';
      resetConversation?: boolean;
    }
  ): Promise<StoredSession> {
    const session = await this.getAndValidateSession(sessionId, sessionSecret);

    let changed = false;

    if (updates.provider && updates.provider !== session.provider) {
      session.provider = updates.provider;
      // Seguridad: Cambiar de proveedor invalida cualquier compra pendiente y reinicia el contexto
      session.pendingOrder = null;
      session.history = [];
      session.geminiRawHistory = undefined;
      session.openaiRawHistory = undefined;
      changed = true;
    }

    if (updates.inventoryMode && updates.inventoryMode !== session.inventoryMode) {
      session.inventoryMode = updates.inventoryMode;
      // Seguridad: Cambiar de inventario invalida compras y regenera stocks
      session.pendingOrder = null;
      session.mockStocks = {};
      session.history = [];
      session.geminiRawHistory = undefined;
      session.openaiRawHistory = undefined;
      changed = true;
    }

    if (updates.resetConversation) {
      session.pendingOrder = null;
      session.history = [];
      session.geminiRawHistory = undefined;
      session.openaiRawHistory = undefined;
      session.mockStocks = {};
      changed = true;
    }

    if (changed) {
      session.updatedAt = new Date().toISOString();
      await this.sessionStore.saveSession(session);
    }

    return session;
  }

  /**
   * Procesa un mensaje de usuario a través del proveedor activo con protecciones de concurrencia e idempotencia.
   */
  public async handleMessage(input: OrchestratorMessageInput): Promise<OrchestratorMessageOutput> {
    const { sessionId, sessionSecret, userMessage, apiKey, clientMessageId, modelOverride } = input;

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      throw new Error('El mensaje de usuario no puede estar vacío.');
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('La API Key del proveedor es requerida.');
    }

    // 1. Control de concurrencia mediante bloqueo atómico de sesión
    const lockAcquired = await this.sessionStore.acquireLock(sessionId, 12000);
    if (!lockAcquired) {
      throw new SessionLockedError();
    }

    try {
      const session = await this.getAndValidateSession(sessionId, sessionSecret);

      // 2. Control de idempotencia
      if (clientMessageId && session.idempotencyRecords?.[clientMessageId]) {
        const cached = session.idempotencyRecords[clientMessageId].response as OrchestratorMessageOutput;
        return cached;
      }

      // 3. Preparar repositorio según el modo de la sesión
      let repo: MockInventoryRepository | DocumentInventoryRepository;
      if (session.inventoryMode === 'mock') {
        const mockRepo = new MockInventoryRepository();
        mockRepo.loadStockMap(session.mockStocks || {});
        repo = mockRepo;
      } else {
        repo = new DocumentInventoryRepository();
      }

      // 4. Restaurar máquina de estados determinista
      const stateMachine = new OrderStateMachine();
      stateMachine.restoreState(session.pendingOrder);

      // 5. Configurar ejecutor de herramientas
      const toolsExecutor = new InventoryToolsExecutor(repo, stateMachine);

      // 6. Ejecutar turno con el proveedor seleccionado
      const provider = this.getProvider(session.provider);
      const rawHistory =
        session.provider === 'gemini' ? session.geminiRawHistory : session.openaiRawHistory;

      let turnResult;
      try {
        turnResult = await provider.sendMessage(
          userMessage.trim(),
          apiKey.trim(),
          {
            inventoryRepo: repo,
            stateMachine,
            toolsExecutor,
            history: session.history,
            rawHistory
          },
          modelOverride
        );
      } catch (err: unknown) {
        const classified = classifyError(err);
        if (classified.isQuotaExhausted) {
          throw new Error(`Cuota agotada en ${session.provider.toUpperCase()}. Por favor verifica tus créditos en la plataforma.`);
        }
        if (classified.status === 401 || classified.status === 403) {
          throw new Error(`La API Key ingresada para ${session.provider.toUpperCase()} no es válida o fue revocada.`);
        }
        throw err;
      }

      // 7. Actualizar existencias de sesión si estamos en modo mock
      if (session.inventoryMode === 'mock' && repo instanceof MockInventoryRepository) {
        session.mockStocks = repo.getStockMap();
      }

      // 8. Actualizar orden pendiente desde la máquina de estados
      session.pendingOrder = stateMachine.getPendingOrder();

      // 9. Actualizar historial de chat
      const nowIso = new Date().toISOString();
      const userMsgRecord: StoredChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessage.trim(),
        timestamp: nowIso
      };
      const assistantMsgRecord: StoredChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: turnResult.text,
        timestamp: new Date().toISOString(),
        toolCalls: turnResult.toolCallsExecuted
      };

      session.history.push(userMsgRecord, assistantMsgRecord);

      // Limitar historial persistido a los últimos 30 mensajes para evitar sobrecarga
      if (session.history.length > 30) {
        session.history = session.history.slice(session.history.length - 30);
      }

      // Guardar historial nativo del proveedor
      if (session.provider === 'gemini') {
        session.geminiRawHistory = turnResult.rawHistory;
      } else {
        session.openaiRawHistory = turnResult.rawHistory;
      }

      const output: OrchestratorMessageOutput = {
        text: turnResult.text,
        toolCallsExecuted: turnResult.toolCallsExecuted,
        pendingOrder: session.pendingOrder,
        sessionId: session.sessionId,
        provider: session.provider,
        inventoryMode: session.inventoryMode
      };

      // 10. Registrar clave de idempotencia
      if (clientMessageId) {
        session.idempotencyRecords = session.idempotencyRecords || {};
        session.idempotencyRecords[clientMessageId] = {
          response: output,
          timestamp: Date.now()
        };
      }

      session.updatedAt = new Date().toISOString();
      await this.sessionStore.saveSession(session);

      return output;
    } finally {
      await this.sessionStore.releaseLock(sessionId);
    }
  }
}
