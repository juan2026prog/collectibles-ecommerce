# Collectibles 2026 — OpenAI Part 2 Certification

## Architecture

The unified AI execution pipeline is implemented with a strict multi-layer security hierarchy:

```
FRONTEND (Client / UI)
   ↓
AIGateway (`frontend/src/services/ai/aiGateway.ts`)
   ↓
OpenAIProvider (`frontend/src/services/ai/providers/openAIProvider.ts`)
   ↓
/api/ai-execute (`api/ai-execute.js`)
   ↓
api/lib/openai.js (`callOpenAIResponses` & `createOpenAITextResponse`)
   ↓
OpenAI Responses API (`https://api.openai.com/v1/responses`, store: false)
   ↓
OpenAI Pricing & Telemetry (`api/lib/openaiPricing.js`)
   ↓
ai_usage_events / ai_error_events (Supabase Database)
   ↓
AI Control Center (`AdminAIControlCenter.tsx`)
```

---

## Server-side Security

1. **Zero Secret Exposure:** `OPENAI_API_KEY` resides strictly within server-side environment variables on Vercel (`process.env.OPENAI_API_KEY`).
2. **Client Immunity:** No `VITE_OPENAI_API_KEY` exists; React components and Vite build bundles never receive nor bundle the API key.
3. **Database Security:** API keys are never stored in Supabase public tables, nor returned in error objects or headers.
4. **Endpoint Guarding:**
   - `GET /api/openai-test`: Safe 0-cost diagnostic verification.
   - `POST /api/openai-test`: Guarded by `OPENAI_TEST_ENABLED=true` (disabled by default in production).
   - `/api/ai-execute`: Strict HTTP POST validation, Supabase authorization, and error sanitization.

---

## AI Gateway

The `AIGateway` enforces a 5-level authorization hierarchy before initiating any AI call:
- **Level 1 — AI Global:** `ai_system_config.global_enabled` (Master Kill Switch).
- **Level 2 — Circuit Breaker:** `ai_system_config.circuit_breaker_state === 'CLOSED'`.
- **Level 3 — Country Authorization:** `ai_country_config.ai_enabled` & per-engine country flags (`ai_search_enabled`, etc.).
- **Level 4 — Engine Authorization:** `ai_engine_config.enabled` & daily request limits.
- **Level 5 — Provider Dispatch:** Routes to `OpenAIProvider` ('OPENAI') or `NullAIProvider` ('NONE') with automatic fallback handler execution.

---

## OpenAIProvider

- Located at `frontend/src/services/ai/providers/openAIProvider.ts`.
- Implements `AIProviderAdapter`.
- Dispatches execution requests to `/api/ai-execute`.
- Carries user session tokens securely when authenticated.
- Maps error statuses (`RATE_LIMITED`, `TIMEOUT`, `AI_DISABLED`, `INVALID_OUTPUT`, `OPENAI_ERROR`) into standardized application responses.

---

## Responses API

- Interacts with OpenAI's official endpoint: `https://api.openai.com/v1/responses`.
- Configured with `store: false` to guarantee data privacy.
- Controlled execution with `AbortController` and configurable timeouts (default: 25,000ms).
- Robust output extraction from `output_text`, nested `content` arrays, and fallback message choices.
- Header tracking: Captures `x-request-id` and `responseId`.

---

## Telemetry & Token Accounting

On every execution:
- Captures `input_tokens`, `output_tokens`, and `total_tokens` directly from OpenAI's `usage` payload.
- Records success telemetry to `public.ai_usage_events`:
  - `engine`, `country_code`, `provider`, `model`, `request_id`, `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost_usd`, `latency_ms`, `status`, `fallback_used`, `metadata`.
- Detailed metadata records: `operation`, `response_id`, `pricing_status`, `pricing_source`, `input_cost_usd`, `output_cost_usd`.

---

## Cost Accounting & Pricing Engine

