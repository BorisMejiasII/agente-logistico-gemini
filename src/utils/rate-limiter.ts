import crypto from 'crypto';
import { Redis } from '@upstash/redis';

/**
 * Limitador de frecuencia de peticiones (Rate Limiter) en memoria por ventana deslizante.
 * Mitiga ataques de denegación de servicio y fuerza bruta en entornos de desarrollo y pruebas.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export class SimpleRateLimiter {
  private readonly hits = new Map<string, RateLimitEntry>();

  constructor(
    private readonly windowMs: number = 60 * 1000,
    private readonly maxRequests: number = 60
  ) {}

  public check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetSeconds: Math.ceil(this.windowMs / 1000)
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: Math.ceil((entry.resetAt - now) / 1000)
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetSeconds: Math.ceil((entry.resetAt - now) / 1000)
    };
  }

  public reset(): void {
    this.hits.clear();
  }
}

/**
 * Limitador distribuido con respaldo en Upstash Redis para entornos multi-instancia (Vercel).
 * Utiliza hashing SHA-256 de IPs para privacidad estricta y evita almacenar PII en Redis.
 */
export class DistributedRateLimiter {
  private redisClient: Redis | null = null;
  private isInitialized = false;

  constructor(
    public readonly category: string,
    public readonly windowSeconds: number,
    public readonly maxRequests: number,
    private readonly fallbackLimiter: SimpleRateLimiter,
    customRedis?: Redis
  ) {
    if (customRedis) {
      this.redisClient = customRedis;
      this.isInitialized = true;
    }
  }

  private getRedis(): Redis | null {
    if (this.isInitialized) return this.redisClient;
    this.isInitialized = true;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        this.redisClient = new Redis({ url, token, retry: { retries: 2 } });
      } catch {
        this.redisClient = null;
      }
    }
    return this.redisClient;
  }

  public async check(clientIp: string): Promise<RateLimitResult> {
    const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
    const isProduction = (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') && !isBuildPhase;

    const redis = this.getRedis();
    if (!redis) {
      if (isProduction) {
        throw new Error(
          `[SEGURIDAD CRÍTICA SERVERLESS] Upstash Redis no está configurado para rate limiting distribuido ('${this.category}'). En producción (Vercel), es obligatorio contar con Redis externo para rate limiting distribuido. No se permite memoria local efímera.`
        );
      }
      return this.fallbackLimiter.check(clientIp);
    }

    try {
      // Hashing de IP para privacidad (GDPR / OWASP)
      const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex').substring(0, 16);
      const redisKey = `logistics:rate:${this.category}:${ipHash}`;

      // Script Lua atómico: incrementa el contador y asigna TTL en la primera llamada
      const script = `
        local current = redis.call("incr", KEYS[1])
        if current == 1 then
          redis.call("expire", KEYS[1], ARGV[1])
        end
        local ttl = redis.call("ttl", KEYS[1])
        return { current, ttl }
      `;

      const [current, ttl] = (await redis.eval(script, [redisKey], [this.windowSeconds])) as [number, number];
      const resetSec = ttl > 0 ? ttl : this.windowSeconds;

      if (current > this.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetSeconds: resetSec
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - current),
        resetSeconds: resetSec
      };
    } catch (err) {
      if (isProduction) {
        throw new Error(
          `[SEGURIDAD CRÍTICA SERVERLESS] Fallo de conectividad con Upstash Redis para rate limiting distribuido ('${this.category}') en producción: ${err instanceof Error ? err.message : String(err)}. Se prohíbe el fallback silencioso a memoria local para evitar elusión de controles.`
        );
      }
      // En desarrollo y pruebas locales, fallback seguro al limitador local
      return this.fallbackLimiter.check(clientIp);
    }
  }

  public reset(): void {
    this.fallbackLimiter.reset();
  }
}

// Limitadores en memoria base para desarrollo y fallback
const baseChatLimiter = new SimpleRateLimiter(60 * 1000, 40);
const baseVerifyKeyLimiter = new SimpleRateLimiter(60 * 1000, 20);
const baseSessionLimiter = new SimpleRateLimiter(60 * 1000, 60);

// Limitadores distribuidos por categoría de endpoint
export const chatRateLimiter = new DistributedRateLimiter('chat', 60, 40, baseChatLimiter);
export const verifyKeyRateLimiter = new DistributedRateLimiter('verify-key', 60, 20, baseVerifyKeyLimiter);
export const sessionRateLimiter = new DistributedRateLimiter('session', 60, 60, baseSessionLimiter);

export function getClientIp(reqHeaders: { get(name: string): string | null }): string {
  // En Vercel Edge / Serverless, x-real-ip es asignado por el proxy de borde confiable
  const realIp = reqHeaders.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }
  const forwarded = reqHeaders.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first.length > 0) return first;
  }
  return '127.0.0.1';
}
