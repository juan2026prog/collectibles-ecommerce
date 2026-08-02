import React, { useMemo } from 'react';
import { Truck, Store, Clock, PackageCheck, AlertCircle, ShieldCheck } from 'lucide-react';
import { getNextDispatchDate } from '../lib/dispatchCalculator';

interface ShippingSettings {
  dac?: { active?: boolean };
  ues?: { active?: boolean };
  soydelivery?: { active?: boolean };
  correo_uruguayo?: { active?: boolean };
  manual?: { active?: boolean; method_name?: string };
  pickup?: { active?: boolean; address?: string; city?: string; hours?: string };
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
        dac: { active: true }, // default fallback if vendor hasn't configured
        pickup: { active: false },
        cutoff_time: '15:00',
        dispatch_days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
      });

  // Extract enabled carriers
  const activeCarriers: { code: string; label: string; desc: string }[] = [];

  if (settings.dac?.active && !isPickupOnly) {
    activeCarriers.push({
      code: 'dac',
      label: 'DAC',
      desc: 'Envíos por DAC a todo Uruguay (agencia o domicilio).'
    });
  }

  if (settings.ues?.active && !isPickupOnly) {
    activeCarriers.push({
      code: 'ues',
      label: 'UES',
      desc: 'Entrega rápida a domicilio en Montevideo e interior.'
    });
  }

  if (settings.soydelivery?.active && !isPickupOnly) {
    activeCarriers.push({
      code: 'soydelivery',
      label: 'SoyDelivery',
      desc: 'Envíos Flex / Express en zonas habilitadas.'
    });
  }

  if (settings.correo_uruguayo?.active && !isPickupOnly) {
    activeCarriers.push({
      code: 'correo_uruguayo',
      label: 'Correo Uruguayo',
      desc: 'Cobertura nacional a través de Correo Uruguayo.'
    });
  }

  if (settings.manual?.active && !isPickupOnly) {
    activeCarriers.push({
      code: 'manual',
      label: settings.manual.method_name || 'Cadetería propia',
      desc: 'Envío directo gestionado por el vendedor.'
    });
  }

  const pickupEnabled = Boolean(settings.pickup?.active);

  // Determine main courier for schedule calculation
  const primaryCourierName = activeCarriers.length > 0
    ? activeCarriers.map(c => c.label).join(' / ')
    : 'DAC';

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

  return (
    <div className="glass rounded-[2rem] p-6 mt-6 border border-white/10 shadow-lg relative overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="w-5 h-5 text-[#f00856]" />
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">ENVÍOS Y RETIRO</h3>
      </div>

      <div className="text-xs font-bold text-slate-300 mb-4 pb-3 border-b border-white/10 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
        <span>Vendido y enviado por <strong className="text-white">{vendorName}</strong></span>
      </div>

      {/* SPECIAL PRODUCT EXCEPTIONS */}
      {isPreorder ? (
        <div className="soft rounded-xl p-4 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs mb-4">
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-amber-400 mb-1">
            <Clock className="w-4 h-4" /> Producto en Preventa
          </div>
          <p className="leading-relaxed">
            El despacho o retiro de este producto se realizará una vez que sea recibido en stock en nuestro depósito.
          </p>
        </div>
      ) : isInternational ? (
        <div className="soft rounded-xl p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs mb-4">
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-indigo-400 mb-1">
            <PackageCheck className="w-4 h-4" /> Importación Internacional
          </div>
          <p className="leading-relaxed">
            Compra protegida por Collectibles.uy. Envío a tu casilla courier en USA y posterior despacho local.
          </p>
        </div>
      ) : dispatchInfo ? (
        /* DYNAMIC DISPATCH BANNER */
        <div className={`soft rounded-xl p-4 text-xs mb-4 border transition-colors ${
          dispatchInfo.can_dispatch_today
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-white/5 border-white/10 text-slate-300'
        }`}>
          <div className="flex items-center gap-2 font-black mb-1 text-white">
            <Clock className="w-4 h-4 text-[#f00856]" />
            <span>Próximo Despacho: <strong className="capitalize">{dispatchInfo.next_dispatch_label}</strong></span>
          </div>
          <p className="leading-relaxed text-slate-300">
            {dispatchInfo.formatted_message}
          </p>
        </div>
      ) : null}

      {/* ENABLED SHIPPING METHODS & PICKUP LIST */}
      <div className="space-y-3">
        {/* PICKUP METHOD */}
        {pickupEnabled && (
          <div className="soft rounded-xl p-3 flex items-start gap-3 text-xs bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
            <Store className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">Retiro disponible</div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                {settings.pickup?.address ? `${settings.pickup.address}` : 'Retiro en sucursal del vendedor.'}
                {settings.pickup?.hours && <span className="block text-slate-500">{settings.pickup.hours}</span>}
              </div>
            </div>
          </div>
        )}

        {/* COURIER METHODS */}
        {activeCarriers.length > 0 ? (
          activeCarriers.map(carrier => (
            <div key={carrier.code} className="soft rounded-xl p-3 flex items-start gap-3 text-xs bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
              <Truck className="w-4 h-4 text-[#f00856] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white">{carrier.label}</div>
                <div className="text-slate-400 text-[11px] mt-0.5">{carrier.desc}</div>
              </div>
            </div>
          ))
        ) : !pickupEnabled ? (
          <div className="soft rounded-xl p-4 bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>Este vendedor no tiene métodos de envío activos configurados actualmente.</span>
          </div>
        ) : null}
      </div>

      <div className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-white/5 text-center">
        El costo y el plazo definitivo se calculan al ingresar tu dirección en el checkout.
      </div>
    </div>
  );
}
