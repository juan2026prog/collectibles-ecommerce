// supabase/functions/_shared/skypostal/skypostal-mappers.ts

import {
  SkyPostalAddress,
  SkyPostalCreateShipmentRequest,
  SkyPostalPackage,
  Leg2SkyPostalStatus,
  ActionRequiredType,
  SkyPostalErrorClassification
} from './skypostal-types.ts';

export function mapCollectiblesAddressToSkyPostal(
  shippingAddress: any,
  customerName?: string,
  customerPhone?: string
): SkyPostalAddress {
  let firstName = shippingAddress.first_name || '';
  let lastName = shippingAddress.last_name || '';

  if (!firstName && customerName) {
    const parts = customerName.trim().split(' ');
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }

  const street = shippingAddress.street || shippingAddress.address || '';
  const streetNumber = shippingAddress.street_number || shippingAddress.number || '';
  const apartment = shippingAddress.apartment || shippingAddress.unit || '';
  const city = shippingAddress.city || '';
  const stateOrDepartment = shippingAddress.department || shippingAddress.state || shippingAddress.province || '';
  const postalCode = shippingAddress.postal_code || shippingAddress.zip || '';
  const countryCode = (shippingAddress.country_code || shippingAddress.country || 'CL').toUpperCase();
  const phone = customerPhone || shippingAddress.phone || '';
  const email = shippingAddress.email || '';
  const taxId = shippingAddress.rut || shippingAddress.cpf || shippingAddress.dni || shippingAddress.rfc || shippingAddress.ci || '';

  return {
    firstName,
    lastName,
    street,
    streetNumber,
    apartment,
    city,
    stateOrDepartment,
    postalCode,
    countryCode,
    phone,
    email,
    taxIdOrNationalId: taxId
  };
}

export function buildSkyPostalShipmentRequest(
  orderId: string,
  suborderId: string | undefined,
  shippingAddress: any,
  weightKg: number,
  quantity: number,
  declaredValueUsd: number = 50.0,
  observations?: string,
  recipientInfo?: { name: string; phone: string }
): SkyPostalCreateShipmentRequest {
  const recipient = mapCollectiblesAddressToSkyPostal(
    shippingAddress,
    recipientInfo?.name,
    recipientInfo?.phone
  );

  const pkg: SkyPostalPackage = {
    weightKg: Math.max(0.1, Number(weightKg) || 1.0),
    declaredValueUsd: Math.max(1.0, declaredValueUsd),
    items: [
      {
        description: observations ? observations.slice(0, 100) : `Collectibles Order ${orderId}`,
        quantity: Math.max(1, quantity),
        unitValue: declaredValueUsd / Math.max(1, quantity),
        totalValue: declaredValueUsd,
        weightKg: Math.max(0.1, Number(weightKg) || 1.0)
      }
    ]
  };

  return {
    orderId,
    suborderId,
    idempotencyKey: `skypostal_${suborderId || orderId}`,
    recipientAddress: recipient,
    package: pkg,
    instructions: observations
  };
}

/**
 * Normalizes SkyPostal tracking event codes and statuses into standard Collectibles status and action required.
 */
