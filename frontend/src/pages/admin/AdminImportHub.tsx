import React, { useState, useEffect } from 'react';
import type { ImportCourier, CourierRateTier, CustomsRule } from '../../plugins/collector-import-hub/types';
import { DEFAULT_COURIERS } from '../../plugins/collector-import-hub/core/courierEngine';
import { DEFAULT_URUGUAY_2026_RULE } from '../../plugins/collector-import-hub/core/customsEngine';
import { ImportCostEngine } from '../../lib/customs/ImportCostEngine';
import { KNOWN_COURIERS } from '../../lib/customs/CourierPricingEngine';
import { supabase } from '../../lib/supabase';
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
  Save,
  Calculator,
  RefreshCw,
  Zap,
  Sparkles
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

const AdminImportHub: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'couriers' | 'rules' | 'simulator'>('couriers');
  const [couriers, setCouriers] = useState<ImportCourier[]>(DEFAULT_COURIERS);
  const [customsRule, setCustomsRule] = useState<CustomsRule>(DEFAULT_URUGUAY_2026_RULE);
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Simulator state
  const [simWeight, setSimWeight] = useState<number>(0.8);
  const [simFob, setSimFob] = useState<number>(140);
  const [simFranchise, setSimFranchise] = useState<boolean>(true);

  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['import_hub_couriers_config', 'import_hub_customs_rules']);

      if (data) {
        data.forEach(row => {
          if (row.key === 'import_hub_couriers_config' && row.value) {
            try {
              const parsed = JSON.parse(row.value);
              if (Array.isArray(parsed) && parsed.length > 0) setCouriers(parsed);
            } catch (e) {
              console.error(e);
            }
          }
          if (row.key === 'import_hub_customs_rules' && row.value) {
            try {
              const parsed = JSON.parse(row.value);
              if (parsed && typeof parsed === 'object') setCustomsRule(parsed);
            } catch (e) {
              console.error(e);
            }
          }
        });
      }
    } catch (err) {
      console.error('Error loading import hub config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCourierFee = (courierCode: string, field: keyof ImportCourier, value: any) => {
    setCouriers(prev => prev.map(c => {
      if (c.code === courierCode) {
        return { ...c, [field]: value };
      }
      return c;
    }));
  };

  const handleUpdateTierRate = (courierCode: string, tierIndex: number, newRate: number) => {
    setCouriers(prev => prev.map(c => {
      if (c.code === courierCode) {
        const updatedRates = [...c.rates];
        if (updatedRates[tierIndex]) {
          updatedRates[tierIndex] = { ...updatedRates[tierIndex], rate_usd: newRate };
        }
        return { ...c, rates: updatedRates };
      }
      return c;
    }));
  };

  const handleSave = async () => {
    try {
      setSavedSuccess(false);
      const { error } = await supabase.from('site_settings').upsert([
        { key: 'import_hub_couriers_config', value: JSON.stringify(couriers) },
        { key: 'import_hub_customs_rules', value: JSON.stringify(customsRule) }
      ], { onConflict: 'key' });

      if (error) throw error;
      setSavedSuccess(true);
      toast.success('Configuración y tarifarios de Import Hub guardados con éxito');
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar configuración');
    }
  };

  const simResult = calculateTotalImportCost({
    fobPriceUSD: simFob,
    weightKg: simWeight,
    hasAvailableFranchise: simFranchise
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Administración de Import Hub</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Courier Matrix 2026
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de tarifas por tramos de peso de couriers Miami, handling, URSEC y normativas aduaneras (DNA).
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white font-bold text-xs rounded-xl shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          {savedSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {savedSuccess ? '¡Cambios Guardados!' : 'Guardar Configuración'}
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveSubTab('couriers')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'couriers'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Truck className="w-4 h-4" /> Couriers & Tarifarios por Peso
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'rules'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Globe className="w-4 h-4" /> Normativas Aduaneras (Uruguay 2026)
        </button>
        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'simulator'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Calculator className="w-4 h-4" /> Simulador de Costos
        </button>
      </div>

      {activeSubTab === 'couriers' && (
        <div className="space-y-6">
          {couriers.map((courier) => (
            <div key={courier.code} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-700 font-mono font-bold rounded-xl border border-blue-200 text-sm">
                    {courier.code.toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{courier.name}</h3>
                    <span className="text-xs text-gray-400">Prioridad en comparador: #{courier.sort_order}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 text-gray-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={courier.is_active}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'is_active', e.target.checked)}
                      className="w-4 h-4 text-[#f00856] rounded border-gray-300 focus:ring-[#f00856]"
                    />
                    <span>Activo en Comparador de Productos</span>
                  </label>
                </div>
              </div>

              {/* Extra fees config */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Handling / Recepción (USD):</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-mono">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={courier.handling_fee_usd}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'handling_fee_usd', parseFloat(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs focus:ring-2 focus:ring-[#f00856] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Trámite URSEC (USD / tarifa):</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-mono">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={courier.ursec_fee_percent}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'ursec_fee_percent', parseFloat(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs focus:ring-2 focus:ring-[#f00856] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Seguro Obligatorio (%):</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={courier.insurance_fee_percent}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'insurance_fee_percent', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs focus:ring-2 focus:ring-[#f00856] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Entrega Local en UY (USD):</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-mono">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={courier.local_delivery_fee_usd}
                      onChange={(e) => handleUpdateCourierFee(courier.code, 'local_delivery_fee_usd', parseFloat(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs focus:ring-2 focus:ring-[#f00856] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tiers display and editable table */}
              <div className="pt-2">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Tramos de Tarifas por Peso Físico (Editable)
                </h4>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-left text-xs text-gray-700">
                    <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-200 font-bold">
                      <tr>
                        <th className="py-2.5 px-4">Tramo de Peso</th>
                        <th className="py-2.5 px-4">Rango (kg)</th>
                        <th className="py-2.5 px-4">Modalidad</th>
                        <th className="py-2.5 px-4 text-right">Tarifa Configurada (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {courier.rates?.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50/70">
                          <td className="py-2.5 px-4 font-semibold text-gray-900">{r.label}</td>
                          <td className="py-2.5 px-4 font-mono text-gray-600">{r.min_weight_kg} kg - {r.max_weight_kg} kg</td>
                          <td className="py-2.5 px-4 text-gray-500">{r.rate_type === 'FLAT_RATE' ? 'Fijo (Flat Rate)' : 'Por Kilogramo (Per Kg)'}</td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <span className="text-gray-400 font-mono text-xs">$</span>
                              <input
                                type="number"
                                step="0.25"
                                value={r.rate_usd}
                                onChange={(e) => handleUpdateTierRate(courier.code, i, parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1 bg-white border border-gray-300 rounded font-mono font-bold text-right text-gray-900 focus:ring-1 focus:ring-[#f00856] outline-none text-xs"
                              />
                              <span className="text-[10px] text-gray-400 font-semibold">{r.rate_type === 'PER_KG' ? '/kg' : 'USD'}</span>
                            </div>
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
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <Globe className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-base font-bold text-gray-900">Reglas Aduaneras: {customsRule.country_name} ({customsRule.year})</h3>
              <p className="text-xs text-gray-500">Parámetros oficiales aplicados por el motor aduanero DNA</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Cupo Anual de Franquicia (USD):</label>
              <input
                type="number"
                value={customsRule.annual_quota_usd}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, annual_quota_usd: parseFloat(e.target.value) || 800 }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Envíos Máximos por Año:</label>
              <input
                type="number"
                value={customsRule.max_shipments_per_year}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, max_shipments_per_year: parseInt(e.target.value) || 3 }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Peso Físico Máximo por Envío (kg):</label>
              <input
                type="number"
                value={customsRule.max_weight_kg}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, max_weight_kg: parseFloat(e.target.value) || 20 }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Tasa Régimen Simplificado (%):</label>
              <input
                type="number"
                value={customsRule.simplified_tax_rate}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, simplified_tax_rate: parseFloat(e.target.value) || 60 }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Mínimo Régimen Simplificado (USD):</label>
              <input
                type="number"
                value={customsRule.min_simplified_tax_usd}
                onChange={(e) => setCustomsRule(prev => ({ ...prev, min_simplified_tax_usd: parseFloat(e.target.value) || 20 }))}
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Calculator size={18} className="text-[#f00856]" />
              Parámetros de Prueba
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Valor FOB Producto (USD):</label>
                <input
                  type="number"
                  value={simFob}
                  onChange={(e) => setSimFob(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Peso Estimado (kg):</label>
                <input
                  type="number"
                  step="0.1"
                  value={simWeight}
                  onChange={(e) => setSimWeight(parseFloat(e.target.value) || 0.1)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-mono font-bold text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800">
                  <input
                    type="checkbox"
                    checked={simFranchise}
                    onChange={(e) => setSimFranchise(e.target.checked)}
                    className="w-4 h-4 text-[#f00856] rounded border-gray-300 focus:ring-[#f00856]"
                  />
                  <span>Aplica Franquicia DNA (&le; USD 200)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center justify-between">
              <span>Resultados Comparativos en Tiempo Real</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mejor Opción: {simResult.bestCourier.name} (${simResult.bestCourier.totalCostUSD.toFixed(2)} USD)
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {simResult.courierComparisons.map((c) => {
                const isBest = c.courierCode === simResult.bestCourier.courierCode;
                return (
                  <div key={c.courierCode} className={`p-4 rounded-xl border ${isBest ? 'bg-pink-50/50 border-pink-300 shadow-sm' : 'bg-gray-50/60 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-900 text-sm">{c.courierName}</span>
                      {isBest && <span className="text-[10px] bg-[#f00856] text-white px-2 py-0.5 rounded-full font-bold">MEJOR</span>}
                    </div>
                    <div className="text-2xl font-black text-gray-900 font-mono">${c.totalLandedUSD.toFixed(2)}</div>
                    <div className="text-[11px] text-gray-500 mt-2 space-y-1 font-mono">
                      <div>Flete Internacional: ${c.shippingCostUSD.toFixed(2)}</div>
                      <div>Handling / Gestión: ${c.handlingFeeUSD.toFixed(2)}</div>
                      <div>Impuestos Aduana: ${c.customsTaxUSD.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminImportHub;
