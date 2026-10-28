'use client';

import React from 'react';
import { StoredChatMessage } from '../../../src/providers/provider.interface.js';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatMessageItemProps {
  message: StoredChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2.5 transition-all`}>
      <div className={`flex items-start gap-2.5 max-w-[92%] sm:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar / Icono */}
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold shadow-xs ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-white border border-slate-700'
          }`}
          title={isUser ? 'Usuario' : 'Agente Logístico'}
        >
          {isUser ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ) : (
            <span className="text-[13px]">📦</span>
          )}
        </div>

        {/* Burbuja de mensaje */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs transition-shadow ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-xs'
              : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-xs'
          }`}
        >
          {/* Encabezado del mensaje */}
          <div
            className={`flex items-center justify-between gap-4 mb-1.5 text-[11px] font-medium ${
              isUser ? 'text-blue-100' : 'text-slate-400'
            }`}
          >
            <span className="font-semibold tracking-wide">
              {isUser ? 'Tú' : 'Agente Logístico'}
            </span>
            <span className="font-mono text-[10px] opacity-80">
              {message.timestamp
                ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </span>
          </div>

          {/* Badges de herramientas ejecutadas (solo para respuestas del asistente) */}
          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2.5 space-y-1.5 pt-0.5">
              {message.toolCalls.map((call, idx) => {
                if (call.name === 'consultar_stock') {
                  const prod = (call.args.producto as string) || '';

                  // Manejo estricto de errores: nunca renderizar [object Object] ni stock falso
                  if (!call.success) {
                    const outputObj =
                      typeof call.output === 'object' && call.output !== null
                        ? (call.output as Record<string, unknown>)
                        : {};
                    const errCode = outputObj.errorCode as string | undefined;
                    const errLabel =
                      errCode === 'AMBIGUOUS_PRODUCT'
                        ? 'Término ambiguo'
                        : errCode === 'CATALOG_QUERY_NOT_A_PRODUCT'
                        ? 'Consulta general'
                        : 'No encontrado';

                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center text-xs font-mono bg-amber-50/90 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-lg shadow-2xs mr-1.5"
                      >
                        <span className="mr-1.5 text-amber-600 font-semibold">🔍 Consulta:</span>
                        <span className="font-medium text-slate-700">&apos;{prod}&apos;</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                          {errLabel}
                        </span>
                      </div>
                    );
                  }

                  // Extracción estricta de cantidad numérica entera
                  let stock: number | null = null;
                  if (
                    typeof call.output === 'object' &&
                    call.output !== null &&
                    'stockDisponible' in call.output
                  ) {
                    const parsed = Number((call.output as { stockDisponible: unknown }).stockDisponible);
                    if (Number.isInteger(parsed)) {
                      stock = parsed;
                    }
                  } else if (typeof call.output === 'number' && Number.isInteger(call.output)) {
                    stock = call.output;
                  }

                  return (
                    <div
                      key={idx}
                      className="inline-flex items-center text-xs font-mono bg-blue-50/90 border border-blue-200/80 text-blue-900 px-2.5 py-1 rounded-lg shadow-2xs mr-1.5"
                    >
                      <span className="mr-1.5 text-blue-600 font-semibold">🔍 Consulta Stock:</span>
                      <span className="font-medium text-slate-700">&apos;{prod}&apos;</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[11px] font-bold">
                        {stock !== null ? `${stock} u. disp.` : 'Consultado'}
                      </span>
                    </div>
                  );
                }

                if (call.name === 'emitir_orden_compra') {
                  const prod = (call.args.producto as string) || '';
                  const cant = call.args.cantidad;

                  // Si la herramienta falló o fue rechazada, NUNCA mostrar como emitida
                  if (!call.success) {
                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center text-xs font-mono bg-rose-50 border border-rose-200 text-rose-950 px-2.5 py-1 rounded-lg shadow-2xs mr-1.5"
                      >
                        <span className="mr-1.5 text-rose-600 font-bold">⚠️ Orden no emitida:</span>
                        <span className="font-medium text-slate-700">
                          {cant ? `${String(cant)} u. de ` : ''}&apos;{prod}&apos;
                        </span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                          Sin autorización
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      className="inline-flex items-center text-xs font-mono bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-1.5 rounded-lg shadow-xs mr-1.5 animate-fadeIn"
                    >
                      <span className="mr-1.5 text-emerald-600 font-bold">📄 Orden Emitida:</span>
                      <strong className="font-bold text-emerald-900 mr-1.5">
                        {String(cant)} u. de {prod}
                      </strong>
                      <span className="bg-emerald-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className="inline-flex items-center text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md mr-1.5"
                  >
                    ⚡ {call.name}
                  </div>
                );
              })}
            </div>
          )}

          {/* Contenido: Markdown para asistente, Texto para usuario */}
          {isUser ? (
            <div className="whitespace-pre-wrap break-words leading-relaxed text-sm text-white">
              {message.content}
            </div>
          ) : (
            <ChatMarkdown content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
};
