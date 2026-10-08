import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { callOpenAIResponses } from './openai.js';
import { calculateOpenAICost, getModelPricingRates } from './openaiPricing.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';

function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
const parseBool=(v,f=true)=>v==null||v===''?f:String(v).toLowerCase()==='true';
const parseDays=(v,f=3)=>{const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(14,Math.round(n))):f;};
const slugify=(v='')=>String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
const words=(v='')=>String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=3&&!['the','and','for','con','para','una','uno','del','las','los','edition','figure','figura'].includes(w));
function scoreProduct(story,p){const set=new Set(words([p.title,p.brand,p.franchise,p.asin,p.source_retailer].filter(Boolean).join(' ')));const qs=[story.exact_product_asin,story.primary_product_name,...(Array.isArray(story.product_queries)?story.product_queries:[]),story.brand,story.franchise,story.character].filter(Boolean);let s=0;if(story.exact_product_asin&&p.asin&&String(story.exact_product_asin).toUpperCase()===String(p.asin).toUpperCase())s+=100;for(const q of qs){const qWords=words(q);if(qWords.length)s+=(qWords.filter(w=>set.has(w)).length/qWords.length)*25;}if(String(p.source_retailer||'').toLowerCase().includes('amazon'))s+=5;return s;}
const signalFromType=t=>({PREORDER:'PREVENTA_ABIERTA',RESTOCK:'VUELVE_A_STOCK',RELEASE:'ACABA_DE_SALIR',HIGH_DEMAND:'ALTA_DEMANDA',EXCLUSIVE:'EXCLUSIVO'}[t]||'NUEVO_ANUNCIO');
const statusFromType=t=>({PREORDER:'PREORDER_OPEN',RESTOCK:'RESTOCKED',RELEASE:'RELEASED'}[t]||'ANNOUNCED');
function safeDate(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString();}

function absoluteUrl(base, value) {
  try { return new URL(value, base).toString(); } catch { return null; }
}

