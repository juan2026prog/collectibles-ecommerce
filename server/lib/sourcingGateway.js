import aiExecute from '../../api/ai-execute.js';

// Internal dispatch retains the same auth, preflight, cache, budget and model routing.
export async function researchViaGateway(req, { query, country, signals }) {
  let payload;
  const response = { setHeader() {}, status(code) { this.statusCode = code; return this; }, end() {}, json(value) { payload = value; return this; } };
  await aiExecute({ ...req, method: 'POST', body: { engine: 'RESEARCH_INTELLIGENCE', operation: 'sourcing_market_research', country,
    prompt: query, payload: { query, country, research_depth: 'ECONOMICO', requested_model: 'AUTO', result_limit: 'AUTO',
      evidence: { discovery_signals: signals, target_country: country } }, context: { research_depth: 'ECONOMICO', requested_model: 'AUTO', result_limit: 'AUTO' } } }, response);
  if (!payload?.success) throw new Error(payload?.error || 'GATEWAY_RESEARCH_FAILED');
  return payload;
}
