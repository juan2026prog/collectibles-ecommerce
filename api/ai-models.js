// ============================================================
// COLLECTIBLES 2026 — AI MODELS CATALOG ENDPOINT (SERVER-SIDE)
// Path: /api/ai-models
// Returns active, compatible models and capabilities from Central Registry.
// ZERO SECRETS EXPOSED.
// ============================================================

import { getAvailableAIModels } from '../server/lib/openaiPricing.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    });
  }

  const queryParams = req.query || {};
  const bodyParams = req.body || {};

  const engine = queryParams.engine || bodyParams.engine || 'RESEARCH_INTELLIGENCE';
  const requiresWebSearch = queryParams.web_search !== 'false' && bodyParams.web_search !== false;

  const modelsCatalog = getAvailableAIModels({
    engine,
    requiresWebSearch
  });

  return res.status(200).json({
    success: true,
    ...modelsCatalog
  });
}
