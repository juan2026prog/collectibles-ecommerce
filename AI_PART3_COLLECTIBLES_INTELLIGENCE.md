# Collectibles 2026 — AI Part 3

## Scope
Part 3 adds Collectibles-owned commercial intelligence on top of the Part 2 AI Gateway. OpenAI is advisory only.

## Engines
- Product Discovery
- Trend Analysis
- Product Curation
- Country Intelligence
- Radar Intelligence
- Release Intelligence

## Authority model
Real retailer/catalog/demand/release/import evidence -> deterministic Collectibles rules -> AI reasoning -> validation -> advisory result -> Admin.

AI cannot publish, purchase, change price, invent stock/price/availability, or bypass country/engine switches.

## Scoring
The deterministic Opportunity Score remains authoritative. AI may return only a bounded advisory scoreAdjustment (-10..10), stored separately.

## Evidence
Part 3 orchestrator reads existing demand signals, catalog gaps, sourcing opportunities and release events, plus explicit retailer/import/competition evidence supplied by callers. Missing evidence is not defaulted to positive commercial values.

## Audit
Provider telemetry remains in ai_usage_events / ai_error_events. Structured Part 3 results are stored in ai_intelligence_runs.

## Automation
Not included. Autonomous publication/purchasing belongs to Part 4.

## Activation
Engines remain governed by ai_system_config, ai_engine_config and ai_country_config. Country expansion must be explicitly enabled; this implementation does not automatically enable countries or autonomous actions.
