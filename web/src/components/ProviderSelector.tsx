'use client';

import React from 'react';

interface ProviderSelectorProps {
  currentProvider: 'gemini' | 'openai';
  onSelectProvider: (provider: 'gemini' | 'openai') => void;
  onRequestSwitchWithPendingOrder?: (provider: 'gemini' | 'openai') => void;
  hasGeminiKey: boolean;
  hasOpenAIKey: boolean;
  isGeminiVerified?: boolean;
  isOpenAIVerified?: boolean;
  hasPendingOrder: boolean;
  disabled: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  currentProvider,
  onSelectProvider,
  onRequestSwitchWithPendingOrder,
  hasGeminiKey,
  hasOpenAIKey,
  isGeminiVerified = false,
  isOpenAIVerified = false,
  hasPendingOrder,
  disabled
}) => {
  const handleClick = (targetProvider: 'gemini' | 'openai') => {
    if (targetProvider === currentProvider || disabled) return;

    if (hasPendingOrder && onRequestSwitchWithPendingOrder) {
      onRequestSwitchWithPendingOrder(targetProvider);
      return;
    }

    onSelectProvider(targetProvider);
  };

  const getStatusDot = (hasKey: boolean, isVerified: boolean) => {
    if (isVerified) {
      return <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="Conexión verificada" />;
    }
    if (hasKey) {
      return <span className="w-2 h-2 rounded-full bg-amber-500" title="Clave ingresada (sin verificar)" />;
    }
    return <span className="w-2 h-2 rounded-full bg-slate-300" title="Sin clave configurada" />;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs transition-all">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
          Proveedor de IA:
        </span>
        <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => handleClick('gemini')}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-2 ${
              currentProvider === 'gemini'
                ? 'bg-white text-blue-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            {getStatusDot(hasGeminiKey, isGeminiVerified)}
            <span>Gemini</span>
            {!hasGeminiKey && (
              <span className="text-[10px] text-amber-600 font-normal">(Sin clave)</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleClick('openai')}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-2 ${
              currentProvider === 'openai'
                ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            {getStatusDot(hasOpenAIKey, isOpenAIVerified)}
            <span>OpenAI</span>
            {!hasOpenAIKey && (
              <span className="text-[10px] text-amber-600 font-normal">(Sin clave)</span>
            )}
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex items-center justify-between sm:justify-end gap-2 px-1">
        <span className="text-slate-400">Modelo:</span>
        <span className="font-mono font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/80">
          {currentProvider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4o-mini'}
        </span>
      </div>
    </div>
  );
};
