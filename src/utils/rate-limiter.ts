/**
 * Limitador de frecuencia de peticiones (Rate Limiter) en memoria por ventana deslizante.
 * Mitiga ataques de denegación de servicio y fuerza bruta en endpoints públicos.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class SimpleRateLimiter {
  private readonly hits = new Map<string, RateLimitEntry>();

  constructor(
    private readonly windowMs: number = 60 * 1000,
    private readonly maxRequests: number = 60
  ) {}

  public check(key: string): { allowed: boolean; remaining: number; resetSeconds: number } {
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

// Limitadores predeterminados por categoría de endpoint
export const chatRateLimiter = new SimpleRateLimiter(60 * 1000, 40); // 40 mensajes/min por IP
export const verifyKeyRateLimiter = new SimpleRateLimiter(60 * 1000, 20); // 20 verificaciones/min por IP
export const sessionRateLimiter = new SimpleRateLimiter(60 * 1000, 60); // 60 operaciones de sesión/min por IP

export function getClientIp(reqHeaders: { get(name: string): string | null }): string {
  const forwarded = reqHeaders.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return reqHeaders.get('x-real-ip') || '127.0.0.1';
}
