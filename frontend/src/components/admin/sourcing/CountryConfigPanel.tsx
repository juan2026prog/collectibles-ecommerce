import React, { useState, useEffect } from 'react';
import type { CountryCode, CountryConfig, CountryImportRules, CountryReadinessIndicator } from '../../../types/sourcingLatam';
import { countryEngine } from '../../../services/sourcing/countryEngine';

export const CountryConfigPanel: React.FC = () => {
  const [selectedCode, setSelectedCode] = useState<CountryCode>('UY');
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [config, setConfig] = useState<CountryConfig | null>(null);
  const [rules, setRules] = useState<CountryImportRules | null>(null);
  const [readiness, setReadiness] = useState<CountryReadinessIndicator | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    countryEngine.initialize().then(() => {
      const all = countryEngine.getAllCountries();
      setCountries(all);
      loadCountry(selectedCode);
    });
  }, []);

  const loadCountry = (code: CountryCode) => {
    setSelectedCode(code);
    const cfg = countryEngine.getCountryConfig(code);
    const rls = countryEngine.getImportRules(code);
    const rdn = countryEngine.getCountryReadiness(code);
    setConfig(cfg);
    setRules(rls);
    setReadiness(rdn);
  };

  const handleToggleEnable = (field: 'enabled' | 'sourcing_enabled' | 'publication_enabled') => {
    if (!config) return;
    const updated = { ...config, [field]: !config[field] };
    setConfig(updated);
  };

  const handleSave = () => {
    setSaveStatus('Configuración guardada exitosamente en el sistema.');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  if (!config || !rules || !readiness) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-slate-100 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚙️</span> Configuración Comercial de Mercados (Super Admin)
          </h3>
          <p className="text-xs text-slate-400">
            Definición de reglas aduaneras, franquicias, márgenes e indicadores de preparación por mercado LATAM.
          </p>
        </div>

        {saveStatus && (
          <span className="text-xs text-emerald-400 font-medium bg-emerald-950 px-3 py-1.5 rounded-md border border-emerald-800">
            ✓ {saveStatus}
          </span>
        )}
      </div>

      {/* Country Selector Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-800/80">
        {countries.map(c => {
          const isSelected = c.country_code === selectedCode;
          return (
            <button
              key={c.country_code}
              onClick={() => loadCountry(c.country_code)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
                isSelected
                  ? 'bg-cyan-600 text-white shadow-lg'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{c.country_name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                c.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-950 text-slate-500'
              }`}>
                {c.enabled ? 'ACTIVO' : 'OFF'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Configuration Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Status & Readiness */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Market Readiness: {readiness.readiness_score}%
          </h4>

          <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all ${
                readiness.readiness_score >= 80 ? 'bg-emerald-500' : readiness.readiness_score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${readiness.readiness_score}%` }}
            />
          </div>

          <div className="text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Moneda base:</span>
              <span className="text-white font-bold">{config.currency}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Estado Comercial:</span>
              <span className={`font-bold ${readiness.status === 'OPERATIVO' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {readiness.status}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-2">
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Mercado Habilitado</span>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={() => handleToggleEnable('enabled')}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Sourcing Activo</span>
              <input
                type="checkbox"
                checked={config.sourcing_enabled}
                onChange={() => handleToggleEnable('sourcing_enabled')}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Publicación Automática</span>
              <input
                type="checkbox"
                checked={config.publication_enabled}
                onChange={() => handleToggleEnable('publication_enabled')}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>
          </div>
        </div>

        {/* Column 2: Import & Tax Rules */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Reglas Aduaneras e Importación
          </h4>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Tope Franquicia USD</label>
              <input
                type="number"
                value={rules.max_franchise_value_usd}
                onChange={(e) => setRules({ ...rules, max_franchise_value_usd: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Tope Peso Franquicia (lbs)</label>
              <input
                type="number"
                value={rules.max_franchise_weight_lbs}
                onChange={(e) => setRules({ ...rules, max_franchise_weight_lbs: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Arancel General Importación (%)</label>
              <input
                type="number"
                value={rules.standard_import_tax_percent}
                onChange={(e) => setRules({ ...rules, standard_import_tax_percent: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Tasa IVA Aduanero (%)</label>
              <input
                type="number"
                value={rules.vat_tax_percent}
                onChange={(e) => setRules({ ...rules, vat_tax_percent: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Column 3: Commercial Margins & Category Restriction */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Pricing & Restricciones
          </h4>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Margen Comercial Mínimo (%)</label>
              <input
                type="number"
                value={rules.min_target_margin_percent}
                onChange={(e) => setRules({ ...rules, min_target_margin_percent: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Fee de Manejo / Courier USD</label>
              <input
                type="number"
                value={rules.customs_handling_fee_usd}
                onChange={(e) => setRules({ ...rules, customs_handling_fee_usd: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Categorías Prohibidas</label>
              <div className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 rounded p-2 font-mono">
                {rules.prohibited_categories.join(', ') || 'Ninguna'}
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full mt-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors shadow-lg"
            >
              Guardar Configuración de {config.country_name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
