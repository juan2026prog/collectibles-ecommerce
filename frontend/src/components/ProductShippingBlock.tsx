import React, { useMemo } from 'react';
import { Truck, Store, Clock, PackageCheck, AlertCircle, ShieldCheck, Check, Info, AlertTriangle } from 'lucide-react';
import { getNextDispatchDate } from '../lib/dispatchCalculator';

interface ShippingSettings {
  dac?: { active?: boolean; fixed_cost?: string | number };
  ues?: { active?: boolean; fixed_cost?: string | number };
  soydelivery?: { active?: boolean; fixed_cost?: string | number };
  correo_uruguayo?: { active?: boolean; fixed_cost?: string | number };
  manual?: { active?: boolean; method_name?: string; fixed_cost?: string | number };
  pickup?: { active?: boolean; address?: string; city?: string; hours?: string; hide_address?: boolean };
  free_shipping?: { active?: boolean; min_amount?: string | number };
  free_shipping_from?: string | number;
  cutoff_time?: string;
  dispatch_days?: (string | number)[];
  preparation_days?: number;
  holidays?: string[];
  notes?: string;
}

interface ProductShippingBlockProps {
  product: any;
  vendorId?: string | null;
  vendorName?: string;
  vendorShippingSettings?: ShippingSettings | null;
  isCollectibles?: boolean;
}

