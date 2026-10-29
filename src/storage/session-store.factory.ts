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
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const isProduction = (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') && !isBuildPhase;

  if (url && token) {
    try {
      const redisStore = new UpstashRedisSessionStore(url, token);
      globalAny.__sharedSessionStore = redisStore;
      return redisStore;
    } catch (err) {
      if (isProduction) {
        throw new Error(
          `[SEGURIDAD CRÍTICA SERVERLESS] Error fatal al inicializar Upstash Redis en producción: ${err instanceof Error ? err.message : String(err)}. Se prohíbe el fallback silencioso a memoria en Vercel.`
        );
      }
      console.warn(
        '[ALMACENAMIENTO] Error al inicializar Upstash Redis en entorno local. Se usará InMemorySessionStore como respaldo de desarrollo.',
        err instanceof Error ? err.message : err
      );
    }
  }

  // En entorno de producción (Vercel serverless) NO se permite almacenamiento en memoria
  if (isProduction) {
    throw new Error(
      '[SEGURIDAD CRÍTICA SERVERLESS] Las variables UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN no están configuradas. En producción (Vercel), es obligatorio contar con Redis externo para persistencia distribuida y aislamiento concurrente de sesiones. No se permite memoria local efímera.'
    );
  }

  // Almacenamiento en memoria estrictamente para pruebas locales y desarrollo
  const inMemory = new InMemorySessionStore();
  globalAny.__sharedSessionStore = inMemory;
  return inMemory;
}

export function resetSessionStoreForTesting(): void {
  const globalAny = globalThis as unknown as { __sharedSessionStore?: ISessionStore };
  delete globalAny.__sharedSessionStore;
}
