'use client';

import React from 'react';
import { PendingOrder } from '../../../src/domain/inventory.types.js';

interface PendingOrderBannerProps {
  order: PendingOrder | null;
}

export const PendingOrderBanner: React.FC<PendingOrderBannerProps> = ({ order }) => {
  if (!order || order.state === 'NONE') return null;

  if (order.state === 'AWAITING_CONFIRMATION') {
    return (
      <div className="mx-1 sm:mx-2 my-2.5 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-300/80 rounded-xl text-amber-950 text-xs shadow-xs transition-all animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 text-sm font-bold">
              ⚠️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-950 text-xs uppercase tracking-wider">
                  Autorización de Compra Requerida
                </span>
                <span className="inline-flex sm:hidden font-mono text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full uppercase">
                  Pendiente
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-0.5">
                Para reponer <strong>{order.missingQuantity}</strong> unidades faltantes de{' '}
                <strong className="capitalize">{order.normalizedProduct}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-200/60">
            <div className="flex items-center gap-2 text-[11px] font-mono text-amber-900">
              <span className="bg-white/80 border border-amber-200 px-2 py-0.5 rounded shadow-2xs">
                Req: <strong>{order.requiredQuantity}</strong>
              </span>
              <span className="bg-white/80 border border-amber-200 px-2 py-0.5 rounded shadow-2xs">
                Disp: <strong>{order.availableStock}</strong>
              </span>
              <span className="bg-amber-600 text-white font-bold px-2 py-0.5 rounded shadow-2xs">
                Faltan: {order.missingQuantity}
              </span>
            </div>
            <span className="hidden sm:inline-flex font-mono text-[10px] font-bold bg-amber-200 text-amber-900 px-2.5 py-1 rounded-full uppercase tracking-wider">
              Awaiting Confirmation
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (order.state === 'COMPLETED') {
    return (
      <div className="mx-1 sm:mx-2 my-2.5 p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50/60 border border-emerald-300/80 rounded-xl text-emerald-950 text-xs shadow-xs transition-all animate-fadeIn">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0 text-sm font-bold">
              ✓
            </div>
            <div>
              <span className="font-semibold text-emerald-950 text-xs uppercase tracking-wider">
                Orden de Compra Emitida Satisfactoriamente
              </span>
              <p className="text-xs text-emerald-850 mt-0.5">
                Se autorizó y emitió la orden por <strong>{order.missingQuantity}</strong> unidades de{' '}
                <strong className="capitalize">{order.normalizedProduct}</strong>.
              </p>
            </div>
          </div>

          <span className="font-mono text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0">
            Completada
          </span>
        </div>
      </div>
    );
  }

  if (order.state === 'CANCELLED') {
    return (
      <div className="mx-1 sm:mx-2 my-2 p-3 bg-slate-100 border border-slate-300 rounded-xl text-slate-700 text-xs flex items-center justify-between shadow-2xs animate-fadeIn">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">🚫</span>
          <span>Operación de compra desestimada o cancelada por el usuario.</span>
        </div>
        <span className="font-mono text-[10px] font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full uppercase">
          Cancelada
        </span>
      </div>
    );
  }

  return null;
};
