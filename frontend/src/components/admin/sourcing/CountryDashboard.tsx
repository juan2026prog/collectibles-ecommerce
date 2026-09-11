import React from 'react';
import type { CountryCode } from '../../../types/sourcingLatam';
import { countryEngine } from '../../../services/sourcing/countryEngine';
import { currencyService } from '../../../services/sourcing/currencyService';

interface CountryDashboardProps {
  countryCode: CountryCode;
  analyzedProductsCount?: number;
  opportunitiesCount?: number;
  avgMarginPercent?: number;
}

export const CountryDashboard: React.FC<CountryDashboardProps> = ({
  countryCode,
  analyzedProductsCount = 12,
  opportunitiesCount = 8,
  avgMarginPercent = 18.5,
}) => {
  const config = countryEngine.getCountryConfig(countryCode);
  const rules = countryEngine.getImportRules(countryCode);
  const readiness = countryEngine.getCountryReadiness(countryCode);
  const exchange = currencyService.getRate(config.currency);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-slate-100 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xl">
            {countryCode === 'UY' ? '🇺🇾' : countryCode === 'AR' ? '🇦🇷' : countryCode === 'CL' ? '🇨🇱' : '🌐'}
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Sourcing Intelligence — {config.country_name}</h3>
            <p className="text-xs text-slate-400">
              Dashboard de mercado y operación comercial internacional
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
            readiness.status === 'OPERATIVO'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : readiness.status === 'CONFIGURADO'
              ? 'bg-amber-950 text-amber-300 border-amber-800'
              : 'bg-slate-950 text-slate-500 border-slate-800'
          }`}>
            {readiness.status}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            Readiness: <strong className="text-white">{readiness.readiness_score}%</strong>
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Productos Analizados</div>
          <div className="text-2xl font-bold text-white font-mono">{analyzedProductsCount}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Oportunidades Viables</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{opportunitiesCount}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Margen Promedio</div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">{avgMarginPercent}%</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Tipo de Cambio FX</div>
          <div className="text-lg font-bold text-indigo-300 font-mono">
            1 USD = {exchange.rate} {config.currency}
          </div>
          <div className="text-[10px] text-slate-500 flex items-center justify-between mt-1">
            <span>Fuente: {exchange.source}</span>
            <span className="text-emerald-400 font-semibold">{exchange.status}</span>
          </div>
        </div>
      </div>

      {/* Operational Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
            Parámetros de Importación & Aduana ({config.country_name})
          </h4>
          <ul className="text-xs space-y-2 text-slate-300 font-mono">
            <li className="flex justify-between">
              <span className="text-slate-400">Tope Franquicia:</span>
              <span>${rules.max_franchise_value_usd} USD</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Peso Máximo Franquicia:</span>
              <span>{rules.max_franchise_weight_lbs} lbs</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Envíos por año:</span>
              <span>{rules.max_franchise_shipments_per_year} envíos</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">Arancel General de Importación:</span>
              <span>{rules.standard_import_tax_percent}%</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-400">IVA Aduanero:</span>
              <span>{rules.vat_tax_percent}%</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
            Verificación de Requisitos Operativos
          </h4>
          <ul className="text-xs space-y-2">
            {Object.entries(readiness.checks).map(([check, passed]) => (
              <li key={check} className="flex items-center justify-between font-mono">
                <span className="text-slate-400 capitalize">{check.replace('_', ' ')}:</span>
                <span className={passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {passed ? '✓ VERIFICADO' : '✕ NO CONFIGURADO'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
