import { describe, it, expect, vi } from 'vitest';
import { 
  planDiscoveryBatches,
  planEnrichmentBatches,
  buildDiscoveryPrompt,
  buildCommercialEnrichmentPrompt,
  parseCommercialEnrichmentItems,
  calculatePreFlightEstimate,
  RESEARCH_MODES
} from '../../../server/lib/researchCostOptimizer.js';
import { 
  mergeCommercialEnrichment,
  corroborateCandidateEvidence,
  PRODUCT_HOSTS,
  IMAGE_HOSTS
} from '../../../server/lib/sourcingSourceVerifier.js';
import { validateCandidate } from '../../../shared/sourcingCandidateValidation.js';

describe('Sourcing V2 — Two-Phase Discovery & Commercial Enrichment Architecture', () => {

  describe('1. Batch Planning Protocols', () => {
    it('plans AUTO(15) with target 15, minimum useful target 8, max 2 batches', () => {
      const plan = planDiscoveryBatches('AUTO');
      expect(plan.targetCount).toBe(15);
      expect(plan.minimumUsefulTarget).toBe(8);
      expect(plan.maxBatches).toBe(2);
      expect(plan.batchCount).toBe(1); // Primary planned batch
      expect(plan.batches).toHaveLength(2);
      expect(plan.batches[0].targetCount).toBe(15);
      expect(plan.batches[1].targetCount).toBe(10);
    });

    it('plans fixed limits correctly (10, 25, 50, 100)', () => {
      const plan10 = planDiscoveryBatches(10);
      expect(plan10.targetCount).toBe(10);
      expect(plan10.maxBatches).toBe(1);

      const plan25 = planDiscoveryBatches(25);
      expect(plan25.targetCount).toBe(25);
      expect(plan25.maxBatches).toBe(2);

      const plan50 = planDiscoveryBatches(50);
      expect(plan50.targetCount).toBe(50);
      expect(plan50.maxBatches).toBe(3);

      const plan100 = planDiscoveryBatches(100);
      expect(plan100.targetCount).toBe(100);
      expect(plan100.maxBatches).toBe(5);
    });

    it('plans commercial enrichment batches in chunks of <= 15 items', () => {
      const enrich0 = planEnrichmentBatches(0);
      expect(enrich0.batchCount).toBe(0);

      const enrich6 = planEnrichmentBatches(6);
      expect(enrich6.batchCount).toBe(1);
      expect(enrich6.batches[0].count).toBe(6);

      const enrich15 = planEnrichmentBatches(15);
      expect(enrich15.batchCount).toBe(1);
      expect(enrich15.batches[0].count).toBe(15);

      const enrich16 = planEnrichmentBatches(16);
      expect(enrich16.batchCount).toBe(2);
      expect(enrich16.batches[0].count).toBe(15);
      expect(enrich16.batches[1].count).toBe(1);
    });
  });

  describe('2. Prompt Construction & Parsing', () => {
    it('builds Phase 1 Discovery prompt with candidate_id and exclusion instructions', () => {
      const prompt = buildDiscoveryPrompt('peluches de batman', 'UY', RESEARCH_MODES.ECONOMICO, 'ALL_TIME', 'ALL', 'AUTO', {
        batchIndex: 2,
        targetCount: 10,
        excludeTitles: ['Batman Plush 8-inch', 'DC Batman Chibi Plush']
      });

      expect(prompt).toContain('FASE 1: DESCUBRIMIENTO');
      expect(prompt).toContain('candidate_id');
      expect(prompt).toContain('Batman Plush 8-inch');
      expect(prompt).toContain('discovery_source');
      expect(prompt).toContain('NUNCA inventes');
    });

    it('builds Phase 2 Commercial Enrichment prompt with grouped candidate IDs', () => {
      const candidates = [
        { candidate_id: 'c_1', title: 'Batman 1989 8-Inch Plush', brand: 'NECA', franchise: 'Batman', size: '8 inch' },
        { candidate_id: 'c_2', title: 'The Dark Knight Phunny Plush', brand: 'Kidrobot', franchise: 'Batman' }
      ];
      const prompt = buildCommercialEnrichmentPrompt(candidates, 'UY', RESEARCH_MODES.ECONOMICO);

      expect(prompt).toContain('FASE 2: ENRIQUECIMIENTO COMERCIAL');
      expect(prompt).toContain('[c_1] "Batman 1989 8-Inch Plush"');
      expect(prompt).toContain('[c_2] "The Dark Knight Phunny Plush"');
      expect(prompt).toContain('commercial_sources');
    });

    it('parses commercial enrichment JSON responses cleanly', () => {
      const sampleResponse = JSON.stringify({
        enrichment: [
          {
            candidate_id: 'c_1',
            commercial_sources: [
              {
                retailer: 'Amazon',
                product_url: 'https://www.amazon.com/dp/B001TESTASIN',
                price: 18.99,
                currency: 'USD',
                image_url: 'https://m.media-amazon.com/images/I/71test.jpg',
                identifier: 'B001TESTASIN',
                identifier_type: 'ASIN',
                evidence: 'In stock at $18.99'
              }
            ]
          }
        ]
      });

      const parsed = parseCommercialEnrichmentItems(sampleResponse);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].candidate_id).toBe('c_1');
      expect(parsed[0].commercial_sources).toHaveLength(1);
      expect(parsed[0].commercial_sources[0].price).toBe(18.99);
      expect(parsed[0].commercial_sources[0].identifier).toBe('B001TESTASIN');
    });
  });

  describe('3. Commercial Enrichment Merging & Anti-Synthetic Invariants', () => {
    it('merges commercial sources and updates primary candidate fields when from whitelisted hosts', () => {
      const candidates = [
        {
          candidate_id: 'c_1',
          title: 'Batman 1989 8-Inch Plush',
          brand: 'NECA',
          url: 'https://news.toyark.com/2026/01/neca-batman-plush-announced',
          origin_price_usd: null,
          image_url: null
        }
      ];

      const enrichment = [
        {
          candidate_id: 'c_1',
          commercial_sources: [
            {
              retailer: 'BigBadToyStore',
              product_url: 'https://www.bigbadtoystore.com/Product/VariationDetails/123456',
              price: 24.99,
              currency: 'USD',
              image_url: 'https://images.bigbadtoystore.com/images/p/full/2026/01/neca-batman.jpg'
            }
          ]
        }
      ];

      const merged = mergeCommercialEnrichment(candidates, enrichment);
      expect(merged[0].commercial_sources).toHaveLength(1);
      expect(merged[0].url).toBe('https://www.bigbadtoystore.com/Product/VariationDetails/123456');
      expect(merged[0].origin_price_usd).toBe(24.99);
      expect(merged[0].image_url).toBe('https://images.bigbadtoystore.com/images/p/full/2026/01/neca-batman.jpg');

      // Passes canonical corroboration & validation
      const observations = corroborateCandidateEvidence(merged[0]);
      const validated = validateCandidate(merged[0], { observations, country: 'UY' });

      expect(validated.provenance.origin_price.status).toBe('CORROBORATED');
      expect(validated.provenance.origin_price.value).toBe(24.99);
      expect(validated.provenance.image.status).toBe('CORROBORATED');
      expect(validated.provenance.image.value).toBe('https://images.bigbadtoystore.com/images/p/full/2026/01/neca-batman.jpg');
      expect(validated.provenance.identity.status).toBe('CORROBORATED');
    });

    it('rejects candidate_id bypass when commercial source is from unapproved domain or fake image', () => {
      const candidates = [
        {
          candidate_id: 'c_1',
          title: 'Fake Unknown Plush',
          url: 'https://unauthorized-store.xyz/item',
          origin_price_usd: 15.00,
          image_url: 'https://images.unsplash.com/photo-12345678'
        }
      ];

      const enrichment = [
        {
          candidate_id: 'c_1',
          commercial_sources: [
            {
              retailer: 'Unauthorized',
              product_url: 'https://unauthorized-store.xyz/item',
              price: 15.00,
              currency: 'USD',
              image_url: 'https://images.unsplash.com/photo-12345678'
            }
          ]
        }
      ];

      const merged = mergeCommercialEnrichment(candidates, enrichment);
      const observations = corroborateCandidateEvidence(merged[0]);
      const validated = validateCandidate(merged[0], { observations, country: 'UY' });

      // Unsplash and unauthorized domains MUST NOT be corroborated
      expect(validated.provenance.image.status).toBe('UNKNOWN');
      expect(validated.provenance.image.value).toBeNull();
      expect(validated.provenance.origin_price.status).toBe('UNKNOWN');
      expect(validated.provenance.origin_price.value).toBeNull();
    });
  });

  describe('4. Preflight Cost Estimation with Two Phases', () => {
    it('computes preflight estimate detailing discovery and enrichment phases', () => {
      const est = calculatePreFlightEstimate({
        query: 'peluches de batman',
        country: 'UY',
        researchDepth: 'ECONOMICO',
        resultLimit: 'AUTO'
      });

      expect(est.phases).toBeDefined();
      expect(est.phases.discovery.expected_batches).toBe(1);
      expect(est.phases.discovery.max_batches).toBe(2);
      expect(est.phases.commercial_enrichment.expected_batches).toBe(1);
      expect(est.phases.commercial_enrichment.max_batches).toBe(1);

      expect(est.estimated_cost_expected_usd).toBeGreaterThan(0);
      expect(est.estimated_cost_max_usd).toBeGreaterThanOrEqual(est.estimated_cost_expected_usd);
      expect(est.estimated_cost_max_usd).toBeLessThan(0.02);
      expect(est.openai_calls_used).toBe(0);
    });
  });

  describe('5. Robustness & Regression Protection', () => {
    it('handles empty, partial, and varied enrichment responses without crashing', () => {
      const candidates = [
        { candidate_id: 'c_1', title: 'Batman Plush' },
        { candidate_id: 'c_2', title: 'Robin Plush' }
      ];

      // Missing commercial_sources
      const partial1 = [{ candidate_id: 'c_1' }];
      expect(() => mergeCommercialEnrichment(candidates, partial1)).not.toThrow();

      // Empty enrichment array
      expect(mergeCommercialEnrichment(candidates, [])).toEqual(candidates);

      // Malformed json in parseCommercialEnrichmentItems
      expect(parseCommercialEnrichmentItems('invalid json')).toEqual([]);
      expect(parseCommercialEnrichmentItems('')).toEqual([]);
      expect(parseCommercialEnrichmentItems('```json\n{"enrichment":[]}\n```')).toEqual([]);
    });

    it('loads api/ai-execute.js without any syntax or scope errors', async () => {
      const aiExecuteModule = await import('../../../api/ai-execute.js');
      expect(typeof aiExecuteModule.default).toBe('function');
    });

    it('executes handler for Sourcing Research without throwing ReferenceError: tools is not defined', async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.OPENAI_API_KEY;
      const fetchCalls = [];

      try {
        process.env.OPENAI_API_KEY = 'mock-test-key-for-vitest';

        // Mock global fetch to handle Responses API requests
        globalThis.fetch = vi.fn(async (url, init) => {
          fetchCalls.push({ url, init });
          const body = JSON.parse(init?.body || '{}');
          const phase = body.metadata?.research_phase;

          if (phase === 'DISCOVERY') {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_disc_1' }),
              json: async () => ({
                id: 'resp_mock_disc_1',
                model: 'gpt-4o-mini',
                output_text: JSON.stringify({
                  summary: 'Peluches de Batman descubiertos',
                  confidence: 0.92,
                  subtrends: ['Batman plush collectors'],
                  discoveries: [
                    {
                      candidate_id: 'c_1',
                      title: 'Batman Plush 8-inch Action Figure Doll',
                      brand: 'NECA',
                      franchise: 'Batman',
                      category: 'Plush',
                      discovery_source: 'https://toynewsi.com/batman-plush'
                    },
                    {
                      candidate_id: 'c_2',
                      title: 'The Dark Knight Phunny Plush',
                      brand: 'Kidrobot',
                      franchise: 'Batman',
                      category: 'Plush',
                      discovery_source: 'https://toynewsi.com/phunny-batman'
                    }
                  ]
                }),
                output: [
                  {
                    content: [
                      {
                        type: 'text',
                        text: 'Peluches de Batman descubiertos',
                        annotations: [
                          {
                            type: 'url_citation',
                            url_citation: {
                              url: 'https://toynewsi.com/batman-plush',
                              title: 'ToyNewsI Batman Plush'
                            }
                          }
                        ]
                      }
                    ]
                  }
                ],
                usage: { input_tokens: 450, output_tokens: 180, total_tokens: 630 }
              })
            };
          }

          if (phase === 'COMMERCIAL_ENRICHMENT') {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_enrich_1' }),
              json: async () => ({
                id: 'resp_mock_enrich_1',
                model: 'gpt-4o-mini',
                output_text: JSON.stringify({
                  enrichment: [
                    {
                      candidate_id: 'c_1',
                      asin: 'B08BATPLSH',
                      commercial_sources: [
                        {
                          retailer: 'Amazon',
                          product_url: 'https://www.amazon.com/dp/B08BATPLSH',
                          price: 19.99,
                          currency: 'USD',
                          image_url: 'https://m.media-amazon.com/images/I/batman.jpg'
                        }
                      ]
                    }
                  ]
                }),
                output: [
                  {
                    content: [
                      {
                        type: 'text',
                        text: 'Commercial data enriched',
                        annotations: [
                          {
                            type: 'url_citation',
                            url_citation: {
                              url: 'https://www.amazon.com/dp/B08BATPLSH',
                              title: 'Amazon Product'
                            }
                          }
                        ]
                      }
                    ]
                  }
                ],
                usage: { input_tokens: 520, output_tokens: 140, total_tokens: 660 }
              })
            };
          }

          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-request-id': 'req_mock_default' }),
            json: async () => ({ id: 'resp_default', output_text: '{}', usage: {} })
          };
        });

        const aiExecuteModule = await import('../../../api/ai-execute.js');
        const handler = aiExecuteModule.default;

        let responseStatusCode = 200;
        let responseJson = null;
        const req = {
          method: 'POST',
          headers: {
            'x-test-auth': 'admin',
            'authorization': 'Bearer test-mock-token'
          },
          body: {
            engine: 'RESEARCH_INTELLIGENCE',
            operation: 'sourcing_research',
            query: 'peluches de batman',
            country: 'UY',
            research_depth: 'ECONOMICO',
            result_limit: 'AUTO',
            context: {
              force_refresh: true
            }
          }
        };

        const res = {
          statusCode: 200,
          headers: {},
          setHeader(k, v) { this.headers[k] = v; },
          status(code) {
            responseStatusCode = code;
            this.statusCode = code;
            return this;
          },
          json(payload) {
            responseJson = payload;
            return this;
          },
          end() {}
        };

        await handler(req, res);

        // Verify successful execution and no 500 error
        expect(responseStatusCode).toBe(200);
        expect(responseJson).toBeDefined();
        expect(responseJson.success).toBe(true);
        expect(responseJson.status).toBe('SUCCESS');
        expect(responseJson.data).toBeDefined();
        expect(Array.isArray(responseJson.data.items)).toBe(true);
        expect(responseJson.data.items.length).toBe(2);

        // Verify that fetch calls were made with tools defined
        const openAiCalls = fetchCalls.filter(c => String(c.url).includes('api.openai.com'));
        expect(openAiCalls.length).toBeGreaterThanOrEqual(2);
        const firstCallBody = JSON.parse(openAiCalls[0].init.body);
        expect(firstCallBody.tools).toBeDefined();
        expect(firstCallBody.tools[0].type).toBe('web_search');
      } finally {
        globalThis.fetch = originalFetch;
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

});
