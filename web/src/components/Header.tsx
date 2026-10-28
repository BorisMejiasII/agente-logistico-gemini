'use client';

import React from 'react';

interface HeaderProps {
  provider: 'gemini' | 'openai';
  isKeyConfigured: boolean;
  isKeyVerified: boolean;
  onOpenSettings: () => void;
  onRequestReset: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  provider,
  isKeyConfigured,
  isKeyVerified,
  onOpenSettings,
  onRequestReset,
  isLoading
}) => {
  return (
    <header className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xs sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Marca y Título */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-lg shadow-sm font-bold shrink-0">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none">
                Agente Logístico
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Multi-Proveedor
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 hidden xs:block">
              Control de Inventarios & Órdenes de Compra con IA
            </p>
          </div>
        </div>

        {/* Acciones e Indicadores */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Badge del proveedor y conectividad */}
          <div className="hidden md:flex items-center text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs font-medium text-slate-700 gap-2">
            <span className="text-slate-400 text-[11px]">Activo:</span>
            <span className="font-semibold text-slate-900 capitalize flex items-center gap-1.5">
              {provider === 'gemini' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-blue-600 shadow-2xs" />
                  Gemini
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-600 shadow-2xs" />
                  OpenAI
                </>
              )}
            </span>
            <span className="text-slate-300">|</span>
            {isKeyVerified ? (
              <span className="text-emerald-700 flex items-center gap-1 text-[11px] font-semibold">
                ✓ Conectado
              </span>
            ) : isKeyConfigured ? (
              <span className="text-amber-700 flex items-center gap-1 text-[11px] font-medium">
                Sin verificar
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                Sin clave
              </span>
            )}
          </div>

          {/* Botón Nueva Conversación */}
          <button
            type="button"
            onClick={onRequestReset}
            disabled={isLoading}
            title="Reiniciar conversación y autorizaciones"
            className="p-2 sm:px-3 sm:py-1.5 text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-medium border border-slate-200 transition disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
          >
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span className="hidden sm:inline">Nueva Sesión</span>
          </button>

          {/* Botón Claves API */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <svg
              className="w-3.5 h-3.5 text-slate-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            <span>Claves API</span>
          </button>
        </div>
      </div>
    </header>
  );
};
