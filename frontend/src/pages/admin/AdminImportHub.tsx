import React, { useState } from 'react';
import type { ImportCourier, CourierRateTier, CustomsRule } from '../../plugins/collector-import-hub/types';
import { DEFAULT_COURIERS } from '../../plugins/collector-import-hub/core/courierEngine';
import { DEFAULT_URUGUAY_2026_RULE } from '../../plugins/collector-import-hub/core/customsEngine';
import { 
  Truck, 
  ShieldCheck, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  DollarSign, 
  Globe, 
  Save 
} from 'lucide-react';

const AdminImportHub: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'couriers' | 'rules'>('couriers');
  const [couriers, setCouriers] = useState<ImportCourier[]>(DEFAULT_COURIERS);
  const [customsRule, setCustomsRule] = useState<CustomsRule>(DEFAULT_URUGUAY_2026_RULE);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleUpdateCourierFee = (courierCode: string, field: keyof ImportCourier, value: any) => {
    setCouriers(prev => prev.map(c => {
      if (c.code === courierCode) {
        return { ...c, [field]: value };
      }
      return c;
    }));
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Administración de Import Hub</h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de tarifas por tramos de peso de couriers Miami, handling, URSEC y normativas aduaneras (DNA).
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all self-start sm:self-auto"
        >
          {savedSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {savedSuccess ? '¡Cambios Guardados!' : 'Guardar Configuración'}
        </button>
      </div>

      <div className="flex gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('couriers')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'couriers'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white bg-slate-900'
          }`}
        >
          <Truck className="w-4 h-4" /> Couriers & Tarifarios por Peso
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'rules'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-white bg-slate-900'
          }`}
        >
          <Globe className="w-4 h-4" /> Normativas Aduaneras (Países)
        </button>
      </div>

      {activeSubTab === 'couriers' && (
        <div className="space-y-6">
          {couriers.map((courier) => (
            <div key={courier.code} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-400 font-mono font-bold rounded-xl border border-amber-500/20">
                    {courier.code}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{courier.name}</h3>
                    <span className="text-xs text-slate-400">Orden de prioridad: {courier.sort_order}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={courier.is_active}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'is_active', e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-amber-500"
                    />
                    <span>Activo en Comparador</span>
                  </label>
                </div>
              </div>

              {/* Extra fees config */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Handling / Recepción (USD):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={courier.handling_fee_usd}
                    onChange={(e) => handleUpdateCourierFee(courier.code, 'handling_fee_usd', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Trámite URSEC (% / tarifa):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={courier.ursec_fee_percent}
                    onChange={(e) => handleUpdateCourierFee(courier.code, 'ursec_fee_percent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Seguro Obligatorio (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={courier.insurance_fee_percent}
                    onChange={(e) => handleUpdateCourierFee(courier.code, 'insurance_fee_percent', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Entrega Local en UY (USD):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={courier.local_delivery_fee_usd}
                    onChange={(e) => handleUpdateCourierFee(courier.code, 'local_delivery_fee_usd', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Tiers display */}
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Tramos de Tarifas por Peso Físico
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="text-[11px] text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Tramo</th>
                        <th className="py-2 px-3">Rango Peso (kg)</th>
                        <th className="py-2 px-3">Tipo de Tarifa</th>
                        <th className="py-2 px-3 text-right">Tarifa (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {courier.rates?.map((r, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 font-medium text-white">{r.label}</td>
                          <td className="py-2 px-3 font-mono">{r.min_weight_kg} kg - {r.max_weight_kg} kg</td>
                          <td className="py-2 px-3">{r.rate_type === 'FLAT_RATE' ? 'Fijo (Flat)' : 'Por Kilogramo'}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-amber-400">
                            ${r.rate_usd.toFixed(2)} {r.rate_type === 'PER_KG' ? '/kg' : 'USD'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'rules' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-amber-400" />
            <div>
              <h3 className="text-lg font-bold text-white">Reglas Aduaneras: {customsRule.country_name} ({customsRule.year})</h3>
              <p className="text-xs text-slate-400">Parámetros oficiales aplicados por el motor de cálculo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Cupo Anual de Franquicia (USD):</label>
              <input
                type="number"
                value={customsRule.annual_quota_usd}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, annual_quota_usd: parseFloat(e.target.value) || 800 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Envíos Máximos por Año:</label>
              <input
                type="number"
                value={customsRule.max_shipments_per_year}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, max_shipments_per_year: parseInt(e.target.value) || 3 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Peso Físico Máximo por Envío (kg):</label>
              <input
                type="number"
                value={customsRule.max_weight_kg}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, max_weight_kg: parseFloat(e.target.value) || 20 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Tasa Régimen Simplificado (%):</label>
              <input
                type="number"
                value={customsRule.simplified_tax_rate}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, simplified_tax_rate: parseFloat(e.target.value) || 60 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Mínimo Régimen Simplificado (USD):</label>
              <input
                type="number"
                value={customsRule.min_simplified_tax_usd}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, min_simplified_tax_usd: parseFloat(e.target.value) || 20 }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminImportHub;
