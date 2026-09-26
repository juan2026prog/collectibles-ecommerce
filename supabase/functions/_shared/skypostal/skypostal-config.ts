// supabase/functions/_shared/skypostal/skypostal-config.ts

import { SkyPostalCredentials, SkyPostalEnvironment } from './skypostal-types.ts';
import { SkyPostalAuthError, SkyPostalKillSwitchActiveError } from './skypostal-errors.ts';

export interface SkyPostalResolvedConfig {
  environment: SkyPostalEnvironment;
  apiUrl: string;
  credentials: SkyPostalCredentials;
  isKillSwitchActive: boolean;
}

/**
 * Resolves SkyPostal configuration from database and server-side secrets.
 * NEVER exposes secrets to client side.
 */
export async function resolveSkyPostalConfig(
  supabaseClient: any,
  marketCountryCode?: string
): Promise<SkyPostalResolvedConfig> {
  // 1. Fetch provider record from shipping_providers
  const { data: provider, error: provErr } = await supabaseClient
    .from('shipping_providers')
    .select('*')
    .eq('code', 'skypostal')
    .maybeSingle();

  if (provErr) {
    console.error('[SkyPostal Config] Error fetching provider record:', provErr.message);
  }

  const settings = provider?.settings || {};

  // Check global kill-switch
  const globalKillSwitch = !!settings.global_kill_switch || Deno.env.get('SKYPOSTAL_KILL_SWITCH') === 'true';
  if (globalKillSwitch) {
    throw new SkyPostalKillSwitchActiveError('global');
  }

  // Check market specific configuration if country specified
  if (marketCountryCode) {
    const { data: market } = await supabaseClient
      .from('international_markets')
      .select('*')
      .eq('country_code', marketCountryCode.toUpperCase())
      .maybeSingle();

    if (market) {
      if (market.market_status === 'DISABLED') {
        throw new SkyPostalKillSwitchActiveError('market', `Market ${marketCountryCode} is DISABLED`);
      }
      if (market.metadata?.kill_switch) {
        throw new SkyPostalKillSwitchActiveError('market', marketCountryCode);
      }
    }
  }

  // Resolve Environment (Default: test / uat)
  const envVar = Deno.env.get('SKYPOSTAL_ENV')?.toLowerCase();
  const dbEnv = provider?.environment === 'production' ? 'production' : 'test';
  const resolvedEnv: SkyPostalEnvironment = envVar === 'production' || dbEnv === 'production' ? 'production' : 'test';

  // Read credentials strictly server-side
  const credentials: SkyPostalCredentials = {
    apiKey: Deno.env.get('SKYPOSTAL_API_KEY') || settings.apiKey || '',
    username: Deno.env.get('SKYPOSTAL_USERNAME') || provider?.username || '',
    password: Deno.env.get('SKYPOSTAL_PASSWORD') || provider?.password_encrypted || '',
    accountNumber: Deno.env.get('SKYPOSTAL_ACCOUNT_NUMBER') || settings.accountNumber || '',
    merchantId: Deno.env.get('SKYPOSTAL_MERCHANT_ID') || settings.merchantId || '',
    environment: resolvedEnv,
    isSandbox: resolvedEnv === 'test',
    settings: settings
  };

  const defaultApiUrl = resolvedEnv === 'production'
    ? (provider?.api_url || 'https://api.skypostal.com/v1')
    : (provider?.api_url || 'https://uat-api.skypostal.com/v1');

  return {
    environment: resolvedEnv,
    apiUrl: defaultApiUrl,
    credentials,
    isKillSwitchActive: false
  };
}
