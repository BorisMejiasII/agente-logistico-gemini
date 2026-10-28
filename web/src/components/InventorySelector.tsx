'use client';

import React from 'react';

interface InventorySelectorProps {
  currentMode: 'mock' | 'unstructured';
  onSelectMode: (mode: 'mock' | 'unstructured') => void;
  onRequestSwitchWithPendingOrder?: (mode: 'mock' | 'unstructured') => void;
  hasPendingOrder: boolean;
  disabled: boolean;
}

export const InventorySelector: React.FC<InventorySelectorProps> = ({
  currentMode,
  onSelectMode,
  onRequestSwitchWithPendingOrder,
  hasPendingOrder,
  disabled
}) => {
  const handleClick = (targetMode: 'mock' | 'unstructured') => {
    if (targetMode === currentMode || disabled) return;

    if (hasPendingOrder && onRequestSwitchWithPendingOrder) {
      onRequestSwitchWithPendingOrder(targetMode);
      return;
    }

    onSelectMode(targetMode);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs transition-all">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
          Inventario:
        </span>
        <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => handleClick('mock')}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              currentMode === 'mock'
                ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <span>🎲 Mock PDF (1-5 u.)</span>
          </button>

          <button
            type="button"
            onClick={() => handleClick('unstructured')}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              currentMode === 'unstructured'
                ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <span>📋 Auditoría Documental</span>
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 px-1">
        {currentMode === 'mock' ? (
          <span className="text-slate-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Stock aleatorio consistente por producto en la sesión
          </span>
        ) : (
          <span className="text-slate-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Registros consolidados con trazabilidad y estados físicos
          </span>
        )}
      </div>
    </div>
  );
};
