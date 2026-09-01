import React from 'react';
import { ShoppingBag, ShieldCheck, Truck, Store, Tag, Sparkles, Check, Lock } from 'lucide-react';

export interface ShipmentSummaryProps {
  items: Array<{
    id: string;
    title: string;
    image_url?: string;
    price: number;
    quantity: number;
    vendor_id?: string;
    vendor_store_id?: string;
    vendor_name?: string;
    is_international?: boolean;
  }>;
  uniqueStoreKeys: string[];
  getVendorName: (storeKey: string) => string;
  subordersShipping: Record<string, { method: string; selectedAgency?: any }>;
  vendorShippingCosts: Record<string, number>;
  subtotal: number;
  shippingTotal: number;
  shippingSavings?: number;
  couponDiscount?: number;
  autoDiscount?: number;
  finalTotal: number;
  formatCurrencyPrice: (amount: number) => string;
  activeCoupon?: any;
  onRemoveCoupon?: () => void;
}

export const ShipmentSummary: React.FC<ShipmentSummaryProps> = ({
  items,
  uniqueStoreKeys,
  getVendorName,
  subordersShipping,
  vendorShippingCosts,
  subtotal,
  shippingTotal,
  shippingSavings = 0,
  couponDiscount = 0,
  autoDiscount = 0,
  finalTotal,
  formatCurrencyPrice,
  activeCoupon,
  onRemoveCoupon,
}) => {
  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 md:p-6 shadow-xl sticky top-6">
      <h3 className="font-bold text-lg text-white mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
        <span className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-[#f00856]" />
          Resumen de tu compra
        </span>
        <span className="text-xs font-normal text-neutral-400">
          {items.length} {items.length === 1 ? 'producto' : 'productos'}
        </span>
      </h3>

      {/* Selected Shipping Methods Breakdown per Vendor */}
      <div className="mb-5 bg-neutral-950/80 rounded-xl p-3.5 border border-neutral-800/80">
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-[#f00856]" />
          Envíos Seleccionados ({uniqueStoreKeys.length} {uniqueStoreKeys.length === 1 ? 'paquete' : 'paquetes'})
        </h4>

        <div className="space-y-2">
          {uniqueStoreKeys.map((key) => {
            const vName = getVendorName(key);
            const subSel = subordersShipping[key];
            const method = subSel?.method || 'delivery';
            const cost = vendorShippingCosts[key] ?? 0;
            const isPickup = method === 'pickup';
            const isFree = cost === 0;

            let methodLabel = 'Envío a domicilio';
            if (key === 'international' || method === 'international_courier_direct') methodLabel = 'Entrega en casilla EE.UU.';
            else if (isPickup) methodLabel = 'Retiro en local';
            else if (method === 'dac_home') methodLabel = 'DAC a domicilio';
            else if (method === 'dac_agency') methodLabel = 'Retiro en agencia DAC';
            else if (method === 'soydelivery') methodLabel = 'Soy Delivery / Flex';

            const isIntlDirect = key === 'international' || method === 'international_courier_direct';

            return (
              <div key={key} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-900 last:border-none">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  {isIntlDirect ? (
                    <span className="text-xs flex-shrink-0">🌎</span>
                  ) : isPickup ? (
                    <Store className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Truck className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                  )}
                  <span className="text-neutral-300 font-medium truncate">
                    {key === 'international' ? 'Collectibles · Internacional' : vName}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-neutral-400">{methodLabel}</span>
                  {isIntlDirect ? (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      SIN CARGO
                    </span>
                  ) : isFree ? (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">GRATIS</span>
                  ) : (
                    <span className="font-semibold text-white">${cost.toLocaleString('es-UY')}</span>
                  )}
                </div>
              </div>
            );
          })}

          {items.some(i => i.is_international) && (
            <div className="pt-2 border-t border-neutral-900 text-[10px] text-sky-400 flex items-center justify-between">
              <span>Courier EE.UU. → Uruguay</span>
              <span className="font-semibold text-slate-400">No incluido</span>
            </div>
          )}
        </div>
      </div>

      {/* Applied Coupon Indicator */}
      {activeCoupon && (
        <div className="mb-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-purple-300 font-medium">
            <Tag className="w-4 h-4 text-purple-400" />
            <span>Cupón <strong>{activeCoupon.code}</strong> aplicado</span>
          </div>
          {onRemoveCoupon && (
            <button
              onClick={onRemoveCoupon}
              className="text-[11px] font-bold text-purple-400 hover:text-purple-300 underline"
            >
              Quitar
            </button>
          )}
        </div>
      )}

      {/* Detailed Financial Breakdown */}
      <div className="space-y-2.5 text-sm mb-5">
        <div className="flex justify-between text-neutral-400">
          <span>Subtotal productos</span>
          <span className="text-white font-medium">{formatCurrencyPrice(subtotal)}</span>
        </div>

        {autoDiscount > 0 && (
          <div className="flex justify-between text-emerald-400 font-medium">
            <span>Descuentos automáticos</span>
            <span>-{formatCurrencyPrice(autoDiscount)}</span>
          </div>
        )}

        {couponDiscount > 0 && (
          <div className="flex justify-between text-purple-400 font-medium">
            <span>Descuento cupón</span>
            <span>-{formatCurrencyPrice(couponDiscount)}</span>
          </div>
        )}

        <div className="flex justify-between text-neutral-400">
          <span>Total envío ({uniqueStoreKeys.length} {uniqueStoreKeys.length === 1 ? 'paquete' : 'paquetes'})</span>
          {shippingTotal === 0 ? (
            <span className="text-emerald-400 font-bold">GRATIS</span>
          ) : (
            <span className="text-white font-medium">{formatCurrencyPrice(shippingTotal)}</span>
          )}
        </div>

        {shippingSavings > 0 && (
          <div className="flex justify-between text-emerald-400 font-semibold text-xs bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
            <span>Ahorro en envíos</span>
            <span>-{formatCurrencyPrice(shippingSavings)}</span>
          </div>
        )}

        <div className="border-t border-neutral-800 pt-3 mt-3 flex justify-between items-baseline">
          <div>
            <span className="text-base font-bold text-white block">Total a pagar</span>
            <span className="text-[11px] text-neutral-400 block">Impuestos incluidos</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-[#f00856] tracking-tight">
              {formatCurrencyPrice(finalTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Security & Trust Notice */}
      <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-center gap-2 text-xs text-neutral-400">
        <Lock className="w-3.5 h-3.5 text-emerald-400" />
        <span>Pago encriptado SSL 256-bit seguro</span>
      </div>
    </div>
  );
};

export default ShipmentSummary;
