import { NextRequest, NextResponse } from 'next/server';
import {
  MultiProviderOrchestrator,
  SessionNotFoundError,
  SessionUnauthorizedError,
  SessionLockedError
} from '../../../../../src/agent/multi-provider-orchestrator.js';
import { sanitizeErrorMessage, isValidUUID, isValidSessionSecret } from '../../../../../src/utils/security.utils.js';
import { chatRateLimiter, getClientIp } from '../../../../../src/utils/rate-limiter.js';

const orchestrator = new MultiProviderOrchestrator();

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

export async function POST(req: NextRequest) {
  let userApiKey = '';
  try {
    // 1. Control de frecuencia (Rate Limiting) por IP
    const clientIp = getClientIp(req.headers);
    const rateCheck = chatRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Por favor espera un momento antes de enviar otro mensaje.' },
        {
          status: 429,
          headers: {
            ...NO_CACHE_HEADERS,
            'Retry-After': String(rateCheck.resetSeconds)
          }
        }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud JSON inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const sessionId = body.sessionId || req.headers.get('x-session-id');
    const sessionSecret = body.sessionSecret || req.headers.get('x-session-secret');
    const { message, apiKey, clientMessageId, modelOverride } = body;
    if (typeof apiKey === 'string') userApiKey = apiKey;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'El parámetro sessionId es requerido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!isValidUUID(sessionId)) {
      return NextResponse.json(
        { error: 'El identificador de sesión tiene un formato inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!sessionSecret || typeof sessionSecret !== 'string') {
      return NextResponse.json(
        { error: 'El secreto de sesión es requerido para autorizar la solicitud.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    if (!isValidSessionSecret(sessionSecret)) {
      return NextResponse.json(
        { error: 'El secreto de sesión tiene un formato o longitud inválida.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'El mensaje de usuario no puede estar vacío.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: 'El mensaje excede el tamaño máximo permitido (4000 caracteres).' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'La API Key del proveedor seleccionado es obligatoria (BYOK).' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (apiKey.length > 256) {
      return NextResponse.json(
        { error: 'La API Key excede la longitud máxima permitida.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const output = await orchestrator.handleMessage({
      sessionId: sessionId.trim(),
      sessionSecret: sessionSecret.trim(),
      userMessage: message.trim(),
      apiKey: apiKey.trim(),
      clientMessageId: clientMessageId ? String(clientMessageId).trim() : undefined,
      modelOverride: modelOverride ? String(modelOverride).trim() : undefined
    });

    return NextResponse.json(output, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    if (err instanceof SessionUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 403, headers: NO_CACHE_HEADERS });
    }
    if (err instanceof SessionLockedError) {
      return NextResponse.json({ error: err.message }, { status: 409, headers: NO_CACHE_HEADERS });
    }

    // Sanitización exhaustiva para garantizar que ninguna API Key ni ruta interna se filtre
    const sanitized = sanitizeErrorMessage(err, userApiKey);
    return NextResponse.json({ error: sanitized }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
