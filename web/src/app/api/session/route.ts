import { NextRequest, NextResponse } from 'next/server';
import {
  MultiProviderOrchestrator,
  SessionNotFoundError,
  SessionUnauthorizedError
} from '../../../../../src/agent/multi-provider-orchestrator.js';
import { sanitizeErrorMessage, isValidUUID, isValidSessionSecret } from '../../../../../src/utils/security.utils.js';
import { sessionRateLimiter, getClientIp } from '../../../../../src/utils/rate-limiter.js';

const orchestrator = new MultiProviderOrchestrator();

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting por IP para prevención de abuso en creación/consulta de sesiones
    const clientIp = getClientIp(req.headers);
    const rateCheck = sessionRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes de sesión. Por favor espera unos momentos.' },
        { status: 429, headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(rateCheck.resetSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud JSON inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const action = body.action || 'create';

    if (action === 'create') {
      const provider = body.provider === 'openai' ? 'openai' : 'gemini';
      const inventoryMode = body.inventoryMode === 'unstructured' ? 'unstructured' : 'mock';

      const session = await orchestrator.createSession({ provider, inventoryMode });

      return NextResponse.json(
        {
          sessionId: session.sessionId,
          sessionSecret: session.sessionSecret,
          provider: session.provider,
          inventoryMode: session.inventoryMode,
          pendingOrder: session.pendingOrder,
          createdAt: session.createdAt
        },
        { status: 201, headers: NO_CACHE_HEADERS }
      );
    }

    // Para acciones que requieren sesión existente
    const sessionId = body.sessionId || req.headers.get('x-session-id');
    const sessionSecret = body.sessionSecret || req.headers.get('x-session-secret');

    if (!sessionId || !sessionSecret) {
      return NextResponse.json(
        { error: 'Identificador y secreto de sesión son obligatorios.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    if (!isValidUUID(sessionId)) {
      return NextResponse.json(
        { error: 'Formato de sessionId inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!isValidSessionSecret(sessionSecret)) {
      return NextResponse.json(
        { error: 'Formato de sessionSecret inválido.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'get') {
      const session = await orchestrator.getAndValidateSession(sessionId, sessionSecret);
      return NextResponse.json(
        {
          sessionId: session.sessionId,
          provider: session.provider,
          inventoryMode: session.inventoryMode,
          pendingOrder: session.pendingOrder,
          history: session.history,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    if (action === 'update' || action === 'reset') {
      const targetProvider: 'gemini' | 'openai' | undefined =
        body.provider === 'openai' ? 'openai' : body.provider === 'gemini' ? 'gemini' : undefined;
      const targetMode: 'mock' | 'unstructured' | undefined =
        body.inventoryMode === 'unstructured' ? 'unstructured' : body.inventoryMode === 'mock' ? 'mock' : undefined;

      const updates = {
        provider: targetProvider,
        inventoryMode: targetMode,
        resetConversation: action === 'reset' || Boolean(body.resetConversation)
      };

      const updated = await orchestrator.updateSessionSettings(sessionId, sessionSecret, updates);
      return NextResponse.json(
        {
          sessionId: updated.sessionId,
          provider: updated.provider,
          inventoryMode: updated.inventoryMode,
          pendingOrder: updated.pendingOrder,
          history: updated.history,
          updatedAt: updated.updatedAt
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: `Acción '${action}' no reconocida.` },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    if (err instanceof SessionUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 403, headers: NO_CACHE_HEADERS });
    }
    const sanitized = sanitizeErrorMessage(err);
    return NextResponse.json({ error: sanitized }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
