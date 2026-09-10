import type { 
  CountryCode, 
  CountryConfig, 
  CountryImportRules, 
  CountryMarketplaceConfig, 
  CountryReadinessIndicator,
  CountryStatus 
} from '../../types/sourcingLatam';
import { supabase } from '../../lib/supabase';

// Baseline local cache of configurations
const DEFAULT_COUNTRIES: Record<CountryCode, CountryConfig> = {
  UY: { country_code: 'UY', country_name: 'Uruguay', currency: 'UYU', locale: 'es-UY', timezone: 'America/Montevideo', enabled: true, sourcing_enabled: true, publication_enabled: true, readiness_score: 100 },
  AR: { country_code: 'AR', country_name: 'Argentina', currency: 'ARS', locale: 'es-AR', timezone: 'America/Argentina/Buenos_Aires', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 40 },
  CL: { country_code: 'CL', country_name: 'Chile', currency: 'CLP', locale: 'es-CL', timezone: 'America/Santiago', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 45 },
  BR: { country_code: 'BR', country_name: 'Brasil', currency: 'BRL', locale: 'pt-BR', timezone: 'America/Sao_Paulo', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 35 },
  PE: { country_code: 'PE', country_name: 'Perú', currency: 'PEN', locale: 'es-PE', timezone: 'America/Lima', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 30 },
  CO: { country_code: 'CO', country_name: 'Colombia', currency: 'COP', locale: 'es-CO', timezone: 'America/Bogota', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 30 },
  MX: { country_code: 'MX', country_name: 'México', currency: 'MXN', locale: 'es-MX', timezone: 'America/Mexico_City', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 35 },
  PY: { country_code: 'PY', country_name: 'Paraguay', currency: 'PYG', locale: 'es-PY', timezone: 'America/Asuncion', enabled: false, sourcing_enabled: false, publication_enabled: false, readiness_score: 25 },
};

