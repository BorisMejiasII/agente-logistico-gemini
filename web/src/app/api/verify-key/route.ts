import { NextRequest, NextResponse } from 'next/server';
import { MultiProviderOrchestrator } from '../../../../../src/agent/multi-provider-orchestrator.js';
import { sanitizeErrorMessage } from '../../../../../src/utils/security.utils.js';
import { verifyKeyRateLimiter, getClientIp } from '../../../../../src/utils/rate-limiter.js';

const orchestrator = new MultiProviderOrchestrator();

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
};

export async function POST(req: NextRequest) {
  let userApiKey = '';
  try {
    // 1. Rate Limiting por IP para prevenir fuerza bruta o abuso de cuota en validación
    const clientIp = getClientIp(req.headers);
    const rateCheck = await verifyKeyRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes de verificación de API Key. Por favor espera antes de intentar nuevamente.' },
        { status: 429, headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(rateCheck.resetSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { provider, apiKey, modelOverride } = body;
    if (typeof apiKey === 'string') userApiKey = apiKey;

    if (provider !== 'gemini' && provider !== 'openai') {
      return NextResponse.json(
        { error: "Proveedor no válido. Debe ser 'gemini' u 'openai'." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'La API Key es obligatoria para la verificación.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Límite de tamaño para prevenir abuso
    if (apiKey.length > 256) {
      return NextResponse.json(
        { error: 'La API Key excede la longitud máxima permitida.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const targetProvider = orchestrator.getProvider(provider);
    const result = await targetProvider.verifyApiKey(apiKey.trim(), modelOverride);

    // Sanitizar cualquier mensaje retornado para prevenir reflejo de la clave
    const sanitizedMsg = sanitizeErrorMessage(result.message, userApiKey);

    return NextResponse.json(
      {
        valid: result.valid,
        message: sanitizedMsg,
        model: result.model
      },
      { status: result.valid ? 200 : 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = sanitizeErrorMessage(err, userApiKey);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
