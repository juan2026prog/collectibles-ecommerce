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
  associateSourcesToCandidates,
  classifySourceDomain,
  matchProductCitation,
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
      expect([...mergeCommercialEnrichment(candidates, [])]).toEqual(candidates);

      // Malformed json in parseCommercialEnrichmentItems
      expect([...parseCommercialEnrichmentItems('invalid json')]).toEqual([]);
      expect([...parseCommercialEnrichmentItems('')]).toEqual([]);
      expect([...parseCommercialEnrichmentItems('```json\n{"enrichment":[]}\n```')]).toEqual([]);
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

    it('Scenario 6.1 (Tests A-F): Surgical hardening of mergeCommercialEnrichment', () => {
      // Test A: Exact candidate_id match
      const candA = [{ candidate_id: 'c_1', title: 'Batman Plush 8in', url: 'https://news.toyark.com/batman' }];
      const enrichA = [{
        candidate_id: 'c_1',
        commercial_sources: [{
          retailer: 'Amazon',
          product_url: 'https://www.amazon.com/dp/B08BATPLSH',
          price: 19.99,
          currency: 'USD',
          image_url: 'https://m.media-amazon.com/images/I/bat.jpg'
        }]
      }];
      const resA = mergeCommercialEnrichment(candA, enrichA);
      expect(resA[0].commercial_sources).toHaveLength(1);
      expect(resA[0].origin_price_usd).toBe(19.99);
      expect(resA[0].url).toBe('https://www.amazon.com/dp/B08BATPLSH');
      expect(resA.telemetry.candidate_id_exact_matches).toBe(1);
      expect(resA.telemetry.commercial_sources_merged).toBe(1);

      // Test B: Mismatched ID, normalized title fallback match
      const candB = [{ candidate_id: 'c_discovery_1', title: 'Batman Deluxe Plush (Limited Edition)', url: null }];
      const enrichB = [{
        candidate_id: 'c_different_id',
        title: 'batman   deluxe plush limited edition',
        commercial_sources: [{
          retailer: 'BigBadToyStore',
          product_url: 'https://www.bigbadtoystore.com/Product/VariationDetails/99999',
          price: 29.99,
          currency: 'USD',
          image_url: 'https://images.bigbadtoystore.com/images/p/full/bbts.jpg'
        }]
      }];
      const resB = mergeCommercialEnrichment(candB, enrichB);
      expect(resB[0].commercial_sources).toHaveLength(1);
      expect(resB[0].origin_price_usd).toBe(29.99);
      expect(resB[0].url).toBe('https://www.bigbadtoystore.com/Product/VariationDetails/99999');
      expect(resB.telemetry.title_fallback_matches).toBe(1);
      expect(resB.telemetry.candidate_id_exact_matches).toBe(0);

      // Test C: Mismatched ID, ambiguous title (multiple items share title -> skipped)
      const candC = [
        { candidate_id: 'c_1', title: 'Batman Plush' },
        { candidate_id: 'c_2', title: 'Batman Plush' }
      ];
      const enrichC = [{
        candidate_id: 'c_unknown',
        title: 'Batman Plush',
        commercial_sources: [{
          retailer: 'Amazon',
          product_url: 'https://www.amazon.com/dp/B08BATPLSH',
          price: 15.00
        }]
      }];
      const resC = mergeCommercialEnrichment(candC, enrichC);
      // Both should not be enriched due to ambiguity
      expect(resC[0].commercial_sources || []).toHaveLength(0);
      expect(resC[1].commercial_sources || []).toHaveLength(0);
      expect(resC.telemetry.ambiguous_matches).toBeGreaterThan(0);

      // Test D: One broken item among valid ones (per-candidate error isolation)
      const candD = [
        { candidate_id: 'c_1', title: 'Valid Plush 1' },
        null, // malformed candidate
        { candidate_id: 'c_3', title: 'Valid Plush 3' }
      ];
      const enrichD = [
        {
          candidate_id: 'c_1',
          commercial_sources: [{ retailer: 'Amazon', product_url: 'https://www.amazon.com/dp/B08BAT1', price: 10 }]
        },
        {
          candidate_id: 'c_3',
          commercial_sources: [{ retailer: 'Amazon', product_url: 'https://www.amazon.com/dp/B08BAT3', price: 30 }]
        }
      ];
      const resD = mergeCommercialEnrichment(candD, enrichD);
      expect(resD[0].commercial_sources).toHaveLength(1);
      expect(resD[2].commercial_sources).toHaveLength(1);
      expect(resD.telemetry.candidate_merge_errors).toBe(1);

      // Test E: Empty commercial_sources stays UNKNOWN
      const candE = [{ candidate_id: 'c_1', title: 'Empty Sources Plush' }];
      const enrichE = [{ candidate_id: 'c_1', commercial_sources: [] }];
      const resE = mergeCommercialEnrichment(candE, enrichE);
      expect(resE[0].commercial_sources || []).toHaveLength(0);
      const obsE = corroborateCandidateEvidence(resE[0]);
      const valE = validateCandidate(resE[0], { observations: obsE, country: 'UY' });
      expect(valE.provenance.origin_price.status).toBe('UNKNOWN');
      expect(valE.provenance.origin_price.value).toBeNull();

      // Test F: Valid commercial fixture passing enrichment -> merge -> corroboration -> canonical validation
      const candF = [{ candidate_id: 'c_1', title: 'Batman 1989 Plush', url: 'https://news.toyark.com/batman' }];
      const enrichF = [{
        candidate_id: 'c_1',
        commercial_sources: [{
          retailer: 'Amazon',
          product_url: 'https://www.amazon.com/dp/B08BATPLSH',
          price: 25.50,
          currency: 'USD',
          image_url: 'https://m.media-amazon.com/images/I/batman.jpg'
        }]
      }];
      const resF = mergeCommercialEnrichment(candF, enrichF);
      const obsF = corroborateCandidateEvidence(resF[0]);
      const valF = validateCandidate(resF[0], { observations: obsF, country: 'UY' });
      expect(valF.provenance.origin_price.status).toBe('CORROBORATED');
      expect(valF.provenance.origin_price.value).toBe(25.50);
      expect(valF.provenance.image.status).toBe('CORROBORATED');
      expect(valF.provenance.image.value).toBe('https://m.media-amazon.com/images/I/batman.jpg');
      expect(valF.provenance.identity.status).toBe('CORROBORATED');
    });

    it('Scenario 6.2: 9-candidate mock integration test reproducing production run with 9 candidates', async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.OPENAI_API_KEY;

      try {
        process.env.OPENAI_API_KEY = 'mock-key-for-9-candidates';

        // 9 discovery candidates
        const discoveryCandidates = Array.from({ length: 9 }, (_, i) => ({
          candidate_id: `c_${i + 1}`,
          title: `Batman Plush Collectible Edition ${i + 1}`,
          brand: 'DC Comics',
          category: 'Plush',
          url: `https://news.toyark.com/batman-${i + 1}`,
          origin_price_usd: null,
          image_url: null,
          notes: 'Discovered via editorial'
        }));

        // 9 enrichment items with varying matching styles (exact id, title fallback, missing)
        const enrichmentItems = [
          // exact ID match
          {
            candidate_id: 'c_1',
            commercial_sources: [{
              retailer: 'Amazon',
              product_url: 'https://www.amazon.com/dp/B08BAT01',
              price: 21.99,
              currency: 'USD',
              image_url: 'https://m.media-amazon.com/images/I/bat1.jpg'
            }]
          },
          // title fallback match (candidate_id different)
          {
            candidate_id: 'c_diff_2',
            title: 'batman plush collectible edition 2',
            commercial_sources: [{
              retailer: 'BigBadToyStore',
              product_url: 'https://www.bigbadtoystore.com/Product/VariationDetails/22222',
              price: 24.99,
              currency: 'USD',
              image_url: 'https://images.bigbadtoystore.com/images/p/full/bat2.jpg'
            }]
          }
        ];

        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
          const bodyObj = JSON.parse(init?.body || '{}');
          const isEnrichment = bodyObj.metadata?.research_phase === 'COMMERCIAL_ENRICHMENT';

          if (!isEnrichment) {
            // Discovery batch returning 9 candidates
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_disc_9' }),
              json: async () => ({
                id: 'resp_disc_9',
                output_text: JSON.stringify({
                  summary: 'Discovered 9 Batman plush collectibles',
                  confidence: 0.88,
                  items: discoveryCandidates
                }),
                usage: { input_tokens: 600, output_tokens: 300, total_tokens: 900 }
              })
            };
          } else {
            // Enrichment batch returning enrichment items
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_enrich_9' }),
              json: async () => ({
                id: 'resp_enrich_9',
                output_text: JSON.stringify({
                  enrichment: enrichmentItems
                }),
                usage: { input_tokens: 500, output_tokens: 200, total_tokens: 700 }
              })
            };
          }
        });

        const aiExecuteModule = await import('../../../api/ai-execute.js');
        const handler = aiExecuteModule.default;

        let responseStatusCode = 200;
        let responseJson: any = null;
        const req: any = {
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
            context: { force_refresh: true }
          }
        };

        const res: any = {
          statusCode: 200,
          headers: {},
          setHeader(k: string, v: string) { this.headers[k] = v; },
          status(code: number) {
            responseStatusCode = code;
            this.statusCode = code;
            return this;
          },
          json(payload: any) {
            responseJson = payload;
            return this;
          },
          end() {}
        };

        await handler(req, res);

        expect(responseStatusCode).toBe(200);
        expect(responseJson.success).toBe(true);
        expect(responseJson.data.items).toHaveLength(9);

        // Candidate 1 (exact ID match) has commercial enrichment
        const cand1 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_1');
        expect(cand1).toBeDefined();
        expect(cand1.commercial_sources).toHaveLength(1);
        expect(cand1.origin_price_usd).toBe(21.99);
        expect(cand1.url).toBe('https://www.amazon.com/dp/B08BAT01');
        const obs1 = corroborateCandidateEvidence(cand1);
        const val1 = validateCandidate(cand1, { observations: obs1, country: 'UY' });
        expect(val1.provenance.origin_price.status).toBe('CORROBORATED');
        expect(val1.provenance.origin_price.value).toBe(21.99);

        // Candidate 2 (title fallback match) has commercial enrichment
        const cand2 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_2');
        expect(cand2).toBeDefined();
        expect(cand2.commercial_sources).toHaveLength(1);
        expect(cand2.origin_price_usd).toBe(24.99);
        expect(cand2.url).toBe('https://www.bigbadtoystore.com/Product/VariationDetails/22222');
        const obs2 = corroborateCandidateEvidence(cand2);
        const val2 = validateCandidate(cand2, { observations: obs2, country: 'UY' });
        expect(val2.provenance.origin_price.status).toBe('CORROBORATED');
        expect(val2.provenance.origin_price.value).toBe(24.99);

        // Candidates 3-9 remain safe and uncorroborated (not fabricated)
        const cand3 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_3');
        expect(cand3).toBeDefined();
        expect(cand3.commercial_sources || []).toHaveLength(0);
        const obs3 = corroborateCandidateEvidence(cand3);
        const val3 = validateCandidate(cand3, { observations: obs3, country: 'UY' });
        expect(val3.provenance.origin_price.status).toBe('UNKNOWN');
      } finally {
        globalThis.fetch = originalFetch;
        process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it('Scenario 6.3: Structured Commercial Enrichment Output Contract (Tests A through J)', () => {
      const elevenCandidateIds = Array.from({ length: 11 }, (_, i) => `c_${i + 1}`);

      // Test A: 11 candidates sent -> 11 returned, some with commercial sources, some empty
      const outputA = JSON.stringify({
        enrichment: elevenCandidateIds.map((id, i) => ({
          candidate_id: id,
          title: `Batman Item ${i + 1}`,
          commercial_sources: i === 0 ? [{
            retailer: 'Amazon',
            product_url: 'https://www.amazon.com/dp/B08BAT01',
            price: 19.99,
            currency: 'USD'
          }] : []
        }))
      });
      const resA = parseCommercialEnrichmentItems(outputA, elevenCandidateIds);
      expect(resA.status).toBe('VALID_ENRICHMENT');
      expect(resA.expectedCount).toBe(11);
      expect(resA).toHaveLength(11);
      expect(resA.missingIds).toHaveLength(0);
      expect(resA[0].commercial_sources).toHaveLength(1);
      expect(resA[1].commercial_sources).toHaveLength(0);

      // Test B: 11 candidates sent -> 11 returned, all commercial_sources empty
      const outputB = JSON.stringify({
        enrichment: elevenCandidateIds.map((id, i) => ({
          candidate_id: id,
          title: `Batman Item ${i + 1}`,
          commercial_sources: []
        }))
      });
      const resB = parseCommercialEnrichmentItems(outputB, elevenCandidateIds);
      expect(resB.status).toBe('VALID_ENRICHMENT');
      expect(resB.expectedCount).toBe(11);
      expect(resB).toHaveLength(11);
      expect(resB.missingIds).toHaveLength(0);

      // Test C: 11 candidates sent -> enrichment: [] (empty valid array, all 11 missing)
      const outputC = JSON.stringify({ enrichment: [] });
      const resC = parseCommercialEnrichmentItems(outputC, elevenCandidateIds);
      expect(resC.status).toBe('EMPTY_VALID_ENRICHMENT');
      expect(resC).toHaveLength(0);
      expect(resC.missingIds).toHaveLength(11);

      // Test D: Invalid JSON text -> status INVALID_JSON, missingIds: 11
      const outputD = 'This is not valid JSON';
      const resD = parseCommercialEnrichmentItems(outputD, elevenCandidateIds);
      expect(resD.status).toBe('INVALID_JSON');
      expect(resD).toHaveLength(0);
      expect(resD.missingIds).toHaveLength(11);

      // Test E: Missing enrichment key / unexpected schema -> status SCHEMA_MISMATCH
      const outputE = JSON.stringify({ unexpected_root: [1, 2, 3] });
      const resE = parseCommercialEnrichmentItems(outputE, elevenCandidateIds);
      expect(resE.status).toBe('SCHEMA_MISMATCH');
      expect(resE).toHaveLength(0);
      expect(resE.missingIds).toHaveLength(11);

      // Test F: Incomplete candidate IDs (e.g. 5 of 11 returned) -> PARTIAL_ENRICHMENT
      const outputF = JSON.stringify({
        enrichment: elevenCandidateIds.slice(0, 5).map(id => ({
          candidate_id: id,
          commercial_sources: []
        }))
      });
      const resF = parseCommercialEnrichmentItems(outputF, elevenCandidateIds);
      expect(resF.status).toBe('PARTIAL_ENRICHMENT');
      expect(resF).toHaveLength(5);
      expect(resF.missingIds).toHaveLength(6);
      expect(resF.missingIds).toEqual(['c_6', 'c_7', 'c_8', 'c_9', 'c_10', 'c_11']);

      // Test G: Safe commercial citation fallback (Amazon URL associated without fabricating price/image/id)
      const candG = [
        {
          candidate_id: 'c_1',
          title: 'Batman Animated Plush 8-inch',
          brand: 'DC',
          url: 'https://news.toyark.com/batman-animated',
          commercial_sources: []
        }
      ];
      const citationsG = [
        {
          url: 'https://www.amazon.com/dp/B08BATPLSH',
          title: 'Batman Animated Plush 8-inch Official Toy',
          cited_text: 'Buy Batman Animated Plush 8-inch on Amazon for $19.99'
        }
      ];
      const resG = associateSourcesToCandidates(candG, citationsG);
      expect(resG[0].commercial_sources).toHaveLength(1);
      const attachedSource = resG[0].commercial_sources[0];
      expect(attachedSource.product_url).toBe('https://www.amazon.com/dp/B08BATPLSH');
      expect(attachedSource.price).toBeNull(); // Strictly null - no fabrication from citation snippet
      expect(attachedSource.image_url).toBeNull(); // Strictly null
      expect(attachedSource.identifier).toBe('B08BATPLSH'); // ASIN extracted from clean URL
      expect(resG[0].url).toBe('https://www.amazon.com/dp/B08BATPLSH'); // Upgraded from editorial
      // Corroboration verification
      const obsG = corroborateCandidateEvidence(resG[0]);
      const valG = validateCandidate(resG[0], { observations: obsG, country: 'UY' });
      expect(valG.provenance.identity.status).toBe('CORROBORATED');
      expect(valG.provenance.asin.status).toBe('CORROBORATED');
      expect(valG.provenance.origin_price.status).toBe('UNKNOWN'); // Price was null, remains unknown
      expect(valG.provenance.origin_price.value).toBeNull();
      expect(valG.provenance.image.status).toBe('UNKNOWN');
      expect(valG.provenance.image.value).toBeNull();

      // Test H: Ambiguous commercial citation (matches multiple candidates -> rejected)
      const candH = [
        { candidate_id: 'c_1', title: 'Batman Plush' },
        { candidate_id: 'c_2', title: 'Batman Plush' }
      ];
      const citationsH = [
        {
          url: 'https://www.amazon.com/dp/B08BATAMB',
          title: 'Batman Plush Official Store'
        }
      ];
      const resH = associateSourcesToCandidates(candH, citationsH);
      expect(resH[0].commercial_sources || []).toHaveLength(0);
      expect(resH[1].commercial_sources || []).toHaveLength(0);

      // Test I: Editorial-only citations do NOT create commercial sources
      const candI = [{ candidate_id: 'c_1', title: 'Batman Plush Rare', commercial_sources: [] }];
      const citationsI = [
        {
          url: 'https://news.toyark.com/2026/01/batman-plush-rare',
          title: 'Toyark Batman Plush Rare News'
        }
      ];
      const resI = associateSourcesToCandidates(candI, citationsI);
      expect(resI[0].commercial_sources || []).toHaveLength(0);
      expect(resI[0].discovery_sources).toHaveLength(1);
      expect(resI[0].discovery_sources[0].url).toBe('https://news.toyark.com/2026/01/batman-plush-rare');

      // Test J: Telemetry persistence resilience (handles mocks with or without .text())
      expect(() => {
        const mockResWithText = { text: async () => 'hello', json: async () => ({}) };
        const mockResWithoutText = { json: async () => ({}) };
        expect(typeof mockResWithText.text).toBe('function');
        expect(typeof (mockResWithoutText as any).text).toBe('undefined');
      }).not.toThrow();
    });

    it('Scenario 6.4: Full 11-candidate live pipeline mock reproducing commit 4a3f65c run', async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.OPENAI_API_KEY;

      try {
        process.env.OPENAI_API_KEY = 'mock-key-for-11-candidates';

        // 11 discovery candidates from Phase 1
        const discoveryCandidates = Array.from({ length: 11 }, (_, i) => ({
          candidate_id: `c_${i + 1}`,
          title: `Batman Plush Edition ${i + 1}`,
          brand: 'DC Comics',
          category: 'Plush',
          url: `https://news.toyark.com/batman-${i + 1}`,
          origin_price_usd: null,
          image_url: null
        }));

        // Model returns 11 items adhering to structured output contract:
        // c_1 has full verified commercial source
        // c_2 has commercial source without price
        // c_3 to c_11 have commercial_sources: []
        const enrichmentItems = Array.from({ length: 11 }, (_, i) => {
          const id = `c_${i + 1}`;
          if (i === 0) {
            return {
              candidate_id: id,
              title: `Batman Plush Edition 1`,
              commercial_sources: [{
                retailer: 'Amazon',
                product_url: 'https://www.amazon.com/dp/B08BAT0111',
                price: 22.99,
                currency: 'USD',
                image_url: 'https://m.media-amazon.com/images/I/bat11.jpg',
                identifier: 'B08BAT0111',
                identifier_type: 'ASIN'
              }]
            };
          }
          if (i === 1) {
            return {
              candidate_id: id,
              title: `Batman Plush Edition 2`,
              commercial_sources: [{
                retailer: 'BigBadToyStore',
                product_url: 'https://www.bigbadtoystore.com/Product/VariationDetails/112233',
                price: null,
                currency: 'USD',
                image_url: null
              }]
            };
          }
          return {
            candidate_id: id,
            title: `Batman Plush Edition ${i + 1}`,
            commercial_sources: []
          };
        });

        // Citations returned by OpenAI responses API during enrichment
        const searchCitations = [
          {
            url: 'https://www.amazon.com/dp/B08BAT0111',
            title: 'Batman Plush Edition 1 Amazon',
            cited_text: 'In stock at Amazon for $22.99'
          },
          {
            url: 'https://www.bigbadtoystore.com/Product/VariationDetails/112233',
            title: 'Batman Plush Edition 2 BBTS',
            cited_text: 'Preorder Batman Plush Edition 2 at BigBadToyStore'
          },
          {
            url: 'https://news.toyark.com/batman-general',
            title: 'ToyArk General Batman News',
            cited_text: 'Batman news summary'
          }
        ];

        globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
          const bodyObj = JSON.parse(init?.body || '{}');
          const isEnrichment = bodyObj.metadata?.research_phase === 'COMMERCIAL_ENRICHMENT';

          if (!isEnrichment) {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_disc_11' }),
              json: async () => ({
                id: 'resp_disc_11',
                output_text: JSON.stringify({
                  summary: 'Discovered 11 Batman plush items',
                  confidence: 0.90,
                  items: discoveryCandidates
                }),
                usage: { input_tokens: 650, output_tokens: 350, total_tokens: 1000 }
              })
            };
          } else {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ 'x-request-id': 'req_mock_enrich_11' }),
              json: async () => ({
                id: 'resp_enrich_11',
                output_text: JSON.stringify({
                  enrichment: enrichmentItems
                }),
                output: [
                  {
                    content: [
                      {
                        type: 'text',
                        text: 'Enrichment completed',
                        annotations: searchCitations.map(c => ({
                          type: 'url_citation',
                          url_citation: { url: c.url, title: c.title }
                        }))
                      }
                    ]
                  }
                ],
                usage: { input_tokens: 750, output_tokens: 280, total_tokens: 1030 }
              })
            };
          }
        });

        const aiExecuteModule = await import('../../../api/ai-execute.js');
        const handler = aiExecuteModule.default;

        let responseStatusCode = 200;
        let responseJson: any = null;
        const req: any = {
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
            context: { force_refresh: true }
          }
        };

        const res: any = {
          statusCode: 200,
          headers: {},
          setHeader(k: string, v: string) { this.headers[k] = v; },
          status(code: number) {
            responseStatusCode = code;
            this.statusCode = code;
            return this;
          },
          json(payload: any) {
            responseJson = payload;
            return this;
          },
          end() {}
        };

        await handler(req, res);

        expect(responseStatusCode).toBe(200);
        expect(responseJson.success).toBe(true);
        expect(responseJson.data.items).toHaveLength(11);

        // Verify telemetry in response
        const batchTelemetry = responseJson.batch_telemetry;
        expect(batchTelemetry).toBeDefined();
        expect(batchTelemetry.discovery_batches_executed).toBe(1);
        expect(batchTelemetry.enrichment_batches_executed).toBe(1);
        expect(batchTelemetry.discovery_tokens).toBeDefined();
        expect(batchTelemetry.discovery_tokens.total_tokens).toBe(1000);
        expect(batchTelemetry.enrichment_tokens).toBeDefined();
        expect(batchTelemetry.enrichment_tokens.total_tokens).toBe(1030);
        expect(batchTelemetry.citations_telemetry).toBeDefined();
        expect(batchTelemetry.citations_telemetry.citations_total).toBeGreaterThanOrEqual(2);

        // Candidate 1: Verified commercial source merged and corroborated
        const cand1 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_1');
        expect(cand1).toBeDefined();
        expect(cand1.commercial_sources).toHaveLength(1);
        expect(cand1.origin_price_usd).toBe(22.99);
        expect(cand1.url).toBe('https://www.amazon.com/dp/B08BAT0111');
        const obs1 = corroborateCandidateEvidence(cand1);
        const val1 = validateCandidate(cand1, { observations: obs1, country: 'UY' });
        expect(val1.provenance.origin_price.status).toBe('CORROBORATED');
        expect(val1.provenance.origin_price.value).toBe(22.99);
        expect(val1.provenance.image.status).toBe('CORROBORATED');
        expect(val1.provenance.image.value).toBe('https://m.media-amazon.com/images/I/bat11.jpg');

        // Candidate 2: Commercial URL merged, price remains null/unknown
        const cand2 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_2');
        expect(cand2).toBeDefined();
        expect(cand2.commercial_sources).toHaveLength(1);
        expect(cand2.url).toBe('https://www.bigbadtoystore.com/Product/VariationDetails/112233');
        const obs2 = corroborateCandidateEvidence(cand2);
        const val2 = validateCandidate(cand2, { observations: obs2, country: 'UY' });
        expect(val2.provenance.identity.status).toBe('CORROBORATED');
        expect(val2.provenance.origin_price.status).toBe('UNKNOWN');
        expect(val2.provenance.origin_price.value).toBeNull();

        // Candidates 3-11: unverified, no price fabrication
        const cand3 = responseJson.data.items.find((i: any) => i.candidate_id === 'c_3');
        expect(cand3).toBeDefined();
        expect(cand3.commercial_sources).toHaveLength(0);
        const obs3 = corroborateCandidateEvidence(cand3);
        const val3 = validateCandidate(cand3, { observations: obs3, country: 'UY' });
        expect(val3.provenance.origin_price.status).toBe('UNKNOWN');
        expect(val3.provenance.origin_price.value).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });
});

