import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, RefreshCw, DollarSign, ShieldAlert, Sparkles, Activity, Globe, Check, AlertTriangle } from 'lucide-react';
import { fetchInternationalSettings } from '../../hooks/useInternationalSettings';
import { calculateInternationalPricing } from '../../lib/internationalPricing';

export default function AdminInternationalSync() {
  const [settings, setSettings] = useState<any>(null);
  const [capacitySummary, setCapacitySummary] = useState<any>(null);
  const [waitlistCount, setWaitlistCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('international_sync_settings').select('*').eq('id', 1).single();
      if (error) {
        setError(error.message);
      } else {
        setSettings({
          ...data,
          international_public_enabled: !!data.international_public_enabled,
          international_purchases_enabled: data.international_purchases_enabled ?? true,
          international_capacity_enabled: data.international_capacity_enabled ?? true,
          international_operating_limit_usd: Number(data.international_operating_limit_usd || 500),
          international_safety_reserve_usd: Number(data.international_safety_reserve_usd || 50),
        });
      }

      // Fetch capacity summary RPC
      const { data: capData, error: capErr } = await supabase.rpc('get_international_capacity_summary');
      if (!capErr && capData) {
        setCapacitySummary(capData);
      }

      // Fetch pending waitlist count
      const { count } = await supabase
        .from('international_capacity_waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setWaitlistCount(count || 0);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    
    // Client-side strict financial validation
    const targetMargin = Number(settings.target_margin_percent);
    const minProfit = Number(settings.min_absolute_profit_usd ?? settings.min_profit_usd ?? 3.99);
    const zincFee = Number(settings.zinc_fee_usd ?? 1.00);
    const prexFeePct = Number(settings.financial_fee_percent ?? 2.50);
    const prexFeeFixed = Number(settings.financial_fee_fixed_usd ?? 0.50);
    const prexFeeTax = Number(settings.financial_fee_tax_rate ?? 0.22);
    const floridaTax = Number(settings.florida_sales_tax_percent ?? 0.0);
    const fixedMarkup = Number(settings.fixed_markup_usd ?? 6.0);
    const operatingLimit = Number(settings.international_operating_limit_usd ?? 500);
    const safetyReserve = Number(settings.international_safety_reserve_usd ?? 50);

    if (isNaN(targetMargin) || targetMargin < 0 || targetMargin >= 100) {
      setError('El margen objetivo debe estar entre 0% y 99,99%.');
      setSaving(false);
      return;
    }

    if (isNaN(minProfit) || minProfit < 0) {
      setError('La ganancia mínima no puede ser negativa.');
      setSaving(false);
      return;
    }

    if (isNaN(zincFee) || zincFee < 0) {
      setError('El costo de Zinc no puede ser negativo.');
      setSaving(false);
      return;
    }

    if (isNaN(prexFeePct) || prexFeePct < 0 || prexFeePct >= 100) {
      setError('El porcentaje financiero debe estar entre 0% y 99,99%.');
      setSaving(false);
      return;
    }

    if (isNaN(prexFeeFixed) || prexFeeFixed < 0) {
      setError('El fee fijo financiero no puede ser negativo.');
      setSaving(false);
      return;
    }

    if (isNaN(prexFeeTax) || prexFeeTax < 0 || prexFeeTax >= 1) {
      setError('La tasa de IVA financiero debe ser un valor decimal entre 0 y 0.99 (ej. 0.22 para 22%).');
      setSaving(false);
      return;
    }

    if (isNaN(floridaTax) || floridaTax < 0 || floridaTax >= 100) {
      setError('El porcentaje de sales tax estimado debe estar entre 0% y 99,99%.');
      setSaving(false);
      return;
    }

    if (isNaN(fixedMarkup) || fixedMarkup < 0) {
      setError('El markup comercial base no puede ser negativo.');
      setSaving(false);
      return;
    }

    if (isNaN(operatingLimit) || operatingLimit <= 0) {
      setError('El límite de capital operativo debe ser un monto estrictamente positivo.');
      setSaving(false);
      return;
    }

    if (isNaN(safetyReserve) || safetyReserve < 0) {
      setError('La reserva de seguridad no puede ser negativa.');
      setSaving(false);
      return;
    }

    try {
      const updatePayload = {
        auto_sync_enabled: settings.auto_sync_enabled,
        sync_interval_minutes: settings.sync_interval_minutes,
        safety_margin_percent: settings.safety_margin_percent,
        auto_purchase_enabled: settings.auto_purchase_enabled,
        block_payment_on_price_change: settings.block_payment_on_price_change,
        allow_price_update_before_payment: settings.allow_price_update_before_payment,
        only_prime: settings.only_prime,
        include_non_prime: settings.include_non_prime,
        pricing_mode: settings.pricing_mode,
        fixed_markup_usd: Number(settings.fixed_markup_usd || 6),
        percentage_markup: settings.percentage_markup,
        tiered_markup_rules: settings.tiered_markup_rules,
        target_margin_percent: targetMargin,
        min_profit_usd: minProfit,
        min_absolute_profit_usd: minProfit,
        never_sell_at_loss: true,
        max_price_variation_percent: settings.max_price_variation_percent,
        price_variation_action: settings.price_variation_action,
        urubox_price_per_kg: settings.urubox_price_per_kg,
        urubox_handling_fee: settings.urubox_handling_fee,
        zinc_fee_usd: Number(settings.zinc_fee_usd || 1),
        financial_fee_percent: Number(settings.financial_fee_percent ?? 2.5),
        financial_fee_fixed_usd: Number(settings.financial_fee_fixed_usd ?? 0.5),
        financial_fee_tax_rate: Number(settings.financial_fee_tax_rate ?? 0.22),
        florida_sales_tax_percent: Number(settings.florida_sales_tax_percent ?? 0),
        international_operating_limit_usd: operatingLimit,
        international_safety_reserve_usd: safetyReserve,
        international_capacity_enabled: !!settings.international_capacity_enabled,
        international_purchases_enabled: !!settings.international_purchases_enabled,
        international_public_enabled: !!settings.international_public_enabled,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('international_sync_settings')
        .update(updatePayload)
        .eq('id', 1);

      if (error) throw error;
      setSuccess('Configuración actualizada correctamente. Los cambios aplican de forma inmediata.');
      await fetchSettings();
      await fetchInternationalSettings(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Control de Compras Internacionales</h2>
          <p className="text-sm text-gray-500 mt-1">Configuración de Publicación, Fondo Operativo, Cupos y Precios.</p>
        </div>
        <button 
          onClick={fetchSettings} 
          title="Recargar configuración"
          className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200 text-sm font-medium">{error}</div>}
      {success && <div className="p-4 bg-green-50 text-green-800 rounded-lg border border-green-200 text-sm font-medium">{success}</div>}

      {/* ── CARD RESUMEN DE CAPITAL EN VIVO ── */}
      {capacitySummary && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl border border-slate-700 text-white shadow-lg space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary-400" />
              <h3 className="text-base font-bold tracking-wide uppercase">Estado del Fondo Operativo de Piloto</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                capacitySummary.status_label === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                capacitySummary.status_label === 'LOW' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                capacitySummary.status_label === 'FULL' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                'bg-slate-700 text-slate-300'
              }`}>
                {capacitySummary.status_label === 'AVAILABLE' && '🟢 Cupos Disponibles'}
                {capacitySummary.status_label === 'LOW' && '🟡 Alta Demanda (Pocos Cupos)'}
                {capacitySummary.status_label === 'FULL' && '🔴 Cupos Completos'}
                {capacitySummary.status_label === 'PAUSED' && '⏸ Pausado Manualmente'}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {waitlistCount} en lista de espera
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Límite Total</span>
              <span className="text-lg font-black text-white">${capacitySummary.operating_limit_usd.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Reserva Seg.</span>
              <span className="text-lg font-black text-amber-400">${capacitySummary.safety_reserve_usd.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Capacidad Neta</span>
              <span className="text-lg font-black text-white">${capacitySummary.usable_limit_usd.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">En Checkout (15m)</span>
              <span className="text-lg font-black text-sky-400">${capacitySummary.active_reserved_usd.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Comprometido / Gastado</span>
              <span className="text-lg font-black text-purple-400">${(capacitySummary.committed_usd + capacitySummary.spent_usd).toFixed(2)}</span>
            </div>
            <div className="p-3 bg-emerald-500/15 rounded-xl border border-emerald-500/30">
              <span className="text-[10px] text-emerald-300 uppercase font-bold block">Disponible Real</span>
              <span className="text-lg font-black text-emerald-400">${capacitySummary.available_capacity_usd.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 1: ESTADO DEL MÓDULO INTERNACIONAL (SWITCHES PRINCIPALES) ── */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-bold text-gray-900">Estado del Módulo Internacional</h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            Controles Principales
          </span>
        </div>

        {/* Advertencia Fuerte si Compras = ON y Control de Cupos = OFF */}
        {settings?.international_purchases_enabled && !settings?.international_capacity_enabled && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 font-medium leading-relaxed">
              <strong className="block font-bold text-amber-950 mb-0.5">⚠️ Advertencia de Riesgo Operativo</strong>
              Las compras internacionales están activas sin control de cupos. Esto puede superar el límite operativo de capital.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Switch 1: Publicación Pública */}
          <div className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
            settings?.international_public_enabled 
              ? 'bg-emerald-50/50 border-emerald-500/40 shadow-sm' 
              : 'bg-gray-50/60 border-gray-200'
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Publicación Pública</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.international_public_enabled || false}
                  onClick={() => setSettings({ ...settings, international_public_enabled: !settings?.international_public_enabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings?.international_public_enabled ? 'bg-emerald-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings?.international_public_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <h4 className="font-bold text-sm text-gray-900 mb-1">Publicar módulo internacional</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Hace visible la sección Internacional en la tienda y habilita la página pública <code className="text-[11px] font-mono bg-white px-1 py-0.5 rounded border border-gray-200">/intl</code>.
              </p>
            </div>
            <div className="mt-4 pt-2.5 border-t border-gray-200/60 flex items-center justify-between text-[11px] font-bold">
              <span className="text-gray-500">Estado:</span>
              <span className={settings?.international_public_enabled ? 'text-emerald-700' : 'text-gray-500'}>
                {settings?.international_public_enabled ? '🟢 PUBLICADO (Visible)' : '⚪ OCULTO (Default)'}
              </span>
            </div>
          </div>

          {/* Switch 2: Compras */}
          <div className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
            settings?.international_purchases_enabled 
              ? 'bg-blue-50/50 border-blue-500/40 shadow-sm' 
              : 'bg-gray-50/60 border-gray-200'
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Compras y Checkout</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.international_purchases_enabled ?? true}
                  onClick={() => setSettings({ ...settings, international_purchases_enabled: !(settings?.international_purchases_enabled ?? true) })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings?.international_purchases_enabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings?.international_purchases_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <h4 className="font-bold text-sm text-gray-900 mb-1">Habilitar compras internacionales</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Permite o bloquea nuevas compras internacionales en el checkout.
              </p>
            </div>
            <div className="mt-4 pt-2.5 border-t border-gray-200/60 flex items-center justify-between text-[11px] font-bold">
              <span className="text-gray-500">Estado:</span>
              <span className={settings?.international_purchases_enabled ? 'text-blue-700' : 'text-amber-700'}>
                {settings?.international_purchases_enabled ? '🟢 COMPRAS HABILITADAS' : '⏸ COMPRAS PAUSADAS'}
              </span>
            </div>
          </div>

          {/* Switch 3: Control de Cupos */}
          <div className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
            settings?.international_capacity_enabled 
              ? 'bg-purple-50/50 border-purple-500/40 shadow-sm' 
              : 'bg-amber-50/60 border-amber-300'
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Control de Cupos</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings?.international_capacity_enabled ?? true}
                  onClick={() => setSettings({ ...settings, international_capacity_enabled: !(settings?.international_capacity_enabled ?? true) })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings?.international_capacity_enabled ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings?.international_capacity_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <h4 className="font-bold text-sm text-gray-900 mb-1">Habilitar control de cupos</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Aplica el límite operativo de capital y reservas concurrentes de 15 minutos.
              </p>
            </div>
            <div className="mt-4 pt-2.5 border-t border-gray-200/60 flex items-center justify-between text-[11px] font-bold">
              <span className="text-gray-500">Estado:</span>
              <span className={settings?.international_capacity_enabled ? 'text-purple-700' : 'text-red-700'}>
                {settings?.international_capacity_enabled ? '🟢 CONTROL ACTIVO' : '⚠️ SIN CONTROL'}
              </span>
            </div>
          </div>

        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
        
        {/* ── FONDO DE CAPITAL Y RESERVAS ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Parámetros del Fondo Operativo (USD)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Límite Operativo Total (USD)</label>
              <input
                type="number"
                step="10"
                min="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.international_operating_limit_usd ?? 500}
                onChange={e => setSettings({...settings, international_operating_limit_usd: Number(e.target.value)})}
              />
              <p className="text-xs text-gray-500 mt-1">Fondo máximo para compras de prueba durante el piloto.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Reserva de Seguridad Intocable (USD)</label>
              <input
                type="number"
                step="5"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.international_safety_reserve_usd ?? 50}
                onChange={e => setSettings({...settings, international_safety_reserve_usd: Number(e.target.value)})}
              />
              <p className="text-xs text-gray-500 mt-1">Margen reservado para absorber fluctuaciones imprevistas.</p>
            </div>
          </div>
        </div>

        {/* ── REGLAS DE PRICING Y MARGEN ── */}
        <div className="pt-6 border-t border-gray-100 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary-600" />
            Protección de Rentabilidad y Margen Dinámico
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700">Ganancia objetivo (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.min_profit_usd ?? 3.99}
                onChange={e => setSettings({...settings, min_profit_usd: Number(e.target.value), min_absolute_profit_usd: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Ganancia neta mínima garantizada por compra.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Fee Comercial Mínimo (USD)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.fixed_markup_usd ?? 6.0}
                onChange={e => setSettings({...settings, fixed_markup_usd: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Recargo comercial base sobre Amazon.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Margen objetivo (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.target_margin_percent ?? 15.0}
                onChange={e => setSettings({...settings, target_margin_percent: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Porcentaje mínimo de ganancia sobre el precio final de venta.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Zinc API Fee (USD)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.zinc_fee_usd ?? 1.0}
                onChange={e => setSettings({...settings, zinc_fee_usd: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Costo fijo por orden de compra automatizada.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-blue-700 flex-shrink-0" />
              Regla Canónica de Rentabilidad:
            </p>
            <p className="text-[11px] text-blue-800 mt-0.5">
              Profit Protection utiliza siempre la condición más exigente entre el fee comercial base, la ganancia mínima absoluta y el margen mínimo configurado.
            </p>
          </div>

          {/* ── PARÁMETROS FINANCIEROS (PREX / PROCESAMIENTO) ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-gray-700">Comisión Tarjeta Prex (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.financial_fee_percent ?? 2.5}
                onChange={e => setSettings({...settings, financial_fee_percent: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Porcentaje por transacción internacional en Prex.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Cargo Fijo Prex (USD)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={settings?.financial_fee_fixed_usd ?? 0.50}
                onChange={e => setSettings({...settings, financial_fee_fixed_usd: Number(e.target.value)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Cargo fijo por operación de tarjeta en el exterior.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">IVA Financiero Prex (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                value={Math.round((settings?.financial_fee_tax_rate ?? 0.22) * 100)}
                onChange={e => setSettings({...settings, financial_fee_tax_rate: Number(e.target.value) / 100})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                IVA uruguayo aplicado sobre cargos financieros (22%).
              </p>
            </div>
          </div>

          {/* ── EJEMPLOS DINÁMICOS DE PRICING EN VIVO ── */}
          {(() => {
            const sim1 = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, settings || {});
            const sim2 = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, { ...(settings || {}), zinc_fee_usd: 4.00 });

            return (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  Simulación de Precios Dinámica con Parámetros Actuales
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <div className="font-bold text-slate-900 border-b pb-1">Caso 1: Amazon $34.99 (Zinc = ${settings?.zinc_fee_usd || 1})</div>
                    <div className="text-slate-600">Costo real: <span className="font-bold text-slate-900">${sim1.realCost.toFixed(2)} USD</span></div>
                    <div className="text-slate-600">1. Comercial Base: ${sim1.commercialPrice.toFixed(2)} USD</div>
                    <div className="text-slate-600">2. Ganancia Mínima ($3.99): ${sim1.absoluteProtectedPrice.toFixed(2)} USD</div>
                    <div className="text-slate-600">3. Margen {sim1.targetMarginPercent}%: <span className="font-bold text-indigo-700">${sim1.marginProtectedPrice.toFixed(2)} USD</span></div>
                    <div className="text-slate-900 font-bold pt-1 border-t flex justify-between">
                      <span>Precio Final: ${sim1.finalPrice.toFixed(2)} USD</span>
                      <span className={sim1.profitProtectionTriggered ? 'text-indigo-600 font-black' : 'text-emerald-600'}>
                        {sim1.pricingProtectionReason === 'target_margin' ? '🛡 Margen 15%' : sim1.pricingProtectionReason === 'absolute_profit' ? '🛡 Mínimo $3.99' : '✓ Base OK'}
                      </span>
                    </div>
                    <div className="text-emerald-700 text-[11px]">Ganancia real: ${sim1.estimatedProfit.toFixed(2)} USD ({sim1.netMarginPercentage.toFixed(1)}%)</div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <div className="font-bold text-slate-900 border-b pb-1">Caso 2: Amazon $34.99 (Zinc Sube a $4.00)</div>
                    <div className="text-slate-600">Costo real: <span className="font-bold text-slate-900">${sim2.realCost.toFixed(2)} USD</span></div>
                    <div className="text-slate-600">1. Comercial Base: ${sim2.commercialPrice.toFixed(2)} USD</div>
                    <div className="text-slate-600">2. Ganancia Mínima ($3.99): ${sim2.absoluteProtectedPrice.toFixed(2)} USD</div>
                    <div className="text-slate-600">3. Margen {sim2.targetMarginPercent}%: <span className="font-bold text-indigo-700">${sim2.marginProtectedPrice.toFixed(2)} USD</span></div>
                    <div className="text-slate-900 font-bold pt-1 border-t flex justify-between">
                      <span>Precio Final: ${sim2.finalPrice.toFixed(2)} USD</span>
                      <span className="text-indigo-600 font-black">
                        🛡 Margen 15% (+${(sim2.appliedFee - sim2.minimumCommercialFee).toFixed(2)})
                      </span>
                    </div>
                    <div className="text-emerald-700 text-[11px]">Ganancia real: ${sim2.estimatedProfit.toFixed(2)} USD ({sim2.netMarginPercentage.toFixed(1)}%)</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── AUTOMATIZACIÓN DE COMPRA Y SINCRONIZACIÓN ── */}
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Automatización de Compra en Origen</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100">
              <input
                type="checkbox"
                className="w-5 h-5 text-primary-600 rounded"
                checked={settings?.auto_purchase_enabled || false}
                onChange={e => setSettings({...settings, auto_purchase_enabled: e.target.checked})}
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">Compra Automática al Confirmar Pago</span>
                <span className="block text-xs text-gray-500">Envía la orden inmediatamente tras webhook de pago aprobado.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100">
              <input
                type="checkbox"
                className="w-5 h-5 text-primary-600 rounded"
                checked={settings?.only_prime || false}
                onChange={e => setSettings({...settings, only_prime: e.target.checked})}
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">Solo Productos Prime</span>
                <span className="block text-xs text-gray-500">Descarta ofertas que no tengan envío rápido Prime en EE.UU.</span>
              </div>
            </label>
          </div>
        </div>

        {/* ── COURIER ESTIMATION (URUBOX) ── */}
        <div className="pt-6 border-t border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Estimador de Courier Referencial (Urubox)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tarifa Urubox (USD por Kg)</label>
              <input
                type="number"
                step="0.1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                value={settings?.urubox_price_per_kg || 20.0}
                onChange={e => setSettings({...settings, urubox_price_per_kg: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Handling Fee Urubox (USD)</label>
              <input
                type="number"
                step="0.1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                value={settings?.urubox_handling_fee || 5.0}
                onChange={e => setSettings({...settings, urubox_handling_fee: Number(e.target.value)})}
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-100 flex justify-end">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex items-center px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 shadow-sm transition-all"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}
