import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { authenticateRequest } from '../server/lib/authGuard.js';
import { callOpenAIResponses } from '../server/lib/openai.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';

function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseBool(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseDays(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(14, Math.round(n)));
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function words(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !['the','and','for','con','para','una','uno','del','las','los','edition','figure','figura'].includes(w));
}

function scoreProduct(story, product) {
  const haystack = words([
    product.title,
    product.brand,
    product.franchise,
    product.asin,
    product.source_retailer
  ].filter(Boolean).join(' '));
  const set = new Set(haystack);
  const queries = [
    story.exact_product_asin,
    story.primary_product_name,
    ...(Array.isArray(story.product_queries) ? story.product_queries : []),
    story.brand,
    story.franchise,
    story.character
  ].filter(Boolean);
  let score = 0;
  if (story.exact_product_asin && product.asin && String(story.exact_product_asin).toUpperCase() === String(product.asin).toUpperCase()) score += 100;
  for (const q of queries) {
    const qWords = words(q);
    if (!qWords.length) continue;
    const matched = qWords.filter(w => set.has(w)).length;
    score += (matched / qWords.length) * 25;
  }
  if (String(product.source_retailer || '').toLowerCase().includes('amazon')) score += 5;
  return score;
}

function signalFromType(type) {
  switch (type) {
    case 'PREORDER': return 'PREVENTA_ABIERTA';
    case 'RESTOCK': return 'VUELVE_A_STOCK';
    case 'RELEASE': return 'ACABA_DE_SALIR';
    case 'HIGH_DEMAND': return 'ALTA_DEMANDA';
    case 'EXCLUSIVE': return 'EXCLUSIVO';
    default: return 'NUEVO_ANUNCIO';
  }
}

