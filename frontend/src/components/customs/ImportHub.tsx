import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, Package, Globe, Copy, Check, AlertTriangle, 
  ArrowRight, Sparkles, Scale, Truck, DollarSign, ExternalLink,
  ChevronRight, RefreshCw, Info, Save, HelpCircle, ShieldAlert
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CustomsRuleEngine, DEFAULT_UY_2026_RULES } from '../../lib/customs/CustomsRuleEngine';
import { KNOWN_COURIERS, CourierPricingEngine } from '../../lib/customs/CourierPricingEngine';
import { ImportCostEngine } from '../../lib/customs/ImportCostEngine';

interface ImportHubProps {
  onSaved?: () => void;
}

export const ImportHub: React.FC<ImportHubProps> = ({ onSaved }) => {
  const { user, profile } = useAuth();

  // ═══════════════════════════════════════════════════════════
  // ESTADO DE CASILLA Y COURIER
  // ═══════════════════════════════════════════════════════════
  const [selectedCourierCode, setSelectedCourierCode] = useState<string>('urubox');
  const [suiteNumber, setSuiteNumber] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  
  // Datos para cuando elige "Otro Courier"
  const [customCourierName, setCustomCourierName] = useState<string>('');
  const [customAddressLine1, setCustomAddressLine1] = useState<string>('');
  const [customAddressLine2, setCustomAddressLine2] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('Miami');
  const [customState, setCustomState] = useState<string>('FL');
  const [customPostalCode, setCustomPostalCode] = useState<string>('33166');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [customRatePerKg, setCustomRatePerKg] = useState<number>(18.00);

  // ═══════════════════════════════════════════════════════════
  // ESTADO DE FRANQUICIAS (MANUAL)
  // ═══════════════════════════════════════════════════════════
  const [shipmentsUsed, setShipmentsUsed] = useState<number>(1);
  const [amountUsedUsd, setAmountUsedUsd] = useState<number>(180);

  // ═══════════════════════════════════════════════════════════
  // PARÁMETROS DEL SIMULADOR
  // ═══════════════════════════════════════════════════════════
  const [regimeMode, setRegimeMode] = useState<'franchise' | 'simplified'>('simplified');
  const [productPriceUsd, setProductPriceUsd] = useState<number>(150);
  const [usShippingUsd, setUsShippingUsd] = useState<number>(10);
  const [weightKg, setWeightKg] = useState<number>(1.8);

  // Estados UI
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // ═══════════════════════════════════════════════════════════
  // CARGA DE DATOS DE USUARIO
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      if (profile) {
        setRecipientName(`${profile.first_name || ''} ${profile.last_name || ''}`.trim());
      }

      if (!user) {
        const storedCustoms = localStorage.getItem('guest_customs_hub_2026');
        if (storedCustoms) {
          try {
            const parsed = JSON.parse(storedCustoms);
            if (parsed.usedShipments !== undefined) setShipmentsUsed(parsed.usedShipments);
            if (parsed.usedAmountUsd !== undefined) setAmountUsedUsd(parsed.usedAmountUsd);
            if (parsed.preferredCourier) setSelectedCourierCode(parsed.preferredCourier);
            if (parsed.suiteNumber) setSuiteNumber(parsed.suiteNumber);
            if (parsed.customCourier) {
              setCustomCourierName(parsed.customCourier.name || '');
              setCustomAddressLine1(parsed.customCourier.address_line_1 || '');
              setCustomAddressLine2(parsed.customCourier.address_line_2 || '');
              setCustomCity(parsed.customCourier.city || 'Miami');
              setCustomState(parsed.customCourier.state || 'FL');
              setCustomPostalCode(parsed.customCourier.postal_code || '33166');
              setCustomPhone(parsed.customCourier.phone || '');
              setCustomRatePerKg(parsed.customCourier.rate || 18);
            }
          } catch (e) {
            console.error(e);
          }
        }
        setLoading(false);
        return;
      }

      try {
        const { data: customsData } = await supabase
          .from('user_customs_usage')
          .select('*')
          .eq('user_id', user.id)
          .eq('year', 2026)
          .maybeSingle();

        if (customsData) {
          setShipmentsUsed(customsData.used_shipments ?? 0);
          setAmountUsedUsd(Number(customsData.used_amount_usd) || 0);
          if (customsData.preferred_courier_code) {
            setSelectedCourierCode(customsData.preferred_courier_code);
          }
        }

        const { data: addressData } = await supabase
          .from('customer_international_addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (addressData) {
          if (addressData.customer_code) setSuiteNumber(addressData.customer_code);
          if (addressData.recipient_name) setRecipientName(addressData.recipient_name);
          
          const courierNameLower = (addressData.courier_name || '').toLowerCase();
          const matchCode = Object.keys(KNOWN_COURIERS).find(k => courierNameLower.includes(k));
          if (matchCode) {
            setSelectedCourierCode(matchCode);
          } else {
            setSelectedCourierCode('custom');
            setCustomCourierName(addressData.courier_name || '');
            setCustomAddressLine1(addressData.address_line_1 || '');
            setCustomAddressLine2(addressData.address_line_2 || '');
            setCustomCity(addressData.city || 'Miami');
            setCustomState(addressData.state || 'FL');
            setCustomPostalCode(addressData.postal_code || '33166');
            setCustomPhone(addressData.phone || '');
          }
        }
      } catch (err) {
        console.error('Error cargando preferencias de importación:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, profile]);

  // ═══════════════════════════════════════════════════════════
  // GUARDAR PREFERENCIAS
  // ═══════════════════════════════════════════════════════════
  const handleSavePreferences = async () => {
    setSaving(true);
    setSavedSuccess(false);

    const isCustom = selectedCourierCode === 'custom';
    const activeMeta = !isCustom ? KNOWN_COURIERS[selectedCourierCode] : null;
    const finalCourierName = isCustom ? (customCourierName || 'Otro Courier') : (activeMeta?.name || 'Courier');
    const finalAddress1 = isCustom ? customAddressLine1 : (activeMeta?.defaultAddressLine1 || '');
    const finalAddress2 = isCustom ? customAddressLine2 : (activeMeta?.defaultAddressLine2 || (suiteNumber ? `Suite ${suiteNumber}` : ''));
    const finalCity = isCustom ? customCity : (activeMeta?.city || 'Miami');
    const finalState = isCustom ? customState : (activeMeta?.state || 'FL');
    const finalZip = isCustom ? customPostalCode : (activeMeta?.postalCode || '33182');
    const finalPhone = isCustom ? customPhone : (activeMeta?.phone || '');

    if (!user) {
      localStorage.setItem('guest_customs_hub_2026', JSON.stringify({
        usedShipments: shipmentsUsed,
        usedAmountUsd: amountUsedUsd,
        preferredCourier: selectedCourierCode,
        suiteNumber,
        customCourier: isCustom ? {
          name: customCourierName,
          address_line_1: customAddressLine1,
          address_line_2: customAddressLine2,
          city: customCity,
          state: customState,
          postal_code: customPostalCode,
          phone: customPhone,
          rate: customRatePerKg
        } : null
      }));
      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      if (onSaved) onSaved();
      return;
    }

    try {
      await supabase
        .from('user_customs_usage')
        .upsert({
          user_id: user.id,
          year: 2026,
          used_shipments: shipmentsUsed,
          used_amount_usd: amountUsedUsd,
          preferred_courier_code: selectedCourierCode,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,year' });

      const { data: existingAddr } = await supabase
        .from('customer_international_addresses')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      const addrPayload = {
        user_id: user.id,
        label: `Casilla ${finalCourierName}`,
        courier_name: finalCourierName,
        recipient_name: recipientName || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Titular',
        customer_code: suiteNumber || null,
        address_line_1: finalAddress1,
        address_line_2: finalAddress2,
        city: finalCity,
        state: finalState,
        postal_code: finalZip,
        country: 'United States',
        phone: finalPhone || null,
        is_default: true
      };

      if (existingAddr?.id) {
        await supabase
          .from('customer_international_addresses')
          .update(addrPayload)
          .eq('id', existingAddr.id);
      } else {
        await supabase
          .from('customer_international_addresses')
          .insert(addrPayload);
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Error al guardar preferencias:', err);
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // MOTOR DE CÁLCULO EN VIVO
  // ═══════════════════════════════════════════════════════════
  const isCustomCourier = selectedCourierCode === 'custom';
  const activeCourierMeta = !isCustomCourier ? KNOWN_COURIERS[selectedCourierCode] : null;

  const calculationEstimate = useMemo(() => {
    return ImportCostEngine.calculateLandedCost({
      productPriceUsd,
      usDomesticShippingUsd: usShippingUsd,
      weightKg,
      courierCode: isCustomCourier ? 'custom' : selectedCourierCode,
      usage: {
        usedShipments: shipmentsUsed,
        usedAmountUsd: amountUsedUsd
      },
      forceSimplifiedRegime: regimeMode === 'simplified',
      exchangeRateUsdToUyu: 42.50
    });
  }, [productPriceUsd, usShippingUsd, weightKg, selectedCourierCode, isCustomCourier, shipmentsUsed, amountUsedUsd, regimeMode]);

  const displayAddress = useMemo(() => {
    const courierName = isCustomCourier ? (customCourierName || 'Otro Courier') : (activeCourierMeta?.name || 'Urubox');
    const addr1 = isCustomCourier ? customAddressLine1 : (activeCourierMeta?.defaultAddressLine1 || '');
    const addr2 = isCustomCourier 
      ? customAddressLine2 
      : (suiteNumber ? `Suite ${suiteNumber}` : (activeCourierMeta?.defaultAddressLine2 || ''));
    const city = isCustomCourier ? customCity : (activeCourierMeta?.city || 'Doral');
    const state = isCustomCourier ? customState : (activeCourierMeta?.state || 'FL');
    const zip = isCustomCourier ? customPostalCode : (activeCourierMeta?.postalCode || '33172');
    const phone = isCustomCourier ? customPhone : (activeCourierMeta?.phone || '');

    return {
      courierName,
      recipient: recipientName || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Titular',
      suite: suiteNumber || 'Sin Suite Asignada',
      addressLine1: addr1,
      addressLine2: addr2,
      cityStateZip: `${city}, ${state} ${zip}`,
      phone,
      fullCopyText: `Destinatario: ${recipientName || 'Titular'}${suiteNumber ? ` (#${suiteNumber})` : ''}\nDirección: ${addr1}${addr2 ? `, ${addr2}` : ''}\nCiudad/Estado: ${city}, ${state}\nZIP: ${zip}\nTeléfono: ${phone}\nCourier: ${courierName}`
    };
  }, [isCustomCourier, customCourierName, activeCourierMeta, customAddressLine1, customAddressLine2, suiteNumber, customCity, customState, customPostalCode, customPhone, recipientName, profile]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(displayAddress.fullCopyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isOverweight = weightKg >= 20;

  return (
    <div className="space-y-6">
      {/* ─── Encabezado Principal del HUB ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-sky-950/40 via-zinc-900 to-zinc-900/90 border border-sky-500/20 rounded-3xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Importador HUB</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30">
                Uruguay 2026
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Centro de control aduanero, gestión de casillas en Miami y simulador de costos en vivo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase font-bold text-slate-400">Cupo Franquicias</div>
            <div className="text-sm font-black text-emerald-400">
              {Math.max(0, 3 - shipmentsUsed)} de 3 disponibles
            </div>
          </div>
        </div>
      </div>

      {/* ─── LAYOUT SPLIT: Panel Lateral (Izquierda) + Tablero en Vivo (Derecha) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ══════════════════════════════════════════════════════
            PANEL LATERAL (SIDEBAR DE CONTROLES - lg:col-span-5)
           ══════════════════════════════════════════════════════ */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* SECCIÓN 1: MI CASILLA EN MIAMI */}
          <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-400" /> 1. Mi Casilla en Miami
              </h3>
              <span className="text-[10px] text-slate-400">Configuración</span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                Courier de Preferencia
              </label>
              <select
                value={selectedCourierCode}
                onChange={(e) => setSelectedCourierCode(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-400 transition"
              >
                {Object.values(KNOWN_COURIERS).map((c) => (
                  <option key={c.code} value={c.code} className="bg-zinc-900">
                    {c.name} ({c.deliveryDays})
                  </option>
                ))}
                <option value="custom" className="bg-zinc-900 font-bold text-sky-300">
                  ✏️ Otro Courier (Carga manual...)
                </option>
              </select>
            </div>

            {/* Si elige "Otro Courier", despliega campos manuales */}
            {isCustomCourier ? (
              <div className="space-y-3 p-3.5 bg-black/30 rounded-2xl border border-sky-500/20 text-xs">
                <div className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" /> Ingresa los datos de tu courier
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nombre de la Empresa</label>
                  <input
                    type="text"
                    value={customCourierName}
                    onChange={(e) => setCustomCourierName(e.target.value)}
                    placeholder="Ej. Miami Box UY"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dirección USA (Línea 1)</label>
                  <input
                    type="text"
                    value={customAddressLine1}
                    onChange={(e) => setCustomAddressLine1(e.target.value)}
                    placeholder="Ej. 7900 NW 60th St"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ciudad / Estado</label>
                    <input
                      type="text"
                      value={`${customCity}, ${customState}`}
                      onChange={(e) => {
                        const parts = e.target.value.split(',');
                        setCustomCity(parts[0]?.trim() || 'Miami');
                        if (parts[1]) setCustomState(parts[1]?.trim());
                      }}
                      placeholder="Miami, FL"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">ZIP Code</label>
                    <input
                      type="text"
                      value={customPostalCode}
                      onChange={(e) => setCustomPostalCode(e.target.value)}
                      placeholder="33166"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tarifa Aprox. por kg (USD)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={customRatePerKg}
                    onChange={(e) => setCustomRatePerKg(Number(e.target.value) || 18)}
                    placeholder="18.00"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-slate-200 font-bold block">{activeCourierMeta?.name}</span>
                <span>{activeCourierMeta?.defaultAddressLine1}, {activeCourierMeta?.city}, {activeCourierMeta?.state} {activeCourierMeta?.postalCode}</span>
              </div>
            )}

            {/* Número de Suite / Casilla */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                Tu Código de Suite / Casilla
              </label>
              <input
                type="text"
                value={suiteNumber}
                onChange={(e) => setSuiteNumber(e.target.value)}
                placeholder="Ej. UY-84920 o BOX-1234"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-400 transition"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Este número se adjuntará a tu dirección de entrega en compras internacionales.
              </span>
            </div>
          </div>

          {/* SECCIÓN 2: MIS FRANQUICIAS (CONTROL MANUAL 2026) */}
          <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> 2. Mis Franquicias (Año 2026)
              </h3>
              <span className="text-[10px] text-emerald-400/80 font-bold">Control Manual</span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-2">
                Franquicias utilizadas este año (de 3 anuales):
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((num) => {
                  const isSelected = shipmentsUsed === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setShipmentsUsed(num)}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20 font-black'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {num === 3 ? '3 Agotadas' : `${num} ${num === 1 ? 'Usada' : 'Usadas'}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                Monto acumulado en facturas este año (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={amountUsedUsd}
                  onChange={(e) => setAmountUsedUsd(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Total sumado de tus compras bajo franquicia en el año calendario.
              </span>
            </div>
          </div>

          {/* SECCIÓN 3: SIMULADOR DE COMPRA */}
          <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" /> 3. Simulador de Compra
              </h3>
              <span className="text-[10px] text-amber-400 font-bold">Simulación en Vivo</span>
            </div>

            {/* Toggle de Régimen */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                Régimen a Aplicar:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRegimeMode('franchise')}
                  className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                    regimeMode === 'franchise'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1">
                    🟢 Franquicia (0%)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Consume 1 de tus 3 cupos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRegimeMode('simplified')}
                  className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                    regimeMode === 'simplified'
                      ? 'bg-sky-500/15 border-sky-500/50 text-sky-300 shadow-sm shadow-sky-500/10'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className="font-bold text-xs flex items-center gap-1">
                    🛡️ Régimen +60%
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold mt-0.5">¡NO consume franquicias!</span>
                </button>
              </div>
            </div>

            {/* Inputs del producto y envío */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Precio Producto (FOB USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={productPriceUsd}
                    onChange={(e) => setProductPriceUsd(Number(e.target.value) || 0)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Envío dentro de USA (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={usShippingUsd}
                    onChange={(e) => setUsShippingUsd(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Peso Real */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-300">
                  Peso Real del Paquete (kg)
                </label>
                <span className={`text-[10px] font-bold ${weightKg >= 20 ? 'text-red-400' : 'text-slate-400'}`}>
                  Máx. legal: 20.0 kg
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value) || 0.1)}
                  className={`w-full bg-black/40 border rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none transition ${
                    weightKg >= 20 ? 'border-red-500 text-red-400' : 'border-white/10 focus:border-amber-400'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">kg</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Regla estricta Aduana UY: peso físico real (nunca peso volumétrico).
              </span>
            </div>

            {/* Botón Guardar en Perfil */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSavePreferences}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 transition cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Guardando en tu perfil...
                  </>
                ) : savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" /> ¡Preferencias Guardadas!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Guardar Preferencias en Mi Perfil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            TABLERO PRINCIPAL EN VIVO (MAIN STAGE - lg:col-span-7)
           ══════════════════════════════════════════════════════ */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* TARJETA 1: TU CASILLA MIAMI (CREDENCIAL CON BOTÓN COPIAR) */}
          <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-sky-950/20 border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🇺🇸</span>
                <div>
                  <h4 className="text-sm font-black text-white tracking-wide">Tu Casilla en Miami lista para Compras</h4>
                  <p className="text-[11px] text-slate-400">Pega estos datos en Amazon, eBay o cualquier tienda de EE.UU.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={copyToClipboard}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
                <span>{copied ? '¡Copiado!' : 'Copiar Completa'}</span>
              </button>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-2xl p-4 font-mono text-xs space-y-2 text-slate-300">
              <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-500 text-[11px]">Courier Activo:</span>
                <strong className="text-sky-300">{displayAddress.courierName}</strong>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-500 text-[11px]">Destinatario:</span>
                <span className="text-white font-bold">{displayAddress.recipient}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-500 text-[11px]">Casilla / Suite:</span>
                <span className="text-emerald-400 font-bold">{displayAddress.suite}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                <span className="text-slate-500 text-[11px]">Dirección (Street):</span>
                <span className="text-white">{displayAddress.addressLine1} {displayAddress.addressLine2}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Ciudad / Estado / ZIP:</span>
                <span className="text-white">{displayAddress.cityStateZip}</span>
              </div>
            </div>
          </div>

          {/* TARJETA 2: ESTADO ADUANERO ANUAL (3 SLOTS) */}
          <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">Estado Aduanero 2026</h4>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                {Math.max(0, 3 - shipmentsUsed)} franquicias libres
              </span>
            </div>

            {/* Visualizador de Slots */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((slotIndex) => {
                const isUsed = slotIndex <= shipmentsUsed;
                return (
                  <div
                    key={slotIndex}
                    className={`rounded-2xl p-3 border text-center transition ${
                      isUsed
                        ? 'bg-white/[0.02] border-white/10 text-slate-500'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-wider mb-1">
                      Envío #{slotIndex}
                    </div>
                    <div className="text-xs font-black flex items-center justify-center gap-1">
                      {isUsed ? (
                        <>⚪ Consumido</>
                      ) : (
                        <>🟢 DISPONIBLE</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Gastado estimado: <strong className="text-white font-bold">USD ${amountUsedUsd.toFixed(2)}</strong></span>
              <span>Cupo sugerido de referencia: <strong className="text-emerald-400 font-bold">USD $800.00</strong></span>
            </div>
          </div>

          {/* TARJETA 3: RESULTADO DE LA LIQUIDACIÓN O ALERTA ROJA (>= 20 KG) */}
          {isOverweight ? (
            /* 🔴 ALERTA ROJA DE BLOQUEO ADUANERO */
            <div className="bg-red-950/40 border-2 border-red-500/50 rounded-3xl p-6 shadow-2xl animate-in fade-in space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500 flex items-center justify-center text-red-400 shrink-0">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-black text-red-300 uppercase tracking-tight">
                    Alerta de Bloqueo: Límite de Peso Excedido ({weightKg.toFixed(1)} kg)
                  </h4>
                  <p className="text-xs text-red-200/80">
                    El paquete supera el tope legal máximo de 20.0 kg estipulado por la Dirección Nacional de Aduanas.
                  </p>
                </div>
              </div>

              <div className="bg-black/50 border border-red-500/30 rounded-2xl p-4 text-xs space-y-2 text-slate-300">
                <div className="flex items-center gap-2 text-red-300 font-bold">
                  <span>❌</span> NO califica para Régimen de Franquicia (0% impuestos).
                </div>
                <div className="flex items-center gap-2 text-red-300 font-bold">
                  <span>❌</span> NO califica para Régimen Simplificado al 60%.
                </div>
                <div className="text-slate-300 text-[11px] leading-relaxed pt-1 border-t border-red-500/20">
                  ⚠️ <strong>Procedimiento obligatorio:</strong> Todo paquete mayor o igual a 20 kg debe tramitarse bajo el <strong>Régimen General de Importación</strong> mediante un <strong>Despachante de Aduanas matriculado</strong>, liquidando aranceles específicos, recargos e IVA de importación comercial.
                </div>
              </div>
            </div>
          ) : (
            /* 📊 LIQUIDACIÓN ESTIMADA EN VIVO */
            <div className="bg-gradient-to-b from-zinc-900 to-black/80 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
              
              {/* Badge de Régimen Activo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">
                    Liquidación Aduanera Estimada
                  </span>
                  <h4 className="text-base font-black text-white">Total Puesto en Uruguay</h4>
                </div>

                {regimeMode === 'simplified' ? (
                  <div className="px-3 py-1 rounded-full text-xs font-black bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 self-start sm:self-auto">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Régimen Simplificado (+60%) · NO consume franquicia</span>
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 self-start sm:self-auto">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Franquicia 0% · Consume 1 cupo anual</span>
                  </div>
                )}
              </div>

              {/* Desglose Numérico Ejecutivo */}
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">1. Valor del Producto (FOB):</span>
                  <span className="font-bold text-white">USD ${productPriceUsd.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">2. Envío interno en USA:</span>
                  <span className="font-bold text-white">USD ${usShippingUsd.toFixed(2)}</span>
                </div>

                {/* Base Imponible Destacada */}
                <div className="flex items-center justify-between bg-sky-950/30 border border-sky-500/30 px-3.5 py-2.5 rounded-xl font-bold">
                  <span className="text-sky-300 flex items-center gap-1.5">
                    👉 TOTAL EN USA (Base Imponible):
                  </span>
                  <span className="text-sky-200 text-sm font-black">
                    USD ${calculationEstimate.totalUsaUsd.toFixed(2)}
                  </span>
                </div>

                {/* Impuesto Aduanero */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">3. Impuesto Aduana Uruguay:</span>
                    {regimeMode === 'simplified' && (
                      <span className="text-[10px] text-sky-400 font-bold">(60% de base imponible)</span>
                    )}
                  </div>
                  <span className={`font-black ${regimeMode === 'simplified' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {regimeMode === 'simplified'
                      ? `+ USD $${calculationEstimate.customsTaxUsd.toFixed(2)}`
                      : 'USD $0.00 (Exento)'
                    }
                  </span>
                </div>

                {/* Flete Courier */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">4. Flete Courier a Uruguay:</span>
                    <span className="text-[10px] text-slate-500">
                      ({calculationEstimate.courier.courierName} · {weightKg} kg)
                    </span>
                  </div>
                  <span className="font-bold text-white">
                    + USD ${calculationEstimate.courier.totalCourierUsd.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Total Puesto en Uruguay */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-black border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-black tracking-widest text-emerald-400">
                    Costo Total Estimado Puesto en UY
                  </div>
                  <div className="text-2xl font-black text-white">
                    USD ${calculationEstimate.totalCostUsd.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Aprox. en Moneda Nacional</div>
                  <div className="text-lg font-black text-emerald-400">
                    $ {calculationEstimate.totalCostUyu.toLocaleString('es-UY')} UYU
                  </div>
                </div>
              </div>

              {/* Nota Informativa del Régimen */}
              <div className="text-[11px] text-slate-400 leading-relaxed bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                {regimeMode === 'simplified' ? (
                  <p>
                    🛡️ <strong className="text-white">Régimen Simplificado (Decreto 336/015 modif.):</strong> Al tributar el 60% sobre el total comprado en EE.UU., este paquete <strong className="text-emerald-400">no descuenta de tus 3 franquicias anuales</strong>. Puedes utilizarlo las veces que desees siempre que no supere los 20 kg físicos ni tenga fines comerciales.
                  </p>
                ) : (
                  <p>
                    🟢 <strong className="text-white">Régimen de Franquicia:</strong> Libre de aranceles aduaneros (0%). Descuenta 1 envío de tu saldo anual de 3 compras permitidas hasta USD 200 de valor de factura.
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
