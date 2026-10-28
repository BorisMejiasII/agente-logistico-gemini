import { NextRequest, NextResponse } from 'next/server';
import {
  MultiProviderOrchestrator,
  SessionNotFoundError,
  SessionUnauthorizedError
} from '../../../../../src/agent/multi-provider-orchestrator.js';

const orchestrator = new MultiProviderOrchestrator();

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

export async function POST(req: NextRequest) {
  try {
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
      const updates = {
        provider: body.provider,
        inventoryMode: body.inventoryMode,
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
    const message = err instanceof Error ? err.message : 'Error en la gestión de sesión.';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
