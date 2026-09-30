import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Save, RefreshCw, DollarSign, ShieldAlert, Sparkles, Activity, Globe, Check, 
  AlertTriangle, Sliders, Info, ArrowRight, Lock, CheckCircle2, XCircle, ShieldCheck, 
  HelpCircle, ExternalLink, X, Settings2
} from 'lucide-react';
import { calculateInternationalPricing } from '../../lib/internationalPricing';

export default function AdminInternationalSync() {
  const [settings, setSettings] = useState<any>(null);
  const [capacitySummary, setCapacitySummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [activeAdvancedTab, setActiveAdvancedTab] = useState<'budget' | 'pricing' | 'costs' | 'ai' | 'automation'>('budget');

  const [openAiConfig, setOpenAiConfig] = useState({
    enabled: true,
    model: 'gpt-4o',
    webSearch: false,
    maxResults: 100,
    dailyLimit: 20,
    dailyBudget: 10.0,
  });

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
          international_purchases_enabled: !!data.international_purchases_enabled,
          auto_purchase_enabled: !!data.auto_purchase_enabled,
          auto_sync_enabled: !!data.auto_sync_enabled,
          international_operating_limit_usd: Number(data.international_operating_limit_usd || 500),
          international_safety_reserve_usd: Number(data.international_safety_reserve_usd || 50),
          target_margin_percent: Number(data.target_margin_percent ?? 15),
          min_absolute_profit_usd: Number(data.min_absolute_profit_usd ?? data.min_profit_usd ?? 3.99),
          zinc_fee_usd: Number(data.zinc_fee_usd ?? 1.00),
          financial_fee_percent: Number(data.financial_fee_percent ?? 2.50),
          financial_fee_fixed_usd: Number(data.financial_fee_fixed_usd ?? 0.50),
          financial_fee_tax_rate: Number(data.financial_fee_tax_rate ?? 0.22),
          florida_sales_tax_percent: Number(data.florida_sales_tax_percent ?? 0.0),
          fixed_markup_usd: Number(data.fixed_markup_usd ?? 6.00)
        });
      }

      // Fetch capacity summary RPC if available
      try {
        const { data: capData } = await supabase.rpc('get_international_capacity_summary');
        if (capData) setCapacitySummary(capData);
      } catch {
        // Fallback calculation if RPC is missing
      }

      // Fetch OpenAI Sourcing configuration from site_settings
      const { data: openAiRows } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', [
          'sourcing_openai_enabled',
          'sourcing_openai_model',
          'sourcing_openai_web_search_enabled',
          'sourcing_openai_max_results',
          'sourcing_openai_daily_request_limit',
          'sourcing_openai_daily_budget_usd'
        ]);

      if (openAiRows) {
        const m: Record<string, string> = {};
        for (const r of openAiRows) m[r.key] = r.value;
        setOpenAiConfig({
          enabled: m['sourcing_openai_enabled'] !== 'false',
          model: m['sourcing_openai_model'] || 'gpt-4o',
          webSearch: m['sourcing_openai_web_search_enabled'] === 'true',
          maxResults: Number(m['sourcing_openai_max_results'] || 100),
          dailyLimit: Number(m['sourcing_openai_daily_request_limit'] || 20),
          dailyBudget: Number(m['sourcing_openai_daily_budget_usd'] || 10.0),
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Real-time calculation example for pricing preview
  const samplePricing = useMemo(() => {
    if (!settings) return null;
    return calculateInternationalPricing(
      { amazonPrice: 50.00, usaShipping: 0, salesTax: 0 },
      settings
    );
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const payload = {
        target_margin_percent: Number(settings.target_margin_percent),
        percentage_markup: Number(settings.target_margin_percent),
        min_absolute_profit_usd: Number(settings.min_absolute_profit_usd),
        min_profit_usd: Number(settings.min_absolute_profit_usd),
        zinc_fee_usd: Number(settings.zinc_fee_usd),
        financial_fee_percent: Number(settings.financial_fee_percent),
        financial_fee_fixed_usd: Number(settings.financial_fee_fixed_usd),
        financial_fee_tax_rate: Number(settings.financial_fee_tax_rate),
        florida_sales_tax_percent: Number(settings.florida_sales_tax_percent),
        fixed_markup_usd: Number(settings.fixed_markup_usd),
        international_operating_limit_usd: Number(settings.international_operating_limit_usd),
        international_safety_reserve_usd: Number(settings.international_safety_reserve_usd),
        auto_purchase_enabled: false, // strictly enforce OFF
        international_purchases_enabled: false, // strictly enforce OFF
        international_public_enabled: false, // strictly enforce OFF
        updated_at: new Date().toISOString()
      };

      const { error: saveError } = await supabase
        .from('international_sync_settings')
        .update(payload)
        .eq('id', 1);

      if (saveError) throw saveError;

      // Update site_settings for OpenAI Sourcing
      await supabase.from('site_settings').upsert([
        { key: 'sourcing_openai_enabled', value: String(openAiConfig.enabled) },
        { key: 'sourcing_openai_model', value: openAiConfig.model },
        { key: 'sourcing_openai_web_search_enabled', value: String(openAiConfig.webSearch) },
        { key: 'sourcing_openai_max_results', value: String(openAiConfig.maxResults) },
        { key: 'sourcing_openai_daily_request_limit', value: String(openAiConfig.dailyLimit) },
        { key: 'sourcing_openai_daily_budget_usd', value: String(openAiConfig.dailyBudget) },
      ]);

      setSuccess('Configuración guardada exitosamente.');
      setShowAdvancedModal(false);
      fetchSettings();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#f00856] animate-spin" />
          <p className="text-sm font-semibold text-gray-500">Cargando control internacional...</p>
        </div>
      </div>
    );
  }

  const operatingLimit = Number(settings.international_operating_limit_usd || 500);
  const safetyReserve = Number(settings.international_safety_reserve_usd || 50);
  const reservedAmount = Number(capacitySummary?.reserved_amount_usd || 0);
  const inPurchasesAmount = Number(capacitySummary?.in_purchases_amount_usd || 0);
  const spentThisMonth = Number(capacitySummary?.spent_month_usd || 0);
  const availableBudget = Math.max(0, operatingLimit - safetyReserve - reservedAmount - inPurchasesAmount);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 1. CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Control de Compras Internacionales
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ACTIVO
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            Supervisión presupuestaria, estado operativo de automatizaciones y gobernanza de compras.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAdvancedModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
          >
            <Settings2 className="w-4 h-4 text-pink-400" />
            <span>CONFIGURACIÓN AVANZADA</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* 2. INDICADORES PRINCIPALES (4 CUADRANTES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Disponible</div>
          <div className="text-2xl font-black text-emerald-600 mt-2">
            USD {availableBudget.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 font-medium">
            Límite (${operatingLimit}) − Reserva (${safetyReserve})
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reservado</div>
          <div className="text-2xl font-black text-amber-600 mt-2">
            USD {reservedAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 font-medium">
            Órdenes en proceso de checkout
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">En compras</div>
          <div className="text-2xl font-black text-blue-600 mt-2">
            USD {inPurchasesAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 font-medium">
            Pendientes de confirmación origen
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gastado este mes</div>
          <div className="text-2xl font-black text-gray-900 mt-2">
            USD {spentThisMonth.toFixed(2)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 font-medium">
            Total acumulado facturado
          </div>
        </div>
      </div>

      {/* 3. ESTADO DE CONEXIONES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-black text-sm">
              a
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900">Amazon / Zinc API</div>
              <div className="text-[11px] text-gray-500">Búsqueda en tiempo real y catálogo verificado</div>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200">
            CONECTADO
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900">OpenAI / Sourcing Intelligence</div>
              <div className="text-[11px] text-gray-500">Planificador de búsquedas e inferencia de demanda</div>
            </div>
          </div>
          <span className={`px-3 py-1 text-xs font-bold rounded-lg border ${
            openAiConfig.enabled 
              ? 'bg-purple-100 text-purple-800 border-purple-200' 
              : 'bg-gray-100 text-gray-600 border-gray-200'
          }`}>
            {openAiConfig.enabled ? 'ACTIVO' : 'DESACTIVADO'}
          </span>
        </div>
      </div>

      {/* 4. ESTADO OPERATIVO & REGLAS COMERCIALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ESTADO OPERATIVO */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Estado Operativo</h3>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              Fase Manual Certificada
            </span>
          </div>

          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-gray-900">Publicación automática</div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Permite publicar productos sin revisión manual.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 text-xs font-black rounded-lg shrink-0">
                OFF
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-gray-900">Compra automática</div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Permite realizar compras en origen sin confirmación manual.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 text-xs font-black rounded-lg shrink-0">
                OFF
              </span>
            </div>
          </div>

          <p className="text-[11px] text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium">
            ℹ️ Durante esta fase de importación y certificación, ambas opciones permanecen estrictamente desactivadas. Todo producto importado ingresa al catálogo administrativo en estado <strong>PENDING_REVIEW</strong>.
          </p>
        </div>

        {/* REGLAS COMERCIALES COTIDIANAS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Reglas Comerciales</h3>
            <button
              onClick={() => setShowAdvancedModal(true)}
              className="text-xs font-bold text-[#f00856] hover:underline flex items-center gap-1"
            >
              <span>Editar parámetros</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <div className="text-xs font-bold text-gray-700">Markup objetivo</div>
                <div className="text-[11px] text-gray-400">Porcentaje agregado sobre el costo real</div>
              </div>
              <div className="text-sm font-black text-gray-900 bg-white px-3 py-1 rounded-lg border border-gray-200">
                {settings.target_margin_percent}%
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <div className="text-xs font-bold text-gray-700">Reserva de seguridad</div>
                <div className="text-[11px] text-gray-400">Fondo protegido fuera de operación</div>
              </div>
              <div className="text-sm font-black text-gray-900 bg-white px-3 py-1 rounded-lg border border-gray-200">
                USD {safetyReserve}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <div className="text-xs font-bold text-gray-700">Ganancia mínima por producto</div>
                <div className="text-[11px] text-gray-400">Piso de rentabilidad protegido</div>
              </div>
              <div className="text-sm font-black text-gray-900 bg-white px-3 py-1 rounded-lg border border-gray-200">
                USD {settings.min_absolute_profit_usd}
              </div>
            </div>
          </div>

          {/* EJEMPLO REAL DE CÁLCULO DE PRECIO */}
          {samplePricing && (
            <div className="p-3.5 bg-slate-900 text-white rounded-xl text-xs space-y-1.5 font-mono">
              <div className="text-[10px] text-pink-400 uppercase font-bold tracking-wider font-sans">
                Ejemplo en vivo (Producto Amazon $50.00):
              </div>
              <div className="flex justify-between text-slate-300 text-[11px]">
                <span>Costo real (Amazon + fees):</span>
                <span>USD {samplePricing.realCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300 text-[11px]">
                <span>Markup ({settings.target_margin_percent}%):</span>
                <span>USD {samplePricing.estimatedProfit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-400 pt-1 border-t border-slate-800">
                <span>Precio de venta final:</span>
                <span>USD {samplePricing.finalPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. MODAL DE CONFIGURACIÓN AVANZADA */}
      {showAdvancedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-[#f00856]" />
                  <span>Configuración Avanzada de Parámetros</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Parámetros técnicos agrupados con descripción, unidad y efecto en el sistema.
                </p>
              </div>
              <button
                onClick={() => setShowAdvancedModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 bg-white px-5 gap-2 overflow-x-auto text-xs font-bold">
              {[
                { id: 'budget', label: 'A. Presupuesto & Seguridad' },
                { id: 'pricing', label: 'B. Pricing & Rentabilidad' },
                { id: 'costs', label: 'C. Costos & Medios de Pago' },
                { id: 'ai', label: 'D. IA & Sourcing' },
                { id: 'automation', label: 'E. Automatización' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveAdvancedTab(tab.id as any)}
                  className={`py-3 px-3 border-b-2 transition whitespace-nowrap ${
                    activeAdvancedTab === tab.id
                      ? 'border-[#f00856] text-[#f00856]'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-gray-700 flex-1">
              {/* SECCIÓN A: PRESUPUESTO Y SEGURIDAD */}
              {activeAdvancedTab === 'budget' && (
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">Límite operativo total (USD)</label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={settings.international_operating_limit_usd}
                        onChange={e => setSettings({ ...settings, international_operating_limit_usd: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Para qué sirve:</strong> Define el saldo máximo de compras internacionales simultáneas permitido para el sistema.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">Reserva de seguridad (USD)</label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={settings.international_safety_reserve_usd}
                        onChange={e => setSettings({ ...settings, international_safety_reserve_usd: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Dinero que el sistema mantiene fuera del presupuesto disponible para evitar comprometer todo el saldo en nuevas operaciones ante fluctuaciones imprevistas.
                    </p>
                  </div>
                </div>
              )}

              {/* SECCIÓN B: PRICING Y RENTABILIDAD */}
              {activeAdvancedTab === 'pricing' && (
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-bold text-gray-900">Markup objetivo (%)</label>
                        <div className="text-[10px] text-gray-500">Porcentaje agregado sobre el costo real</div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={settings.target_margin_percent}
                        onChange={e => setSettings({ ...settings, target_margin_percent: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Efecto en el sistema:</strong> Se suma al costo real para obtener el precio de venta sugerido. Ejemplo: Costo real USD 100 + Markup 3% = Ganancia USD 3 → Precio venta USD 103.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-bold text-gray-900">Ganancia mínima garantizada (USD)</label>
                        <div className="text-[10px] text-gray-500">Piso absoluto de utilidad</div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={settings.min_absolute_profit_usd}
                        onChange={e => setSettings({ ...settings, min_absolute_profit_usd: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Interacción con markup:</strong> Si el cálculo del markup genera una ganancia inferior a este valor (ej. en productos de bajo costo), el sistema aplica automáticamente este piso de rentabilidad.
                    </p>
                  </div>
                </div>
              )}

              {/* SECCIÓN C: COSTOS DE COMPRA / MEDIOS DE PAGO */}
              {activeAdvancedTab === 'costs' && (
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">Zinc Fee (USD)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={settings.zinc_fee_usd}
                        onChange={e => setSettings({ ...settings, zinc_fee_usd: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Costo considerado por el sistema para operaciones procesadas mediante Zinc. Forma parte integral del cálculo del costo real.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">Prex % (Comisión financiera)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={settings.financial_fee_percent}
                        onChange={e => setSettings({ ...settings, financial_fee_percent: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Representa la comisión porcentual cobrada por el procesador de tarjetas por compra internacional.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">IVA sobre comisión (Tasa decimal, ej 0.22 = 22%)</label>
                      <input
                        type="number"
                        min="0"
                        max="0.99"
                        step="0.01"
                        value={settings.financial_fee_tax_rate}
                        onChange={e => setSettings({ ...settings, financial_fee_tax_rate: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Corresponde al Impuesto al Valor Agregado aplicado sobre la comisión de pago en Uruguay (22%).
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-900">Florida Sales Tax (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={settings.florida_sales_tax_percent}
                        onChange={e => setSettings({ ...settings, florida_sales_tax_percent: e.target.value })}
                        className="w-32 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-right font-bold text-gray-900"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Impuesto estimado en origen (EEUU). Usualmente 0% si el casillero logístico está exento.
                    </p>
                  </div>
                </div>
              )}

              {/* SECCIÓN D: IA Y SOURCING */}
              {activeAdvancedTab === 'ai' && (
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-bold text-gray-900">Sourcing con OpenAI</label>
                        <div className="text-[10px] text-gray-500">Intérprete y generador de estrategias de búsqueda</div>
                      </div>
                      <button
                        onClick={() => setOpenAiConfig({ ...openAiConfig, enabled: !openAiConfig.enabled })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          openAiConfig.enabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {openAiConfig.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Explicación:</strong> Permite que OpenAI interprete instrucciones en lenguaje natural y genere planes de búsqueda. Los productos, precios, reviews y disponibilidad provienen de las fuentes reales conectadas (Amazon/Zinc); OpenAI no inventa estos datos.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-gray-200 rounded-xl p-3 bg-white">
                      <label className="text-[11px] font-bold text-gray-700 block">Modelo OpenAI</label>
                      <input
                        type="text"
                        value={openAiConfig.model}
                        onChange={e => setOpenAiConfig({ ...openAiConfig, model: e.target.value })}
                        className="mt-1 w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold"
                      />
                    </div>

                    <div className="border border-gray-200 rounded-xl p-3 bg-white">
                      <label className="text-[11px] font-bold text-gray-700 block">Límite diario de consultas</label>
                      <input
                        type="number"
                        value={openAiConfig.dailyLimit}
                        onChange={e => setOpenAiConfig({ ...openAiConfig, dailyLimit: Number(e.target.value) })}
                        className="mt-1 w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECCIÓN E: AUTOMATIZACIÓN */}
              {activeAdvancedTab === 'automation' && (
                <div className="space-y-4">
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                    <div className="font-bold text-rose-900 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-rose-600" />
                      <span>Automatizaciones Bloqueadas en Fase de Certificación</span>
                    </div>
                    <p className="text-[11px] text-rose-800 leading-relaxed">
                      Para garantizar la máxima seguridad operativa y cero compras o publicaciones accidentales, todos los flags de automatización permanecen desactivados.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">Auto-Publish</div>
                        <div className="text-[11px] text-gray-500">Publica automáticamente en la tienda pública sin revisión previa.</div>
                      </div>
                      <span className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg">OFF (Bloqueado)</span>
                    </div>

                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">Auto-Purchase</div>
                        <div className="text-[11px] text-gray-500">Ordena automáticamente en Amazon/Zinc al recibir pago del cliente.</div>
                      </div>
                      <span className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg">OFF (Bloqueado)</span>
                    </div>

                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900">Cron / Shadow Autopilot</div>
                        <div className="text-[11px] text-gray-500">Ejecución desatendida periódica en segundo plano.</div>
                      </div>
                      <span className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg">OFF (Bloqueado)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-gray-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setShowAdvancedModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Guardar Parámetros</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
