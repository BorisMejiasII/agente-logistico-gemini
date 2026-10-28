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
  idempotencyRecords?: Record<string, { response: unknown; timestamp: number }>;
}

export interface ISessionStore {
  readonly storeType: 'in-memory' | 'upstash-redis';
  getSession(sessionId: string): Promise<StoredSession | null>;
  saveSession(session: StoredSession, ttlSeconds?: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  acquireLock(sessionId: string, ttlMs?: number): Promise<boolean>;
  releaseLock(sessionId: string): Promise<void>;
}
