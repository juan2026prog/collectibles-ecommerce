import React, { useState } from 'react';
import { ShoppingBag, Truck, CreditCard, ShieldCheck, AlertCircle, ArrowRight, ArrowLeft, CheckCircle2, Info } from 'lucide-react';
import { validateArgentineTaxId, formatCUIT } from '../../lib/argentina/taxIdValidator';
import { resolveArgentinaZone, calculateDeblexShipping } from '../../lib/argentina/pricingEngine';
import { ArgentinaShipmentZone } from '../../lib/argentina/types';

export interface ArgentinaCheckoutItem {
  id: string;
  title: string;
  image?: string;
  price_usd: number;
  weight_kg: number;
  quantity: number;
}

interface ArgentinaCheckoutFlowProps {
  items: ArgentinaCheckoutItem[];
  onCompleteOrder: (orderPayload: any) => Promise<{ success: boolean; orderId?: string; error?: string }>;
  isLiveCheckoutEnabled?: boolean; // Must be false until certified
}

export const ArgentinaCheckoutFlow: React.FC<ArgentinaCheckoutFlowProps> = ({
  items,
  onCompleteOrder,
  isLiveCheckoutEnabled = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 2 form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [docType, setDocType] = useState<'CUIT' | 'CUIL' | 'CDI' | 'PASAPORTE'>('CUIT');
  const [docNumber, setDocNumber] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [floorApt, setFloorApt] = useState('');
  const [province, setProvince] = useState('Buenos Aires');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 3 acceptance
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calculations
  const totalFobUsd = items.reduce((sum, item) => sum + item.price_usd * item.quantity, 0);
  const totalWeightKg = items.reduce((sum, item) => sum + item.weight_kg * item.quantity, 0);

  const zone: ArgentinaShipmentZone = resolveArgentinaZone(province, city, postalCode);
  const shippingCalculation = calculateDeblexShipping(totalWeightKg, zone);

  // Estimated taxes under Modalidad A (Deseable / Estimado informativo; 0 arancel franquicia, IVA estimado)
  const estimatedTaxUsd = 0; // Franquicia Modalidad A exempts import duty and statistical fee up to USD 400
  const finalTotalUsd = totalFobUsd + shippingCalculation.total_logistics_usd + estimatedTaxUsd;

  // Validation
  const taxIdValidation = validateArgentineTaxId(docNumber, docType);
  const isStep2Valid =
    firstName.trim().length > 1 &&
    lastName.trim().length > 1 &&
    taxIdValidation.is_valid_format &&
    street.trim().length > 2 &&
    streetNumber.trim().length > 0 &&
    city.trim().length > 1 &&
    postalCode.trim().length >= 4 &&
    email.includes('@');

  const handleNextToStep2 = () => {
    if (totalFobUsd > 400.0) {
      setErrorMessage('El valor FOB total supera USD 400.00 (límite de Modalidad A). Se requiere cotización especial.');
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleNextToStep3 = () => {
    if (!isStep2Valid) {
      setErrorMessage('Por favor completá todos los campos requeridos y verificá tu CUIT/documento.');
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  const handleSubmitOrder = async () => {
    if (!termsAccepted) {
      setErrorMessage('Debés aceptar los términos y condiciones aduaneros para continuar.');
      return;
    }

    if (!isLiveCheckoutEnabled) {
      setErrorMessage('El mercado de Argentina se encuentra en fase de certificación y validación operativa. El checkout público está desactivado temporalmente para compras reales.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const orderPayload = {
        market: 'AR',
        currency: 'USD',
        fob_subtotal_usd: totalFobUsd,
        shipping_cost_usd: shippingCalculation.total_logistics_usd,
        freight_usd: shippingCalculation.freight_usd,
        logistic_pack_usd: shippingCalculation.logistic_pack_usd,
        total_usd: finalTotalUsd,
        destination_zone: zone,
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          document_type: docType,
          document_number: taxIdValidation.clean_number,
          street: `${street} ${streetNumber} ${floorApt}`.trim(),
          city,
          province,
          postal_code: postalCode,
          country: 'Argentina',
          phone,
          email,
        },
        items,
      };

      const result = await onCompleteOrder(orderPayload);
      if (!result.success) {
        setErrorMessage(result.error || 'Error al procesar la orden');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header and Stepper */}
      <div className="pb-4 border-b border-gray-700/60 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            Checkout Collectibles Argentina
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Pago único transparente (Producto + Flete Internacional USD 19/kg + Logistic Pack único)
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className={`px-2.5 py-1 rounded-full ${step === 1 ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-800 text-gray-400'}`}>
            1. Pedido
          </span>
          <span className="text-gray-600">→</span>
          <span className={`px-2.5 py-1 rounded-full ${step === 2 ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-800 text-gray-400'}`}>
            2. Entrega
          </span>
          <span className="text-gray-600">→</span>
          <span className={`px-2.5 py-1 rounded-full ${step === 3 ? 'bg-amber-500 text-gray-950 font-bold' : 'bg-gray-800 text-gray-400'}`}>
            3. Pago
          </span>
        </div>
      </div>

      {!isLiveCheckoutEnabled && (
        <div className="p-3.5 bg-sky-950/40 border border-sky-800/80 rounded-xl text-sky-200 text-xs flex items-center gap-3">
          <Info className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            <strong>Modo Simulación / Certificación:</strong> Este checkout implementa la estructura completa de precios y validaciones del Bloque 2, pero las compras reales en Amazon se encuentran desactivadas hasta la validación de pagos en producción.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Step 1: Tu Pedido */}
      {step === 1 && (
        <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Paso 1: Detalle de tu Pedido</h2>

          <div className="divide-y divide-gray-700/40">
            {items.map(item => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center shrink-0 border border-gray-700/60 overflow-hidden">
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="w-full h-full object-contain" />
                    ) : (
                      <ShoppingBag className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">{item.title}</h4>
                    <span className="text-xs text-gray-400">
                      Cant: {item.quantity} | Peso est.: {(item.weight_kg * item.quantity).toFixed(2)} kg
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-white block">
                    USD {(item.price_usd * item.quantity).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-gray-400">FOB</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-gray-700/60 flex items-center justify-between text-sm">
            <span className="text-gray-400">Subtotal FOB Estimado:</span>
            <span className="font-bold text-white">USD {totalFobUsd.toFixed(2)}</span>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleNextToStep2}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-lg flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              Continuar a Entrega y Costos
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Entrega y Costos */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Paso 2: Domicilio de Entrega en Argentina</h2>
            <p className="text-xs text-gray-400">
              Ingresá tu domicilio argentino y CUIT para la identificación aduanera. No necesitás casilla en Miami.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Nombre</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Juan"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Apellido</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Pérez"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Tipo de Documento</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value as any)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="CUIT">CUIT (Clave Única de Identificación Tributaria)</option>
                  <option value="CUIL">CUIL (Código Único de Identificación Laboral)</option>
                  <option value="CDI">CDI (Clave de Identificación)</option>
                  <option value="PASAPORTE">Pasaporte (Extranjeros)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Número de Documento</label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={e => setDocNumber(e.target.value)}
                  placeholder="20-12345678-9"
                  className={`w-full bg-gray-900 border rounded-lg p-2 text-white focus:outline-none ${
                    docNumber.length > 5 && !taxIdValidation.is_valid_format
                      ? 'border-red-500'
                      : 'border-gray-700 focus:border-amber-500'
                  }`}
                />
                {docNumber.length > 5 && !taxIdValidation.is_valid_format && (
                  <span className="text-[10px] text-red-400 mt-0.5 block">{taxIdValidation.error}</span>
                )}
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Provincia</label>
                <select
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Ciudad Autónoma de Buenos Aires">Ciudad Autónoma de Buenos Aires (CABA)</option>
                  <option value="Buenos Aires">Buenos Aires (GBA / Interior)</option>
                  <option value="Córdoba">Córdoba</option>
                  <option value="Santa Fe">Santa Fe</option>
                  <option value="Mendoza">Mendoza</option>
                  <option value="Entre Ríos">Entre Ríos</option>
                  <option value="Tucumán">Tucumán</option>
                  <option value="Otras Provincias">Otras Provincias (Interior)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Localidad / Partido</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="Ej: Palermo / San Isidro / Rosario"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Calle y Altura</label>
                <input
                  type="text"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  placeholder="Av. Santa Fe 1234"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Piso / Depto (Opcional)</label>
                <input
                  type="text"
                  value={floorApt}
                  onChange={e => setFloorApt(e.target.value)}
                  placeholder="4to B"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Código Postal</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value)}
                  placeholder="C1425"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Email de Notificaciones</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-3 text-xs">
            <span className="text-sm font-semibold text-white block">Desglose de Costos Logísticos</span>

            <div className="space-y-1.5 text-gray-300">
              <div className="flex justify-between">
                <span>Valor FOB Productos:</span>
                <span className="font-mono text-white">USD {totalFobUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Flete Internacional ({totalWeightKg.toFixed(2)} kg × USD 19):</span>
                <span className="font-mono text-white">USD {shippingCalculation.freight_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Logistic Pack Único (Zona {zone}):</span>
                <span className="font-mono text-white">USD {shippingCalculation.logistic_pack_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Aranceles Aduaneros (Franquicia Modalidad A):</span>
                <span className="font-mono text-emerald-400">EXENTO</span>
              </div>
              <div className="pt-2 border-t border-gray-700/60 flex justify-between font-bold text-sm text-white">
                <span>Total a Pagar:</span>
                <span className="text-amber-400">USD {finalTotalUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al Pedido
            </button>
            <button
              onClick={handleNextToStep3}
              disabled={!isStep2Valid}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              Continuar al Pago
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Pago y Confirmación */}
      {step === 3 && (
        <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 space-y-4 text-xs">
          <h2 className="text-sm font-semibold text-white">Paso 3: Pago y Declaración Aduanera</h2>

          <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-700/40 space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-white">
              <span>Importe Total Consolidado:</span>
              <span className="text-amber-400 text-base">USD {finalTotalUsd.toFixed(2)}</span>
            </div>
            <p className="text-gray-400 text-[11px]">
              Destino: {street} {streetNumber}, {city}, {province} ({zone}) — Destinatario: {firstName} {lastName} ({docType} {formatCUIT(taxIdValidation.clean_number)})
            </p>
          </div>

          <div className="p-3 bg-gray-900/40 border border-gray-700/50 rounded-lg space-y-2 text-gray-300">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 text-amber-500 focus:ring-amber-500 mt-0.5"
              />
              <span className="text-[11px]">
                Declaro bajo juramento que los bienes adquiridos son para uso personal y sin fin comercial (Régimen de Pequeño Envío bajo Modalidad A de ARCA/Aduana), y autorizo a Pixel & Codes y Deblex a realizar las gestiones logísticas y aduaneras correspondientes en mi nombre.
              </span>
            </label>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Modificar Domicilio
            </button>
            <button
              onClick={handleSubmitOrder}
              disabled={!termsAccepted || submitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Confirmando...' : 'Confirmar y Pagar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