export default function ProductShippingBlock({
  product,
  vendorId,
  vendorName = 'Collectibles.uy',
  vendorShippingSettings,
  isCollectibles = false
}: ProductShippingBlockProps) {
  
  // 1. Check Product Exceptions
  const isPreorder = Boolean(product?.badge?.toLowerCase().includes('preventa') || product?.metadata?.is_preorder || product?.title?.toLowerCase().includes('preventa'));
  const isInternational = product?.source_provider === 'zinc' || product?.source_provider === 'amazon';
  const isPickupOnly = Boolean(product?.metadata?.pickup_only || product?.dimensions?.pickup_only);
  const isVoluminous = Boolean(product?.metadata?.is_voluminous || product?.dimensions?.is_voluminous);

  // 2. Parse Shipping Settings for Platform vs Vendor
  const defaultCollectiblesSettings: ShippingSettings = {
    dac: { active: true },
    ues: { active: true },
    soydelivery: { active: true },
    pickup: { active: true, address: 'Maldonado 1422, Montevideo', hours: 'Lun a Vie 10:00 a 19:00, Sáb 10:00 a 14:00' },
    cutoff_time: '16:00',
    dispatch_days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    preparation_days: 0
  };

  const settings: ShippingSettings = (isCollectibles || !vendorId)
    ? { ...defaultCollectiblesSettings, ...vendorShippingSettings }
    : (vendorShippingSettings || {
        dac: { active: true },
        pickup: { active: false },
        cutoff_time: '15:00',
        dispatch_days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
      });

  // Extract active carriers
  const activeCarriers: { code: string; label: string; desc: string; costLabel?: string }[] = [];

  if (settings.dac?.active && !isPickupOnly) {
    const cost = settings.dac.fixed_cost;
    activeCarriers.push({
      code: 'dac',
      label: 'DAC',
      desc: 'Entrega a domicilio o retiro en agencia',
      costLabel: cost ? `$${cost}` : undefined
    });
  }

  if (settings.ues?.active && !isPickupOnly) {
    const cost = settings.ues.fixed_cost;
    activeCarriers.push({
      code: 'ues',
      label: 'UES',
      desc: 'Entrega rápida a domicilio',
      costLabel: cost ? `$${cost}` : undefined
    });
  }

  if (settings.soydelivery?.active && !isPickupOnly) {
    const cost = settings.soydelivery.fixed_cost;
    activeCarriers.push({
      code: 'soydelivery',
      label: 'SoyDelivery',
      desc: 'Envíos Flex / Express en zonas habilitadas',
      costLabel: cost ? `$${cost}` : undefined
    });
  }

  if (settings.correo_uruguayo?.active && !isPickupOnly) {
    const cost = settings.correo_uruguayo.fixed_cost;
    activeCarriers.push({
      code: 'correo_uruguayo',
      label: 'Correo Uruguayo',
      desc: 'Cobertura nacional a todo el país',
      costLabel: cost ? `$${cost}` : undefined
    });
  }

  if (settings.manual?.active && !isPickupOnly) {
    const cost = settings.manual.fixed_cost;
    activeCarriers.push({
      code: 'manual',
      label: settings.manual.method_name || 'Cadetería propia',
      desc: 'Envío gestionado por el vendedor',
      costLabel: cost ? `$${cost}` : undefined
    });
  }

  const pickupEnabled = Boolean(settings.pickup?.active);
  const primaryCourierName = activeCarriers.length > 0
    ? activeCarriers.map(c => c.label).join(' / ')
    : 'DAC';

  // Free shipping threshold check
  const freeShippingThreshold = settings.free_shipping_from || settings.free_shipping?.min_amount;

  // 3. Compute Dispatch Schedule using Helper
  const dispatchInfo = useMemo(() => {
    if (isPreorder || isInternational) return null;

    return getNextDispatchDate({
      currentDate: new Date(),
      timezone: 'America/Montevideo',
      enabledWeekdays: settings.dispatch_days || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
      cutoffTime: settings.cutoff_time || '15:00',
      preparationDays: settings.preparation_days || 0,
      holidays: settings.holidays || [],
      courierName: primaryCourierName,
      vendorName: vendorName
    });
  }, [settings, isPreorder, isInternational, primaryCourierName, vendorName]);

  // Check Official Store status
  const isOfficialStore = Boolean(
    product?.vendor_store?.is_official &&
    product?.vendor_store?.status === 'active' &&
    product?.vendor_store?.approved_by
  );

  // Semáforo visual state
  const statusLight = isPreorder
    ? { color: 'bg-amber-400', label: 'En preventa' }
    : isInternational
    ? { color: 'bg-indigo-400', label: 'Importación USA' }
    : settings.preparation_days && settings.preparation_days > 0
    ? { color: 'bg-slate-400', label: `Preparación ${settings.preparation_days}d` }
    : dispatchInfo?.can_dispatch_today
    ? { color: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]', label: 'Despacha hoy' }
    : { color: 'bg-amber-400', label: `Despacho el ${dispatchInfo?.next_dispatch_day_name || 'próximo día hábil'}` };

  // --------------------------------------------------------------------------
  // RENDER: BLOQUE INTERNACIONAL (AMAZON USA)
  // --------------------------------------------------------------------------
  if (isInternational) {
    return (
      <div className="rounded-2xl p-4 mt-4 border border-indigo-500/20 bg-indigo-950/20 relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-indigo-400" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-white">Importación Amazon USA</h3>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            USA ✈ Uruguay
          </span>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-start gap-2 text-[11px]">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>Compra inmediata protegida por Collectibles.uy.</span>
          </div>

          <div className="flex items-start gap-2 text-[11px]">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>Se envía a tu casilla courier en Estados Unidos.</span>
          </div>

          <div className="flex items-start gap-2 text-[11px]">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>Envío USA ➔ Uruguay gestionado por el courier elegido por el cliente.</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 mt-3 pt-2.5 border-t border-indigo-500/20 leading-relaxed">
          ⚠️ Costo de courier internacional no incluido en el precio. Se calcula según el peso final al ingresar a tu casilla.
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: BLOQUE NACIONAL MARKETPLACE / COLLECTIBLES
  // --------------------------------------------------------------------------
  return (
    <div className="rounded-2xl p-4 sm:p-5 mt-4 border border-white/10 bg-white/[0.03] relative overflow-hidden">
      
      {/* HEADER: TITULO + VENDEDOR + BADGE OFICIAL */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#f00856]" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-white">ENVÍOS Y RETIRO</h3>
        </div>

        <div className="flex items-center gap-2">
          {isOfficialStore && (
            <span className="text-[8px] px-1.5 py-0.5 font-black uppercase rounded bg-red-500 text-white border border-red-400 tracking-wider">
              TIENDA OFICIAL
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-400">
            Despachado por <strong className="text-white font-bold">{vendorName}</strong>
          </span>
        </div>
      </div>

      {/* SEMÁFORO VISUAL + SUMMARY ROW */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-white pr-2 border-r border-white/10 text-[11px]">
          <span className={`w-2 h-2 rounded-full ${statusLight.color}`} />
          <span>{statusLight.label}</span>
        </div>

        {activeCarriers.length > 0 && (
          <span className="text-slate-300 font-medium text-[11px] flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> {activeCarriers[0].label} disponible
          </span>
        )}

        {pickupEnabled && (
          <span className="text-slate-300 font-medium text-[11px] flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Retiro en tienda
          </span>
        )}
      </div>

      {/* SPECIAL PRODUCT WARNINGS */}
      {isPreorder ? (
        <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs mb-3">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-400 text-[11px] mb-0.5">
            <Clock className="w-3.5 h-3.5" /> Producto en Preventa
          </div>
          <p className="leading-relaxed text-slate-300 text-[11px]">
            El despacho o retiro se realizará una vez recibido en stock en el depósito del vendedor.
          </p>
        </div>
      ) : settings.preparation_days && settings.preparation_days > 0 ? (
        <div className="rounded-xl p-3 bg-slate-500/10 border border-slate-500/20 text-slate-200 text-xs mb-3">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-300 text-[11px] mb-0.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Preparación Especial
          </div>
          <p className="leading-relaxed text-[11px]">
            Este producto requiere <strong className="text-white">{settings.preparation_days} día{settings.preparation_days > 1 ? 's' : ''} hábil{settings.preparation_days > 1 ? 'es' : ''}</strong> de preparación antes del despacho.
          </p>
        </div>
      ) : dispatchInfo ? (
        /* BANNER DE DESPACHO DINÁMICO */
        <div className={`rounded-xl p-3 text-[11px] mb-3 border transition-colors ${
          dispatchInfo.can_dispatch_today
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
            : 'bg-white/[0.02] border-white/10 text-slate-300'
        }`}>
          <div className="flex items-center gap-1.5 font-bold mb-0.5 text-white">
            <Clock className={`w-3.5 h-3.5 ${dispatchInfo.can_dispatch_today ? 'text-emerald-400' : 'text-[#f00856]'}`} />
            <span>Próximo Despacho: <strong className="capitalize text-white">{dispatchInfo.next_dispatch_label}</strong></span>
          </div>
          <p className="leading-relaxed text-slate-300">
            {dispatchInfo.formatted_message}
          </p>
        </div>
      ) : null}

      {/* ADVERTENCIA PRODUCTOS VOLUMINOSOS */}
      {isVoluminous && (
        <div className="rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] mb-3 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Este producto puede requerir una cotización especial de envío.</span>
        </div>
      )}

      {/* ENVÍO GRATIS BANNER */}
      {freeShippingThreshold && (
        <div className="rounded-xl p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] mb-3 font-bold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Envío gratis disponible
          </span>
          <span className="text-white">Desde ${freeShippingThreshold}</span>
        </div>
      )}

      {/* MÉTODOS DISPONIBLES (LISTA LIMPIA CON CHECKMARKS) */}
      <div className="mt-3">
        <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">
          Métodos disponibles
        </div>

        <div className="space-y-2">
          {/* RETIRO EN TIENDA */}
          {pickupEnabled && (
            <div className="p-2.5 rounded-xl flex items-start justify-between text-xs bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors">
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white text-[12px]">Retiro en tienda</div>
                  {!settings.pickup?.hide_address && settings.pickup?.address && (
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      {settings.pickup.address}
                      {settings.pickup?.hours && <span className="block text-slate-400">{settings.pickup.hours}</span>}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded shrink-0">
                Sin costo
              </span>
            </div>
          )}

          {/* COURIERS ACTIVOS */}
          {activeCarriers.length > 0 ? (
            activeCarriers.map(carrier => (
              <div key={carrier.code} className="p-2.5 rounded-xl flex items-start justify-between text-xs bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white text-[12px]">{carrier.label}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{carrier.desc}</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-slate-400 shrink-0">
                  {carrier.costLabel || 'En checkout'}
                </span>
              </div>
            ))
          ) : !pickupEnabled ? (
            <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>Este vendedor no tiene métodos de envío activos para tu ubicación.</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
