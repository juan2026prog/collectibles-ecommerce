import React, { useState } from 'react';
import type { CustomsRule, UserImportDeclaration } from '../../plugins/collector-import-hub/types';
import { ShieldCheck, Plus, CheckCircle2, AlertTriangle, Calendar, RefreshCw, Trash2, ArrowUpRight } from 'lucide-react';

interface Props {
  rule: CustomsRule;
  declarations: UserImportDeclaration[];
  onOpenDeclareModal: () => void;
  onDeleteDeclaration?: (id: string) => void;
}

export const MyFranchiseSection: React.FC<Props> = ({
  rule,
  declarations,
  onOpenDeclareModal,
  onDeleteDeclaration
}) => {
  const currentYear = rule.year || 2026;
  const currentYearDeclarations = declarations.filter(d => d.year === currentYear);

  const usedCount = currentYearDeclarations.length;
  const remainingCount = Math.max(0, rule.max_shipments_per_year - usedCount);

  const usedAmountUsd = currentYearDeclarations.reduce((acc, curr) => acc + curr.product_price_usd, 0);
  const remainingQuotaUsd = Math.max(0, rule.annual_quota_usd - usedAmountUsd);

  const shipmentsPercent = Math.min(100, (usedCount / rule.max_shipments_per_year) * 100);
  const amountPercent = Math.min(100, (usedAmountUsd / rule.annual_quota_usd) * 100);

  const isExhausted = remainingCount <= 0 || remainingQuotaUsd <= 0;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Mi Cupo y Franquicias ({currentYear})</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Régimen de Envíos Postales Internacionales de Carácter No Comercial (DNA Uruguay)
            </p>
          </div>

          <button
            onClick={onOpenDeclareModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            Declarar Compra Externa
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Franquicias Utilizadas</span>
                <span className="text-xs font-bold text-amber-400 font-mono">{usedCount} de {rule.max_shipments_per_year}</span>
              </div>
              <div className="text-2xl font-extrabold text-white mb-2">
                {remainingCount} <span className="text-sm font-normal text-slate-400">disponibles</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${usedCount >= 3 ? 'bg-rose-500' : 'bg-amber-500'}`}
                  style={{ width: `${shipmentsPercent}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-4">
              Cada persona física mayor de edad cuenta con hasta 3 envíos por año civil libre de impuestos aduaneros.
            </p>
          </div>

          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Cupo Anual Acumulado</span>
                <span className="text-xs font-bold text-amber-400 font-mono">${usedAmountUsd.toFixed(2)} / ${rule.annual_quota_usd} USD</span>
              </div>
              <div className="text-2xl font-extrabold text-white mb-2">
                ${remainingQuotaUsd.toFixed(2)} <span className="text-sm font-normal text-slate-400">saldo estimado</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${usedAmountUsd >= rule.annual_quota_usd ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${amountPercent}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-4">
              Límite de hasta USD 200 de factura comercial por envío individual bajo courier expreso.
            </p>
          </div>
        </div>

        {isExhausted && (
          <div className="mt-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-300 text-xs">Cupo de Franquicia Completo o Agotado</h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Aun si ya utilizaste tus 3 franquicias, <strong>puedes seguir importando tus figuras y coleccionables</strong> mediante el <em>Régimen Simplificado (Decreto 60%)</em> abonando el 60% del valor de factura (mínimo USD 20) directamente a través de tu courier sin despachante.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="font-bold text-white text-base mb-4">Detalle de Compras y Envíos Registrados ({currentYear})</h3>
        
        {currentYearDeclarations.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            No tienes envíos registrados para el año {currentYear}. Haz clic en "Declarar Compra Externa" para comenzar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Origen / Tipo</th>
                  <th className="py-3 px-4">Artículo</th>
                  <th className="py-3 px-4">Courier</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">Valor Factura</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentYearDeclarations.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      {d.origin_type === 'SYSTEM_CONFIRMED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          Collectibles.uy
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Declarado Usuario
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">{d.description}</td>
                    <td className="py-3 px-4 text-slate-400">{d.courier_name || '-'}</td>
                    <td className="py-3 px-4 text-slate-400">{d.purchase_date}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      ${d.product_price_usd.toFixed(2)} USD
                    </td>
                    <td className="py-3 px-4 text-center">
                      {onDeleteDeclaration && d.origin_type === 'USER_DECLARED' && (
                        <button
                          onClick={() => onDeleteDeclaration(d.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Eliminar declaración"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