async function resolveSourceImage(sourceUrl, story = {}) {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'CollectiblesRadarBot/1.0 (+https://collectibles.uy)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 800000);

    const candidates = [];
    const metaPatterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/ig,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/ig,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/ig,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/ig
    ];
    for (const pattern of metaPatterns) {
      let match;
      while ((match = pattern.exec(html)) && candidates.length < 8) {
        const abs = absoluteUrl(response.url || sourceUrl, match[1]);
        if (abs) candidates.push(abs);
      }
    }

    const jsonImageMatches = html.match(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/ig) || [];
    for (const raw of jsonImageMatches.slice(0, 6)) {
      const m = raw.match(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/i);
      const val = m?.[1] || m?.[2];
      const abs = val ? absoluteUrl(response.url || sourceUrl, val.replace(/\\u002F/g, '/').replace(/\\\//g, '/')) : null;
      if (abs) candidates.push(abs);
    }

    const deduped = [...new Set(candidates)].filter(url => {
      const lower = url.toLowerCase();
      if (lower.includes('unsplash.com') || lower.includes('pexels.com')) return false;
      if (/logo|avatar|icon|sprite|favicon/.test(lower)) return false;
      return /^https?:\/\//.test(url);
    });

    const titleWords = words([story.title, story.primary_product_name, story.brand, story.franchise, story.character].filter(Boolean).join(' '));
    let best = null;
    let bestScore = -1;
    for (const url of deduped) {
      const lower = url.toLowerCase();
      let score = 1;
      for (const w of titleWords) if (lower.includes(w)) score += 1;
      if (/product|products|media|uploads|cdn|images/.test(lower)) score += 1;
      if (score > bestScore) { best = url; bestScore = score; }
    }
    return best ? { url: best, source_page: response.url || sourceUrl, score: Math.min(0.95, 0.72 + bestScore * 0.03) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function repairExistingRadarImages(supabase, limit = 12) {
  const { data: rows } = await supabase
    .from('release_events')
    .select('id,title,source_url,official_image_url,manufacturer,franchise,character,raw_source_data')
    .is('official_image_url', null)
    .not('source_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  let repaired = 0;
  for (const row of rows || []) {
    const img = await resolveSourceImage(row.source_url, row);
    if (!img?.url) continue;
    const { error } = await supabase.from('release_events').update({
      official_image_url: img.url,
      image_source_url: img.source_page,
      image_match_score: img.score,
      updated_at: new Date().toISOString(),
      raw_source_data: {
        ...(row.raw_source_data || {}),
        image_provenance: 'SOURCE_PAGE',
        image_repaired_without_ai: true
      }
    }).eq('id', row.id);
    if (!error) repaired++;
  }
  return repaired;
}

const RADAR_MODELS = new Set(['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol']);
const WEB_SEARCH_TOOL_COST_USD = 0.01; // $10 / 1k calls (OpenAI official pricing snapshot)

const RADAR_MODES = Object.freeze({
  ECONOMICO: { model: 'gpt-5.6-luna', maxItems: 3, intervalDays: 3, useWebSearch: false },
  NORMAL: { model: 'gpt-5.6-luna', maxItems: 5, intervalDays: 3, useWebSearch: true },
  PROFUNDO: { model: 'gpt-5.6-terra', maxItems: 8, intervalDays: 3, useWebSearch: true }
});

const OFFICIAL_RADAR_SOURCES = Object.freeze([
  { name: 'Hasbro Pulse', url: 'https://www.hasbropulse.com/blogs/news' },
  { name: 'NECA', url: 'https://necaonline.com/category/blog/' },
  { name: 'McFarlane Toys', url: 'https://mcfarlane.com/news/' },
  { name: 'Funko', url: 'https://funko.com/funko-blog-home/' },
  { name: 'LEGO', url: 'https://www.lego.com/en-us/aboutus/news' },
  { name: 'Sideshow', url: 'https://www.sideshow.com/blog' },
  { name: 'Super7', url: 'https://super7.com/blogs/news' }
]);

function normalizeRadarMode(value) {
  const mode = String(value || '').trim().toUpperCase();
  return RADAR_MODES[mode] ? mode : 'ECONOMICO';
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CollectiblesRadarBot/1.0 (+https://collectibles.uy)', 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) return null;
    return { html: (await response.text()).slice(0, 700000), finalUrl: response.url || url };
  } catch { return null; } finally { clearTimeout(timeout); }
}

function extractMeta(html, names = []) {
  for (const name of names) {
    const patterns = [
      new RegExp('<meta[^>]+(?:property|name)=["\\\']' + name + '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\'][^>]*>', 'i'),
      new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']' + name + '["\\\'][^>]*>', 'i')
    ];
    for (const pattern of patterns) { const m = html.match(pattern); if (m?.[1]) return stripHtml(m[1]); }
  }
  return null;
}

function extractOfficialLinks(source, html, baseUrl) {
  let host; try { host = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { return []; }
  const found = [];
  const regex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) && found.length < 100) {
    const url = absoluteUrl(baseUrl, match[1]);
    const title = stripHtml(match[2]);
    if (!url || title.length < 12 || title.length > 180) continue;
    let parsed; try { parsed = new URL(url); } catch { continue; }
    const candidateHost = parsed.hostname.replace(/^www\./, '');
    if (candidateHost !== host && !candidateHost.endsWith('.' + host) && !host.endsWith('.' + candidateHost)) continue;
    if (/account|cart|search|privacy|terms|contact|login|signup|wishlist/i.test(parsed.pathname)) continue;
    if (parsed.pathname === '/' || parsed.pathname.length < 5) continue;
    found.push({ source_name: source.name, url, title });
  }
  return [...new Map(found.map(x => [x.url, x])).values()].slice(0, 12);
}

async function hydrateOfficialCandidate(candidate) {
  const fetched = await fetchHtml(candidate.url, 5500);
  if (!fetched) return null;
  const html = fetched.html;
  const title = extractMeta(html, ['og:title', 'twitter:title']) || stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') || candidate.title;
  const description = extractMeta(html, ['og:description', 'description', 'twitter:description']) || '';
  const datePublished = extractMeta(html, ['article:published_time', 'date', 'datePublished']) || ((html.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1] || null);
  const image = extractMeta(html, ['og:image', 'twitter:image']);
  return { source_name: candidate.source_name, source_url: fetched.finalUrl, title: title.slice(0, 220), description: description.slice(0, 700), source_published_at: safeDate(datePublished), source_image_url: image ? absoluteUrl(fetched.finalUrl, image) : null };
}

async function collectFreshOfficialCandidates(supabase, limit = 8) {
  const { data: existingRows } = await supabase.from('release_events').select('source_url').not('source_url', 'is', null).limit(500);
  const seen = new Set((existingRows || []).map(r => r.source_url).filter(Boolean));
  const raw = [];
  for (const source of OFFICIAL_RADAR_SOURCES) {
    const fetched = await fetchHtml(source.url, 5500);
    if (!fetched) continue;
    for (const candidate of extractOfficialLinks(source, fetched.html, fetched.finalUrl)) {
      if (!seen.has(candidate.url)) raw.push(candidate);
      if (raw.length >= limit * 3) break;
    }
    if (raw.length >= limit * 3) break;
  }
  const hydrated = [];
  for (const candidate of raw.slice(0, limit * 2)) {
    const item = await hydrateOfficialCandidate(candidate);
    if (!item?.source_url || seen.has(item.source_url)) continue;
    hydrated.push(item);
    if (hydrated.length >= limit) break;
  }
  return hydrated;
}

function normalizeRadarModel(value) {
  const model = String(value || '').trim().toLowerCase();
  return RADAR_MODELS.has(model) ? model : 'gpt-5.6-luna';
}

export function estimateRadarRefreshCost({ model = 'gpt-5.6-luna', maxItems = 3, intervalDays = 3, mode = 'ECONOMICO' } = {}) {
  const selectedMode = normalizeRadarMode(mode);
  const defaults = RADAR_MODES[selectedMode];
  const selectedModel = normalizeRadarModel(model || defaults.model);
  const items = Math.max(3, Math.min(12, Number(maxItems) || defaults.maxItems));
  const days = Math.max(1, Math.min(14, Number(intervalDays) || defaults.intervalDays));
  const useWebSearch = selectedMode !== 'ECONOMICO';

  // Conservative local-only estimate. Web search result volume is variable, so expose a range.
  const inputMin = 6000 + items * 500;
  const inputExpected = 12000 + items * 1000;
  const inputMax = 30000 + items * 2000;
  const outputMin = 700;
  const outputExpected = Math.min(2600, 700 + items * 180);
  const outputMax = 3000;

  const tokenMin = calculateOpenAICost(selectedModel, inputMin, outputMin);
  const tokenExpected = calculateOpenAICost(selectedModel, inputExpected, outputExpected);
  const tokenMax = calculateOpenAICost(selectedModel, inputMax, outputMax);

  const addTool = (cost) => cost == null ? null : Number((cost + (useWebSearch ? WEB_SEARCH_TOOL_COST_USD : 0)).toFixed(5));
  const expected = addTool(tokenExpected.estimated_cost_usd);
  const min = addTool(tokenMin.estimated_cost_usd);
  const max = addTool(tokenMax.estimated_cost_usd);
  const runsPer30Days = 30 / days;

  return {
    mode: selectedMode,
    model: selectedModel,
    web_search_planned: useWebSearch,
    max_items: items,
    interval_days: days,
    estimated_cost_min_usd: min,
    estimated_cost_expected_usd: expected,
    estimated_cost_max_usd: max,
    estimated_monthly_usd: expected == null ? null : Number((expected * runsPer30Days).toFixed(4)),
    estimated_monthly_max_usd: max == null ? null : Number((max * runsPer30Days).toFixed(4)),
    web_search_tool_cost_usd: useWebSearch ? WEB_SEARCH_TOOL_COST_USD : 0,
    pricing: getModelPricingRates(selectedModel),
    openai_calls_used: 0,
    note: useWebSearch ? 'Estimación local previa. Incluye búsqueda web.' : 'Modo Económico: primero usa fuentes oficiales directas, sin cargo de web_search.'
  };
}

export async function runRadarNewsRefresh(req,{force=false}={}) {
  const supabase=db();
  if(!supabase) return {httpStatus:500,success:false,status:'CONFIG_ERROR',error:'SUPABASE_SERVICE_ROLE_KEY no configurada'};

  // Bootstrap cleanup: fail closed on legacy generic/mismatched artwork.
  // This runs through the application connection, so it does not depend on the
  // separate Supabase management SQL channel that may time out.
  try {
    await supabase
      .from('release_events')
      .update({ official_image_url: null, image_match_score: 0, updated_at: new Date().toISOString() })
      .or('official_image_url.ilike.%unsplash.com%,official_image_url.ilike.%mlstatic.com%');
  } catch (cleanupError) {
    console.warn('[Radar Refresh] legacy image cleanup skipped', cleanupError?.message || cleanupError);
  }

  let repairedExistingImages = 0;
  try {
    repairedExistingImages = await repairExistingRadarImages(supabase, 12);
  } catch (repairError) {
    console.warn('[Radar Refresh] existing image repair skipped', repairError?.message || repairError);
  }

  const {data:settingRows,error:settingsError}=await supabase.from('site_settings').select('key,value').in('key',['radar_auto_refresh_enabled','radar_refresh_interval_days','radar_last_refresh_at','radar_max_items_per_refresh','radar_ai_model','radar_cost_mode']);
  if(settingsError)return {httpStatus:500,success:false,status:'SETTINGS_ERROR',error:settingsError.message};
  const settings=Object.fromEntries((settingRows||[]).map(r=>[r.key,r.value]));
  const enabled=parseBool(settings.radar_auto_refresh_enabled,true);
  const radarMode=normalizeRadarMode(settings.radar_cost_mode);
  const modeDefaults=RADAR_MODES[radarMode];
  const intervalDays=parseDays(settings.radar_refresh_interval_days,modeDefaults.intervalDays);
  const maxItems=Math.max(3,Math.min(12,Number(settings.radar_max_items_per_refresh)||modeDefaults.maxItems));
  const radarModel=normalizeRadarModel(settings.radar_ai_model || modeDefaults.model);
  const useWebSearch=radarMode !== 'ECONOMICO';

  if(!enabled&&!force)return {httpStatus:200,success:true,status:'DISABLED',interval_days:intervalDays};
  const last=settings.radar_last_refresh_at?new Date(settings.radar_last_refresh_at):null;
  const dueAt=last&&!Number.isNaN(last.getTime())?new Date(last.getTime()+intervalDays*86400000):null;
  if(!force&&dueAt&&Date.now()<dueAt.getTime())return {httpStatus:200,success:true,status:'NOT_DUE',interval_days:intervalDays,last_refresh_at:last.toISOString(),next_refresh_at:dueAt.toISOString()};

  const lookbackDays=Math.max(4,intervalDays+2);
  const schema={type:'object',additionalProperties:false,properties:{stories:{type:'array',maxItems,items:{type:'object',additionalProperties:false,properties:{
    title:{type:'string'},summary:{type:'string'},why_it_matters:{type:'string'},news_type:{type:'string',enum:['NEWS','PREORDER','RELEASE','RESTOCK','HIGH_DEMAND','EXCLUSIVE']},source_name:{type:'string'},source_url:{type:'string'},source_published_at:{type:['string','null']},brand:{type:['string','null']},manufacturer:{type:['string','null']},franchise:{type:['string','null']},character:{type:['string','null']},product_line:{type:['string','null']},release_date:{type:['string','null']},exact_product_asin:{type:['string','null']},primary_product_name:{type:['string','null']},product_queries:{type:'array',items:{type:'string'},maxItems:6}
  },required:['title','summary','why_it_matters','news_type','source_name','source_url','source_published_at','brand','manufacturer','franchise','character','product_line','release_date','exact_product_asin','primary_product_name','product_queries']}}},required:['stories']};

  let officialCandidates = [];
  if (!useWebSearch) {
    try {
      officialCandidates = await collectFreshOfficialCandidates(supabase, Math.max(6, maxItems * 2));
    } catch (sourceError) {
      console.warn('[Radar Refresh] official source collection failed', sourceError?.message || sourceError);
    }
  }

  if (!useWebSearch && officialCandidates.length === 0) {
    const now = new Date().toISOString();
    await supabase.from('site_settings').upsert([
      {key:'radar_last_refresh_at',value:now,updated_at:now},
      {key:'radar_auto_refresh_enabled',value:String(enabled),updated_at:now},
      {key:'radar_refresh_interval_days',value:String(intervalDays),updated_at:now}
    ],{onConflict:'key'});
    return {
      httpStatus:200, success:true, status:'NO_NEW_OFFICIAL_ITEMS',
      mode:radarMode, web_search_used:false, interval_days:intervalDays, model:radarModel,
      created:0, updated:0, skipped:0, repaired_existing_images:repairedExistingImages,
      published:[], sources_checked:OFFICIAL_RADAR_SOURCES.length,
      last_refresh_at:now, next_refresh_at:new Date(Date.now()+intervalDays*86400000).toISOString(),
      ai_cost_usd:0
    };
  }

  const aiInput = useWebSearch
    ? [
        'Busca noticias REALES y recientes del mundo de coleccionables, figuras de accion, estatuas, LEGO/building sets, anime, comics, TCG cuando sea realmente relevante, replicas y props.',
        `Ventana prioritaria: ultimos ${lookbackDays} dias.`,
        'Prioriza anuncios de fabricantes, aperturas de preventa, lanzamientos, restocks, exclusivas y tendencias verificables.',
        'Cada historia debe tener una URL fuente concreta y verificable. No inventes datos.'
      ].join('\n')
    : [
        'Analiza SOLO estos candidatos obtenidos directamente de fuentes oficiales.',
        'Selecciona únicamente novedades útiles y devuelve como máximo ' + maxItems + '.',
        'No inventes datos. Conserva exactamente source_url y source_name.',
        JSON.stringify(officialCandidates)
      ].join('\n');

  let ai;
  try{
    ai=await callOpenAIResponses({
      model:radarModel,
      input:aiInput,
      instructions:'Actuas como editor de Radar de Collectibles 2026. Detecta hechos verificables y conviertelos en noticias breves, utiles y comerciales. No inventes.',
      ...(useWebSearch ? { tools:[{type:'web_search'}], toolChoice:'required' } : {}),
      maxTokens: useWebSearch ? 3000 : 1800,
      timeoutMs:55000,
      textFormat:{type:'json_schema',name:'radar_news_refresh',strict:true,schema},
      metadata:{engine:'RADAR_NEWS_REFRESH',mode:radarMode,interval_days:String(intervalDays),trigger:force?'MANUAL':'CRON',max_items:String(maxItems)}
    });
  }catch(e){return {httpStatus:e?.statusCode||502,success:false,status:'AI_FAILED',error:e?.message||'Fallo de investigacion Radar'};}

  let parsed;try{parsed=JSON.parse(ai.outputText||'{}');}catch{return {httpStatus:502,success:false,status:'INVALID_AI_OUTPUT',error:'La investigacion no devolvio JSON valido'};}
  const cited=useWebSearch ? new Set((ai.sources||[]).map(s=>s.url).filter(Boolean)) : new Set(officialCandidates.map(s=>s.source_url).filter(Boolean));
  const stories=Array.isArray(parsed.stories)?parsed.stories:[];
  const {data:amazonRows}=await supabase.from('international_products').select('id,title,brand,franchise,source_retailer,asin,product_url_external,main_image_url_external,image_url,base_price_usd,final_price_usd').ilike('source_retailer','%amazon%').limit(700);
  const catalog=amazonRows||[];
  let created=0,updated=0,skipped=0;const published=[];

  for(const story of stories.slice(0,maxItems)){
    if(!story?.title||!story?.source_url||!cited.has(story.source_url)){skipped++;continue;}
    const ranked=catalog.map(product=>({product,score:scoreProduct(story,product)})).filter(x=>x.score>=22).sort((a,b)=>b.score-a.score).slice(0,6);
    const hasExactAsinMatch = story.exact_product_asin && ranked.some(r => r.product.asin && String(r.product.asin).toUpperCase() === String(story.exact_product_asin).toUpperCase());
    const linkedProducts=ranked.map(({product,score},index)=>{
      const isExactAsin = story.exact_product_asin && product.asin && String(product.asin).toUpperCase() === String(story.exact_product_asin).toUpperCase();
      const isPrimary = isExactAsin || (index === 0 && score >= 85);
      return {
        id:product.id,
        title:product.title,
        retailer:product.source_retailer||'Amazon',
        asin:product.asin||null,
        url:product.product_url_external||null,
        image_url:product.main_image_url_external||product.image_url||null,
        price_usd:product.final_price_usd??product.base_price_usd??null,
        match_score:Math.round(score),
        role:isPrimary ? 'PRIMARY' : 'RELATED'
      };
    }).filter(p=>p.url);
    const primary=linkedProducts.find(p=>p.role==='PRIMARY')||null;
    const sourceImage = primary?.image_url ? null : await resolveSourceImage(story.source_url, story);
    const selectedImageUrl = primary?.image_url || sourceImage?.url || null;
    const selectedImageSource = primary?.url || sourceImage?.source_page || story.source_url;
    const selectedImageScore = primary
      ? Math.min(1,Math.max(.7,(primary.match_score||70)/100))
      : (sourceImage?.score || 0);
    const provenance = primary?.image_url ? 'AMAZON_PRODUCT' : (sourceImage?.url ? 'SOURCE_PAGE' : 'NONE');
    const storyDate=safeDate(story.source_published_at);
    const releaseDate=story.release_date&&/^\d{4}-\d{2}-\d{2}$/.test(story.release_date)?story.release_date:null;
    const slug=slugify(`${story.title}-${crypto.createHash('sha1').update(story.source_url).digest('hex').slice(0,10)}`);
    const row={slug,title:story.title.trim(),subtitle:story.news_type==='NEWS'?'Noticias Collectibles':null,summary:story.summary.trim(),description:story.summary.trim(),manufacturer:story.manufacturer||story.brand||null,franchise:story.franchise||null,character:story.character||null,product_line:story.product_line||null,status:statusFromType(story.news_type),currency:'USD',region:'GLOBAL',release_date_start:releaseDate,release_precision:releaseDate?'EXACT_DATE':'TBA',date_display_text:releaseDate||(storyDate?new Intl.DateTimeFormat('es-UY',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(storyDate)):'Noticia reciente'),source_name:story.source_name,source_url:story.source_url,official_image_url:selectedImageUrl,image_source_url:selectedImageSource,image_match_score:selectedImageScore,confidence_score:90,radar_signal:signalFromType(story.news_type),radar_why:story.why_it_matters,radar_context:`NOTICIA · ${story.source_name}`,approval_status:'PUBLISHED',is_verified:true,is_published:true,is_featured:false,raw_source_data:{content_kind:'NEWS',news_type:story.news_type,source_published_at:storyDate,source_verified_by_web_search:true,auto_generated:true,linked_products:linkedProducts,primary_product:primary,image_provenance:provenance,product_queries:story.product_queries||[],refresh_interval_days:intervalDays},updated_at:new Date().toISOString()};
    const {data:existing}=await supabase.from('release_events').select('id').eq('source_url',story.source_url).limit(1).maybeSingle();
    const result=existing?.id?await supabase.from('release_events').update(row).eq('id',existing.id):await supabase.from('release_events').insert({...row,created_at:new Date().toISOString()});
    if(result.error){console.error('[Radar Refresh] persistence error',{title:story.title,error:result.error.message});skipped++;continue;}
    existing?.id?updated++:created++;
    published.push({title:story.title,source:story.source_name,linked_products:linkedProducts.length,primary_product:primary?.title||null});
  }

  const now=new Date().toISOString();
  await supabase.from('site_settings').upsert([{key:'radar_last_refresh_at',value:now,updated_at:now},{key:'radar_auto_refresh_enabled',value:String(enabled),updated_at:now},{key:'radar_refresh_interval_days',value:String(intervalDays),updated_at:now}],{onConflict:'key'});
  try{await supabase.from('ai_usage_events').insert({engine:'RADAR_INTELLIGENCE',country_code:'GLOBAL',provider:'OPENAI',model:ai.model,request_id:ai.requestId,input_tokens:ai.usage?.inputTokens??null,output_tokens:ai.usage?.outputTokens??null,total_tokens:ai.usage?.totalTokens??null,estimated_cost_usd:ai.pricing?.estimated_cost_usd??null,latency_ms:ai.latencyMs??null,status:'SUCCESS',fallback_used:false,metadata:{operation:'RADAR_NEWS_REFRESH',mode:radarMode,web_search_used:useWebSearch,created,updated,skipped,interval_days:intervalDays}});}catch{}

  return {httpStatus:200,success:true,status:'REFRESHED',mode:radarMode,web_search_used:useWebSearch,interval_days:intervalDays,model:radarModel,created,updated,skipped,repaired_existing_images:repairedExistingImages,published,sources_checked:cited.size,last_refresh_at:now,next_refresh_at:new Date(Date.now()+intervalDays*86400000).toISOString(),ai_cost_usd:ai.pricing?.estimated_cost_usd??null};
}
