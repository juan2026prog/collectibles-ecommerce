// supabase/functions/_shared/skypostal/skypostal-mappers.ts

import { SkyPostalAddress, SkyPostalCreateShipmentRequest, SkyPostalPackage } from './skypostal-types.ts';

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
