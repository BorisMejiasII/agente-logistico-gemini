import { ISessionStore } from './session-store.interface.js';
import { InMemorySessionStore } from './in-memory-session-store.js';
import { UpstashRedisSessionStore } from './upstash-redis-session-store.js';

export function getSessionStore(): ISessionStore {
  const globalAny = globalThis as unknown as { __sharedSessionStore?: ISessionStore };
  if (globalAny.__sharedSessionStore) {
    return globalAny.__sharedSessionStore;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const redisStore = new UpstashRedisSessionStore(url, token);
      globalAny.__sharedSessionStore = redisStore;
      return redisStore;
    } catch (err) {
      console.warn(
        '[ALMACENAMIENTO] Error al inicializar Upstash Redis. Se usará InMemorySessionStore como respaldo.',
        err instanceof Error ? err.message : err
      );
    }
  }

  // Almacenamiento en memoria para pruebas locales y desarrollo
  const inMemory = new InMemorySessionStore();
  globalAny.__sharedSessionStore = inMemory;
  return inMemory;
}

export function resetSessionStoreForTesting(): void {
  const globalAny = globalThis as unknown as { __sharedSessionStore?: ISessionStore };
  delete globalAny.__sharedSessionStore;
}
