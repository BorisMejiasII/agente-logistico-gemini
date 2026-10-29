import { ISessionStore, StoredSession, SessionConcurrencyError } from './session-store.interface.js';

interface InMemorySessionEntry {
  session: StoredSession;
  expiresAt: number;
}

export class InMemorySessionStore implements ISessionStore {
  public readonly storeType = 'in-memory';
  private readonly store = new Map<string, InMemorySessionEntry>();
  private readonly locks = new Map<string, { expiresAt: number; owner: string }>();

  constructor(private readonly defaultTtlSeconds: number = 3600) {
    // Limpieza periódica cada 10 minutos en entornos locales de larga duración
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.cleanupExpired(), 10 * 60 * 1000);
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(id);
      }
    }
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        this.locks.delete(id);
      }
    }
  }

  public async getSession(sessionId: string): Promise<StoredSession | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(sessionId);
      return null;
    }
    // Clon profundo para aislamiento de memoria
    return JSON.parse(JSON.stringify(entry.session));
  }

  public async saveSession(session: StoredSession, expectedVersion?: number, ttlSeconds?: number): Promise<void> {
    const current = this.store.get(session.sessionId);
    if (expectedVersion !== undefined && current) {
      const currentVersion = current.session.version ?? 1;
      if (currentVersion !== expectedVersion) {
        throw new SessionConcurrencyError(
          `Conflicto de concurrencia en sesión '${session.sessionId}': versión esperada ${expectedVersion}, pero la sesión fue modificada a versión ${currentVersion}.`
        );
      }
    }

    const nextVersion = current ? ((current.session.version ?? 0) + 1) : (session.version ?? 1);
    session.version = nextVersion;

    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(session.sessionId, {
      session: JSON.parse(JSON.stringify(session)),
      expiresAt
    });
  }

  public async deleteSession(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
    this.locks.delete(sessionId);
  }

  public async acquireLock(sessionId: string, ttlMs: number = 5000, lockOwner: string = '1'): Promise<boolean> {
    const now = Date.now();
    const existingLock = this.locks.get(sessionId);
    if (existingLock && existingLock.expiresAt > now) {
      return false; // Bloqueo activo por otra solicitud concurrente
    }
    this.locks.set(sessionId, { expiresAt: now + ttlMs, owner: lockOwner });
    return true;
  }

  public async extendLock(sessionId: string, ttlMs: number = 15000, lockOwner: string = '1'): Promise<boolean> {
    const now = Date.now();
    const current = this.locks.get(sessionId);
    if (!current || current.owner !== lockOwner || current.expiresAt <= now) {
      return false;
    }
    current.expiresAt = now + ttlMs;
    return true;
  }

  public async releaseLock(sessionId: string, lockOwner?: string): Promise<void> {
    if (!lockOwner) {
      this.locks.delete(sessionId);
      return;
    }
    const current = this.locks.get(sessionId);
    // Escenario 5: Solo el propietario legítimo del bloqueo puede liberarlo
    if (current && current.owner === lockOwner) {
      this.locks.delete(sessionId);
    }
  }

  public clearAll(): void {
    this.store.clear();
    this.locks.clear();
  }
}
