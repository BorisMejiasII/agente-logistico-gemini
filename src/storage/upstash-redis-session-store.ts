import { Redis } from '@upstash/redis';
import { ISessionStore, StoredSession } from './session-store.interface.js';

export class UpstashRedisSessionStore implements ISessionStore {
  public readonly storeType = 'upstash-redis';
  private readonly redis: Redis;

  constructor(
    url?: string,
    token?: string,
    private readonly defaultTtlSeconds: number = 3600
  ) {
    if (url && token) {
      this.redis = new Redis({ url, token });
    } else {
      this.redis = Redis.fromEnv();
    }
  }

  private sessionKey(sessionId: string): string {
    return `logistics:session:${sessionId}`;
  }

  private lockKey(sessionId: string): string {
    return `logistics:lock:${sessionId}`;
  }

  public async getSession(sessionId: string): Promise<StoredSession | null> {
    const raw = await this.redis.get<string | StoredSession>(this.sessionKey(sessionId));
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as StoredSession;
      } catch {
        return null;
      }
    }
    return raw as StoredSession;
  }

  public async saveSession(session: StoredSession, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    await this.redis.set(this.sessionKey(session.sessionId), JSON.stringify(session), {
      ex: ttl
    });
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(this.sessionKey(sessionId));
    await this.redis.del(this.lockKey(sessionId));
  }

  public async acquireLock(sessionId: string, ttlMs: number = 5000, lockOwner: string = '1'): Promise<boolean> {
    // Bloqueo atómico SET NX PX con identificación de propietario
    const res = await this.redis.set(this.lockKey(sessionId), lockOwner, {
      nx: true,
      px: ttlMs
    });
    return res === 'OK';
  }

  public async releaseLock(sessionId: string, lockOwner?: string): Promise<void> {
    if (!lockOwner) {
      await this.redis.del(this.lockKey(sessionId));
      return;
    }
    // Liberación atómica condicionada al propietario legítimo (mitiga Escenario 5)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.redis.eval(script, [this.lockKey(sessionId)], [lockOwner]);
    } catch {
      // Fallback si eval no está disponible en la versión del mock
      const current = await this.redis.get<string>(this.lockKey(sessionId));
      if (current === lockOwner) {
        await this.redis.del(this.lockKey(sessionId));
      }
    }
  }
}
