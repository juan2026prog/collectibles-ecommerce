// ==============================================================================
// COLLECTIBLES 2026 — SERVER-SIDE FX SYNC & OVERRIDE HANDLER
// Path: /api/currency-sync.js
// GET: Publicly read verified exchange rates (CDN cached) OR run authenticated Cron sync
// POST: (Protected / Admin / Cron) Sync live rates or apply manual override
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '../server/lib/authGuard.js';
import { withDeadline } from './_lib/public-supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { 'x-application-name': 'collectibles-currency-sync' }
  }
});

const FX_PROVIDER_CONFIG = {
  provider_id: 'EXCHANGERATE_API',
  provider_name: 'ExchangeRate-API',
  provider_endpoint: 'https://open.er-api.com/v6/latest/USD',
  provider_url: 'https://www.exchangerate-api.com'
};

// Country & Currency Specifications
const COUNTRY_CURRENCIES = [
  {
    country_code: 'UY',
    country_name: 'Uruguay',
    quote_currency: 'UYU',
    source_name: 'Banco Central del Uruguay (BCU)',
    source_url: 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx',
    is_active: true
  },
  {
    country_code: 'AR',
    country_name: 'Argentina',
    quote_currency: 'ARS',
    source_name: 'Banco Central de la República Argentina (BCRA)',
    source_url: 'https://www.bcra.gob.ar/',
    is_active: false
  },
  {
    country_code: 'CL',
    country_name: 'Chile',
    quote_currency: 'CLP',
    source_name: 'Banco Central de Chile',
    source_url: 'https://www.bcentral.cl/',
    is_active: false
  },
  {
    country_code: 'PE',
    country_name: 'Perú',
    quote_currency: 'PEN',
    source_name: 'Banco Central de Reserva del Perú (BCRP)',
    source_url: 'https://www.bcrp.gob.pe/',
    is_active: false
  },
  {
    country_code: 'MX',
    country_name: 'México',
    quote_currency: 'MXN',
    source_name: 'Banco de México (Banxico)',
    source_url: 'https://www.banxico.org.mx/',
    is_active: false
  },
  {
    country_code: 'EC',
    country_name: 'Ecuador',
    quote_currency: 'USD',
    source_name: 'Banco Central del Ecuador (Economía Dolarizada)',
    source_url: 'https://www.bce.fin.ec/',
    is_active: false
  }
];

// Baseline reference rates for emergency fallback when both PostgreSQL & upstream FX are down
const FALLBACK_STATIC_RATES = {
  UYU: 40.0835,
  ARS: 1528.7563,
  CLP: 961.514,
  PEN: 3.4178,
  MXN: 17.8992,
  USD: 1.0
};

