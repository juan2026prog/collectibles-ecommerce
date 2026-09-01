import React, { useMemo } from 'react';
import { Truck, Store, Clock, ShieldCheck, Check, PackageCheck, AlertTriangle } from 'lucide-react';
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
  
  const isPreorder = Boolean(product?.badge?.toLowerCase().includes('preventa') || product?.metadata?.is_preorder || product?.title?.toLowerCase().includes('preventa'));
  const isInternational = Boolean(
    product?.is_international || 
    product?.source_provider === 'zinc' || 
    product?.source_provider === 'amazon' ||
    product?.shipping_type === 'international_courier_direct'
  );
  const isPickupOnly = Boolean(product?.metadata?.pickup_only || product?.dimensions?.pickup_only);

  const defaultCollectiblesSettings: ShippingSettings = {
    dac: { active: true },
    ues: { active: true },
    soydelivery: { active: true },
    pickup: { active: true, address: 'Vázquez 1418, Montevideo', hours: 'Lun a Vie 12:00 a 19:00, Sáb 10:00 a 14:00' },
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

  const activeCarriers: string[] = [];
  if (settings.dac?.active && !isPickupOnly) activeCarriers.push('DAC');
  if (settings.ues?.active && !isPickupOnly) activeCarriers.push('UES');
  if (settings.soydelivery?.active && !isPickupOnly) activeCarriers.push('SoyDelivery');
  if (settings.correo_uruguayo?.active && !isPickupOnly) activeCarriers.push('Correo Uruguayo');
  if (settings.manual?.active && !isPickupOnly && settings.manual.method_name) activeCarriers.push(settings.manual.method_name);

  const pickupEnabled = Boolean(settings.pickup?.active);
  const primaryCourierName = activeCarriers.length > 0 ? activeCarriers.join(' / ') : 'DAC';

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

  const freeShippingThreshold = settings.free_shipping_from || settings.free_shipping?.min_amount;

  if (isInternational) {
    const weightKg = Number(product?.weight_kg || product?.metadata?.weight_kg || 0.5);
    const estUruboxUsd = Number(((weightKg * 20.0) + 5.0).toFixed(2));

    return (
      <div className="py-4 border-t border-white/10 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🌎</span>
            <span className="text-xs font-black uppercase tracking-wider text-white">Entrega en tu casilla de EE.UU.</span>
          </div>
          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            SIN CARGO ADICIONAL
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Collectibles envía este producto a la dirección de tu courier en EE.UU. (Urubox, USX, PuntoMio u otro). El traslado Miami → Uruguay se abona directamente a tu courier.
        </p>
        <div className="bg-sky-950/30 border border-sky-500/20 rounded-xl p-2.5 text-[11px] text-sky-300">
          <span className="font-bold text-sky-200 block">Envío estimado a Uruguay (Urubox): ~ USD {estUruboxUsd}</span>
          <span className="text-[10px] text-sky-400/80 block mt-0.5">Estimación informativa referencial. El importe final se paga directamente al courier.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 border-t border-white/10 space-y-3.5">
      {/* 📦 SECCIÓN ENVÍOS */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#f00856]" />
            <span className="text-xs font-black uppercase tracking-wider text-white">Envíos a todo el país</span>
          </div>
          {activeCarriers.length > 0 && (
            <span className="text-xs font-bold text-slate-300">
              {activeCarriers.join(' · ')}
            </span>
          )}
        </div>

        {dispatchInfo && (
          <div className="flex items-center gap-2 text-xs text-slate-300 pl-6">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Despacho: <strong className="text-white font-bold">{dispatchInfo.can_dispatch_today ? 'Hoy mismo' : `Próximo día hábil (${dispatchInfo.next_dispatch_day_name})`}</strong>
            </span>
          </div>
        )}

        <div className="text-[11px] text-slate-400 pl-6">
          Costo calculado durante el checkout según dirección.
          {freeShippingThreshold && (
            <span className="text-emerald-400 font-bold block mt-0.5">
              ✓ Envío gratis en compras mayores a ${freeShippingThreshold}
            </span>
          )}
        </div>
      </div>

      {/* 🏪 SECCIÓN RETIRO EN TIENDA */}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-white">Retiro en local</span>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
          pickupEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
        }`}>
          {pickupEnabled ? 'Disponible' : 'No disponible'}
        </span>
      </div>
    </div>
  );
}
