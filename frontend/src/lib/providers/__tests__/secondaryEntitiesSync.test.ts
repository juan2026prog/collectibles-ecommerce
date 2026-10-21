import { describe, it, expect, vi } from 'vitest';
import workerApp, {
  type Env,
  type D1Database,
  type D1PreparedStatement,
} from '../../../../../cloudflare/collectibles-catalog-api/src/index';
import {
  syncPromotionsToCloudflareD1,
  syncRadarToCloudflareD1,
  syncSettingsToCloudflareD1,
  processOutboxBatch,
  calculateNextBackoff,
} from '../../../../../supabase/functions/_shared/cloudflareCatalogSync';

const SYNC_SECRET = 'test-secret-collectibles-2026-very-secure';

function createMockDb(): D1Database & {
  radarMap: Map<string, any>;
  promotionsMap: Map<string, any>;
  bannersMap: Map<string, any>;
  badgesMap: Map<string, any>;
  settingsMap: Map<string, string>;
} {
  const radarMap = new Map<string, any>();
  const promotionsMap = new Map<string, any>();
  const bannersMap = new Map<string, any>();
  const badgesMap = new Map<string, any>();
  const settingsMap = new Map<string, string>();

  function createStatement(sql: string, boundValues: unknown[] = []): D1PreparedStatement {
    return {
      bind(...values: unknown[]) {
        return createStatement(sql, values);
      },
      async run() {
        const normalized = sql.replace(/\s+/g, ' ').trim();

        // 1. Radar
        if (normalized.includes('INSERT INTO public_radar_releases')) {
          const [id, title, slug, brand_id, brand_name, brand_slug, license_id, license_name, license_slug,
                 category, release_date, estimated_quarter, status, msrp_usd, currency, hero_image_url,
                 gallery_json, description, editorial_summary, hype_score, is_featured,
                 milestones_json, related_products_json, created_at, updated_at] = boundValues;
          radarMap.set(String(id), {
            id, title, slug, brand_id, brand_name, brand_slug, license_id, license_name, license_slug,
            category, release_date, estimated_quarter, status, msrp_usd, currency, hero_image_url,
            gallery_json, description, editorial_summary, hype_score, is_featured,
            milestones_json, related_products_json, created_at, updated_at,
          });
          return { success: true, meta: { changes: 1, duration: 1 } };
        }
        if (normalized.includes('DELETE FROM public_radar_releases WHERE id = ?')) {
          const [id] = boundValues;
          radarMap.delete(String(id));
          return { success: true, meta: { changes: 1, duration: 1 } };
        }

        // 2. Promotions
        if (normalized.includes('INSERT INTO public_promotions')) {
          const [id, name, description, type, value, min_purchase_amount, max_discount_amount,
                 starts_at, ends_at, is_active, priority, stackable, badge_text, applies_to_all,
                 targets_json, exclusions_json, tiers_json, group_items_json, updated_at] = boundValues;
          promotionsMap.set(String(id), {
            id, name, description, type, value, min_purchase_amount, max_discount_amount,
            starts_at, ends_at, is_active, priority, stackable, badge_text, applies_to_all,
            targets_json, exclusions_json, tiers_json, group_items_json, updated_at,
          });
          return { success: true, meta: { changes: 1, duration: 1 } };
        }
        if (normalized.includes('UPDATE public_promotions SET is_active = 0')) {
          const [id] = boundValues;
          const existing = promotionsMap.get(String(id));
          if (existing) {
            existing.is_active = 0;
            existing.updated_at = new Date().toISOString();
          }
          return { success: true, meta: { changes: 1, duration: 1 } };
        }

        // 3. Settings
        if (normalized.includes('INSERT INTO public_site_settings')) {
          const [key, value_json] = boundValues;
          settingsMap.set(String(key), String(value_json));
          return { success: true, meta: { changes: 1, duration: 1 } };
        }

        // 4. Banners
        if (normalized.includes('INSERT INTO public_banners')) {
          const [id, title, subtitle, image_url, mobile_image_url, link_url, cta_text,
                 position, sort_order, is_active, starts_at, ends_at, updated_at] = boundValues;
          bannersMap.set(String(id), {
            id, title, subtitle, image_url, mobile_image_url, link_url, cta_text,
            position, sort_order, is_active, starts_at, ends_at, updated_at,
          });
          return { success: true, meta: { changes: 1, duration: 1 } };
        }
        if (normalized.includes('UPDATE public_banners SET is_active = 0')) {
          const [id] = boundValues;
          const existing = bannersMap.get(String(id));
          if (existing) {
            existing.is_active = 0;
          }
          return { success: true, meta: { changes: 1, duration: 1 } };
        }

        // 5. Badges
        if (normalized.includes('INSERT INTO public_badges')) {
          const [id, name, slug, label, bg_color, text_color, icon, is_active, updated_at] = boundValues;
          badgesMap.set(String(id), {
            id, name, slug, label, bg_color, text_color, icon, is_active, updated_at,
          });
          return { success: true, meta: { changes: 1, duration: 1 } };
        }

        return { success: true, meta: { changes: 0, duration: 0 } };
      },
      async first<T = unknown>(): Promise<T | null> {
        return null;
      },
      async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
        return { results: [], success: true, meta: {} };
      },
      async raw<T = unknown>(): Promise<T[]> {
        return [];
      },
    };
  }

  return {
    radarMap,
    promotionsMap,
    bannersMap,
    badgesMap,
    settingsMap,
    prepare(query: string) {
      return createStatement(query);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(query: string) {
      return { count: 0, duration: 0 };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  };
}

describe('ETAPA 8.3: Sincronización Automática e Idempotente de Entidades Secundarias (D1 Outbox Nivel 1)', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let env: Env;

  beforeEach(() => {
    mockDb = createMockDb();
    env = {
      DB: mockDb,
      CATALOG_SYNC_SECRET: SYNC_SECRET,
      ENVIRONMENT: 'production',
      CATALOG_RUNTIME_ENABLED: 'false',
      ALLOWED_ORIGINS: '*',
      DEFAULT_PAGE_SIZE: '24',
      MAX_PAGE_SIZE: '60',
    };
  });

  it('1. RADAR: Publica solo eventos aprobados (is_published=true AND approval_status=PUBLISHED) y purga borradores', async () => {
    const publishedEvent = {
      id: '10000000-0000-0000-0000-000000000016',
      title: 'NECA Ultimate Ghost Face Inferno',
      slug: 'neca-ultimate-ghostface-inferno',
      is_published: true,
      approval_status: 'PUBLISHED',
      manufacturer: 'NECA',
      franchise: 'Scream',
      msrp: 36.99,
      official_image_url: 'https://cdn.example.com/ghostface.jpg',
      confidence_score: 95,
      is_featured: true,
      updated_at: '2026-10-21T10:00:00Z',
    };

    const draftEvent = {
      id: '20000000-0000-0000-0000-000000000099',
      title: 'Borrador Confidencial Prototipo Secreto',
      slug: 'borrador-confidencial',
      is_published: false,
      approval_status: 'DRAFT',
      manufacturer: 'Sideshow',
      updated_at: '2026-10-21T10:00:00Z',
    };

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            const all = [publishedEvent, draftEvent];
            return { data: all.filter((e) => ids.includes(e.id)), error: null };
          },
        }),
      }),
    };

    const fetcher = ((url: string, init: any) =>
      workerApp.fetch(new Request(url, init), env)) as any;

    const result = await syncRadarToCloudflareD1(
      [publishedEvent.id, draftEvent.id],
      mockSupabase,
      {
        syncSecret: SYNC_SECRET,
        workerUrl: 'https://catalog.worker.internal',
        purgeIds: ['15915d31-419b-4ff4-b845-66795f70a7bb'],
        fetcher,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.recordsSynced).toBe(3);

    expect(mockDb.radarMap.has(publishedEvent.id)).toBe(true);
    expect(mockDb.radarMap.get(publishedEvent.id).title).toBe('NECA Ultimate Ghost Face Inferno');
    expect(mockDb.radarMap.get(publishedEvent.id).brand_name).toBe('NECA');

    expect(mockDb.radarMap.has(draftEvent.id)).toBe(false);
    expect(mockDb.radarMap.has('15915d31-419b-4ff4-b845-66795f70a7bb')).toBe(false);
  });

  it('2. PROMOTIONS: Sincroniza altas y despublica promociones inactivas', async () => {
    const activePromo = {
      id: 'promo-hot-10',
      name: '10% OFF Coleccionables',
      discount_type: 'percentage',
      discount_value: 10,
      is_active: true,
      priority: 5,
      is_stackable: false,
      badge_text: 'HOT 10%',
      target_type: 'all',
      updated_at: '2026-10-21T11:00:00Z',
    };

    const inactivePromo = {
      id: 'promo-expired-20',
      name: '20% OFF Vencida',
      discount_type: 'percentage',
      discount_value: 20,
      is_active: false,
      updated_at: '2026-10-21T11:00:00Z',
    };

    mockDb.promotionsMap.set(inactivePromo.id, { id: inactivePromo.id, is_active: 1 });

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            const all = [activePromo, inactivePromo];
            return { data: all.filter((p) => ids.includes(p.id)), error: null };
          },
        }),
      }),
    };

    const fetcher = ((url: string, init: any) =>
      workerApp.fetch(new Request(url, init), env)) as any;

    const result = await syncPromotionsToCloudflareD1(
      [activePromo.id, inactivePromo.id],
      mockSupabase,
      {
        syncSecret: SYNC_SECRET,
        workerUrl: 'https://catalog.worker.internal',
        fetcher,
      }
    );

    expect(result.ok).toBe(true);
    expect(mockDb.promotionsMap.has(activePromo.id)).toBe(true);
    expect(mockDb.promotionsMap.get(activePromo.id).is_active).toBe(1);
    expect(mockDb.promotionsMap.get(inactivePromo.id).is_active).toBe(0);
  });

  it('3. SETTINGS & TOGGLES: Sincroniza site_settings, feature_toggles, banners y badges', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'site_settings') {
          return {
            select: async () => ({
              data: [{ key: 'site_title', value: 'Collectibles.uy Oficial' }],
              error: null,
            }),
          };
        }
        if (table === 'feature_toggles') {
          return {
            select: async () => ({
              data: [
                { id: 'ecommerce', is_enabled: true },
                { id: 'radar', is_enabled: false },
                { id: 'search', is_enabled: false },
              ],
              error: null,
            }),
          };
        }
        if (table === 'banners') {
          return {
            select: async () => ({
              data: [
                {
                  id: 'banner-hero-1',
                  title: 'Gran Lanzamiento',
                  image_url: 'https://cdn.example.com/hero.jpg',
                  button_text: 'Ver Catálogo',
                  position: 'home_hero',
                  sort_order: 1,
                  is_active: true,
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'vendor_store_badges') {
          return {
            select: async () => ({
              data: [
                {
                  id: 'badge-verified',
                  badge_key: 'verified_store',
                  label: 'Tienda Verificada',
                  bg_color: '#22c55e',
                  text_color: '#ffffff',
                },
              ],
              error: null,
            }),
          };
        }
        return { select: async () => ({ data: [], error: null }) };
      },
    };

    const fetcher = ((url: string, init: any) =>
      workerApp.fetch(new Request(url, init), env)) as any;

    const result = await syncSettingsToCloudflareD1(['any'], mockSupabase, {
      syncSecret: SYNC_SECRET,
      workerUrl: 'https://catalog.worker.internal',
      fetcher,
    });

    expect(result.ok).toBe(true);
    expect(mockDb.settingsMap.has('site_title')).toBe(true);
    expect(mockDb.settingsMap.has('feature_toggles')).toBe(true);
    const toggles = JSON.parse(mockDb.settingsMap.get('feature_toggles')!);
    expect(toggles.ecommerce).toBe(true);
    expect(toggles.radar).toBe(false);

    expect(mockDb.bannersMap.has('banner-hero-1')).toBe(true);
    expect(mockDb.badgesMap.has('badge-verified')).toBe(true);
  });

  it('4. PROCESS OUTBOX BATCH: Procesa lote heterogéneo (product, promotion, radar, settings) en un solo ciclo atómico', async () => {
    const outboxRows = [
      {
        id: 'ob-1',
        event_type: 'product_published',
        entity_type: 'product',
        entity_id: 'prod-001',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 0,
        max_attempts: 5,
      },
      {
        id: 'ob-2',
        event_type: 'promotion_active',
        entity_type: 'promotion',
        entity_id: 'promo-001',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 0,
        max_attempts: 5,
      },
      {
        id: 'ob-3',
        event_type: 'radar_published',
        entity_type: 'radar',
        entity_id: '10000000-0000-0000-0000-000000000016',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 0,
        max_attempts: 5,
      },
      {
        id: 'ob-4',
        event_type: 'settings_updated',
        entity_type: 'settings',
        entity_id: 'site_settings',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 0,
        max_attempts: 5,
      },
    ];

    const updatedOutboxRows: any[] = [];

    const mockSupabase = {
      rpc: async (fn: string) => {
        if (fn === 'claim_d1_outbox_batch') {
          return { data: outboxRows, error: null };
        }
        return { data: null, error: 'RPC_NOT_FOUND' };
      },
      from: (table: string) => {
        if (table === 'products') {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: 'prod-001',
                    slug: 'goku-ssj',
                    title: 'Goku SSJ',
                    base_price: 2500,
                    status: 'published',
                    is_active: true,
                    updated_at: '2026-10-21T12:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'international_products') {
          return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
        }
        if (table === 'product_variants') {
          return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
        }
        if (table === 'product_images') {
          return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
        }
        if (table === 'promotions') {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: 'promo-001',
                    name: 'Promo 1',
                    discount_type: 'percentage',
                    discount_value: 15,
                    is_active: true,
                    updated_at: '2026-10-21T12:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'release_events') {
          return {
            select: () => ({
              in: async () => ({
                data: [
                  {
                    id: '10000000-0000-0000-0000-000000000016',
                    title: 'NECA Inferno',
                    slug: 'neca-inferno',
                    is_published: true,
                    approval_status: 'PUBLISHED',
                    updated_at: '2026-10-21T12:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'site_settings' || table === 'feature_toggles' || table === 'banners' || table === 'vendor_store_badges') {
          return { select: async () => ({ data: [], error: null }) };
        }
        if (table === 'd1_catalog_outbox') {
          return {
            update: (payload: any) => ({
              in: async (col: string, ids: string[]) => {
                updatedOutboxRows.push({ payload, col, ids });
                return { error: null };
              },
              eq: async (col: string, val: string) => {
                updatedOutboxRows.push({ payload, col, val });
                return { error: null };
              },
            }),
          };
        }
        return { select: async () => ({ data: [], error: null }) };
      },
    };

    const fetcher = ((url: string, init: any) =>
      workerApp.fetch(new Request(url, init), env)) as any;

    const batchRes = await processOutboxBatch(mockSupabase, {
      batchSize: 20,
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      fetcher,
    });

    expect(batchRes.ok).toBe(true);
    expect(batchRes.processed).toBe(4);
    expect(batchRes.errors).toBe(0);
    expect(batchRes.deadLetters).toBe(0);

    const syncedUpdates = updatedOutboxRows.filter((u) => u.payload.status === 'synced');
    expect(syncedUpdates.length).toBeGreaterThanOrEqual(1);
    const syncedIds = syncedUpdates.flatMap((u) => u.ids || []);
    expect(syncedIds).toContain('ob-1');
    expect(syncedIds).toContain('ob-2');
    expect(syncedIds).toContain('ob-3');
    expect(syncedIds).toContain('ob-4');
  });

  it('5. DEAD LETTER QUEUE & RETRIES: Escala con backoff exponencial y pasa a dead_letter al 5to intento fallido', async () => {
    expect(calculateNextBackoff(1)).toBeDefined();
    expect(calculateNextBackoff(5)).toBeDefined();

    const failingRow = {
      id: 'ob-fail-5',
      event_type: 'radar_published',
      entity_type: 'radar',
      entity_id: 'radar-crash-id',
      version_timestamp: '2026-10-21T12:00:00Z',
      attempts: 4,
      max_attempts: 5,
    };

    const deadLetterRows: any[] = [];

    const mockSupabase = {
      rpc: async () => ({ data: [failingRow], error: null }),
      from: (table: string) => {
        if (table === 'release_events') {
          return { select: () => ({ in: async () => ({ data: null, error: { message: 'DB_CONNECTION_CRASH' } }) }) };
        }
        if (table === 'd1_catalog_outbox') {
          return {
            update: (payload: any) => ({
              eq: async (col: string, val: string) => {
                deadLetterRows.push({ payload, col, val });
                return { error: null };
              },
            }),
          };
        }
        return { select: async () => ({ data: [], error: null }) };
      },
    };

    const batchRes = await processOutboxBatch(mockSupabase, {
      batchSize: 10,
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
    });

    expect(batchRes.ok).toBe(false);
    expect(batchRes.deadLetters).toBe(1);

    const dlq = deadLetterRows.find((d) => d.payload.status === 'dead_letter');
    expect(dlq).toBeDefined();
    expect(dlq.payload.attempts).toBe(5);
    expect(dlq.payload.last_error).toContain('DB_CONNECTION_CRASH');
  });
});
