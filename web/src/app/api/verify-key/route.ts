import { NextRequest, NextResponse } from 'next/server';
import { MultiProviderOrchestrator } from '../../../../../src/agent/multi-provider-orchestrator.js';

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
        { error: 'Cuerpo de solicitud inválido.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { provider, apiKey, modelOverride } = body;

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

    return NextResponse.json(
      {
        valid: result.valid,
        message: result.message,
        model: result.model
      },
      { status: result.valid ? 200 : 400, headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error interno al verificar credenciales';
    return NextResponse.json(
      { error: errorMsg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
