export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown, delayMs: number, classification: ErrorClassification) => void;
}

export interface ErrorClassification {
  status: number | null;
  code: string | null;
  message: string;
  isRetryable: boolean;
  isQuotaExhausted: boolean;
}

/*
 Clasifica estructuradamente un error HTTP / Gemini API para determinar
 si es recuperable mediante reintentos con backoff exponencial.
 */
export function classifyError(error: unknown): ErrorClassification {
  let status: number | null = null;
  let code: string | null = null;
  let message = '';

  if (error instanceof Error) {
    message = error.message;
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      status = (error as Record<string, unknown>).status as number;
    }
    if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
      code = (error as Record<string, unknown>).code as string;
    }
  } else if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      status = (error as Record<string, unknown>).status as number;
    }
    if ('message' in error && typeof (error as Record<string, unknown>).message === 'string') {
      message = (error as Record<string, unknown>).message as string;
    }
    if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
      code = (error as Record<string, unknown>).code as string;
    }
  } else {
    message = String(error);
  }

  // Si el mensaje es una cadena JSON devuelta por la API de Google, parsear detalles estructurados
  try {
    const trimmed = message.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.error) {
        if (!status && typeof parsed.error.code === 'number') {
          status = parsed.error.code;
        }
        if (typeof parsed.error.status === 'string') {
          code = parsed.error.status;
        }
        if (typeof parsed.error.message === 'string') {
          message = parsed.error.message;
        }
      }
    }
  } catch {
    // Si no es JSON válido, conservar el mensaje original
  }

  const lowerMsg = message.toLowerCase();

  // Detección estricta de agotamiento de cuotas o créditos
  const isQuotaExhausted =
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('exceeded your current quota') ||
    lowerMsg.includes('insufficient_quota') ||
    lowerMsg.includes('daily limit') ||
    lowerMsg.includes('credit balance') ||
    lowerMsg.includes('billing account') ||
    (code === 'RESOURCE_EXHAUSTED' && (lowerMsg.includes('quota') || lowerMsg.includes('credit')));

  // Reglas de reintentabilidad:
  let isRetryable = false;

  if (status === 400 || status === 401 || status === 403 || status === 404) {
    // 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found fallan inmediatamente
    isRetryable = false;
  } else if (status === 429) {
    // 429 temporal (Rate Limit) permite reintentos; cuota agotada no reintenta inútilmente
    isRetryable = !isQuotaExhausted;
  } else if (status === 500 || status === 502 || status === 503 || status === 504) {
    // Errores de servidor / sobrecarga / indisponibilidad temporal
    isRetryable = true;
  } else if (code === 'UNAVAILABLE' || code === 'DEADLINE_EXCEEDED') {
    isRetryable = true;
  } else if (code === 'RESOURCE_EXHAUSTED') {
    isRetryable = !isQuotaExhausted;
  } else if (
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('high demand')
  ) {
    isRetryable = true;
  }

  return {
    status,
    code,
    message,
    isRetryable,
    isQuotaExhausted
  };
}

/**
 * Ejecuta una operación asíncrona con reintentos exponenciales deterministas.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const sleepFn = options.sleepFn ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const classification = classifyError(error);

      // Si el error no es reintentable o se agotaron los intentos, propagar de inmediato
      if (!classification.isRetryable || attempt >= maxAttempts) {
        throw error;
      }

      // Cálculo de backoff exponencial: delay = initialDelay * (factor ^ (attempt - 1))
      const calculatedDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      const delayMs = Math.min(calculatedDelay, maxDelayMs);

      // Notificación segura de observabilidad (sin exponer API Keys ni headers)
      if (options.onRetry) {
        options.onRetry(attempt, error, delayMs, classification);
      } else {
        const errCode = classification.status ? `HTTP ${classification.status}` : (classification.code ?? 'ERROR_RED');
        console.warn(`[REINTENTO RED] Intento ${attempt}/${maxAttempts} tras error ${errCode}. Esperando ${delayMs}ms antes del siguiente intento.`);
      }

      await sleepFn(delayMs);
    }
  }

  throw lastError;
}