const DEFAULT_RULES: Record<CountryCode, CountryImportRules> = {
  UY: { country_code: 'UY', max_franchise_value_usd: 200, max_franchise_weight_lbs: 4.4, max_franchise_shipments_per_year: 3, standard_import_tax_percent: 60, vat_tax_percent: 22, customs_handling_fee_usd: 15, min_target_margin_percent: 15, prohibited_categories: ['combustibles', 'armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues', 'replicas', 'cards', 'merch'] },
  AR: { country_code: 'AR', max_franchise_value_usd: 50, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 50, vat_tax_percent: 21, customs_handling_fee_usd: 10, min_target_margin_percent: 20, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  CL: { country_code: 'CL', max_franchise_value_usd: 41, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 6, vat_tax_percent: 19, customs_handling_fee_usd: 8, min_target_margin_percent: 18, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  BR: { country_code: 'BR', max_franchise_value_usd: 50, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 60, vat_tax_percent: 17, customs_handling_fee_usd: 12, min_target_margin_percent: 25, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  PE: { country_code: 'PE', max_franchise_value_usd: 200, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 0, vat_tax_percent: 18, customs_handling_fee_usd: 10, min_target_margin_percent: 18, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  CO: { country_code: 'CO', max_franchise_value_usd: 200, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 0, vat_tax_percent: 19, customs_handling_fee_usd: 10, min_target_margin_percent: 18, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  MX: { country_code: 'MX', max_franchise_value_usd: 50, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 19, vat_tax_percent: 16, customs_handling_fee_usd: 10, min_target_margin_percent: 18, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] },
  PY: { country_code: 'PY', max_franchise_value_usd: 100, max_franchise_weight_lbs: 11.0, max_franchise_shipments_per_year: 12, standard_import_tax_percent: 10, vat_tax_percent: 10, customs_handling_fee_usd: 8, min_target_margin_percent: 20, prohibited_categories: ['armas'], restricted_categories: ['baterias_litio'], allowed_categories: ['figures', 'statues'] }
};

export class CountryEngine {
  private static instance: CountryEngine;
  private countryCache: Map<CountryCode, CountryConfig> = new Map();
  private rulesCache: Map<CountryCode, CountryImportRules> = new Map();
  private initialized = false;

  private constructor() {
    // Populate defaults
    (Object.keys(DEFAULT_COUNTRIES) as CountryCode[]).forEach(code => {
      this.countryCache.set(code, DEFAULT_COUNTRIES[code]);
      this.rulesCache.set(code, DEFAULT_RULES[code]);
    });
  }

  public static getInstance(): CountryEngine {
    if (!CountryEngine.instance) {
      CountryEngine.instance = new CountryEngine();
    }
    return CountryEngine.instance;
  }

  /**
   * Initializes / syncs configs from database if accessible
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { data: dbCountries } = await supabase
        .from('sourcing_countries')
        .select('*');

      if (dbCountries && dbCountries.length > 0) {
        dbCountries.forEach((c: any) => {
          if (c.country_code in DEFAULT_COUNTRIES) {
            const code = c.country_code as CountryCode;
            this.countryCache.set(code, {
              ...DEFAULT_COUNTRIES[code],
              ...c,
              enabled: c.enabled,
              sourcing_enabled: c.sourcing_enabled,
              publication_enabled: c.publication_enabled,
              readiness_score: c.readiness_score ?? DEFAULT_COUNTRIES[code].readiness_score
            });
          }
        });
      }

      const { data: dbRules } = await supabase
        .from('sourcing_country_rules')
        .select('*');

      if (dbRules && dbRules.length > 0) {
        dbRules.forEach((r: any) => {
          if (r.country_code in DEFAULT_RULES) {
            const code = r.country_code as CountryCode;
            this.rulesCache.set(code, {
              ...DEFAULT_RULES[code],
              ...r
            });
          }
        });
      }
    } catch {
      // Fallback silently to default in-memory configs
    } finally {
      this.initialized = true;
    }
  }

  public getCountryConfig(code: CountryCode): CountryConfig {
    return this.countryCache.get(code) || DEFAULT_COUNTRIES[code];
  }

  public getImportRules(code: CountryCode): CountryImportRules {
    return this.rulesCache.get(code) || DEFAULT_RULES[code];
  }

  public getAllCountries(): CountryConfig[] {
    return Array.from(this.countryCache.values());
  }

  public getEnabledCountries(): CountryConfig[] {
    return Array.from(this.countryCache.values()).filter(c => c.enabled && c.sourcing_enabled);
  }

  /**
   * Evaluates readiness score (0 - 100%) for a given country
   */
  public getCountryReadiness(code: CountryCode): CountryReadinessIndicator {
    const config = this.getCountryConfig(code);
    const rules = this.getImportRules(code);

    const checks = {
      currency: Boolean(config.currency),
      import_rules: Boolean(rules && rules.max_franchise_value_usd > 0),
      logistics: code === 'UY', // Currently verified live for UY
      marketplace: code === 'UY', // MLU active for UY
      pricing: Boolean(rules && rules.min_target_margin_percent > 0),
      sourcing: config.sourcing_enabled,
      publication: config.publication_enabled
    };

    const totalPassed = Object.values(checks).filter(Boolean).length;
    const readiness_score = Math.round((totalPassed / Object.keys(checks).length) * 100);

    const missing_requirements: string[] = [];
    if (!checks.currency) missing_requirements.push('Moneda no configurada');
    if (!checks.import_rules) missing_requirements.push('Reglas aduaneras incompletas');
    if (!checks.logistics) missing_requirements.push('Logística no verificada');
    if (!checks.marketplace) missing_requirements.push('Marketplace connector no activo');
    if (!checks.pricing) missing_requirements.push('Margen comercial no definido');

    let status: CountryStatus = 'NO_CONFIGURADO';
    if (config.enabled && config.publication_enabled && readiness_score >= 90) {
      status = 'OPERATIVO';
    } else if (readiness_score >= 40) {
      status = 'CONFIGURADO';
    } else {
      status = 'NO_CONFIGURADO';
    }

    return {
      country_code: code,
      country_name: config.country_name,
      readiness_score,
      status,
      checks,
      missing_requirements
    };
  }

  /**
   * Validates if a category or item is allowed in destination country
   */
  public isCategoryAllowed(code: CountryCode, category?: string): { allowed: boolean; reason?: string } {
    if (!category) return { allowed: true };
    const rules = this.getImportRules(code);
    const normalizedCategory = category.toLowerCase();

    const isProhibited = rules.prohibited_categories.some(p => normalizedCategory.includes(p));
    if (isProhibited) {
      return { allowed: false, reason: `Categoría '${category}' prohibida en ${code}` };
    }

    const isRestricted = rules.restricted_categories.some(r => normalizedCategory.includes(r));
    if (isRestricted) {
      return { allowed: true, reason: `Categoría '${category}' requiere permisos especiales en ${code}` };
    }

    return { allowed: true };
  }
}

export const countryEngine = CountryEngine.getInstance();
