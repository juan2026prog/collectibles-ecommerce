// ============================================================
// COLLECTIBLES 2026 — AI PRE-FLIGHT ESTIMATE ENDPOINT (SERVER-SIDE)
// Path: /api/ai-estimate
// Calculates local token and cost estimates BEFORE executing OpenAI calls.
// STRICT ZERO OPENAI COST GUARANTEE: Uses local pricing registry and DB cache.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { 
  calculatePreFlightEstimate, 
  generateResearchCacheKey,
  normalizeQuery,
  resolveResearchMode
} from '../server/lib/researchCostOptimizer.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  const {
    engine = 'RESEARCH_INTELLIGENCE',
    operation = 'sourcing_market_research',
    query = '',
    country = 'UY',
    research_depth = 'ECONOMICO',
    is_web_search = true,
    force_refresh = false
  } = req.body || {};

  const cleanQuery = normalizeQuery(query || req.body?.prompt || '');
  if (!cleanQuery) {
    return res.status(400).json({
      success: false,
      error: 'Query is required for cost estimation.'
    });
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const mode = resolveResearchMode(research_depth);
  const cacheKey = generateResearchCacheKey(cleanQuery, 'GLOBAL', mode.key);

  let cacheInfo = {
    status: 'MISS',
    age_seconds: null,
    last_researched_at: null,
    cached_items_count: 0
  };

  // 1. Check Research Cache in Supabase (Zero OpenAI Calls)
  if (!force_refresh && client) {
    try {
      // First check sourcing_research_cache
      const { data: cachedRow } = await client
        .from('sourcing_research_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cachedRow) {
        const ageSec = Math.floor((Date.now() - new Date(cachedRow.created_at).getTime()) / 1000);
        cacheInfo = {
          status: 'HIT',
          age_seconds: Math.max(0, ageSec),
          last_researched_at: cachedRow.created_at,
          cached_items_count: Array.isArray(cachedRow.items) ? cachedRow.items.length : 0,
          cached_model: cachedRow.model,
          cached_cost_usd: cachedRow.cost_usd || 0
        };
      } else {
        // Fallback check recent sourcing_signals / sourcing_discoveries
        const { data: recentDisc } = await client
          .from('sourcing_discoveries')
          .select('id, title, discovered_at')
          .ilike('title', `%${cleanQuery.split(' ')[0]}%`)
          .gte('discovered_at', new Date(Date.now() - (12 * 3600 * 1000)).toISOString())
          .limit(5);

        if (recentDisc && recentDisc.length >= 3) {
          const ageSec = Math.floor((Date.now() - new Date(recentDisc[0].discovered_at).getTime()) / 1000);
          cacheInfo = {
            status: 'HIT_DISCOVERIES',
            age_seconds: Math.max(0, ageSec),
            last_researched_at: recentDisc[0].discovered_at,
            cached_items_count: recentDisc.length
          };
        }
      }
    } catch (cacheErr) {
      // Non-blocking cache lookup error
    }
  }

  // 2. Calculate Local Pre-Flight Estimate
  const estimate = calculatePreFlightEstimate({
    query: cleanQuery,
    country,
    researchDepth: mode.key,
    isWebSearch: is_web_search,
    cacheInfo
  });

  return res.status(200).json({
    success: true,
    engine,
    operation,
    query: cleanQuery,
    country,
    ...estimate
  });
}
