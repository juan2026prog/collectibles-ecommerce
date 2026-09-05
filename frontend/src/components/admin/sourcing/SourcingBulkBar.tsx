import React from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { Download, Clock, X, ShieldCheck, AlertTriangle } from 'lucide-react';

interface SourcingBulkBarProps {
  selectedProducts: NormalizedProduct[];
  onClearSelection: () => void;
  onBulkImport: () => void;
  onBulkPreorder: () => void;
  isProcessing?: boolean;
}

export const SourcingBulkBar: React.FC<SourcingBulkBarProps> = ({
  selectedProducts,
  onClearSelection,
  onBulkImport,
  onBulkPreorder,
  isProcessing = false
}) => {
  if (selectedProducts.length === 0) return null;

  // Cálculos agregados en tiempo real
  const totalCostPuesto = selectedProducts.reduce((sum, p) => sum + p.financials.real_cost_puesto_usd, 0);
  const totalSaleRevenue = selectedProducts.reduce((sum, p) => sum + p.financials.current_sale_price_usd, 0);
  const totalProfit = selectedProducts.reduce((sum, p) => sum + p.financials.profit_usd, 0);
  const avgMargin = totalSaleRevenue > 0 ? (totalProfit / totalSaleRevenue) * 100 : 0;

  const officialCount = selectedProducts.filter(p => p.authenticity.status === 'VERIFIED_OFFICIAL').length;
  const unverifiedCount = selectedProducts.length - officialCount;
  const hasPreorders = selectedProducts.some(p => p.product_type === 'PREORDER');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-5xl bg-white/95 backdrop-blur-xl border border-gray-300 shadow-2xl rounded-2xl p-3.5 px-6 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Métricas Agregadas */}
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white bg-[#f00856] px-2.5 py-1 rounded-full text-sm shadow-xs">
              {selectedProducts.length}
            </span>
            <span className="text-gray-800 font-bold">Seleccionados</span>
          </div>

          <div className="hidden sm:block border-l border-gray-200 pl-4 space-y-0.5">
            <span className="text-gray-500 block text-[10px] uppercase font-semibold tracking-wider">Inversión (Costo Puesto)</span>
            <span className="font-mono text-gray-900 font-bold text-sm">${totalCostPuesto.toFixed(2)} USD</span>
          </div>

          <div className="hidden sm:block border-l border-gray-200 pl-4 space-y-0.5">
            <span className="text-gray-500 block text-[10px] uppercase font-semibold tracking-wider">Venta Potencial</span>
            <span className="font-mono text-gray-900 font-bold text-sm">${totalSaleRevenue.toFixed(2)} USD</span>
          </div>

          <div className="border-l border-gray-200 pl-4 space-y-0.5">
            <span className="text-emerald-700 block text-[10px] uppercase tracking-wider font-semibold">Utilidad Total</span>
            <span className="font-mono text-emerald-600 font-extrabold text-sm">
              +${totalProfit.toFixed(2)} USD
            </span>
          </div>

          <div className="hidden md:block border-l border-gray-200 pl-4 space-y-0.5">
            <span className="text-gray-500 block text-[10px] uppercase font-semibold tracking-wider">Margen Promedio</span>
            <span className="font-mono text-gray-900 font-bold text-sm">{avgMargin.toFixed(1)}%</span>
          </div>
        </div>

        {/* Acciones Masivas */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {unverifiedCount > 0 && (
            <span className="hidden lg:flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium mr-2" title={`${unverifiedCount} productos no oficiales serán omitidos o requieren verificación`}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{unverifiedCount} pendientes de verificar</span>
            </span>
          )}

          {hasPreorders && (
            <button
              onClick={onBulkPreorder}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all"
            >
              <Clock className="w-4 h-4" />
              <span>PUBLICAR PREVENTAS ({selectedProducts.filter(p => p.product_type === 'PREORDER').length})</span>
            </button>
          )}

          <button
            onClick={onBulkImport}
            disabled={isProcessing || officialCount === 0}
            className="flex items-center gap-1.5 px-5 py-2 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all"
          >
            <Download className="w-4 h-4" />
            <span>IMPORTAR {officialCount} PRODUCTOS</span>
          </button>

          <button
            onClick={onClearSelection}
            title="Deseleccionar todo"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
