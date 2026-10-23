import React, { useState } from 'react';
import { ShoppingBag, Truck, CreditCard, ShieldCheck, AlertCircle, Info, LockKeyhole, PackageCheck } from 'lucide-react';
import { validateArgentineTaxId } from '../../lib/argentina/taxIdValidator';
import { resolveArgentinaZone, calculateDeblexShipping, DEFAULT_DEBLEX_TARIFFS } from '../../lib/argentina/pricingEngine';
import { ArgentinaShipmentZone, DeblexTariffConfig } from '../../lib/argentina/types';

export interface ArgentinaCheckoutItem {
  id: string;
  title: string;
  image?: string;
  price_usd: number;
  weight_kg: number;
  quantity: number;
  species_category?: string;
}
interface ArgentinaCheckoutFlowProps {
  items: ArgentinaCheckoutItem[];
  onCompleteOrder: (orderPayload: any) => Promise<{ success: boolean; orderId?: string; error?: string }>;
  isLiveCheckoutEnabled?: boolean;
  tariffs?: DeblexTariffConfig;
}

const money = (n: number) => 'USD ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-400';
const fieldLabel = 'mb-1.5 block text-xs font-medium text-slate-300';

export const ArgentinaCheckoutFlow: React.FC<ArgentinaCheckoutFlowProps> = ({
  items, tariffs = DEFAULT_DEBLEX_TARIFFS,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [docType, setDocType] = useState<'CUIT' | 'CUIL' | 'CDI' | 'PASAPORTE'>('CUIL');
  const [docNumber, setDocNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('Ciudad Autónoma de Buenos Aires');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [floorApt, setFloorApt] = useState('');
  const [quotaDeclared, setQuotaDeclared] = useState(false);
  const [personalUseAccepted, setPersonalUseAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [vatRate, setVatRate] = useState<21 | 10.5>(21);

  const totalFobUsd = Number(items.reduce((s, p) => s + p.price_usd * p.quantity, 0).toFixed(2));
  const totalWeightKg = Number(items.reduce((s, p) => s + p.weight_kg * p.quantity, 0).toFixed(3));
  const hasInvalidItems = items.length === 0 || items.some(p =>
    !Number.isFinite(p.price_usd) || p.price_usd <= 0 ||
    !Number.isFinite(p.weight_kg) || p.weight_kg <= 0 ||
    !Number.isInteger(p.quantity) || p.quantity <= 0
  );
  // Species must be classified accurately: a generic category alone is not an identification of species.
  const speciesCounts = new Map<string, number>();
  items.forEach(p => {
    const key = (p.species_category || '').trim().toLowerCase();
    if (key) speciesCounts.set(key, (speciesCounts.get(key) || 0) + p.quantity);
  });
  const needsSpeciesReview = items.some(p => !p.species_category?.trim());
  const exceedsSpecies = [...speciesCounts.values()].some(n => n > tariffs.max_units_per_species_modalidad_a);
  const exceedsFob = totalFobUsd > tariffs.max_fob_modalidad_a;
  const exceedsWeight = totalWeightKg > tariffs.max_weight_modalidad_a_kg;
  const zone: ArgentinaShipmentZone = resolveArgentinaZone(province, city, postalCode);
  const logistics = calculateDeblexShipping(totalWeightKg, zone, tariffs);
  const customsBase = Number((totalFobUsd + logistics.freight_usd).toFixed(2));
  // Illustrative only. Actual VAT is determined by Deblex/ARCA, including customs valuation and applicable rates.
  const estimatedVat = Number((customsBase * vatRate / 100).toFixed(2));
  const indicativeTotal = Number((totalFobUsd + logistics.total_logistics_usd + estimatedVat).toFixed(2));
  const taxId = validateArgentineTaxId(docNumber, docType);
  const dataReady = !!(firstName.trim() && lastName.trim() && email.includes('@') && phone.trim() &&
    taxId.is_valid_format && city.trim() && postalCode.trim() && street.trim() && streetNumber.trim());
  const field = (label: string, value: string, setter: (s: string) => void, placeholder = '', type = 'text') => (
    <label className="block"><span className={fieldLabel}>{label}</span><input className={inputClass} type={type}
      placeholder={placeholder} value={value} onChange={e => setter(e.target.value)} /></label>
  );
  const amountRow = (label: string, value: string, extraClass = '') => (
    <div className={'flex items-center justify-between gap-3 py-1.5 text-sm ' + extraClass}>
      <span className="text-slate-400">{label}</span><span className="font-semibold text-white tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-1 pb-10 text-slate-100">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-5">
        <div>
          <div className="mb-1 flex items-center gap-2 text-amber-400"><ShoppingBag size={18}/><span className="text-xs font-semibold uppercase tracking-wider">Collectibles Argentina</span></div>
          <h1 className="text-2xl font-bold text-white">Finalizar compra</h1>
          <p className="mt-1 text-sm text-slate-400">Completá tus datos y revisá el costo de importación.</p>
        </div>
        <span className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1.5 text-xs font-medium text-sky-200">Vista previa · Pagos desactivados</span>
      </div>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)] xl:gap-10">
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold"><span className="text-amber-400">01</span> Información de contacto</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('Nombre *', firstName, setFirstName, 'Nombre')}
              {field('Apellido *', lastName, setLastName, 'Apellido')}
              {field('Correo electrónico *', email, setEmail, 'correo@ejemplo.com', 'email')}
              {field('Teléfono *', phone, setPhone, '+54 11 ...', 'tel')}
              <label className="block"><span className={fieldLabel}>Tipo de identificación</span>
                <select className={inputClass} value={docType} onChange={e => {setDocType(e.target.value as typeof docType);setDocNumber('');}}>
                  <option value="CUIL">CUIL</option><option value="CUIT">CUIT</option><option value="CDI">CDI</option><option value="PASAPORTE">Pasaporte</option>
                </select>
              </label>
              <div>{field('Número de documento *', docNumber, setDocNumber, '20-12345678-9')}
                {docNumber.length > 5 && !taxId.is_valid_format && <p className="mt-1 text-xs text-red-300">{taxId.error}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold"><span className="text-amber-400">02</span> Dirección de entrega</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className={fieldLabel}>Provincia *</span>
                <select value={province} onChange={e => setProvince(e.target.value)} className={inputClass}>
                  {['Ciudad Autónoma de Buenos Aires','Buenos Aires','Córdoba','Santa Fe','Mendoza','Entre Ríos','Tucumán','Otras Provincias'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              {field('Localidad / partido *', city, setCity, 'Localidad')}
              {field('Código postal *', postalCode, setPostalCode, 'C1425')}
              {field('Calle *', street, setStreet, 'Nombre de calle')}
              {field('Número *', streetNumber, setStreetNumber, '1234')}
              {field('Piso / departamento', floorApt, setFloorApt, 'Opcional')}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-900 bg-sky-950/40 p-3 text-xs text-sky-200">
              <Info size={15} className="mt-0.5 shrink-0"/><span>Zona estimada: <strong>{zone === 'INTERIOR' ? 'Interior' : zone}</strong>. La cobertura y el código postal requieren confirmación de Deblex antes de cobrar.</span>
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><span className="text-amber-400">03</span> Importación con Deblex</h2>
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <Truck className="shrink-0 text-amber-400" size={21}/>
              <div><p className="text-sm font-semibold">Pequeño Envío · Hasta USD 400 FOB</p><p className="text-xs text-slate-400">Hasta 50 kg por envío · Hasta 3 unidades de una misma especie · 5 envíos anuales por persona</p></div>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 accent-amber-400" checked={personalUseAccepted} onChange={e => setPersonalUseAccepted(e.target.checked)}/><span>Declaro que los productos son para uso personal y no tienen finalidad comercial.</span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 accent-amber-400" checked={quotaDeclared} onChange={e => setQuotaDeclared(e.target.checked)}/><span>Declaro que cuento con cupo disponible dentro de los 5 envíos anuales. El cupo oficial deberá verificarse.</span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 accent-amber-400" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}/><span>Acepto las condiciones de compra, importación y privacidad aplicables.</span></label>
            </div>
            <p className="mt-4 text-xs text-slate-400">Plazo orientativo Deblex: 4 a 7 días hábiles desde la recepción en depósito, sujeto a confirmación. Los envíos reales todavía no están habilitados.</p>
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/20">
            <div className="border-b border-slate-700 p-5"><h2 className="flex items-center gap-2 text-lg font-semibold"><PackageCheck size={20} className="text-amber-400"/> Tu pedido</h2><p className="mt-1 text-xs text-slate-400">Detalle de productos y costos estimados</p></div>
            <div className="max-h-64 space-y-3 overflow-y-auto p-5">
              {items.map(p => <div key={p.id} className="flex gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">{p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-contain"/> : <ShoppingBag size={20} className="text-slate-500"/>}</div>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-snug">{p.title}</p><p className="mt-1 text-xs text-slate-400">Cantidad {p.quantity} · {(p.weight_kg*p.quantity).toFixed(2)} kg</p></div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.price_usd*p.quantity)}</span>
              </div>)}
            </div>
            <div className="space-y-1 border-t border-slate-700 px-5 py-4">
              {amountRow('Productos (FOB)', money(totalFobUsd))}
              {amountRow('Flete internacional · 19 USD/kg', money(logistics.freight_usd))}
              {amountRow('Logistic Pack fijo · ' + zone, money(logistics.logistic_pack_usd))}
              <div className="my-2 border-t border-slate-800"/>
              {amountRow('Base CIF simplificada (orientativa)', money(customsBase))}
              <label className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-slate-400">IVA de importación (estimado)</span><select className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" value={vatRate} onChange={e=>setVatRate(Number(e.target.value) as 21 | 10.5)}><option value={21}>21%</option><option value={10.5}>10,5%</option></select><strong className="tabular-nums">{money(estimatedVat)}</strong></label>
              {amountRow('Derechos y tasa estadística (franquicia)', 'USD 0,00')}
            </div>
            <div className="border-t border-slate-700 bg-slate-950/70 p-5">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold">Total orientativo</span><strong className="text-2xl font-bold text-amber-400 tabular-nums">{money(indicativeTotal)}</strong></div>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">El IVA es una estimación sobre FOB + flete, sin seguro ni ajustes aduaneros. La tasa aplicable y liquidación definitiva requieren validación de Deblex. No es un importe final garantizado.</p>
              {(exceedsWeight || exceedsFob || exceedsSpecies || needsSpeciesReview || hasInvalidItems) && <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-200"><AlertCircle size={16} className="shrink-0"/><span>{hasInvalidItems ? 'Faltan datos válidos de producto o peso.' : exceedsWeight ? 'Tu envío supera el límite de 50 kg permitido por Deblex.' : exceedsFob ? 'Supera USD 400 FOB. Requiere cotización especial; modalidad B no habilitada.' : needsSpeciesReview ? 'Falta clasificar la especie de un producto.' : 'Supera las 3 unidades de una misma especie.'}</span></div>}
              {!dataReady && <p className="mb-3 text-xs text-slate-400">Completá tus datos a la izquierda para revisar toda la información.</p>}
              <div className="mb-3 flex items-center gap-2 text-xs text-sky-300"><LockKeyhole size={15}/> Esperando integración con dLocal Go</div>
              <button type="button" disabled aria-disabled="true" className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3.5 text-sm font-bold text-slate-950 opacity-60"><CreditCard size={17}/> Pagar con dLocal Go — Próximamente</button>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-400"><ShieldCheck size={15} className="shrink-0 text-slate-500"/> No se generan cobros, pedidos reales, envíos ni consumos de franquicia desde esta pantalla.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
