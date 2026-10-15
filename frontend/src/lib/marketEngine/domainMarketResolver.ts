// frontend/src/lib/marketEngine/domainMarketResolver.ts

/**
 * Domain Market Resolver
 * Centralized, secure domain and host-based market resolution.
 *
 * Security Principles:
 * 1. Explicitly differentiates:
 *    - PRODUCTION_OFFICIAL: Official verified domains (collectibles.uy).
 *    - PREVIEW_AUTHORIZED: Verified Vercel preview environments (*.vercel.app).
 *    - DEVELOPMENT_LOCAL: Localhost and local IP development.
 *    - UNTRUSTED_UNKNOWN: Spoofed, unmapped, or untrusted hostnames.
 * 2. Untrusted hostnames NEVER receive automatic commercial authorization (isAuthorizedHost = false, canCheckout = false).
 * 3. Never trust arbitrary client headers or query parameters as authority for financial transactions.
 * 4. Preserves 100% functionality for collectibles.uy and authorized Vercel previews.
 */

export type HostClassification =
  | 'PRODUCTION_OFFICIAL'
  | 'PREVIEW_AUTHORIZED'
  | 'DEVELOPMENT_LOCAL'
  | 'UNTRUSTED_UNKNOWN';

export interface DomainMapping {
  hostname: string;
  countryCode: string;
  classification: HostClassification;
  notes?: string;
}

export interface DomainResolutionResult {
  hostname: string;
  countryCode: string;
  classification: HostClassification;
  isAuthorizedHost: boolean;
  canCheckoutOnDomain: boolean;
}

export const AUTHORIZED_DOMAIN_MAPPINGS: DomainMapping[] = [
  // Uruguay (Official Production & Local Development)
  { hostname: 'collectibles.uy', countryCode: 'UY', classification: 'PRODUCTION_OFFICIAL', notes: 'Dominio oficial Uruguay' },
  { hostname: 'www.collectibles.uy', countryCode: 'UY', classification: 'PRODUCTION_OFFICIAL', notes: 'Alias www Uruguay' },
  { hostname: 'localhost', countryCode: 'UY', classification: 'DEVELOPMENT_LOCAL', notes: 'Entorno de desarrollo local' },
  { hostname: '127.0.0.1', countryCode: 'UY', classification: 'DEVELOPMENT_LOCAL', notes: 'Entorno de desarrollo IP loopback' },

  // Argentina (Arquitectónicamente previsto, NO activo comercialmente hasta certificación Deblex/DNS)
  { hostname: 'collectibles.ar', countryCode: 'AR', classification: 'PRODUCTION_OFFICIAL', notes: 'Dominio previsto Argentina (Pendiente certificación/DNS)' },
  { hostname: 'www.collectibles.ar', countryCode: 'AR', classification: 'PRODUCTION_OFFICIAL', notes: 'Alias www Argentina' },
];

/**
 * Normalizes a raw host or hostname string (strips ports, protocols, path and trailing dots).
 */
export function normalizeHostname(rawHost: string | null | undefined): string {
  if (!rawHost || typeof rawHost !== 'string') return '';
  let host = rawHost.trim().toLowerCase();

  // Strip protocol if present
  if (host.startsWith('http://') || host.startsWith('https://')) {
    try {
      const url = new URL(host);
      host = url.hostname;
    } catch {
      host = host.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  // Strip path or query if present
  host = host.split('/')[0].split('?')[0];

  // Strip port if present (e.g., localhost:5173 -> localhost)
  host = host.split(':')[0];

  // Strip trailing dot if present
  if (host.endsWith('.')) {
    host = host.slice(0, -1);
  }

  return host;
}

/**
 * Evaluates host classification with security guarantees.
 */
export function classifyHost(rawHost: string | null | undefined): DomainResolutionResult {
  const host = normalizeHostname(rawHost);

  if (!host) {
    return {
      hostname: '',
      countryCode: 'UY',
      classification: 'UNTRUSTED_UNKNOWN',
      isAuthorizedHost: false,
      canCheckoutOnDomain: false
    };
  }

  const matched = AUTHORIZED_DOMAIN_MAPPINGS.find(m => m.hostname === host);
  if (matched) {
    const isProdOrDev = matched.classification === 'PRODUCTION_OFFICIAL' || matched.classification === 'DEVELOPMENT_LOCAL';
    // Argentina is not authorized for checkout even if domain matches until certified
    const canCheckout = isProdOrDev && matched.countryCode === 'UY';

    return {
      hostname: host,
      countryCode: matched.countryCode,
      classification: matched.classification,
      isAuthorizedHost: true,
      canCheckoutOnDomain: canCheckout
    };
  }

  // Vercel Preview Deployments (e.g. collectibles-ecommerce-*.vercel.app)
  if (host.endsWith('.vercel.app')) {
    return {
      hostname: host,
      countryCode: 'UY',
      classification: 'PREVIEW_AUTHORIZED',
      isAuthorizedHost: true,
      canCheckoutOnDomain: true // Enabled for QA preview of Uruguay
    };
  }

  // Hostnames desconocidos o no autorizados:
  // Se asigna país UY como contenido informativo estático pero NO se otorga autorización comercial
  return {
    hostname: host,
    countryCode: 'UY',
    classification: 'UNTRUSTED_UNKNOWN',
    isAuthorizedHost: false,
    canCheckoutOnDomain: false
  };
}

/**
 * Resolves country code based on hostname.
 */
export function resolveCountryFromHostname(rawHost: string | null | undefined): string {
  return classifyHost(rawHost).countryCode;
}
