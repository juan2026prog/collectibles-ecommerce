import React from 'react';
import { Package, Store, CheckCircle2, Info, Sparkles, MapPin, Tag } from 'lucide-react';
import ShippingMethodCard from './ShippingMethodCard';
import { useImageProtection } from '../../hooks/useImageProtection';

export interface PackageCardProps {
  packageIndex: number;
  totalPackages: number;
  storeKey: string;
  vendorName: string;
  vendorLogo?: string | null;
  isOfficialStore?: boolean;
  items: Array<{
    id: string;
    title: string;
    image_url?: string;
    price: number;
    quantity: number;
  }>;
  groupTotal: number;
  freeShippingThreshold: number;
  vendorFreeShippingMin?: number;
  vendorFreeShippingActive?: boolean;
  shippingOptions: Array<{
    id: string;
    name: string;
    available: boolean;
    cost?: number;
    reason?: string;
    show: boolean;
  }>;
  selectedMethodId: string;
  selectedAgency?: any;
  onSelectMethod: (methodId: string) => void;
  onSelectAgency?: (agency: any) => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  packageIndex,
  totalPackages,
  storeKey,
  vendorName,
  vendorLogo,
  isOfficialStore,
  items,
  groupTotal,
  freeShippingThreshold,
  vendorFreeShippingMin = 0,
  vendorFreeShippingActive = false,
  shippingOptions,
  selectedMethodId,
  selectedAgency,
  onSelectMethod,
  onSelectAgency,
}) => {
  const { getImageProps, handleDragStart } = useImageProtection({ isProduct: true });
  const isPlatform = storeKey === 'collectibles' || storeKey === 'platform';
  const isInternational = storeKey === 'international';

  // Calculate free shipping progress for this vendor
  const thresholdToUse = vendorFreeShippingActive && vendorFreeShippingMin > 0 
    ? vendorFreeShippingMin 
    : isPlatform 
    ? freeShippingThreshold 
    : 0;

  const isFreeShippingQualified = thresholdToUse > 0 && groupTotal >= thresholdToUse;
  const amountNeededForFreeShipping = thresholdToUse > 0 && groupTotal < thresholdToUse 
    ? thresholdToUse - groupTotal 
    : 0;
  const progressPercent = thresholdToUse > 0 
    ? Math.min(100, Math.round((groupTotal / thresholdToUse) * 100)) 
    : 100;

  // Selected option cost
  const selectedOption = shippingOptions.find(o => o.id === selectedMethodId);
  const selectedCost = selectedOption?.cost ?? 0;
  const isPickupSelected = selectedMethodId === 'pickup';

  return (
    <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 md:p-6 shadow-xl mb-6 transition-all duration-300">
      {/* Header: Vendor Info & Package Counter */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center overflow-hidden flex-shrink-0">
            {vendorLogo ? (
              <img src={vendorLogo} alt={vendorName} draggable={false} onDragStart={handleDragStart} className="w-full h-full object-cover img-protected" />
            ) : isPlatform ? (
              <Package className="w-5 h-5 text-[#f00856]" />
            ) : (
              <Store className="w-5 h-5 text-neutral-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base md:text-lg text-white tracking-tight">{vendorName}</h3>
              {isOfficialStore && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  OFICIAL
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              Paquete {packageIndex} de {totalPackages} · {items.length} {items.length === 1 ? 'producto' : 'productos'} · Subtotal: <span className="text-white font-semibold">${groupTotal.toLocaleString('es-UY')}</span>
            </p>
          </div>
        </div>

        {/* Selected status summary badge */}
        <div className="flex items-center gap-2">
          {isPickupSelected ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Retiro Gratis
            </span>
          ) : selectedCost === 0 ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Envío Gratis
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
              Envío: ${selectedCost.toLocaleString('es-UY')}
            </span>
          )}
        </div>
      </div>

      {/* Items Preview */}
      <div className="bg-neutral-950/60 rounded-xl p-3 mb-5 border border-neutral-800/60">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 flex-shrink-0 bg-neutral-900/80 p-2 rounded-lg border border-neutral-800">
              <img
                src={item.image_url || '/placeholder.png'}
                alt={item.title}
                {...getImageProps("w-10 h-10 object-cover rounded-md bg-neutral-800")}
              />
              <div className="max-w-[140px] md:max-w-[180px]">
                <p className="text-xs font-medium text-white truncate">{item.title}</p>
                <p className="text-[11px] text-neutral-400">Cant: {item.quantity} · ${item.price.toLocaleString('es-UY')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vendor Free Shipping Progress Banner */}
      {!isInternational && thresholdToUse > 0 && (
        <div className="mb-5 p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
          {isFreeShippingQualified ? (
            <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>¡Genial! Calificás para envío gratis en este paquete</span>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center text-xs md:text-sm font-medium text-neutral-300 mb-1.5">
                <span>Te faltan <strong className="text-[#f00856]">${amountNeededForFreeShipping.toLocaleString('es-UY')}</strong> para envío gratis en {vendorName}</span>
                <span className="text-xs font-bold text-neutral-400">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#f00856] to-emerald-400 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shipping Options Header */}
      <h4 className="text-sm font-bold text-neutral-200 mb-3 uppercase tracking-wider text-[11px]">
        Opciones de envío para este paquete
      </h4>

      {/* List of Shipping Method Cards */}
      <div className="grid grid-cols-1 gap-3">
        {shippingOptions
          .filter(option => option.show)
          .map((option) => {
            const isFree = option.cost === 0 || (isFreeShippingQualified && option.id !== 'pickup');
            
            // Map iconType
            let iconType: 'pickup' | 'truck' | 'express' | 'dac' | 'manual' = 'truck';
            if (option.id === 'pickup') iconType = 'pickup';
            else if (option.id === 'soydelivery') iconType = 'express';
            else if (option.id.startsWith('dac')) iconType = 'dac';
            else if (option.id === 'international_courier_direct') iconType = 'pickup';

            // Map estimated time
            let estimatedTime = '24hs a 72hs hábiles';
            if (option.id === 'pickup') estimatedTime = 'Retiro inmediato en horario de atención';
            else if (option.id === 'soydelivery') estimatedTime = 'Envíos en el día para zonas Flex';
            else if (option.id === 'international_courier_direct') estimatedTime = 'Despacho directo a tu casilla';

            return (
              <ShippingMethodCard
                key={option.id}
                id={option.id}
                name={option.name}
                description={
                  option.id === 'pickup' 
                    ? 'Retirá sin costo en la dirección del vendedor'
                    : option.id === 'soydelivery'
                    ? 'Entrega rápida a domicilio'
                    : option.id === 'dac_home'
                    ? 'DAC directo a la puerta de tu casa u oficina'
                    : option.id === 'dac_agency'
                    ? 'Retiro por la sucursal DAC más cercana'
                    : undefined
                }
                estimatedTime={estimatedTime}
                cost={option.cost ?? 0}
                isFree={isFree}
                isSelected={selectedMethodId === option.id}
                isDisabled={!option.available}
                disabledReason={option.reason}
                badge={
                  isFree && option.id !== 'pickup' 
                    ? 'GRATIS' 
                    : option.id === 'pickup'
                    ? 'GRATIS'
                    : option.id === 'soydelivery'
                    ? 'MÁS RÁPIDO'
                    : undefined
                }
                iconType={iconType}
                onSelect={() => onSelectMethod(option.id)}
              />
            );
          })}
      </div>
    </div>
  );
};

export default PackageCard;
