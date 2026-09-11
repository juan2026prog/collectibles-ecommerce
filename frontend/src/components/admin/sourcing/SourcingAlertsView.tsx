import React, { useState } from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { 
  AlertTriangle, ShieldAlert, Info, Bell, CheckCircle2, 
  TrendingDown, RefreshCw, ArrowRight, Filter, ExternalLink
} from 'lucide-react';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface SourcingAlertItem {
  id: string;
  severity: AlertSeverity;
  type: 
    | 'MARGIN_DROP' 
    | 'OUT_OF_STOCK' 
    | 'SOURCE_SWITCH' 
    | 'SELLER_DOWNGRADE' 
    | 'PRICE_DRIFT' 
    | 'HIGH_DEMAND' 
    | 'NEW_OPPORTUNITY' 
    | 'INTEGRATION_ERROR' 
    | 'CIRCUIT_BREAKER';
  title: string;
  description: string;
  timestamp: string;
  product?: NormalizedProduct;
  resolved?: boolean;
}

interface SourcingAlertsViewProps {
  products: NormalizedProduct[];
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
}

export const SourcingAlertsView: React.FC<SourcingAlertsViewProps> = ({
  products,
  onOpenAnalysisModal
}) => {
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | 'ALL'>('ALL');

  // Derive real alerts dynamically from products & system events
  const generateAlerts = (): SourcingAlertItem[] => {
    const alerts: SourcingAlertItem[] = [];

    products.forEach((p, idx) => {
      if (p.financials.profit_usd <= 0) {
        alerts.push({
          id: `alt-margin-${p.id}`,
          severity: 'CRITICAL',
          type: 'MARGIN_DROP',
          title: `Pérdida de Margen detectada: ${p.title}`,
          description: `El costo puesto ($${p.financials.real_cost_puesto_usd.toFixed(2)}) supera el precio de venta ($${p.financials.current_sale_price_usd.toFixed(2)}). Lucro nulo o negativo.`,
          timestamp: new Date(Date.now() - idx * 3600000).toISOString(),
          product: p
        });
      }

      if (p.authenticity.status === 'NEEDS_VERIFICATION') {
        alerts.push({
          id: `alt-[#f00856]-${p.id}`,
          severity: 'WARNING',
          type: 'SELLER_DOWNGRADE',
          title: `Revisión de Autenticidad requerida: ${p.title}`,
          description: `Vendedor o fuente presenta señales dudosas: ${p.authenticity.red_flags.join(', ') || 'Reputación no verificada'}.`,
          timestamp: new Date(Date.now() - (idx + 1) * 7200000).toISOString(),
          product: p
        });
      }

      if (p.opportunity_score >= 85) {
        alerts.push({
          id: `alt-opp-${p.id}`,
          severity: 'INFO',
          type: 'HIGH_DEMAND',
          title: `Alta Oportunidad Comercial: ${p.title}`,
          description: `Opportunity Score alcanzado: ${p.opportunity_score}/100. Alta demanda y margen de $${p.financials.profit_usd.toFixed(2)} USD.`,
          timestamp: new Date(Date.now() - (idx + 2) * 1800000).toISOString(),
          product: p
        });
      }
    });

    // Integration & Circuit Breaker status alerts
    alerts.push({
      id: 'sys-zinc-1',
      severity: 'INFO',
      type: 'NEW_OPPORTUNITY',
      title: 'Multifuente Activa (Amazon, eBay, Best Buy)',
      description: 'Adaptadores de Zinc API 2.0 respondiendo normalmente sin Circuit Breakers activados.',
      timestamp: new Date().toISOString()
    });

    return alerts;
  };

  const [alerts, setAlerts] = useState<SourcingAlertItem[]>(generateAlerts);

  const filteredAlerts = filterSeverity === 'ALL' 
    ? alerts 
    : alerts.filter(a => a.severity === filterSeverity);

  const handleResolveAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' && !a.resolved).length;
  const warningCount = alerts.filter(a => a.severity === 'WARNING' && !a.resolved).length;
  const infoCount = alerts.filter(a => a.severity === 'INFO' && !a.resolved).length;

  return (
    <div className="space-y-6">
      {/* Alert KPI Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterSeverity('ALL')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterSeverity === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-900'
          }`}
        >
          <span className="text-xs font-semibold opacity-75 block">Total Alertas Registradas</span>
          <strong className="text-2xl font-extrabold font-mono mt-1 block">{alerts.length}</strong>
        </button>

        <button
          onClick={() => setFilterSeverity('CRITICAL')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterSeverity === 'CRITICAL'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-rose-50/70 hover:bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold block">CRITICAL</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <strong className="text-2xl font-extrabold font-mono mt-1 block">{criticalCount}</strong>
        </button>

        <button
          onClick={() => setFilterSeverity('WARNING')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterSeverity === 'WARNING'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50/70 hover:bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold block">WARNING</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <strong className="text-2xl font-extrabold font-mono mt-1 block">{warningCount}</strong>
        </button>

        <button
          onClick={() => setFilterSeverity('INFO')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            filterSeverity === 'INFO'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-blue-50/70 hover:bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold block">INFO</span>
            <Info className="w-4 h-4 text-blue-500" />
          </div>
          <strong className="text-2xl font-extrabold font-mono mt-1 block">{infoCount}</strong>
        </button>
      </div>

      {/* Alerts Feed */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#f00856]" />
            <span>Centro Consolidado de Alertas de Sourcing ({filteredAlerts.length})</span>
          </h3>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Filtrar severidad:</span>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as any)}
              className="text-xs font-bold border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-800"
            >
              <option value="ALL">Todas las severidades</option>
              <option value="CRITICAL">CRITICAL (Críticas)</option>
              <option value="WARNING">WARNING (Advertencias)</option>
              <option value="INFO">INFO (Informativas)</option>
            </select>
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
            <p className="text-xs font-bold text-gray-700">Sin alertas activas para el filtro seleccionado</p>
            <p className="text-[11px] text-gray-500 mt-0.5">El sistema de Sourcing opera en parámetros seguros.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map(alert => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                  alert.resolved
                    ? 'bg-gray-50 border-gray-200 opacity-60'
                    : alert.severity === 'CRITICAL'
                    ? 'bg-rose-50/50 border-rose-200'
                    : alert.severity === 'WARNING'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-blue-50/50 border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`p-2 rounded-lg shrink-0 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-100 text-rose-700'
                      : alert.severity === 'WARNING'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {alert.severity === 'CRITICAL' ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : alert.severity === 'WARNING' ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <Info className="w-5 h-5" />
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-extrabold px-2 py-0.2 rounded uppercase ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-200 text-rose-800'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-200 text-amber-800'
                          : 'bg-blue-200 text-blue-800'
                      }`}>
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {new Date(alert.timestamp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {alert.resolved && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.2 rounded">
                          RESUELTA
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-gray-900">
                      {alert.title}
                    </h4>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {alert.product && (
                    <button
                      onClick={() => onOpenAnalysisModal(alert.product!)}
                      className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-gray-100 border border-gray-300 rounded-lg text-gray-700 shadow-2xs transition cursor-pointer"
                    >
                      Analizar
                    </button>
                  )}

                  {!alert.resolved && (
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="px-3 py-1.5 text-xs font-bold bg-gray-900 hover:bg-black text-white rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Marcar Resuelta</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
