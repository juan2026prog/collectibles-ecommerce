// frontend/src/lib/argentina/suiteConfig.ts
/**
 * Single Central Miami Suite Configuration for Collectibles Argentina + Deblex
 * 
 * CORE PRINCIPLE:
 * All purchases for Argentina go through the SINGLE central Pixel & Codes suite in Miami.
 * Buyers do NOT have personal suites, do NOT configure US addresses, and do NOT need courier credentials.
 * Separation of packages is handled strictly by recipient document (CUIT/CUIL), order number and tracking.
 */

import { MiamiCentralSuiteConfig } from './types';

export const PIXEL_CODES_MIAMI_SUITE: MiamiCentralSuiteConfig = {
  company_name: 'Pixel & Codes LLC',
  suite_code: 'DEBLEX-AR-CENTRAL',
  address_line_1: '8400 NW 25th St',
  address_line_2: 'Suite AR-CENTRAL (Pixel & Codes / Deblex)',
  city: 'Doral',
  state: 'FL',
  zip_code: '33122',
  phone: '3055928880',
  country: 'United States',
  operator_name: 'Pixel & Codes',
  courier_partner: 'Deblex',
};

/**
 * Returns formatted shipping address for Amazon/Zinc orders destined for Argentina.
 * Recipient name includes reference tags if accepted by vendor.
 */
export function buildMiamiFulfillmentAddress(recipientFullName: string, cuitClean?: string) {
  const reference = cuitClean ? ` - CUIT ${cuitClean}` : '';
  return {
    firstName: recipientFullName,
    lastName: '(Pixel&Codes)',
    addressLine1: PIXEL_CODES_MIAMI_SUITE.address_line_1,
    addressLine2: `${PIXEL_CODES_MIAMI_SUITE.address_line_2}${reference}`,
    city: PIXEL_CODES_MIAMI_SUITE.city,
    state: PIXEL_CODES_MIAMI_SUITE.state,
    zipCode: PIXEL_CODES_MIAMI_SUITE.zip_code,
    country: 'US',
    phoneNumber: PIXEL_CODES_MIAMI_SUITE.phone,
  };
}