- Centralized in `api/lib/openaiPricing.js`.
- Configurable per model via environment variables (`OPENAI_PRICE_<MODEL>_INPUT_PER_1M`, `OPENAI_PRICE_<MODEL>_OUTPUT_PER_1M`) with a built-in standard matrix (`gpt-5.6-terra`, `gpt-5.6-sol`, `gpt-4o`, `gpt-4o-mini`, etc.).
- Explicit handling of `UNKNOWN_PRICING`: If a model's rate is not configured, it returns `pricing_status: 'UNKNOWN_PRICING'` and `estimated_cost_usd: null`, explicitly avoiding false `$0.00` reporting in commercial telemetry.

---

## Latency & Safeguards

- Exact latency tracked via high-resolution timing (`performance.now()` / `Date.now()`).
- Circuit breaker automatically prevents runaway cascading requests.
- Daily and monthly budget threshold tracking against `ai_system_config` and `ai_country_config`.

---

## Error Handling

- Centralized in `OpenAIError`.
- Captures and logs all errors to `public.ai_error_events`:
  - `TIMEOUT`, `RATE_LIMITED` (429), `NOT_CONFIGURED` (401/403), `MODEL_NOT_ALLOWED` (404), `INVALID_OUTPUT` (400), `OPENAI_ERROR` (500).
- Safe error sanitization: Strips internal stack traces and secrets before returning JSON to the client.

---

## Admin Control Center

- `frontend/src/pages/superadmin/AdminAIControlCenter.tsx` updated and hardened.
- Obsolete Phase 1 texts removed.
- Displays real dynamic status of the OpenAI Provider (`CONNECTED` / `NOT CONFIGURED`).
- Live overview of today/month requests, token usage, USD cost, latency, and errors.
- Added live administrative E2E test interface for superadmins to trigger single-call certification tests (`OPENAI_COLLECTIBLES_OK`).

---

## Tests Executed

Automated Vitest test suite (`frontend/src/tests/ai_openai_part2_certification.test.ts` & `frontend/src/tests/ai_gateway.test.ts`):
- [x] **A.** Master Switch OFF → No OpenAI call, returns `AI_DISABLED`.
- [x] **B.** Engine OFF → No OpenAI call, returns `ENGINE_DISABLED`.
- [x] **C.** Country OFF → No OpenAI call, returns `COUNTRY_DISABLED`.
- [x] **D.** Provider NONE → Routes to `NullAIProvider`, returns `PROVIDER_NOT_CONFIGURED`.
- [x] **E.** OpenAI Configured → Dispatches to `/api/ai-execute` correctly.
- [x] **F.** API Key → Never exposed to frontend or client classes.
- [x] **G.** Timeout → Returns `TIMEOUT` status gracefully.
- [x] **H.** 429 → Returns `RATE_LIMITED` status properly.
- [x] **I.** OpenAI Success → Tracks input, output, and total tokens.
- [x] **J.** Pricing Configured → Accurately calculates USD cost per million tokens.
- [x] **K.** Pricing Unknown → Returns `UNKNOWN_PRICING` and avoids false $0.00.
- [x] **L.** Telemetry → Records usage events and metadata properly.
- [x] **M.** Error → Error classification handles invalid outputs safely.
- [x] **N.** Fallback → Fallback handler executes seamlessly when AI fails.
- [x] **O.** GET /api/openai-test → Safe 0-cost diagnostic verification.
- [x] **P.** POST Test Disabled → Rejects live execution in production unless explicitly enabled.

**Result: 20 passed (2 test files, 100% pass rate).**

---

## Build & Production Deployment Result

- **Vite Build Gate:** `npm run build` completed cleanly in 11.16s (0 errors).
- **Git Push:** Committed and pushed to `origin/main` (`5516887`).
- **Production URL:** `https://collectibles.uy` responding HTTP 200 OK.
- **Production API Check:** `https://collectibles.uy/api/openai-test` returned:
  ```json
  {
    "ok": true,
    "configured": true,
    "models": {
      "fast": "gpt-5.6-luna",
      "balanced": "gpt-5.6-terra",
      "reasoning": "gpt-5.6-sol"
    },
    "liveTestEnabled": false
  }
  ```

---

## Remaining Risks

- None identified for Phase 2 infrastructure. Commercial algorithms and autonomous agent behavior remain deferred for Phase 3/4.

---

## Part 2 Verdict

**PART2_CERTIFIED**