function statusFromType(type) {
  switch (type) {
    case 'PREORDER': return 'PREORDER_OPEN';
    case 'RESTOCK': return 'RESTOCKED';
    case 'RELEASE': return 'RELEASED';
    default: return 'ANNOUNCED';
  }
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const auth = await authenticateRequest(req, { allowCron: true });
  if (!auth.authenticated || !auth.isSuperAdmin) {
    return res.status(403).json({ success: false, error: 'SUPERADMIN requerido' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'GET o POST requerido' });
  }

  const supabase = db();
  if (!supabase) return res.status(500).json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' });

  const { data: settingRows, error: settingsError } = await supabase
    .from('site_settings')
    .select('key,value')
    .in('key', ['radar_auto_refresh_enabled','radar_refresh_interval_days','radar_last_refresh_at','radar_max_items_per_refresh']);

  if (settingsError) return res.status(500).json({ success: false, error: settingsError.message });

  const settings = Object.fromEntries((settingRows || []).map(r => [r.key, r.value]));
  const enabled = parseBool(settings.radar_auto_refresh_enabled, true);
  const intervalDays = parseDays(settings.radar_refresh_interval_days, 3);
  const maxItems = Math.max(3, Math.min(12, Number(settings.radar_max_items_per_refresh) || 8));
  const force = req.method === 'POST' && req.body?.force === true;

  if (!enabled && !force) {
    return res.status(200).json({ success: true, status: 'DISABLED', interval_days: intervalDays });
  }

  const lastRefresh = settings.radar_last_refresh_at ? new Date(settings.radar_last_refresh_at) : null;
  const dueAt = lastRefresh && !Number.isNaN(lastRefresh.getTime())
    ? new Date(lastRefresh.getTime() + intervalDays * 86400000)
    : null;

  if (!force && dueAt && Date.now() < dueAt.getTime()) {
    return res.status(200).json({
      success: true,
      status: 'NOT_DUE',
      interval_days: intervalDays,
      last_refresh_at: lastRefresh.toISOString(),
      next_refresh_at: dueAt.toISOString()
    });
  }

  const lookbackDays = Math.max(4, intervalDays + 2);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      stories: {
        type: 'array',
        maxItems,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            why_it_matters: { type: 'string' },
            news_type: { type: 'string', enum: ['NEWS','PREORDER','RELEASE','RESTOCK','HIGH_DEMAND','EXCLUSIVE'] },
            source_name: { type: 'string' },
            source_url: { type: 'string' },
            source_published_at: { type: ['string','null'] },
            brand: { type: ['string','null'] },
            manufacturer: { type: ['string','null'] },
            franchise: { type: ['string','null'] },
            character: { type: ['string','null'] },
            product_line: { type: ['string','null'] },
            release_date: { type: ['string','null'] },
            exact_product_asin: { type: ['string','null'] },
            primary_product_name: { type: ['string','null'] },
            product_queries: { type: 'array', items: { type: 'string' }, maxItems: 6 }
          },
          required: ['title','summary','why_it_matters','news_type','source_name','source_url','source_published_at','brand','manufacturer','franchise','character','product_line','release_date','exact_product_asin','primary_product_name','product_queries']
        }
      }
    },
    required: ['stories']
  };

  const prompt = [
    'Busca noticias REALES y recientes del mundo de coleccionables, figuras de accion, estatuas, LEGO/building sets, anime, comics, TCG cuando sea realmente relevante, replicas y props.',
    `Ventana prioritaria: ultimos ${lookbackDays} dias.`,
    'Prioriza anuncios de fabricantes, aperturas de preventa, lanzamientos, restocks, exclusivas y tendencias verificables que interesen a compradores de Uruguay y LATAM, sin limitar la investigacion al mercado local.',
    'Marcas/fuentes prioritarias: Hasbro/Hasbro Pulse, NECA, McFarlane Toys, Mattel Creations, Bandai/Tamashii Nations, Hot Toys, Sideshow, Iron Studios, Funko, LEGO, Super7, Mezco y retailers confiables.',
    'Cada historia debe tener una URL fuente concreta y verificable. No inventes fechas, precios, stock, ASIN ni disponibilidad.',
    'Si conoces un ASIN exacto por evidencia, incluyelo; si no, dejalo null.',
    'product_queries debe contener nombres concretos de productos que tengan sentido comercial debajo de la noticia.'
  ].join('\n');

  let ai;
  try {
    ai = await callOpenAIResponses({
      profile: 'balanced',
      input: prompt,
      instructions: 'Actuas como editor de Radar de Collectibles 2026. Tu trabajo es detectar hechos recientes verificables y convertirlos en noticias breves, utiles y comerciales. No inventes. Una noticia puede existir aunque todavia no haya producto para comprar. Los productos vinculados se resuelven luego contra el catalogo real de Collectibles.',
      tools: [{ type: 'web_search' }],
      toolChoice: 'required',
      maxTokens: 3000,
      timeoutMs: 55000,
      textFormat: { type: 'json_schema', name: 'radar_news_refresh', strict: true, schema },
      metadata: { engine: 'RADAR_NEWS_REFRESH', interval_days: String(intervalDays), trigger: auth.isCron ? 'CRON' : 'MANUAL' }
    });
  } catch (error) {
    return res.status(error?.statusCode || 502).json({ success: false, status: 'AI_FAILED', error: error?.message || 'Fallo de investigacion Radar' });
  }

  let parsed;
  try {
    parsed = JSON.parse(ai.outputText || '{}');
  } catch {
    return res.status(502).json({ success: false, status: 'INVALID_AI_OUTPUT', error: 'La investigacion no devolvio JSON valido' });
  }

  const cited = new Set((ai.sources || []).map(s => s.url).filter(Boolean));
  const stories = Array.isArray(parsed.stories) ? parsed.stories : [];

  const { data: amazonRows } = await supabase
    .from('international_products')
    .select('id,title,brand,franchise,source_retailer,asin,product_url_external,main_image_url_external,image_url,base_price_usd,final_price_usd')
    .ilike('source_retailer', '%amazon%')
    .limit(700);

  const catalog = amazonRows || [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const published = [];

  for (const story of stories.slice(0, maxItems)) {
    if (!story?.title || !story?.source_url || !cited.has(story.source_url)) {
      skipped++;
      continue;
    }

    const ranked = catalog
      .map(product => ({ product, score: scoreProduct(story, product) }))
      .filter(x => x.score >= 22)
      .sort((a,b) => b.score - a.score)
      .slice(0, 6);

    const linkedProducts = ranked.map(({ product, score }, index) => ({
      id: product.id,
      title: product.title,
      retailer: product.source_retailer || 'Amazon',
      asin: product.asin || null,
      url: product.product_url_external || null,
      image_url: product.main_image_url_external || product.image_url || null,
      price_usd: product.final_price_usd ?? product.base_price_usd ?? null,
      match_score: Math.round(score),
      role: index === 0 && score >= 45 ? 'PRIMARY' : 'RELATED'
    })).filter(p => p.url);

    const primary = linkedProducts.find(p => p.role === 'PRIMARY') || null;
    const storyDate = safeDate(story.source_published_at);
    const releaseDate = story.release_date && /^\d{4}-\d{2}-\d{2}$/.test(story.release_date) ? story.release_date : null;
    const sourceHash = crypto.createHash('sha1').update(story.source_url).digest('hex').slice(0, 10);
    const slug = slugify(`${story.title}-${sourceHash}`);

    const row = {
      slug,
      title: story.title.trim(),
      subtitle: story.news_type === 'NEWS' ? 'Noticias Collectibles' : null,
      summary: story.summary.trim(),
      description: story.summary.trim(),
      manufacturer: story.manufacturer || story.brand || null,
      franchise: story.franchise || null,
      character: story.character || null,
      product_line: story.product_line || null,
      status: statusFromType(story.news_type),
      currency: 'USD',
      region: 'GLOBAL',
      release_date_start: releaseDate,
      release_precision: releaseDate ? 'EXACT_DATE' : 'TBA',
      date_display_text: releaseDate || (storyDate ? new Intl.DateTimeFormat('es-UY', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(storyDate)) : 'Noticia reciente'),
      source_name: story.source_name,
      source_url: story.source_url,
      official_image_url: primary?.image_url || null,
      image_source_url: primary?.url || story.source_url,
      image_match_score: primary ? Math.min(1, Math.max(0.7, (primary.match_score || 70) / 100)) : 0,
      confidence_score: 90,
      radar_signal: signalFromType(story.news_type),
      radar_why: story.why_it_matters,
      radar_context: `NOTICIA · ${story.source_name}`,
      approval_status: 'PUBLISHED',
      is_verified: true,
      is_published: true,
      is_featured: false,
      raw_source_data: {
        content_kind: 'NEWS',
        news_type: story.news_type,
        source_published_at: storyDate,
        source_verified_by_web_search: true,
        auto_generated: true,
        linked_products: linkedProducts,
        primary_product: primary,
        product_queries: story.product_queries || [],
        refresh_interval_days: intervalDays
      },
      updated_at: new Date().toISOString()
    };

    const { data: existing } = await supabase.from('release_events').select('id').eq('source_url', story.source_url).limit(1).maybeSingle();
    let writeError;
    if (existing?.id) {
      const result = await supabase.from('release_events').update(row).eq('id', existing.id);
      writeError = result.error;
      if (!writeError) updated++;
    } else {
      const result = await supabase.from('release_events').insert({ ...row, created_at: new Date().toISOString() });
      writeError = result.error;
      if (!writeError) created++;
    }
    if (writeError) {
      console.error('[Radar Refresh] persistence error', { title: story.title, error: writeError.message });
      skipped++;
      continue;
    }
    published.push({ title: story.title, source: story.source_name, linked_products: linkedProducts.length, primary_product: primary?.title || null });
  }

  const now = new Date().toISOString();
  await supabase.from('site_settings').upsert([
    { key: 'radar_last_refresh_at', value: now, updated_at: now },
    { key: 'radar_auto_refresh_enabled', value: String(enabled), updated_at: now },
    { key: 'radar_refresh_interval_days', value: String(intervalDays), updated_at: now }
  ], { onConflict: 'key' });

  try {
    await supabase.from('ai_usage_events').insert({
      engine: 'RADAR_INTELLIGENCE',
      country_code: 'GLOBAL',
      provider: 'OPENAI',
      model: ai.model,
      request_id: ai.requestId,
      input_tokens: ai.usage?.inputTokens ?? null,
      output_tokens: ai.usage?.outputTokens ?? null,
      total_tokens: ai.usage?.totalTokens ?? null,
      estimated_cost_usd: ai.pricing?.estimated_cost_usd ?? null,
      latency_ms: ai.latencyMs ?? null,
      status: 'SUCCESS',
      fallback_used: false,
      metadata: { operation: 'RADAR_NEWS_REFRESH', created, updated, skipped, interval_days: intervalDays }
    });
  } catch {}

  return res.status(200).json({
    success: true,
    status: 'REFRESHED',
    interval_days: intervalDays,
    created,
    updated,
    skipped,
    published,
    sources_checked: cited.size,
    last_refresh_at: now,
    next_refresh_at: new Date(Date.now() + intervalDays * 86400000).toISOString(),
    ai_cost_usd: ai.pricing?.estimated_cost_usd ?? null
  });
}
