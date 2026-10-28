'use client';

import React, { useState, useEffect } from 'react';

export type KeyVerificationState = 'idle' | 'verifying' | 'verified' | 'error';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  geminiKey: string;
  openAIKey: string;
  onUpdateGeminiKey: (key: string) => void;
  onUpdateOpenAIKey: (key: string) => void;
  geminiStatus: KeyVerificationState;
  openAIStatus: KeyVerificationState;
  onVerifyKey: (provider: 'gemini' | 'openai') => Promise<void>;
  statusMessageGemini?: string;
  statusMessageOpenAI?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  geminiKey,
  openAIKey,
  onUpdateGeminiKey,
  onUpdateOpenAIKey,
  geminiStatus,
  openAIStatus,
  onVerifyKey,
  statusMessageGemini,
  statusMessageOpenAI
}) => {
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fadeIn"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative border border-slate-200 transition-transform">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg font-bold border border-blue-100">
              🔑
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-semibold text-slate-900">
                Configuración de Credenciales
              </h2>
              <p className="text-xs text-slate-500">
                Modelo BYOK (Bring Your Own Key) — Almacenamiento Volátil
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Tarjeta de Garantía de Seguridad */}
        <div className="my-4 p-3.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/90 text-xs text-amber-950 flex items-start gap-3 shadow-2xs">
          <div className="w-6 h-6 rounded-md bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0 font-bold">
            🔒
          </div>
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-950">Garantía de Seguridad y Privacidad:</p>
            <p className="text-amber-900/90 leading-relaxed text-[11px]">
              Tus claves se mantienen <strong>exclusivamente en la memoria RAM</strong> de esta pestaña.
              Nunca se guardan en <code>localStorage</code>, <code>cookies</code>, <code>Redis</code> ni base de datos alguna. Al recargar o pulsar &quot;Limpiar memoria&quot;, se eliminan inmediatamente.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Tarjeta Gemini */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs" />
                Google Gemini API Key
              </label>
              <div>
                {geminiStatus === 'verified' && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                    ✓ Verificada
                  </span>
                )}
                {geminiStatus === 'verifying' && (
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-300 animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                    Verificando...
                  </span>
                )}
                {geminiStatus === 'error' && (
                  <span className="text-[11px] font-semibold text-red-700 bg-red-100/80 px-2 py-0.5 rounded-md border border-red-300">
                    ✕ Inválida
                  </span>
                )}
              </div>
            </div>

            <div className="relative flex items-center">
              <input
                type={showGemini ? 'text' : 'password'}
                value={geminiKey}
                onChange={e => onUpdateGeminiKey(e.target.value)}
                placeholder="AIzaSy... o AQ...."
                className="w-full text-xs font-mono px-3.5 py-2.5 pr-14 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs transition"
              />
              <button
                type="button"
                onClick={() => setShowGemini(!showGemini)}
                className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-700 font-medium px-1.5 py-1 rounded transition"
              >
                {showGemini ? 'Ocultar' : 'Ver'}
              </button>
            </div>

            {statusMessageGemini && (
              <p className={`text-[11px] mt-1.5 ${geminiStatus === 'verified' ? 'text-emerald-700 font-medium' : 'text-red-600'}`}>
                {statusMessageGemini}
              </p>
            )}

            <div className="flex items-center justify-between mt-3 pt-1 border-t border-slate-200/60">
              <button
                type="button"
                onClick={() => onUpdateGeminiKey('')}
                disabled={!geminiKey}
                className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-30 transition font-medium"
              >
                Limpiar de memoria
              </button>
              <button
                type="button"
                onClick={() => onVerifyKey('gemini')}
                disabled={!geminiKey || geminiStatus === 'verifying'}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition disabled:opacity-40 shadow-2xs"
              >
                {geminiStatus === 'verifying' ? 'Verificando...' : 'Verificar Conexión'}
              </button>
            </div>
          </div>

          {/* Tarjeta OpenAI */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs" />
                OpenAI API Key
              </label>
              <div>
                {openAIStatus === 'verified' && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                    ✓ Verificada
                  </span>
                )}
                {openAIStatus === 'verifying' && (
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-300 animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                    Verificando...
                  </span>
                )}
                {openAIStatus === 'error' && (
                  <span className="text-[11px] font-semibold text-red-700 bg-red-100/80 px-2 py-0.5 rounded-md border border-red-300">
                    ✕ Inválida
                  </span>
                )}
              </div>
            </div>

            <div className="relative flex items-center">
              <input
                type={showOpenAI ? 'text' : 'password'}
                value={openAIKey}
                onChange={e => onUpdateOpenAIKey(e.target.value)}
                placeholder="sk-proj-... o sk-..."
                className="w-full text-xs font-mono px-3.5 py-2.5 pr-14 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs transition"
              />
              <button
                type="button"
                onClick={() => setShowOpenAI(!showOpenAI)}
                className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-700 font-medium px-1.5 py-1 rounded transition"
              >
                {showOpenAI ? 'Ocultar' : 'Ver'}
              </button>
            </div>

            {statusMessageOpenAI && (
              <p className={`text-[11px] mt-1.5 ${openAIStatus === 'verified' ? 'text-emerald-700 font-medium' : 'text-red-600'}`}>
                {statusMessageOpenAI}
              </p>
            )}

            <div className="flex items-center justify-between mt-3 pt-1 border-t border-slate-200/60">
              <button
                type="button"
                onClick={() => onUpdateOpenAIKey('')}
                disabled={!openAIKey}
                className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-30 transition font-medium"
              >
                Limpiar de memoria
              </button>
              <button
                type="button"
                onClick={() => onVerifyKey('openai')}
                disabled={!openAIKey || openAIStatus === 'verifying'}
                className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition disabled:opacity-40 shadow-2xs"
              >
                {openAIStatus === 'verifying' ? 'Verificando...' : 'Verificar Conexión'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition"
          >
            Listo / Guardar en Memoria
          </button>
        </div>
      </div>
    </div>
  );
};
