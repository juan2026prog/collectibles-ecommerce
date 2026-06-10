import { useState, useEffect } from 'react';
import { useAdminMode } from '../contexts/AdminModeContext';
import { X, ExternalLink, Calculator, RefreshCw, AlertCircle, TrendingUp, Package, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AdminTechnicalPanelProps {
  product: any;
}

export default function AdminTechnicalPanel({ product }: AdminTechnicalPanelProps) {
  const { isAdminMode, toggleAdminMode } = useAdminMode();
  const [intl, setIntl] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdminMode && product && (product.source_provider === 'zinc' || product.source_provider === 'amazon')) {
      const fetchIntl = async () => {
        setLoading(true);
        const intlId = product.international_products?.[0]?.id || product.international_products?.id;
        if (intlId) {
          const { data } = await supabase.from('international_products').select('*').eq('id', intlId).single();
          if (data) setIntl(data);
        }
        setLoading(false);
      };
      fetchIntl();
    }
  }, [isAdminMode, product]);

  if (!isAdminMode || !product || (product.source_provider !== 'zinc' && product.source_provider !== 'amazon')) {
    return null;
  }

  const rawData = intl?.raw_data || {};

  if (loading) {
    return (
      <div className="fixed top-0 right-0 h-full w-80 bg-gray-900 text-gray-100 shadow-2xl z-[9998] flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="mt-4 text-sm text-gray-400">Cargando métricas...</p>
      </div>
    );
  }

  const cost = Number(intl?.base_price_usd || 0) + Number(intl?.usa_domestic_shipping_usd || 0);
  const profit = Number(intl?.expected_profit_usd || 0);
  const finalPrice = Number(intl?.final_price_usd || 0);
  const marginPercent = finalPrice > 0 ? ((profit / finalPrice) * 100).toFixed(1) : '0.0';
  
  const isProfitable = profit > 0 && finalPrice > cost;

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-gray-900 text-gray-100 shadow-2xl z-[9998] flex flex-col transition-transform duration-300 transform translate-x-0 overflow-y-auto">
      {/* Header */}
      <div className="bg-gray-950 px-4 py-4 border-b border-gray-800 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-400" />
          <h2 className="font-bold text-lg text-white">Panel Técnico</h2>
        </div>
        <button onClick={toggleAdminMode} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 p-1.5 rounded-md">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Profitability Status */}
        <div className={`p-4 rounded-lg border-2 ${isProfitable ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
          <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Rentabilidad</div>
          <div className={`text-2xl font-black ${isProfitable ? 'text-green-400' : 'text-red-400'} flex items-center gap-2`}>
            {isProfitable ? 'SÍ ES RENTABLE' : 'NO ES RENTABLE'}
            {!isProfitable && <AlertCircle className="w-5 h-5" />}
          </div>
          <div className="mt-2 text-sm text-gray-300 flex justify-between items-center">
            <span>Ganancia Neta:</span>
            <span className="font-bold text-white">${profit.toFixed(2)} USD</span>
          </div>
          <div className="text-sm text-gray-300 flex justify-between items-center mt-1">
            <span>Margen sobre venta:</span>
            <span className="font-bold text-white">{marginPercent}%</span>
          </div>
        </div>

        {/* Amazon Cost Breakdown */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Estructura de Costo
          </h3>
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Precio Amazon:</span>
              <span>${Number(intl?.amazon_current_price_usd || intl?.base_price_usd || 0).toFixed(2)} USD</span>
            </div>
            {intl?.amazon_list_price_usd && (
              <div className="flex justify-between">
                <span className="text-gray-400">Precio Lista Original:</span>
                <span className="line-through text-gray-500">${Number(intl?.amazon_list_price_usd).toFixed(2)} USD</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Envío USA (Amazon):</span>
              <span>${Number(intl?.usa_domestic_shipping_usd || 0).toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between border-t border-gray-700 pt-2 font-medium">
              <span className="text-gray-300">Costo Base USA:</span>
              <span>${cost.toFixed(2)} USD</span>
            </div>
          </div>
        </div>

        {/* Fees */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Comisiones
          </h3>
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Collectibles Fee (Zinc):</span>
              <span className="text-yellow-400 font-medium">${Number(intl?.collectibles_fee_usd || 0).toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pasarela (Prex/Dlocal):</span>
              <span className="text-orange-400 font-medium">${Number(intl?.prex_fee_usd || 0).toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between border-t border-gray-700 pt-2 font-bold text-white text-base">
              <span>Precio Final Cobrado:</span>
              <span>${finalPrice.toFixed(2)} USD</span>
            </div>
          </div>
        </div>

        {/* Sync Info */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Estado de Sincronización
          </h3>
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Auto Sync:</span>
              <span className={intl?.sync_enabled ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                {intl?.sync_enabled ? 'ACTIVADO' : 'DESACTIVADO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Última Sincronización:</span>
              <span>{intl?.last_synced_at ? new Date(intl.last_synced_at).toLocaleString() : 'Nunca'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Último Live Check:</span>
              <span>{intl?.price_last_checked_at ? new Date(intl.price_last_checked_at).toLocaleString() : 'Nunca'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status Amazon:</span>
              <span className="font-mono bg-gray-900 px-1.5 py-0.5 rounded text-gray-300">
                {intl?.amazon_delivery_type || 'unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Peso Estimado:</span>
              <span>{intl?.weight_lb || '?'} lb</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">ASIN:</span>
              <span className="font-mono text-gray-300">{intl?.external_product_id}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 pb-12 text-center border-t border-gray-800">
          <a 
            href={intl?.product_url_external || `https://www.amazon.com/dp/${intl?.external_product_id}`}
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Ver en Amazon <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
