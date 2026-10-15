import React, { useState } from 'react';
import { Package, Layers, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, DollarSign } from 'lucide-react';
import { evaluateConsolidation } from '../../lib/argentina/pricingEngine';
import { ArgentinaShipmentZone } from '../../lib/argentina/types';

export interface MyPackageItem {
  id: string;
  order_number: string;
  product_title: string;
  product_image?: string;
  original_tracking_number?: string;
  carrier?: string;
  fob_usd: number;
  weight_kg: number;
  species_category?: string;
  units?: number;
  package_status: string;
  is_available_for_consolidation: boolean;
  logistics_paid_usd: number;
}

interface MyPackagesTabProps {
  packages: MyPackageItem[];
  userZone: ArgentinaShipmentZone;
  onConsolidate: (selectedPackageIds: string[]) => Promise<void>;
  onSendIndividual?: (packageId: string) => Promise<void>;
}

export const MyPackagesTab: React.FC<MyPackagesTabProps> = ({
  packages,
  userZone,
  onConsolidate,
  onSendIndividual,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedPackages = packages.filter(p => selectedIds.includes(p.id));

  const consolidationQuote = selectedPackages.length > 0
    ? evaluateConsolidation(
        selectedPackages.map(p => ({
          id: p.id,
          fob_usd: p.fob_usd,
          weight_kg: p.weight_kg,
          species_category: p.species_category,
          units: p.units || 1,
          logistics_paid_usd: p.logistics_paid_usd,
        })),
        userZone
      )
    : null;

  const handleConsolidateClick = async () => {
    if (selectedIds.length === 0) return;
    if (consolidationQuote && consolidationQuote.status !== 'ELIGIBLE') {
      setErrorMessage(consolidationQuote.errors.join(' '));
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConsolidate(selectedIds);
      setSelectedIds([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar la consolidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-700/60 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400" />
            Mis Paquetes en Miami (Suite Central)
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Visualizá los paquetes recibidos para tu cuenta y consolidalos para ahorrar con un único Logistic Pack.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-gray-800 text-gray-300 px-3 py-1.5 rounded-full border border-gray-700">
            Zona de entrega: <strong className="text-white">{userZone}</strong>
          </span>
          <button
            onClick={handleConsolidateClick}
            disabled={selectedIds.length === 0 || isSubmitting || (consolidationQuote?.status !== 'ELIGIBLE')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
              selectedIds.length > 0 && consolidationQuote?.status === 'ELIGIBLE' && !isSubmitting
                ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
            }`}
          >
            <Layers className="w-4 h-4" />
            Consolidar seleccionados ({selectedIds.length})
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-xl text-red-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <strong>Atención:</strong> {errorMessage}
          </div>
        </div>
      )}

      {consolidationQuote && selectedPackages.length > 0 && (
        <div className="p-4 bg-gray-800/80 border border-amber-500/30 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Resumen de Consolidación (Modalidad A)
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              consolidationQuote.status === 'ELIGIBLE'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-red-950 text-red-300 border border-red-800'
            }`}>
              {consolidationQuote.status === 'ELIGIBLE' ? 'Elegible para consolidar' : 'No elegible'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-700/50">
              <div className="text-gray-400">FOB Total</div>
              <div className="text-white font-bold text-sm">USD {consolidationQuote.fob_total_usd.toFixed(2)}</div>
              <div className="text-[10px] text-gray-500">Máx. USD 400.00</div>
            </div>
            <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-700/50">
              <div className="text-gray-400">Peso Total</div>
              <div className="text-white font-bold text-sm">{consolidationQuote.total_weight_kg.toFixed(2)} kg</div>
              <div className="text-[10px] text-gray-500">USD 19/kg = USD {consolidationQuote.freight_usd.toFixed(2)}</div>
            </div>
            <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-700/50">
              <div className="text-gray-400">Logistic Pack Único</div>
              <div className="text-white font-bold text-sm">USD {consolidationQuote.single_logistic_pack_usd.toFixed(2)}</div>
              <div className="text-[10px] text-gray-500">Aplica 1 sola vez ({userZone})</div>
            </div>
            <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-700/50">
              <div className="text-gray-400">Diferencia / Crédito</div>
              <div className={`font-bold text-sm ${consolidationQuote.net_logistics_difference_usd <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {consolidationQuote.net_logistics_difference_usd <= 0 ? '-' : '+'} USD {Math.abs(consolidationQuote.net_logistics_difference_usd).toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-500">Ya pagado: USD {consolidationQuote.previous_logistics_paid_usd.toFixed(2)}</div>
            </div>
          </div>

          {consolidationQuote.errors.length > 0 && (
            <div className="text-xs text-red-300 bg-red-950/20 p-2 rounded border border-red-900/40">
              {consolidationQuote.errors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/40 border border-gray-700/40 rounded-xl">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-300">No tenés paquetes registrados</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
            Cuando realices compras internacionales destinadas a Argentina, tus paquetes aparecerán aquí al ser procesados por Deblex en Miami.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(pkg => {
            const isSelected = selectedIds.includes(pkg.id);
            const isEligible = pkg.is_available_for_consolidation && ['RECIBIDO_EN_DEPOSITO', 'DISPONIBLE_PARA_CONSOLIDAR'].includes(pkg.package_status);

            return (
              <div
                key={pkg.id}
                className={`relative rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'bg-amber-950/20 border-amber-500 shadow-md shadow-amber-500/10'
                    : 'bg-gray-800/60 border-gray-700/60 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isEligible}
                      onChange={() => toggleSelect(pkg.id)}
                      className="w-4 h-4 rounded border-gray-700 text-amber-500 focus:ring-amber-500 disabled:opacity-40"
                    />
                    <span className="text-xs font-mono font-medium text-gray-400">
                      {pkg.order_number || 'Pedido'}
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    pkg.package_status === 'DISPONIBLE_PARA_CONSOLIDAR' || pkg.package_status === 'RECIBIDO_EN_DEPOSITO'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : pkg.package_status === 'CONSOLIDACION_CERRADA'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {pkg.package_status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="flex gap-3 mb-3">
                  <div className="w-16 h-16 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-gray-700/60">
                    {pkg.product_image ? (
                      <img src={pkg.product_image} alt={pkg.product_title} className="w-full h-full object-contain" />
                    ) : (
                      <Package className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                      {pkg.product_title}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      Tracking Amazon: <strong className="font-mono text-gray-300">{pkg.original_tracking_number || 'Pendiente'}</strong>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-900/50 p-2.5 rounded-lg border border-gray-700/40 mb-3">
                  <div>
                    <span className="text-gray-500 text-[10px] block">FOB Unitario</span>
                    <span className="font-bold text-white">USD {pkg.fob_usd.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">Peso</span>
                    <span className="font-bold text-white">{pkg.weight_kg.toFixed(2)} kg</span>
                  </div>
                </div>

                {onSendIndividual && isEligible && (
                  <button
                    onClick={() => onSendIndividual(pkg.id)}
                    className="w-full py-1.5 px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    Enviar individual sin consolidar
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
