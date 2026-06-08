import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Store, Box, AlertCircle, RefreshCw } from 'lucide-react';
import { useCurrency } from '../../contexts/CurrencyContext';

export default function AdminBuyBox() {
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatCurrencyPrice } = useCurrency();

  async function loadAnalytics() {
    setLoading(true);
    try {
      // Find all products that have vendor products associated
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          id, title,
          vendor_products (
            id,
            vendor:vendors (id, store_name, status, kyc_status)
          )
        `)
        .not('vendor_products', 'is', null);

      if (productsError) throw productsError;

      const analysisPromises = productsData
        .filter(p => p.vendor_products.length > 0)
        .map(async (product) => {
          // Check Buy Box per product via RPC
          const { data: buyBoxData } = await supabase.rpc('get_product_buybox', { p_product_id: product.id });
          
          return {
            product,
            competitors: product.vendor_products.length,
            buyBox: buyBoxData
          };
        });

      const results = await Promise.all(analysisPromises);
      setAnalytics(results);
    } catch (err) {
      console.error('Error loading Buy Box analytics', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Trophy className="w-8 h-8 text-[#f00856]" />
            Buy Box Analytics
          </h1>
          <p className="text-gray-500 mt-2">Monitoreo en tiempo real de la competencia entre vendors (V2).</p>
        </div>
        <button onClick={loadAnalytics} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <RefreshCw className="w-12 h-12 text-[#f00856] mx-auto animate-spin opacity-50" />
          <p className="mt-4 font-bold text-gray-500">Analizando algoritmos...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                <th className="p-4 font-bold">Producto</th>
                <th className="p-4 font-bold text-center">Competidores</th>
                <th className="p-4 font-bold">Variante (SKU)</th>
                <th className="p-4 font-bold">Ganador Actual</th>
                <th className="p-4 font-bold">Precio Ganador</th>
                <th className="p-4 font-bold">Score (Precio/Stock/Log)</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((row) => {
                const variants = Object.keys(row.buyBox || {});
                if (variants.length === 0) return null;

                return variants.map((variantId, idx) => {
                  const bb = row.buyBox[variantId];
                  const winner = bb?.winner;
                  if (!winner) return null;

                  return (
                    <tr key={`${row.product.id}-${variantId}`} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      {idx === 0 && (
                        <>
                          <td className="p-4 font-bold text-gray-900" rowSpan={variants.length}>
                            {row.product.title}
                          </td>
                          <td className="p-4 text-center font-bold" rowSpan={variants.length}>
                            {bb?.hide_vendors ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs">
                                <Box className="w-3 h-3" /> Bloqueados (Stock Propio)
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                                <Store className="w-4 h-4" />
                                {row.competitors}
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td className="p-4 text-gray-500 font-mono text-xs">
                        {variantId.substring(0, 8)}...
                      </td>
                      <td className="p-4">
                        {winner.is_collectibles ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-xs">
                            <Box className="w-3 h-3" /> Collectibles Uruguay
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 font-bold text-xs">
                            <Store className="w-3 h-3" /> {winner.vendor_name}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-black">
                        {formatCurrencyPrice(Number(winner.price || 0))}
                      </td>
                      <td className="p-4">
                        {winner.is_collectibles ? (
                          <span className="text-gray-400 text-xs italic">N/A (Owner)</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 w-24 overflow-hidden">
                              <div 
                                className="bg-[#f00856] h-full" 
                                style={{ width: `${Math.min(100, winner.final_score)}%` }} 
                              />
                            </div>
                            <span className="text-xs font-bold w-12 text-right">
                              {Number(winner.final_score).toFixed(1)}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
              {analytics.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No hay competencia de Buy Box activa actualmente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
