import React, { useState } from 'react';
import { ShieldCheck, Plus, Trash2, DollarSign, Percent, Award } from 'lucide-react';
import type { AutopilotRule, FinancialLimits } from '../../../../types/sourcingAutopilot';

interface AutopilotPolicyEditorProps {
  rules: AutopilotRule[];
  financialLimits: FinancialLimits;
  onSaveRule: (rule: Partial<AutopilotRule>) => void;
  onUpdateFinancialLimits: (limits: Partial<FinancialLimits>) => void;
}

export const AutopilotPolicyEditor: React.FC<AutopilotPolicyEditorProps> = ({
  rules,
  financialLimits,
  onSaveRule,
  onUpdateFinancialLimits
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'financial'>('rules');

  const [editableLimits, setEditableLimits] = useState<FinancialLimits>(financialLimits);

  const handleLimitsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateFinancialLimits(editableLimits);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white font-bold">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3>MOTOR DE POLÍTICAS Y LÍMITES COMERCIALES</h3>
        </div>

        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1 text-xs font-semibold rounded ${activeTab === 'rules' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            Reglas de Negocio
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`px-3 py-1 text-xs font-semibold rounded ${activeTab === 'financial' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            Límites Financieros
          </button>
        </div>
      </div>

      {activeTab === 'rules' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Alcance (Scope)</th>
                <th className="p-3">Identificador</th>
                <th className="p-3">Margen Mín %</th>
                <th className="p-3">Utilidad Mín USD</th>
                <th className="p-3">Seller Score Mín</th>
                <th className="p-3">Opp. Score Mín</th>
                <th className="p-3">Compra Auto</th>
                <th className="p-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rules.map(rule => (
                <tr key={rule.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-white">{rule.scope}</td>
                  <td className="p-3 uppercase text-amber-400">{rule.identifier}</td>
                  <td className="p-3">{rule.min_margin_percent}%</td>
                  <td className="p-3">${rule.min_profit_usd} USD</td>
                  <td className="p-3">{rule.min_seller_score}%</td>
                  <td className="p-3">{rule.min_opportunity_score} pts</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.auto_purchase_enabled ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400'}`}>
                      {rule.auto_purchase_enabled ? 'SÍ' : 'NO'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                      {rule.is_active ? 'ACTIVA' : 'INACTIVA'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <form onSubmit={handleLimitsSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Compra Máxima Individual (USD)</label>
            <input
              type="number"
              step="0.01"
              value={editableLimits.max_single_purchase_usd}
              onChange={e => setEditableLimits(prev => ({ ...prev, max_single_purchase_usd: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Gasto Diario Máximo (USD)</label>
            <input
              type="number"
              step="0.01"
              value={editableLimits.max_daily_expenditure_usd}
              onChange={e => setEditableLimits(prev => ({ ...prev, max_daily_expenditure_usd: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Gasto Mensual Máximo (USD)</label>
            <input
              type="number"
              step="0.01"
              value={editableLimits.max_monthly_expenditure_usd}
              onChange={e => setEditableLimits(prev => ({ ...prev, max_monthly_expenditure_usd: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
            />
          </div>

          <div className="md:col-span-3 flex justify-end mt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow transition"
            >
              Guardar Límites Financieros
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
