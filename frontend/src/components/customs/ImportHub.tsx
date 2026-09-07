import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, Globe, Copy, Check, AlertTriangle, 
  Scale, Truck, DollarSign, RefreshCw, Info, Save, 
  ShieldAlert, Star, ChevronDown, ChevronUp, CheckCircle2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { KNOWN_COURIERS, CourierPricingEngine } from '../../lib/customs/CourierPricingEngine';
import { ImportCostEngine } from '../../lib/customs/ImportCostEngine';

interface ImportHubProps {
  onSaved?: () => void;
}

export const ImportHub: React.FC<ImportHubProps> = ({ onSaved }) => {
  const { user, profile } = useAuth();

  // ═══════════════════════════════════════════════════════════
  // ESTADOS DE CONFIGURACIÓN
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

  // Estado de Franquicias (Manual)
  const [shipmentsUsed, setShipmentsUsed] = useState<number>(1);
  const [amountUsedUsd, setAmountUsedUsd] = useState<number>(180);

  // Parámetros del Simulador
  const [regimeMode, setRegimeMode] = useState<'franchise' | 'simplified'>('simplified');
  const [productPriceUsd, setProductPriceUsd] = useState<number>(150);
  const [usShippingUsd, setUsShippingUsd] = useState<number>(10);
  const [weightKg, setWeightKg] = useState<number>(1.8);

  // Estados UI
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showComparisonTable, setShowComparisonTable] = useState<boolean>(true);

  // ═══════════════════════════════════════════════════════════
  // CARGA DE DATOS DEL USUARIO
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
  // CÁLCULO PRINCIPAL
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

  // Dirección construida para copiar
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
      suite: suiteNumber || 'Sin Suite',
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

  // ═══════════════════════════════════════════════════════════
  // TABLA COMPARATIVA DE COURIERS
  // ═══════════════════════════════════════════════════════════
  const comparisonList = useMemo(() => {
    const list = Object.values(KNOWN_COURIERS).map(c => {
      const estimate = ImportCostEngine.calculateLandedCost({
        productPriceUsd,
        usDomesticShippingUsd: usShippingUsd,
        weightKg,
        courierCode: c.code,
        usage: { usedShipments: shipmentsUsed, usedAmountUsd: amountUsedUsd },
        forceSimplifiedRegime: regimeMode === 'simplified',
        exchangeRateUsdToUyu: 42.50
      });

      return {
        code: c.code,
        name: c.name,
        deliveryDays: c.deliveryDays,
        estimate,
        isCurrent: c.code === selectedCourierCode
      };
    });

    // Si tiene configurado un courier personalizado, agregarlo a la tabla
    if (isCustomCourier && customCourierName) {
      const customEstimate = ImportCostEngine.calculateLandedCost({
        productPriceUsd,
        usDomesticShippingUsd: usShippingUsd,
        weightKg,
        courierCode: 'custom',
        usage: { usedShipments: shipmentsUsed, usedAmountUsd: amountUsedUsd },
        forceSimplifiedRegime: regimeMode === 'simplified',
        exchangeRateUsdToUyu: 42.50
      });
      list.push({
        code: 'custom',
        name: customCourierName,
        deliveryDays: '5 a 10 días hábiles',
        estimate: customEstimate,
        isCurrent: true
      });
    }

    // Encontrar el más económico
    const minTotal = Math.min(...list.filter(x => !x.estimate.courier.isOverweight).map(x => x.estimate.totalCostUsd));

    return list.map(item => ({
      ...item,
      isCheapest: !item.estimate.courier.isOverweight && item.estimate.totalCostUsd === minTotal
    }));
  }, [productPriceUsd, usShippingUsd, weightKg, shipmentsUsed, amountUsedUsd, regimeMode, selectedCourierCode, isCustomCourier, customCourierName]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      
      {/* ─── ENCABEZADO MINIMALISTA ─── */}
      <div className="border-b border-white/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span>🇺🇾</span> Consultor de Importaciones & Franquicias 2026
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configura tu casilla en Miami, controla tu cupo anual y simula el costo total puesto en Uruguay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {Math.max(0, 3 - shipmentsUsed)} de 3 franquicias disponibles
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          BLOQUE 1 (VERTICAL): MI CASILLA USA & CUPO ADUANERO
         ══════════════════════════════════════════════════════ */}
      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="border-b border-white/5 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-sky-400" /> 1. Mi Casilla en Miami & Cupo Anual
          </h3>
          <span className="text-[11px] text-slate-400">Paso 1 de 2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Selector de Courier */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
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

          {/* Número de Suite / Casilla */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Tu Número de Suite / Casilla
            </label>
            <input
              type="text"
              value={suiteNumber}
              onChange={(e) => setSuiteNumber(e.target.value)}
              placeholder="Ej. UY-84920"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-400 transition"
            />
          </div>

          {/* Franquicias Utilizadas */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Franquicias utilizadas en el año
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((num) => {
                const isSelected = shipmentsUsed === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setShipmentsUsed(num)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm font-black'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {num === 3 ? '3 Usadas' : `${num} ${num === 1 ? 'Usada' : 'Usadas'}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desplegable si eligió Otro Courier */}
        {isCustomCourier && (
          <div className="p-4 bg-black/30 rounded-xl border border-sky-500/20 text-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nombre Courier</label>
              <input
                type="text"
                value={customCourierName}
                onChange={(e) => setCustomCourierName(e.target.value)}
                placeholder="Ej. Miami Box UY"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dirección USA</label>
              <input
                type="text"
                value={customAddressLine1}
                onChange={(e) => setCustomAddressLine1(e.target.value)}
                placeholder="Ej. 7900 NW 60th St"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ciudad, Estado y ZIP</label>
              <input
                type="text"
                value={`${customCity}, ${customState} ${customPostalCode}`}
                onChange={(e) => {
                  const parts = e.target.value.split(',');
                  setCustomCity(parts[0]?.trim() || 'Miami');
                  if (parts[1]) {
                    const subparts = parts[1].trim().split(' ');
                    setCustomState(subparts[0] || 'FL');
                    if (subparts[1]) setCustomPostalCode(subparts[1]);
                  }
                }}
                placeholder="Miami, FL 33166"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tarifa Aprox. / kg (USD)</label>
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
        )}

        {/* Tarjeta Visual de Dirección en Miami lista para Copiar */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-300 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400 flex items-center gap-1.5">
              <span>📍 Dirección oficial en Miami para tus compras:</span>
            </div>
            <div className="font-mono text-white text-xs">
              <strong>{displayAddress.recipient}</strong> {suiteNumber ? `(#${suiteNumber})` : ''} · {displayAddress.addressLine1} {displayAddress.addressLine2}, {displayAddress.cityStateZip}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyToClipboard}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Dirección'}</span>
            </button>

            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedSuccess ? 'Guardado' : 'Guardar en Perfil'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          BLOQUE 2 (VERTICAL): SIMULADOR DE COMPRA Y SU RESULTADO
         ══════════════════════════════════════════════════════ */}
      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="border-b border-white/5 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" /> 2. Simulador de Compra & Liquidación en Uruguay
          </h3>
          <span className="text-[11px] text-slate-400">Paso 2 de 2</span>
        </div>

        {/* Formulario de Entrada del Simulador */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Régimen a Aplicar:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRegimeMode('franchise')}
                className={`p-3 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                  regimeMode === 'franchise'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm'
                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/5'
                }`}
              >
                <span className="font-bold text-xs flex items-center gap-1.5">
                  🟢 Régimen de Franquicia (0% Aduana)
                </span>
                <span className="text-[11px] text-slate-400 mt-1">
                  Exento de aranceles bajo Decreto 336/015. Consume 1 de tus 3 cupos anuales.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRegimeMode('simplified')}
                className={`p-3 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                  regimeMode === 'simplified'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 shadow-sm'
                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    🛡️ Régimen Simplificado (+60%)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    NO CONSUME FRANQUICIA
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">
                  Tributa 60% sobre el total en EE.UU. (Producto + Envío USA). Tus 3 cupos quedan intactos.
                </span>
              </button>
            </div>
          </div>

          {/* Inputs Numéricos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Precio del Producto (FOB USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={productPriceUsd}
                  onChange={(e) => setProductPriceUsd(Number(e.target.value) || 0)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Envío interno dentro de USA (USD)
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
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300">
                  Peso Real del Paquete (kg)
                </label>
                <span className={`text-[10px] font-bold ${weightKg >= 20 ? 'text-red-400' : 'text-slate-400'}`}>
                  Límite legal: 20 kg
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value) || 0.1)}
                  className={`w-full bg-black/40 border rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none transition ${
                    weightKg >= 20 ? 'border-red-500 text-red-400' : 'border-white/10 focus:border-amber-400'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">kg</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RESULTADO INMEDIATO DE LA LIQUIDACIÓN ─── */}
        {isOverweight ? (
          /* Alerta Roja >= 20 kg */
          <div className="bg-red-950/40 border-2 border-red-500/50 rounded-xl p-5 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
              <div>
                <h4 className="text-sm font-black text-red-300 uppercase tracking-tight">
                  Alerta Roja: Peso Excedido ({weightKg.toFixed(1)} kg)
                </h4>
                <p className="text-xs text-red-200/80">
                  El paquete supera el tope legal de 20.0 kg permitido por la Dirección Nacional de Aduanas para compras personales por courier.
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-300 bg-black/40 p-3 rounded-lg border border-red-500/20 space-y-1">
              <div>❌ No califica para Franquicia ni para Régimen Simplificado (60%).</div>
              <div>⚠️ Requiere importación general obligatoria mediante Despachante de Aduanas con aranceles e IVA comercial.</div>
            </div>
          </div>
        ) : (
          /* Liquidación Numérica Limpia y Transparente */
          <div className="bg-black/50 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Liquidación Estimada para tu Courier ({calculationEstimate.courier.courierName})
              </span>
              <span className={`text-xs font-black px-2 py-0.5 rounded ${
                regimeMode === 'simplified' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {regimeMode === 'simplified' ? 'Régimen Simplificado 60%' : 'Bajo Franquicia 0%'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-slate-400 text-[11px] block">1. Valor Producto</span>
                <strong className="text-white text-sm font-black">USD ${productPriceUsd.toFixed(2)}</strong>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-slate-400 text-[11px] block">2. Envío USA</span>
                <strong className="text-white text-sm font-black">USD ${usShippingUsd.toFixed(2)}</strong>
              </div>

              <div className="bg-sky-950/30 border border-sky-500/30 p-3 rounded-xl">
                <span className="text-sky-300 text-[11px] block font-bold">👉 Base Imponible USA</span>
                <strong className="text-sky-200 text-sm font-black">USD ${calculationEstimate.totalUsaUsd.toFixed(2)}</strong>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-slate-400 text-[11px] block">3. Impuesto Aduana UY</span>
                <strong className={`text-sm font-black ${regimeMode === 'simplified' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {regimeMode === 'simplified'
                    ? `+ USD $${calculationEstimate.customsTaxUsd.toFixed(2)}`
                    : 'USD $0.00 (Exento)'
                  }
                </strong>
              </div>
            </div>

            {/* Total Puesto en Uruguay */}
            <div className="bg-gradient-to-r from-emerald-950/50 via-zinc-900 to-black border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400 block">
                  Total Estimado Puesto en Uruguay
                </span>
                <div className="text-2xl font-black text-white">
                  USD ${calculationEstimate.totalCostUsd.toFixed(2)}
                </div>
                <span className="text-xs text-slate-400">
                  Incluye Flete Courier a UY (~USD ${calculationEstimate.courier.totalCourierUsd.toFixed(2)}) + Impuesto Aduana
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">En Moneda Nacional</span>
                <div className="text-xl font-black text-emerald-400">
                  $ {calculationEstimate.totalCostUyu.toLocaleString('es-UY')} UYU
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          BLOQUE 3: TABLA COMPARATIVA DE COSTO POR COURIER
         ══════════════════════════════════════════════════════ */}
      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" /> Comparativa de Costo por Courier
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulación comparada de este paquete ({weightKg} kg · Producto USD ${productPriceUsd}) entre las principales empresas de Uruguay.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowComparisonTable(!showComparisonTable)}
            className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
          >
            {showComparisonTable ? (
              <>Ocultar tabla <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Ver tabla comparativa <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        </div>

        {showComparisonTable && (
          <div className="space-y-4 animate-in fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Empresa Courier</th>
                    <th className="py-2.5 px-3">Tiempo Estimado</th>
                    <th className="py-2.5 px-3 text-right">Flete Miami → MVD</th>
                    <th className="py-2.5 px-3 text-right">Aduana ({regimeMode === 'simplified' ? '60%' : '0%'})</th>
                    <th className="py-2.5 px-3 text-right">Total Puesto en UY</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comparisonList.map((c) => {
                    const isSelected = c.code === selectedCourierCode;
                    return (
                      <tr 
                        key={c.code}
                        className={`transition ${
                          isSelected 
                            ? 'bg-sky-500/10 border-l-4 border-sky-400' 
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Nombre del Courier y Badges */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{c.name}</span>
                            {c.isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                                <Star className="w-2.5 h-2.5 fill-sky-300" /> Tu Courier
                              </span>
                            )}
                            {c.isCheapest && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                🟢 Más Económico
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Tiempo */}
                        <td className="py-3 px-3 text-slate-400">
                          {c.deliveryDays}
                        </td>

                        {/* Flete */}
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          USD ${c.estimate.courier.totalCourierUsd.toFixed(2)}
                        </td>

                        {/* Aduana */}
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          {regimeMode === 'simplified'
                            ? `USD $${c.estimate.customsTaxUsd.toFixed(2)}`
                            : '$0.00'
                          }
                        </td>

                        {/* Total Puesto en UY */}
                        <td className="py-3 px-3 text-right font-mono font-black text-white text-sm">
                          USD ${c.estimate.totalCostUsd.toFixed(2)}
                          <span className="text-[10px] text-emerald-400 block font-normal">
                            ~ ${c.estimate.totalCostUyu.toLocaleString('es-UY')} UYU
                          </span>
                        </td>

                        {/* Botón Seleccionar */}
                        <td className="py-3 px-3 text-center">
                          {isSelected ? (
                            <span className="text-sky-400 font-bold text-[11px] flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedCourierCode(c.code)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                            >
                              Seleccionar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Aviso Legal de Precios de Referencia */}
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>Aviso de referencia:</strong> Los precios, tarifas por kilogramo y tiempos de entrega mostrados son de carácter estrictamente informativo y de referencia, calculados a partir de la información pública disponible en los sitios web oficiales de cada courier al momento de la consulta. Las tarifas finales son liquidadas y cobradas directamente por la empresa de courier correspondiente al momento de recibir el paquete en Uruguay.
              </span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
