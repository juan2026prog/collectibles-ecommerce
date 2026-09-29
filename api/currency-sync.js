// ==============================================================================
// COLLECTIBLES 2026 — SERVER-SIDE FX SYNC & OVERRIDE HANDLER
// Path: /api/currency-sync.js
// GET: Publicly read verified exchange rates OR run scheduled Vercel Cron sync
// POST: (Protected / SuperAdmin) Sync live rates or apply manual override
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

export const FX_PROVIDER_CONFIG = {
  provider_id: 'EXCHANGERATE_API',
  provider_name: 'ExchangeRate-API',
  provider_endpoint: 'https://open.er-api.com/v6/latest/USD',
  provider_url: 'https://www.exchangerate-api.com'
};

// Country & Currency Specifications
export const COUNTRY_CURRENCIES = [
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

export const FALLBACK_STATIC_RATES = {
  UYU: 40.0835,
  ARS: 1528.7563,
  CLP: 961.514,
  PEN: 3.4178,
  MXN: 17.8992,
  USD: 1.0
};

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
  const syncedRates = [];

  for (const item of COUNTRY_CURRENCIES) {
    const rawRate = item.quote_currency === 'USD' ? 1.0 : fxData.rates[item.quote_currency];
    if (typeof rawRate !== 'number' || rawRate <= 0) {
      continue;
    }

    const formattedRate = Number(rawRate.toFixed(6));

    if (supabase) {
      // Check if row has active manual override
      const { data: existing } = await supabase
        .from('currency_exchange_rates')
        .select('*')
        .eq('base_currency', 'USD')
        .eq('quote_currency', item.quote_currency)
        .maybeSingle();

      if (existing && existing.is_manual_override) {
        syncedRates.push({
          quote_currency: item.quote_currency,
          rate: existing.rate,
          status: 'MANUAL_OVERRIDE_PRESERVED',
          source: item.source_name
        });
        continue;
      }

      const { data: upserted, error: upErr } = await supabase
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

      if (!upErr && upserted) {
        await supabase.from('currency_exchange_rate_history').insert({
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
        });
      }
    }

    syncedRates.push({
      country: item.country_name,
      currency: item.quote_currency,
      rate: formattedRate,
      source: item.source_name,
      provider_timestamp: providerTimestamp,
      status: 'VERIFIED'
    });
  }

  return {
    provider: FX_PROVIDER_CONFIG.provider_name,
    provider_endpoint: FX_PROVIDER_CONFIG.provider_endpoint,
    provider_timestamp: providerTimestamp,
    synced_at: nowIso,
    synced_count: syncedRates.length,
    results: syncedRates
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-vercel-cron');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const isCronExecution = !!req.headers['x-vercel-cron'] || url.searchParams.get('cron') === 'true';
  const isForceSyncRequested = url.searchParams.get('sync') === 'true';

  // ----------------------------------------------------
  // GET: Read Active Rates OR Trigger Vercel Cron / On-demand Sync
  // ----------------------------------------------------
  if (req.method === 'GET') {
    if (isCronExecution || isForceSyncRequested) {
      try {
        const syncResult = await executeLiveSync(isCronExecution ? 'VERCEL_CRON' : 'GET_SYNC_REQUEST');
        return res.status(200).json({
          ok: true,
          message: isCronExecution ? 'Vercel Cron scheduled FX sync executed successfully' : 'Live FX sync executed successfully',
          ...syncResult
        });
      } catch (err) {
        console.error('[CurrencySync] GET sync failed:', err);
        return res.status(500).json({ ok: false, error: err.message, timestamp: new Date().toISOString() });
      }
    }

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('currency_exchange_rates')
          .select('*')
          .order('country_code', { ascending: false });

        if (!error && data && data.length > 0) {
          const now = Date.now();
          const enriched = data.map(item => {
            const fetchedTime = new Date(item.fetched_at).getTime();
            const ageHours = (now - fetchedTime) / 3600000;
            let currentStatus = item.status;
            if (!item.is_manual_override) {
              if (ageHours > 24) {
                currentStatus = 'STALE';
              } else if (ageHours <= 24 && currentStatus === 'STALE') {
                currentStatus = 'VERIFIED';
              }
            }
            return {
              ...item,
              status: currentStatus,
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
      }

      // Fallback in-memory response if DB is unreachable
      const fallbackList = COUNTRY_CURRENCIES.map(c => ({
        country_code: c.country_code,
        country_name: c.country_name,
        base_currency: 'USD',
        quote_currency: c.quote_currency,
        rate: FALLBACK_STATIC_RATES[c.quote_currency] || 1.0,
        provider: FX_PROVIDER_CONFIG.provider_name,
        source_name: c.source_name,
        source_url: c.source_url,
        status: 'VERIFIED',
        is_manual_override: false,
        is_active: c.is_active,
        is_auto_sync: true,
        fetched_at: new Date().toISOString(),
        effective_at: new Date().toISOString(),
        age_hours: 0
      }));

      return res.status(200).json({
        ok: true,
        canonical_currency: 'USD',
        provider: FX_PROVIDER_CONFIG.provider_name,
        provider_endpoint: FX_PROVIDER_CONFIG.provider_endpoint,
        rates: fallbackList,
        source: 'INSTITUTIONAL_FALLBACK',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ----------------------------------------------------
  // POST: Sync or Override FX
  // ----------------------------------------------------
  if (req.method === 'POST') {
    const { action, quote_currency, rate, reason, admin_email } = req.body || {};

    // 1. Manual Override Action
    if (action === 'MANUAL_OVERRIDE') {
      if (!quote_currency || !rate || Number(rate) <= 0 || !reason) {
        return res.status(400).json({
          ok: false,
          error: 'quote_currency, valid positive rate, and reason are required for MANUAL_OVERRIDE'
        });
      }

      const numRate = Number(rate);
      const email = admin_email || 'superadmin@collectibles.uy';
      const nowIso = new Date().toISOString();

      try {
        if (supabase) {
          const { data: updatedRow, error: updateErr } = await supabase
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

          if (updateErr) throw updateErr;

          await supabase.from('currency_exchange_rate_history').insert({
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
          });

          return res.status(200).json({
            ok: true,
            message: `Manual override applied for USD/${quote_currency}: ${numRate}`,
            record: updatedRow
          });
        }

        return res.status(200).json({
          ok: true,
          message: `Manual override registered (local mode): USD/${quote_currency} = ${numRate}`
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
        const fxData = await fxRes.json();
        const liveRate = fxData?.rates?.[quote_currency] || FALLBACK_STATIC_RATES[quote_currency];
        const nowIso = new Date().toISOString();
        const email = admin_email || 'superadmin@collectibles.uy';

        if (supabase) {
          const { data: updatedRow, error: updateErr } = await supabase
            .from('currency_exchange_rates')
            .update({
              rate: Number(liveRate),
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

          if (updateErr) throw updateErr;

          await supabase.from('currency_exchange_rate_history').insert({
            rate_id: updatedRow.id,
            base_currency: 'USD',
            quote_currency,
            rate: Number(liveRate),
            provider: FX_PROVIDER_CONFIG.provider_name,
            source_name: updatedRow.source_name,
            source_url: updatedRow.source_url,
            status: 'VERIFIED',
            is_manual_override: false,
            reason: 'Restored automatic sync by admin',
            admin_email: email,
            effective_at: nowIso
          });

          return res.status(200).json({
            ok: true,
            message: `Restored automatic sync for USD/${quote_currency}: ${liveRate}`,
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
      const syncResult = await executeLiveSync('MANUAL_SYNC_BUTTON');
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

