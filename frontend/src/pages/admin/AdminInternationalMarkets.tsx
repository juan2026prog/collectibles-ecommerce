// frontend/src/pages/admin/AdminInternationalMarkets.tsx

import React, { useState } from 'react';
import { useInternationalMarkets } from '../../hooks/useInternationalMarkets';
import { MarketRecord, MarketStatus } from '../../lib/marketEngine/marketTypes';
import {
  Globe,
  Eye,
  Shield,
  ExternalLink,
  Power,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  Settings2,
  Radio
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminInternationalMarkets() {
  const { toast } = useToast();
  const { markets, loading, error, refreshMarkets, updateMarketStatus, updateMarketConfig } = useInternationalMarkets();
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);
  const [globalKillSwitch, setGlobalKillSwitch] = useState<boolean>(false);

  const handleStatusChange = async (countryCode: string, newStatus: MarketStatus) => {
    // Safety guard: SkyPostal cannot be set to LIVE in Phase 1 Foundation
    if (newStatus === 'LIVE') {
      const market = markets.find(m => m.country_code === countryCode);
      if (market && market.logistics_mode === 'SKYPOSTAL') {
        toast.error(`Bloqueo de seguridad: El mercado ${market.country_name} (SkyPostal) requiere certificación en Fase 3 antes de pasar a LIVE.`);
        return;
      }
    }

    setUpdatingCode(countryCode);
    const res = await updateMarketStatus(countryCode, newStatus);
    setUpdatingCode(null);

    if (res.success) {
      toast.success(`Estado de ${countryCode} actualizado a ${newStatus}`);
    } else {
      toast.error(`Error actualizando mercado: ${res.error}`);
    }
  };

  const handleToggleKillSwitch = async (market: MarketRecord) => {
    const currentKillSwitch = !!market.metadata?.kill_switch;
    const newMetadata = { ...market.metadata, kill_switch: !currentKillSwitch };

    setUpdatingCode(market.country_code);
    const res = await updateMarketConfig(market.country_code, { metadata: newMetadata });
    setUpdatingCode(null);

    if (res.success) {
      toast.success(`Kill Switch de ${market.country_name} ${!currentKillSwitch ? 'ACTIVADO (PAUSADO)' : 'DESACTIVADO (ACTIVO)'}`);
    } else {
      toast.error(`Error: ${res.error}`);
    }
  };

  const getStatusBadge = (status: MarketStatus) => {
    switch (status) {
      case 'LIVE':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="w-3.5 h-3.5" /> LIVE</span>;
      case 'PREVIEW':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"><Eye className="w-3.5 h-3.5" /> PREVIEW</span>;
      case 'SANDBOX':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"><Radio className="w-3.5 h-3.5" /> SANDBOX</span>;
      case 'DISABLED':
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-surface-700/50 text-surface-400 border border-surface-600"><Lock className="w-3.5 h-3.5" /> DISABLED</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5 text-xs text-primary-400 font-bold uppercase tracking-wider">
            <Globe className="w-4 h-4" />
            <span>Infraestructura Logística Internacional</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1">International Markets — SkyPostal & Import Hub</h1>
          <p className="text-surface-400 text-sm mt-0.5">
            Control central de mercados, enrutamiento logístico, preview modes y estados operativos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refreshMarkets()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Kill Switch & Notice Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-800/80 border border-surface-700/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-surface-200 font-bold text-sm">
              <Power className="w-4 h-4 text-emerald-400" />
              <span>SkyPostal Global Kill Switch</span>
            </div>
            <p className="text-surface-400 text-xs mt-0.5">
              Desactiva todos los envíos SkyPostal inmediatamente en caso de contingencia.
            </p>
          </div>
          <button
            onClick={() => {
              setGlobalKillSwitch(!globalKillSwitch);
              toast.success(`Global Kill Switch ${!globalKillSwitch ? 'ACTIVADO' : 'DESACTIVADO'}`);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              globalKillSwitch
                ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                : 'bg-surface-700 text-surface-300 border-surface-600 hover:bg-surface-600'
            }`}
          >
            {globalKillSwitch ? 'ACTIVADO (PAUSADO)' : 'OPERATIVO'}
          </button>
        </div>

        <div className="p-4 rounded-xl bg-primary-950/30 border border-primary-800/40 col-span-1 md:col-span-2 flex items-center gap-3.5">
          <Shield className="w-6 h-6 text-primary-400 shrink-0" />
          <div className="text-xs text-primary-200/90 leading-relaxed">
            <strong>Fase 1 Foundation:</strong> Uruguay y Argentina continúan operando exclusivamente mediante <strong>Import Hub</strong> sin alteraciones. Los mercados de Chile, Perú, Brasil, Colombia y Ecuador operan en modo <strong>PREVIEW</strong> (sin transacciones ni envíos reales). México permanece <strong>DISABLED</strong>.
          </div>
        </div>
      </div>

      {/* Markets Table */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between bg-surface-900/50">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary-400" />
            <span>Mercados Internacionales Configurados ({markets.length})</span>
          </h2>
          <span className="text-xs text-surface-400 font-mono">Fase 1 Target: CL Lead Preview</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-surface-800 bg-surface-950/60 text-surface-400 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">País</th>
                <th className="py-3.5 px-4">Modo Logístico</th>
                <th className="py-3.5 px-4">Proveedor</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-center">Preview</th>
                <th className="py-3.5 px-4 text-center">Público</th>
                <th className="py-3.5 px-4 text-center">Checkout</th>
                <th className="py-3.5 px-4">Entorno</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/60">
              {markets.map((market) => {
                const isUpdating = updatingCode === market.country_code;
                const isKillSwitch = !!market.metadata?.kill_switch;

                return (
                  <tr key={market.country_code} className="hover:bg-surface-800/40 transition-colors">
                    {/* Country */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" role="img" aria-label={market.country_name}>
                          {market.metadata?.flag || '🌐'}
                        </span>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{market.country_name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-800 text-surface-400 border border-surface-700">
                              {market.country_code}
                            </span>
                          </div>
                          <span className="text-surface-400 text-[11px] font-mono">Moneda: {market.currency}</span>
                        </div>
                      </div>
                    </td>

                    {/* Logistics Mode */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                        market.logistics_mode === 'IMPORT_HUB'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {market.logistics_mode}
                      </span>
                    </td>

                    {/* Provider */}
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-surface-200 uppercase text-[11px]">
                        {market.provider}
                      </span>
                    </td>

                    {/* Status Select */}
                    <td className="py-3.5 px-4">
                      <select
                        value={market.market_status}
                        disabled={isUpdating}
                        onChange={(e) => handleStatusChange(market.country_code, e.target.value as MarketStatus)}
                        className="bg-surface-800 border border-surface-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-primary-500"
                      >
                        <option value="DISABLED">DISABLED</option>
                        <option value="PREVIEW">PREVIEW</option>
                        <option value="SANDBOX">SANDBOX</option>
                        <option value="LIVE">LIVE</option>
                      </select>
                    </td>

                    {/* Preview Flag */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.preview_enabled ? 'bg-amber-400 ring-2 ring-amber-400/20' : 'bg-surface-600'}`} />
                    </td>

                    {/* Public Flag */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.public_enabled ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-surface-600'}`} />
                    </td>

                    {/* Checkout Flag */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${market.checkout_enabled ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-surface-600'}`} />
                    </td>

                    {/* Environment */}
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                        market.provider_environment === 'production'
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                          : 'bg-amber-950/60 text-amber-300 border-amber-800'
                      }`}>
                        {market.provider_environment}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Open Preview Button */}
                        <a
                          href={`/intl/${market.country_code.toLowerCase()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-primary-400 hover:text-primary-300 border border-surface-700 text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                          <ExternalLink className="w-3 h-3 ml-0.5 text-surface-400" />
                        </a>

                        {/* Kill Switch Toggle */}
                        <button
                          onClick={() => handleToggleKillSwitch(market)}
                          disabled={isUpdating}
                          title={isKillSwitch ? 'Kill switch activo' : 'Pausar mercado'}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isKillSwitch
                              ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                              : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-white'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