// Helper: fetch with timeout to prevent hanging serverless functions
async function fetchWithTimeout(promise, ms = 4000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Coalesce concurrent public reads without retaining prices after completion.
// Abort the upstream request on timeout instead of leaving it running for 90s.
let publicRatesRead = null;
function readPublicRates() {
  if (!publicRatesRead) {
    publicRatesRead = withDeadline(signal => supabase
      .from('currency_exchange_rates')
      .select('id, country_code, country_name, base_currency, quote_currency, rate, provider, source_name, source_url, status, safety_buffer_percent, is_manual_override, is_active, is_auto_sync, fetched_at, effective_at, expires_at, created_at, updated_at')
      .order('country_code', { ascending: false })
      .abortSignal(signal), 3500)
      .finally(() => { publicRatesRead = null; });
  }
  return publicRatesRead;
}

async function executeLiveSync(triggerSource = 'SCHEDULED_CRON') {
  const fxRes = await fetch(FX_PROVIDER_CONFIG.provider_endpoint);
  if (!fxRes.ok) {
    throw new Error(`External FX API error: HTTP ${fxRes.status}`);
  }

  const fxData = await fxRes.json();
  if (!fxData || !fxData.rates) {
    throw new Error('Invalid FX payload from ExchangeRate-API provider');
  }

  const nowIso = new Date().toISOString();
  const providerTimestamp = fxData.time_last_update_utc || fxData.time_last_update_unix || null;
  const ratesProcessed = [];
  const errors = [];
  let dbPersistCount = 0;
  let historyPersistCount = 0;

  for (const item of COUNTRY_CURRENCIES) {
    const rawRate = item.quote_currency === 'USD' ? 1.0 : fxData.rates[item.quote_currency];
    if (typeof rawRate !== 'number' || rawRate <= 0) {
      continue;
    }

    const formattedRate = Number(rawRate.toFixed(6));

    if (supabase) {
      try {
        // Check existing rate and manual override status (with 4s timeout)
        const checkQuery = supabase
          .from('currency_exchange_rates')
          .select('*')
          .eq('base_currency', 'USD')
          .eq('quote_currency', item.quote_currency)
          .maybeSingle();

        const { data: existing, error: checkErr } = await withDeadline(checkQuery, 4000);

        // REQUIREMENT D: If checking existing row fails or times out, DO NOT overwrite!
        if (checkErr) {
          throw new Error(`Safety halt: unable to verify manual override for ${item.quote_currency}: ${checkErr.message}`);
        }

        // REQUIREMENT C: Preserved manual override is NOT counted as a new write
        if (existing && existing.is_manual_override) {
          ratesProcessed.push({
            quote_currency: item.quote_currency,
            rate: existing.rate,
            provider_fetched_rate: formattedRate,
            saved_to_supabase: true,
            history_persisted: false,
            status: 'MANUAL_OVERRIDE_PRESERVED',
            source: item.source_name
          });
          continue;
        }

        // REQUIREMENT: Idempotent writes & reduce redundant writes if rate unchanged
        const rateChanged = !existing || Math.abs(Number(existing.rate) - formattedRate) > 0.000001;

        if (!rateChanged && existing) {
          // Touch updated_at and expires_at without re-writing entire row or creating duplicate history
          const touchQuery = supabase
            .from('currency_exchange_rates')
            .update({
              status: 'VERIFIED',
              fetched_at: nowIso,
              expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
              updated_at: nowIso
            })
            .eq('id', existing.id);

          const { error: touchErr } = await fetchWithTimeout(touchQuery, 4000);

          if (touchErr) {
            throw new Error(`Touch update error for unchanged ${item.quote_currency}: ${touchErr.message}`);
          }

          dbPersistCount++;
          ratesProcessed.push({
            country: item.country_name,
            currency: item.quote_currency,
            rate: formattedRate,
            saved_to_supabase: true,
            history_persisted: false,
            source: item.source_name,
            provider_timestamp: providerTimestamp,
            status: 'VERIFIED_UNCHANGED'
          });
          continue;
        }

        const upsertQuery = supabase
          .from('currency_exchange_rates')
          .upsert({
            country_code: item.country_code,
            country_name: item.country_name,
            base_currency: 'USD',
            quote_currency: item.quote_currency,
            rate: formattedRate,
            provider: FX_PROVIDER_CONFIG.provider_name,
            source_name: item.source_name,
            source_url: item.source_url,
            status: 'VERIFIED',
            is_manual_override: false,
            is_active: item.is_active,
            is_auto_sync: true,
            fetched_at: nowIso,
            effective_at: nowIso,
            expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
            updated_at: nowIso
          }, { onConflict: 'base_currency,quote_currency' })
          .select()
          .single();

        const { data: upserted, error: upErr } = await fetchWithTimeout(upsertQuery, 4000);

        if (upErr) {
          throw new Error(`Upsert error for ${item.quote_currency}: ${upErr.message}`);
        }

        dbPersistCount++;
        let histPersisted = false;

        if (upserted) {
          try {
            await fetchWithTimeout(supabase.from('currency_exchange_rate_history').insert({
              rate_id: upserted.id,
              base_currency: 'USD',
              quote_currency: item.quote_currency,
              rate: formattedRate,
              provider: FX_PROVIDER_CONFIG.provider_name,
              source_name: item.source_name,
              source_url: item.source_url,
              status: 'VERIFIED',
              is_manual_override: false,
              reason: `Automated live FX synchronization (${triggerSource})`,
              effective_at: nowIso
            }), 4000);
            historyPersistCount++;
            histPersisted = true;
          } catch (histErr) {
            console.warn(`[CurrencySync] History insert failed for ${item.quote_currency}:`, histErr.message);
          }
        }

        ratesProcessed.push({
          country: item.country_name,
          currency: item.quote_currency,
          rate: formattedRate,
          saved_to_supabase: true,
          history_persisted: histPersisted,
          source: item.source_name,
          provider_timestamp: providerTimestamp,
          status: 'VERIFIED'
        });
      } catch (dbErr) {
        console.error(`[CurrencySync] DB persist failed for ${item.quote_currency}:`, dbErr.message);
        errors.push({ currency: item.quote_currency, error: dbErr.message });
        ratesProcessed.push({
          country: item.country_name,
          currency: item.quote_currency,
          rate: formattedRate,
          saved_to_supabase: false,
          history_persisted: false,
          source: item.source_name,
          provider_timestamp: providerTimestamp,
          status: 'FETCHED_UPSTREAM_BUT_PERSIST_FAILED',
          error: dbErr.message
        });
      }
    } else {
      ratesProcessed.push({
        country: item.country_name,
        currency: item.quote_currency,
        rate: formattedRate,
        saved_to_supabase: false,
        history_persisted: false,
        source: item.source_name,
        provider_timestamp: providerTimestamp,
        status: 'FETCHED_UPSTREAM_NO_DB'
      });
    }
  }

  // Determine actual synchronization status
  const totalCurrencies = COUNTRY_CURRENCIES.length;
  let overallSyncStatus = 'SUCCESS';
  if (dbPersistCount === 0 && COUNTRY_CURRENCIES.length > 0) {
    overallSyncStatus = 'FAILED_PERSISTENCE';
  } else if (errors.length > 0) {
    overallSyncStatus = 'PARTIAL_SUCCESS';
  }

  return {
    provider: FX_PROVIDER_CONFIG.provider_name,
    provider_endpoint: FX_PROVIDER_CONFIG.provider_endpoint,
    provider_timestamp: providerTimestamp,
    synced_at: nowIso,
    total_requested: totalCurrencies,
    rates_processed_count: ratesProcessed.length,
    db_persisted_count: dbPersistCount,
    history_persisted_count: historyPersistCount,
    sync_status: overallSyncStatus,
    errors: errors.length > 0 ? errors : undefined,
    results: ratesProcessed
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const isForceSyncRequested = req.query?.sync === 'true' || req.query?.cron === 'true';

  // ----------------------------------------------------
  // GET: Read Active Rates OR Trigger Authenticated Cron / Admin Sync
  // ----------------------------------------------------
  if (req.method === 'GET') {
    if (isForceSyncRequested) {
      // Must NOT be cached when executing cron/sync
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

      const auth = await authenticateRequest(req, { allowCron: true });
      // STRICT SECURITY: Only authenticate via verified Bearer CRON_SECRET or Admin JWT.
      // Never authorize merely by an arbitrary header like 'x-vercel-cron'.
      const cronAuthorized = auth.authenticated && (auth.isCron || auth.isAdmin);

      if (!cronAuthorized) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED_SYNC_REQUEST',
          message: 'Acceso denegado. Se requiere autenticación estricta: Authorization: Bearer CRON_SECRET o sesión administrativa válida.'
        });
      }

      try {
        const syncResult = await executeLiveSync(auth.isCron ? 'VERCEL_CRON_SECRET' : 'ADMIN_GET_SYNC');
        const isFailure = syncResult.sync_status === 'FAILED_PERSISTENCE';
        return res.status(isFailure ? 502 : 200).json({
          ok: !isFailure,
          message: isFailure ? 'Upstream FX rates retrieved but failed to persist to PostgreSQL' : (auth.isCron ? 'Vercel Cron scheduled FX sync executed successfully' : 'Live FX sync executed successfully'),
          ...syncResult
        });
      } catch (err) {
        console.error('[CurrencySync] GET sync failed:', err);
        return res.status(500).json({ ok: false, error: err.message, timestamp: new Date().toISOString() });
      }
    }

    // Standard Public Read: Edge CDN Cache enabled to shield PostgreSQL
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    try {
      if (supabase) {
        try {
          const { data, error } = await readPublicRates();

          if (!error && data && data.length > 0) {
            const now = Date.now();
            const enriched = data.map(item => {
              const fetchedTime = new Date(item.fetched_at).getTime();
              const ageHours = (now - fetchedTime) / 3600000;
              let currentStatus = item.status;
              // Strict financial defense: If row is marked STALE or UNAVAILABLE in DB, NEVER promote to VERIFIED
              if (!item.is_manual_override) {
                if (ageHours > 24) {
                  currentStatus = 'STALE';
                }
              }
              return {
                id: item.id,
                country_code: item.country_code,
                country_name: item.country_name,
                base_currency: item.base_currency,
                quote_currency: item.quote_currency,
                rate: Number(item.rate),
                provider: item.provider,
                source_name: item.source_name,
                source_url: item.source_url,
                status: currentStatus,
                safety_buffer_percent: Number(item.safety_buffer_percent || 2.00),
                is_manual_override: !!item.is_manual_override,
                is_active: !!item.is_active,
                is_auto_sync: !!item.is_auto_sync,
                fetched_at: item.fetched_at,
                effective_at: item.effective_at,
                expires_at: item.expires_at,
                age_hours: Number(ageHours.toFixed(1))
              };
            });

            return res.status(200).json({
              ok: true,
              canonical_currency: 'USD',
              provider: FX_PROVIDER_CONFIG.provider_name,
              provider_endpoint: FX_PROVIDER_CONFIG.provider_endpoint,
              rates: enriched,
              source: 'SUPABASE_EXCHANGE_RATES',
              timestamp: new Date().toISOString()
            });
          }
        } catch (dbReadErr) {
          console.warn('[CurrencySync] Supabase read timed out, falling back to static rates:', dbReadErr.message);
        }
      }

      // Fallback in-memory response if DB is unreachable or timing out.
      // Transparent status: STALE / UNAVAILABLE. Never marked as VERIFIED.
      const fallbackList = COUNTRY_CURRENCIES.map(c => ({
        country_code: c.country_code,
        country_name: c.country_name,
        base_currency: 'USD',
        quote_currency: c.quote_currency,
        rate: FALLBACK_STATIC_RATES[c.quote_currency] || 1.0,
        provider: 'FALLBACK_STATIC_BASELINE',
        source_name: c.source_name,
        source_url: c.source_url,
        status: 'STALE',
        is_manual_override: false,
        is_active: c.is_active,
        is_auto_sync: false,
        is_fallback: true,
        verification_warning: 'PostgreSQL unreachable; serving hardcoded fallback baseline. Not verified against live FX.',
        fetched_at: null,
        effective_at: null,
        age_hours: null
      }));

      // Fallback response with shorter edge cache
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

      return res.status(200).json({
        ok: true,
        canonical_currency: 'USD',
        provider: 'FALLBACK_OFFLINE',
        provider_endpoint: null,
        rates: fallbackList,
        source: 'INSTITUTIONAL_FALLBACK',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ----------------------------------------------------
  // POST: Sync or Override FX (Strictly Admin / Cron Protected)
  // ----------------------------------------------------
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    const auth = await authenticateRequest(req, { allowCron: true });
    if (!auth.authenticated || (!auth.isCron && !auth.isAdmin)) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED_MUTATION_REQUEST',
        message: 'Acceso denegado. Se requiere autenticación administrativa válida.'
      });
    }

    // Always derive authenticated user's email securely from the verified token/session
    const verifiedAdminEmail = auth.user?.email || 'admin@collectibles.uy';
    const { action, quote_currency, rate, reason } = req.body || {};

    // 1. Manual Override Action
    if (action === 'MANUAL_OVERRIDE') {
      if (!quote_currency || !rate || Number(rate) <= 0 || !reason) {
        return res.status(400).json({
          ok: false,
          error: 'quote_currency, valid positive rate, and reason are required for MANUAL_OVERRIDE'
        });
      }

      const numRate = Number(rate);
      const email = verifiedAdminEmail;
      const nowIso = new Date().toISOString();

      try {
        if (supabase) {
          const updateQuery = supabase
            .from('currency_exchange_rates')
            .update({
              rate: numRate,
              status: 'MANUAL_OVERRIDE',
              is_manual_override: true,
              override_reason: reason,
              override_admin_email: email,
              effective_at: nowIso,
              updated_at: nowIso
            })
            .eq('base_currency', 'USD')
            .eq('quote_currency', quote_currency)
            .select()
            .single();

          const { data: updatedRow, error: updateErr } = await fetchWithTimeout(updateQuery, 5000);

          if (updateErr) throw updateErr;

          await fetchWithTimeout(supabase.from('currency_exchange_rate_history').insert({
            rate_id: updatedRow.id,
            base_currency: 'USD',
            quote_currency,
            rate: numRate,
            provider: 'MANUAL_OVERRIDE',
            source_name: `Manual Override by ${email}`,
            source_url: 'https://collectibles.uy/superadmin/currencies',
            status: 'MANUAL_OVERRIDE',
            is_manual_override: true,
            reason,
            admin_email: email,
            effective_at: nowIso
          }), 4000).catch(() => {});

          return res.status(200).json({
            ok: true,
            message: `Manual override applied for USD/${quote_currency}: ${numRate} by ${email}`,
            record: updatedRow
          });
        }

        return res.status(200).json({
          ok: true,
          message: `Manual override registered: USD/${quote_currency} = ${numRate} by ${email}`
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // 2. Restore Automatic Action
    if (action === 'RESTORE_AUTOMATIC') {
      if (!quote_currency) {
        return res.status(400).json({ ok: false, error: 'quote_currency is required for RESTORE_AUTOMATIC' });
      }

      try {
        const fxRes = await fetch(FX_PROVIDER_CONFIG.provider_endpoint);
        if (!fxRes.ok) {
          throw new Error(`El proveedor de cotizaciones devolvió HTTP ${fxRes.status}. No se pudo obtener una tasa en vivo.`);
        }
        const fxData = await fxRes.json();
        const rawLiveRate = fxData?.rates?.[quote_currency];
        
        // STRICT DEFENSE: Never substitute invalid or missing external rates with static fallback rates,
        // and never mark a failed live query as VERIFIED. Abort and preserve manual override!
        if (typeof rawLiveRate !== 'number' || isNaN(rawLiveRate) || rawLiveRate <= 0) {
          return res.status(422).json({
            ok: false,
            error: `El proveedor no devolvió una cotización válida para USD/${quote_currency}. Se canceló la restauración automática y se preservó la cotización manual existente.`
          });
        }

        const liveRate = Number(rawLiveRate.toFixed(6));
        const nowIso = new Date().toISOString();
        const email = verifiedAdminEmail;

        if (supabase) {
          const updateQuery = supabase
            .from('currency_exchange_rates')
            .update({
              rate: liveRate,
              status: 'VERIFIED',
              is_manual_override: false,
              override_reason: null,
              override_admin_email: null,
              provider: FX_PROVIDER_CONFIG.provider_name,
              fetched_at: nowIso,
              effective_at: nowIso,
              expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
              updated_at: nowIso
            })
            .eq('base_currency', 'USD')
            .eq('quote_currency', quote_currency)
            .select()
            .single();

          const { data: updatedRow, error: updateErr } = await fetchWithTimeout(updateQuery, 5000);

          if (updateErr) throw updateErr;

          await fetchWithTimeout(supabase.from('currency_exchange_rate_history').insert({
            rate_id: updatedRow.id,
            base_currency: 'USD',
            quote_currency,
            rate: liveRate,
            provider: FX_PROVIDER_CONFIG.provider_name,
            source_name: updatedRow.source_name,
            source_url: updatedRow.source_url,
            status: 'VERIFIED',
            is_manual_override: false,
            reason: `Restored automatic sync by admin ${email}`,
            admin_email: email,
            effective_at: nowIso
          }), 4000).catch(() => {});

          return res.status(200).json({
            ok: true,
            message: `Restored automatic sync for USD/${quote_currency}: ${liveRate} by ${email}`,
            record: updatedRow
          });
        }

        return res.status(200).json({
          ok: true,
          message: `Restored automatic sync for USD/${quote_currency}: ${liveRate}`
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // 3. Sync All Live Rates (Scheduled Sync / Force Sync)
    try {
      const syncResult = await executeLiveSync(`MANUAL_SYNC_${verifiedAdminEmail}`);
      return res.status(200).json({
        ok: true,
        message: 'Live FX sync executed successfully across all supported currencies',
        ...syncResult
      });
    } catch (err) {
      console.error('[CurrencySync] Sync failed:', err);
      return res.status(500).json({
        ok: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
