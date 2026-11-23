// frontend/src/lib/argentina/suiteConfig.ts
/**
 * Single Central Miami Suite Configuration for Collectibles Argentina + Deblex
 * 
 * CORE PRINCIPLE:
 * All purchases for Argentina go through the SINGLE central Pixel & Codes / Deblex suite in Miami.
 * Buyers do NOT have personal suites, do NOT configure US addresses, and do NOT need courier credentials.
 * Separation of packages is handled strictly by recipient document (CUIT/CUIL), order number and tracking.
 * 
 * DIRECCIÓN REAL CONFIRMADA POR DEBLEX / PROPIETARIO:
 * Destinatario de la suite: Juan Castillo Deblex
 * Calle: 2301 NW 107th AVE
 * Suite: Ste #102 DAR101334
 * Ciudad: Doral
 * Estado: Florida
 * ZIP: 33172-2177
 * País: Estados Unidos
 */

import { MiamiCentralSuiteConfig } from './types';

export const PIXEL_CODES_MIAMI_SUITE: MiamiCentralSuiteConfig = {
  company_name: 'Juan Castillo Deblex',
  suite_code: 'Ste #102 DAR101334',
  address_line_1: '2301 NW 107th AVE',
  address_line_2: 'Ste #102 DAR101334',
  city: 'Doral',
  state: 'FL',
  zip_code: '33172-2177',
  phone: '3055928880',
  country: 'United States',
  operator_name: 'Pixel & Codes LLC',
  courier_partner: 'Deblex',
};

/**
 * Returns formatted shipping address for Amazon/Zinc orders destined for Argentina.
 * Recipient name includes reference tags if accepted by vendor.
 */
export function buildMiamiFulfillmentAddress(recipientFullName: string, cuitClean?: string) {
  const reference = cuitClean ? ` - CUIT ${cuitClean}` : '';
  return {
    firstName: 'Juan Castillo',
    lastName: `Deblex (${recipientFullName}${reference})`,
    addressLine1: PIXEL_CODES_MIAMI_SUITE.address_line_1,
    addressLine2: PIXEL_CODES_MIAMI_SUITE.address_line_2,
    city: PIXEL_CODES_MIAMI_SUITE.city,
    state: PIXEL_CODES_MIAMI_SUITE.state,
    zipCode: PIXEL_CODES_MIAMI_SUITE.zip_code,
    country: 'US',
    phoneNumber: PIXEL_CODES_MIAMI_SUITE.phone,
  };
}
