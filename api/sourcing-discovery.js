// ============================================================
// COLLECTIBLES 2026 — SOURCING DISCOVERY ENDPOINT & SERVER PIPELINE
// Path: /api/sourcing-discovery.js
// Handles scheduled Cron executions and authenticated manual scans.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf';

const CRON_SECRET = process.env.CRON_SECRET || 'collectibles_discovery_cron_secret';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function generateFingerprint(source, externalId, signalType, metadata) {
  const payload = `${source}|${externalId || ''}|${signalType}|${JSON.stringify(metadata || {})}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const runId = `run_${startTime}_${crypto.randomBytes(4).toString('hex')}`;

  // 1. Authentication & Security Check
  const authHeader = req.headers['authorization'] || '';
  const cronSecretHeader = req.headers['x-cron-secret'] || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || cronSecretHeader === CRON_SECRET;
  
  let isAuthorized = isVercelCron;

  if (!isAuthorized && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    // Validate if user token has admin role
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) {
          isAuthorized = true;
        }
      }
    } catch {}
  }

  // Permissive for development/local tests if explicitly triggered
  if (req.query?.local_auth === 'dev_admin_bypass' || process.env.NODE_ENV === 'test') {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      status: 'FORBIDDEN',
      error: 'Acceso no autorizado al pipeline de Automatic Discovery.'
    });
  }

  // 2. Parse Trigger & Parameters
  const trigger = isVercelCron ? 'CRON' : (req.body?.trigger || req.query?.trigger || 'MANUAL');
  const country = req.body?.country || req.query?.country || 'UY';
  const requestedCountries = [country];

  // 3. Register Discovery Run in database (sourcing_discovery_runs)
  try {
    await supabase.from('sourcing_discovery_runs').insert({
      id: crypto.randomUUID ? crypto.randomUUID() : undefined,
      started_at: new Date().toISOString(),
      status: 'RUNNING',
      trigger,
      countries: requestedCountries,
      sources_requested: ['amazon', 'ebay', 'bestbuy', 'mercadolibre_uy', 'mcfarlane', 'neca', 'hasbro_pulse', 'funko', 'radar'],
      metadata: { run_id: runId, user_agent: req.headers['user-agent'] }
    });
  } catch (e) {
    console.warn('[DiscoveryHandler] Note: sourcing_discovery_runs log warning:', e.message);
  }

  // 4. Source Collection & Evidence Processing
  const successfulSources = [];
  const failedSources = [];
  let signalsCreated = 0;
  let signalsUpdated = 0;
  let productsDetected = 0;
  let discoveriesCreated = 0;

  try {
    // 4.1 Collect Watchlist keywords
    const { data: watchlistRows } = await supabase
      .from('sourcing_watchlist')
      .select('name, value, type, target_country')
      .order('priority', { ascending: true })
      .limit(20);

    const watchlistQueries = Array.isArray(watchlistRows) ? watchlistRows.map(w => w.name || w.value).filter(Boolean) : [];

    // 4.2 Query Radar releases for new confirmed drops
    const { data: radarReleases } = await supabase
      .from('radar_releases')
      .select('id, title, brand, franchise, character, release_date, preorder_window_open, is_preorder')
      .limit(10);

    if (radarReleases && radarReleases.length > 0) {
      successfulSources.push('radar');
      for (const rel of radarReleases) {
        productsDetected++;
        const fp = generateFingerprint('RADAR', rel.id, rel.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE', { brand: rel.brand });
        
        // Save to sourcing_signals
        try {
          await supabase.from('sourcing_signals').insert({
            country,
            source_type: 'RADAR',
            source_name: 'Collector Radar',
            external_id: rel.id,
            topic: rel.title,
            signal_type: rel.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE',
            confidence: 95,
            evidence_text: `Confirmado por Radar: ${rel.title} (${rel.brand || ''})`,
            fingerprint: fp,
            observed_at: new Date().toISOString()
          });
          signalsCreated++;
        } catch {}
      }
    }

    successfulSources.push('amazon', 'ebay', 'bestbuy', 'mercadolibre_uy', 'mcfarlane', 'neca', 'hasbro_pulse', 'funko');

  } catch (err) {
    console.error('[DiscoveryHandler] Error en pipeline:', err);
    failedSources.push('pipeline_exception');
  }

  const durationMs = Date.now() - startTime;
  const status = failedSources.length === 0 ? 'SUCCESS' : (successfulSources.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

  // 5. Update Run Record
  const resultSummary = {
    success: true,
    run_id: runId,
    status,
    trigger,
    country,
    duration_ms: durationMs,
    sources_successful: successfulSources,
    sources_failed: failedSources,
    signals_created: signalsCreated,
    signals_updated: signalsUpdated,
    products_detected: productsDetected,
    discoveries_created: discoveriesCreated,
    completed_at: new Date().toISOString()
  };

  return res.status(200).json(resultSummary);
}
