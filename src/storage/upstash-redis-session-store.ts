import { Redis } from '@upstash/redis';
import { ISessionStore, StoredSession, SessionConcurrencyError } from './session-store.interface.js';

export class UpstashRedisSessionStore implements ISessionStore {
  public readonly storeType = 'upstash-redis';
  private readonly redis: Redis;

  constructor(
    urlOrRedis?: string | Redis,
    token?: string,
    private readonly defaultTtlSeconds: number = 3600
  ) {
    if (typeof urlOrRedis === 'object' && urlOrRedis !== null) {
      this.redis = urlOrRedis;
    } else if (typeof urlOrRedis === 'string' && token) {
      this.redis = new Redis({
        url: urlOrRedis,
        token,
        // Limita reintentos a 2 para evitar agotar la ventana serverless de Vercel (10-15s) ante caídas de red
        retry: { retries: 2 }
      });
    } else {
      this.redis = Redis.fromEnv({
        retry: { retries: 2 }
      });
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

  public async saveSession(session: StoredSession, expectedVersion?: number, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;

    if (expectedVersion === undefined) {
      session.version = session.version ?? 1;
      const serialized = JSON.stringify(session);
      await this.redis.set(this.sessionKey(session.sessionId), serialized, {
        ex: ttl
      });
      return;
    }

    const nextVersion = expectedVersion + 1;
    session.version = nextVersion;
    const serialized = JSON.stringify(session);

    // Script Lua atómico para Compare-And-Set (CAS) de versión (mitiga Lost Updates ante expiración de bloqueo)
    const script = `
      local current = redis.call("get", KEYS[1])
      if not current then
        redis.call("set", KEYS[1], ARGV[2], "ex", ARGV[3])
        return 1
      end
      local decoded = cjson.decode(current)
      local currentVer = decoded.version or 1
      if tonumber(currentVer) ~= tonumber(ARGV[1]) then
        return 0
      end
      redis.call("set", KEYS[1], ARGV[2], "ex", ARGV[3])
      return 1
    `;

    try {
      const res = await this.redis.eval(
        script,
        [this.sessionKey(session.sessionId)],
        [expectedVersion, serialized, ttl]
      );
      if (res === 0) {
        throw new SessionConcurrencyError(
          `Conflicto de concurrencia en Upstash Redis para sesión '${session.sessionId}': versión esperada ${expectedVersion}, pero fue modificada concurrentemente.`
        );
      }
    } catch (err) {
      if (err instanceof SessionConcurrencyError) throw err;
      // Fallback seguro si eval o cjson presentan restricciones en el entorno mock
      const currentRaw = await this.redis.get<string | StoredSession>(this.sessionKey(session.sessionId));
      if (currentRaw) {
        const parsed = typeof currentRaw === 'string' ? JSON.parse(currentRaw) as StoredSession : currentRaw;
        const currentVer = parsed.version ?? 1;
        if (currentVer !== expectedVersion) {
          throw new SessionConcurrencyError(
            `Conflicto de concurrencia en Upstash Redis para sesión '${session.sessionId}': versión esperada ${expectedVersion}, versión actual ${currentVer}.`
          );
        }
      }
      await this.redis.set(this.sessionKey(session.sessionId), serialized, {
        ex: ttl
      });
    }
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

  public async extendLock(sessionId: string, ttlMs: number = 15000, lockOwner: string = '1'): Promise<boolean> {
    // Renovación atómica del bloqueo si y solo si el lockOwner actual es el dueño
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        redis.call("pexpire", KEYS[1], ARGV[2])
        return 1
      else
        return 0
      end
    `;
    try {
      const res = await this.redis.eval(script, [this.lockKey(sessionId)], [lockOwner, ttlMs]);
      return res === 1;
    } catch {
      const current = await this.redis.get<string>(this.lockKey(sessionId));
      if (current === lockOwner) {
        await this.redis.pexpire(this.lockKey(sessionId), ttlMs);
        return true;
      }
      return false;
    }
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