export function normalizeSkyPostalTrackingStatus(statusOrCode: string): {
  normalizedStatus: Leg2SkyPostalStatus;
  actionRequired: ActionRequiredType;
  description: string;
} {
  const code = (statusOrCode || '').toUpperCase().trim();

  switch (code) {
    case 'CREATED':
    case 'LABEL_CREATED':
    case 'MANIFEST_GENERATED':
    case 'REGISTERED':
      return {
        normalizedStatus: 'SHIPMENT_CREATED',
        actionRequired: 'NONE',
        description: 'Envío internacional registrado en SkyPostal.'
      };

    case 'MANIFESTED':
    case 'MANIFEST_DISPATCHED':
      return {
        normalizedStatus: 'MANIFESTED',
        actionRequired: 'NONE',
        description: 'Paquete manifestado y despachado desde Miami Hub.'
      };

    case 'RECEIVED_MIAMI':
    case 'DEPARTED_MIAMI':
    case 'IN_TRANSIT':
    case 'TRANSIT':
    case 'FLIGHT_DEPARTED':
    case 'ARRIVED_DESTINATION_AIRPORT':
      return {
        normalizedStatus: 'IN_TRANSIT',
        actionRequired: 'NONE',
        description: 'Paquete en tránsito aéreo internacional hacia el país de destino.'
      };

    case 'CUSTOMS_RECEIVED':
    case 'CUSTOMS_PROCESSING':
    case 'IN_CUSTOMS':
    case 'ADUANA_INGRESO':
      return {
        normalizedStatus: 'CUSTOMS',
        actionRequired: 'NONE',
        description: 'Envío en proceso de revisión y desaduanamiento.'
      };

    case 'CUSTOMS_CLEARED':
    case 'ADUANA_LIBERADO':
      return {
        normalizedStatus: 'CUSTOMS',
        actionRequired: 'NONE',
        description: 'Despacho aduanero completado con éxito.'
      };

    case 'OUT_FOR_DELIVERY':
    case 'ON_ROUTE':
    case 'EN_REPARTO':
      return {
        normalizedStatus: 'OUT_FOR_DELIVERY',
        actionRequired: 'NONE',
        description: 'En reparto de última milla hacia el domicilio de entrega.'
      };

    case 'DELIVERED':
    case 'ENTREGADO':
      return {
        normalizedStatus: 'DELIVERED',
        actionRequired: 'NONE',
        description: 'Paquete entregado al destinatario.'
      };

    case 'MISSING_DOCUMENT':
    case 'RUT_REQUIRED':
    case 'DNI_REQUIRED':
    case 'TAX_ID_REQUIRED':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'DOCUMENT_REQUIRED',
        description: 'Se requiere documento de identidad (RUT/DNI/CPF/Cédula) para liberación aduanera.'
      };

    case 'CUSTOMS_HOLD':
    case 'CUSTOMS_INVOICE_REQUIRED':
    case 'CUSTOMS_INFO_REQUIRED':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'CUSTOMS_INFORMATION_REQUIRED',
        description: 'Aduana solicita información comercial o comprobante de compra adicional.'
      };

    case 'ADDRESS_NOT_FOUND':
    case 'INCOMPLETE_ADDRESS':
    case 'BAD_ADDRESS':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'ADDRESS_CORRECTION_REQUIRED',
        description: 'Dirección incompleta o no localizada. Se requiere corrección de domicilio.'
      };

    case 'PAYMENT_REQUIRED':
    case 'DUTIES_PENDING':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'PAYMENT_REQUIRED',
        description: 'Pago de aranceles o tasas aduaneras pendiente.'
      };

    case 'EXCEPTION':
    case 'MANUAL_REVIEW':
    case 'HOLD':
    default:
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'MANUAL_REVIEW',
        description: 'Incidencia operativa o aduanera en revisión.'
      };
  }
}

/**
 * Authoritative error classification for retry / dead-letter policy
 */
export function classifySkyPostalError(error: any): SkyPostalErrorClassification {
  const msg = (error?.message || String(error)).toLowerCase();
  const code = Number(error?.statusCode || error?.status || error?.code);

  // Network / timeout / 5xx -> Retryable
  if (
    msg.includes('timeout') ||
    msg.includes('econnaborted') ||
    msg.includes('econnreset') ||
    msg.includes('network') ||
    code === 408 ||
    code === 429 ||
    (code >= 500 && code <= 599)
  ) {
    return 'RETRYABLE';
  }

  // Missing documents / address issues -> Manual review
  if (
    msg.includes('document') ||
    msg.includes('rut') ||
    msg.includes('dni') ||
    msg.includes('tax id') ||
    msg.includes('address') ||
    msg.includes('postal code') ||
    msg.includes('manual_review')
  ) {
    return 'MANUAL_REVIEW';
  }

  // 4xx validation or prohibited items -> Non-retryable
  return 'NON_RETRYABLE';
}
