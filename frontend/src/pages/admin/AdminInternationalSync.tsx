import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminInternationalSync() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    const { data, error } = await supabase.from('international_sync_settings').select('*').eq('id', 1).single();
    if (error) {
      setError(error.message);
    } else {
      setSettings(data);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const { error } = await supabase.from('international_sync_settings').update({
        auto_sync_enabled: settings.auto_sync_enabled,
        sync_interval_minutes: settings.sync_interval_minutes,
        safety_margin_percent: settings.safety_margin_percent,
        auto_purchase_enabled: settings.auto_purchase_enabled,
        block_payment_on_price_change: settings.block_payment_on_price_change,
        allow_price_update_before_payment: settings.allow_price_update_before_payment,
        only_prime: settings.only_prime,
        include_non_prime: settings.include_non_prime,
        pricing_mode: settings.pricing_mode,
        fixed_markup_usd: settings.fixed_markup_usd,
        percentage_markup: settings.percentage_markup,
        tiered_markup_rules: settings.tiered_markup_rules,
        target_margin_percent: settings.target_margin_percent,
        min_profit_usd: settings.min_profit_usd,
        min_absolute_profit_usd: settings.min_absolute_profit_usd,
        never_sell_at_loss: settings.never_sell_at_loss,
        max_price_variation_percent: settings.max_price_variation_percent,
        price_variation_action: settings.price_variation_action,
        urubox_price_per_kg: settings.urubox_price_per_kg,
        urubox_handling_fee: settings.urubox_handling_fee,
        zinc_fee_usd: settings.zinc_fee_usd
      }).eq('id', 1);

      if (error) throw error;
      setSuccess('Configuración guardada correctamente.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sincronización Amazon / Zinc</h2>
          <p className="text-sm text-gray-500 mt-1">Configura las reglas para la sincronización automática de precios y disponibilidad.</p>
        </div>
        <button onClick={fetchSettings} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm">{error}</div>}
      {success && <div className="p-4 bg-green-50 text-green-800 rounded-lg border border-green-200 text-sm">{success}</div>}

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b pb-2">Configuración General</h3>
            
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100">
              <input type="checkbox" className="w-5 h-5 text-primary-600 rounded" checked={settings?.auto_sync_enabled || false} onChange={e => setSettings({...settings, auto_sync_enabled: e.target.checked})} />
              <div>
                <span className="block text-sm font-medium text-gray-900">Activar Sync Automático</span>
                <span className="block text-xs text-gray-500">Habilita o deshabilita la sincronización en segundo plano de todos los productos.</span>
              </div>
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700">Intervalo de Sync (minutos)</label>
              <input type="number" min="1" max="1440" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm" value={settings?.sync_interval_minutes || 5} onChange={e => setSettings({...settings, sync_interval_minutes: Number(e.target.value)})} />
              <p className="text-xs text-gray-500 mt-1">Frecuencia recomendada: 5 minutos. Valores muy bajos pueden generar costos altos de API.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Margen de Seguridad de Precio (%)</label>
              <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm" value={settings?.safety_margin_percent || 8} onChange={e => setSettings({...settings, safety_margin_percent: Number(e.target.value)})} />
              <p className="text-xs text-gray-500 mt-1">Margen máximo que puede subir el precio en origen antes de bloquear la compra.</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b pb-2">Comportamiento en Checkout</h3>

            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100">
              <input type="checkbox" className="w-5 h-5 text-primary-600 rounded" checked={settings?.block_payment_on_price_change || false} onChange={e => setSettings({...settings, block_payment_on_price_change: e.target.checked})} />
              <div>
                <span className="block text-sm font-medium text-gray-900">Bloquear pago si precio cambió</span>
                <span className="block text-xs text-gray-500">Si el precio en Amazon sube por encima del margen, se impide que el usuario pague.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 opacity-50 cursor-not-allowed">
              <input type="checkbox" disabled className="w-5 h-5 text-primary-600 rounded" checked={settings?.auto_purchase_enabled || false} onChange={e => setSettings({...settings, auto_purchase_enabled: e.target.checked})} />
              <div>
                <span className="block text-sm font-medium text-gray-900">Permitir compra automática con Zinc (Próximamente)</span>
                <span className="block text-xs text-gray-500">Ejecuta la compra real en Amazon de forma desatendida.</span>
              </div>
            </label>
          </div>
        </div>

        {/* PRICING SETTINGS */}
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Modo de Cálculo de Precios (Gestión Collectibles)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <label className={`flex flex-col cursor-pointer p-4 rounded-lg border ${settings?.pricing_mode === 'amazon_price_plus_fee' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <input type="radio" name="pricing_mode" value="amazon_price_plus_fee" className="w-4 h-4 text-primary-600" checked={settings?.pricing_mode === 'amazon_price_plus_fee'} onChange={e => setSettings({...settings, pricing_mode: e.target.value})} />
                <span className="font-medium text-gray-900 text-sm">Fee Fijo (USD)</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Se suma un monto fijo en dólares al costo del producto en Amazon.</p>
              {settings?.pricing_mode === 'amazon_price_plus_fee' && (
                <div className="mt-auto">
                  <label className="text-xs font-medium text-gray-700">Monto (USD)</label>
                  <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.fixed_markup_usd || 0} onChange={e => setSettings({...settings, fixed_markup_usd: Number(e.target.value)})} />
                </div>
              )}
            </label>

            <label className={`flex flex-col cursor-pointer p-4 rounded-lg border ${settings?.pricing_mode === 'fixed_markup' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <input type="radio" name="pricing_mode" value="fixed_markup" className="w-4 h-4 text-primary-600" checked={settings?.pricing_mode === 'fixed_markup'} onChange={e => setSettings({...settings, pricing_mode: e.target.value})} />
                <span className="font-medium text-gray-900 text-sm">Porcentaje Fijo (%)</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Se calcula un porcentaje del precio de Amazon como ganancia/gestión.</p>
              {settings?.pricing_mode === 'fixed_markup' && (
                <div className="mt-auto">
                  <label className="text-xs font-medium text-gray-700">Porcentaje (%)</label>
                  <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.percentage_markup || 0} onChange={e => setSettings({...settings, percentage_markup: Number(e.target.value)})} />
                </div>
              )}
            </label>

            <label className={`flex flex-col cursor-pointer p-4 rounded-lg border ${settings?.pricing_mode === 'tiered_markup' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <input type="radio" name="pricing_mode" value="tiered_markup" className="w-4 h-4 text-primary-600" checked={settings?.pricing_mode === 'tiered_markup'} onChange={e => setSettings({...settings, pricing_mode: e.target.value})} />
                <span className="font-medium text-gray-900 text-sm">Escalonado por tramos</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Define reglas según el rango de precio. (La edición avanzada del JSON se hace por BD por el momento).</p>
              {settings?.pricing_mode === 'tiered_markup' && (
                <div className="mt-auto bg-white p-2 rounded border border-gray-200">
                  <pre className="text-[10px] text-gray-600 overflow-x-auto">
                    {JSON.stringify(settings?.tiered_markup_rules, null, 2)}
                  </pre>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* PROFIT PROTECTION ENGINE */}
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Motor de Rentabilidad (Profit Protection Engine)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Margen Objetivo (%)</label>
                <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.target_margin_percent || 7.0} onChange={e => setSettings({...settings, target_margin_percent: Number(e.target.value)})} />
                <p className="text-xs text-gray-500 mt-1">Margen esperado para la fórmula oficial.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Ganancia Mínima (USD)</label>
                <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.min_profit_usd || 3.99} onChange={e => setSettings({...settings, min_profit_usd: Number(e.target.value)})} />
                <p className="text-xs text-gray-500 mt-1">Si el margen objetivo es menor a esto, se usa este valor.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Ganancia Mínima Absoluta (USD)</label>
                <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.min_absolute_profit_usd || 2.00} onChange={e => setSettings({...settings, min_absolute_profit_usd: Number(e.target.value)})} />
                <p className="text-xs text-gray-500 mt-1">Si la ganancia real cae por debajo de este valor, se dispara la protección.</p>
              </div>
              
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100">
                <input type="checkbox" className="w-5 h-5 text-primary-600 rounded" checked={settings?.never_sell_at_loss || false} onChange={e => setSettings({...settings, never_sell_at_loss: e.target.checked})} />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Nunca vender con pérdida</span>
                  <span className="block text-xs text-gray-500">Forza el recargo para mantener la ganancia mínima absoluta siempre.</span>
                </div>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Variación Máxima Permitida (%)</label>
                <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.max_price_variation_percent || 5.0} onChange={e => setSettings({...settings, max_price_variation_percent: Number(e.target.value)})} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Comportamiento al superar Variación</label>
                <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.price_variation_action || 'manual_review'} onChange={e => setSettings({...settings, price_variation_action: e.target.value})}>
                  <option value="manual_review">Pasar a Revisión Manual (Checkout bloqueado)</option>
                  <option value="recalculate">Recalcular Precio Automáticamente</option>
                  <option value="unpublish">Despublicar Producto Automáticamente</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Zinc Fee Estimado (USD)</label>
                <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.zinc_fee_usd || 1.00} onChange={e => setSettings({...settings, zinc_fee_usd: Number(e.target.value)})} />
              </div>
            </div>
          </div>
        </div>

        {/* URUBOX SETTINGS */}
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Integración Courier (Urubox)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tarifa Urubox (USD por Kg)</label>
              <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.urubox_price_per_kg || 20.0} onChange={e => setSettings({...settings, urubox_price_per_kg: Number(e.target.value)})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Handling Fee Urubox (USD)</label>
              <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" value={settings?.urubox_handling_fee || 5.0} onChange={e => setSettings({...settings, urubox_handling_fee: Number(e.target.value)})} />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 flex justify-end">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex items-center px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 shadow-sm"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
