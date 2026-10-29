import { PendingOrder } from '../domain/inventory.types.js';
import { LLMProviderId, StoredChatMessage } from '../providers/provider.interface.js';

export interface StoredSession {
  sessionId: string;
  sessionSecret: string;
  provider: LLMProviderId;
  inventoryMode: 'mock' | 'unstructured';
  mockStocks: Record<string, number>;
  pendingOrder: PendingOrder | null;
  history: StoredChatMessage[];
  geminiRawHistory?: unknown;
  openaiRawHistory?: unknown;
  createdAt: string;
  updatedAt: string;
  version?: number;
  idempotencyRecords?: Record<string, {
    response: unknown;
    messageHash?: string;
    timestamp: number;
  }>;
}

export class SessionConcurrencyError extends Error {
  constructor(message = 'Conflicto de concurrencia: el estado de la sesión fue modificado por otra instancia o el bloqueo expiró.') {
    super(message);
    this.name = 'SessionConcurrencyError';
  }
}

export interface ISessionStore {
  readonly storeType: 'in-memory' | 'upstash-redis';
  getSession(sessionId: string): Promise<StoredSession | null>;
  saveSession(session: StoredSession, expectedVersion?: number, ttlSeconds?: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  acquireLock(sessionId: string, ttlMs?: number, lockOwner?: string): Promise<boolean>;
  releaseLock(sessionId: string, lockOwner?: string): Promise<void>;
  extendLock(sessionId: string, ttlMs?: number, lockOwner?: string): Promise<boolean>;
}
