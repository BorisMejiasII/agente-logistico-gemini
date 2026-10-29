import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_SECRET_REGEX = /^[0-9a-f]{48}$/i;

/**
 * Valida si un string cumple el formato de UUID v4 estándar.
 */
export function isValidUUID(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Valida si un string cumple el formato del secreto de sesión (48 caracteres hexadecimales CSPRNG).
 */
export function isValidSessionSecret(secret: unknown): boolean {
  if (typeof secret !== 'string') return false;
  return SESSION_SECRET_REGEX.test(secret.trim());
}

/**
 * Comparación en tiempo constante para mitigar ataques de canal lateral (timing attacks).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Sanitiza mensajes de error para evitar fugas de API Keys, rutas de archivos locales o trazas internas.
 */
export function sanitizeErrorMessage(error: unknown, keyToMask?: string): string {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object' && error !== null) {
    message = 'error' in error ? String((error as { error: unknown }).error) : JSON.stringify(error);
  } else {
    message = String(error);
  }

  // 1. Enmascarar la API Key provista por el usuario si está presente
  if (keyToMask && keyToMask.trim().length > 4) {
    const trimmed = keyToMask.trim();
    message = message.split(trimmed).join('[REDACTED_API_KEY]');
  }

  // 2. Enmascarar patrones conocidos de API Keys (Gemini: AIza..., OpenAI: sk-...)
  message = message
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_OPENAI_KEY]');

  // 3. Ocultar rutas absolutas del sistema de archivos local (Windows y Unix)
  message = message
    .replace(/[A-Z]:\\[^:\n\r\t]+/gi, '[PATH_REDACTED]')
    .replace(/\/(home|Users|var|tmp|etc|app)\/[^:\s\n\r]+/g, '[PATH_REDACTED]');

  // 4. Limpiar cadenas sensibles de URLs con query params
  message = message.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[PARAMS_REDACTED]');

  return message;
}
