import { supabase } from './supabase';
import { collectMediaUrls, registerMediaVariants } from './mediaVariants';
import { PublicCatalogProvider } from './providers/PublicCatalogProvider';

const checked = new Map<string, number>();
const MEDIA_VARIANT_CACHE_TTL_MS = 15 * 60 * 1000;

function isAutomatedCrawler(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent || '';
  return /(meta-externalagent|facebookexternalhit|facebot|Googlebot|AdsBot-Google|Mediapartners-Google|bingbot|Applebot|Linespider|ByteSpider|PetalBot|SemrushBot|AhrefsBot|MJ12bot|YandexBot|DuckDuckBot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|HeadlessChrome|PhantomJS|Prerender)/i.test(ua);
}

/** One bounded batch before rendering detail; absence/error always keeps the original usable. */
export async function loadMediaVariants(value: unknown) {
  if (isAutomatedCrawler() || PublicCatalogProvider.isDomainEnabled('productDetail')) return;
  const urls = collectMediaUrls(value).filter(url => (checked.get(url) || 0) < Date.now()).slice(0, 150);
  if (!urls.length) return;
  try {
    const { data, error } = await supabase.rpc('get_catalog_media_variants', { urls })
      .abortSignal(AbortSignal.timeout(2000));
    if (!error) {
      registerMediaVariants(data || []);
      urls.forEach(url => checked.set(url, Date.now() + MEDIA_VARIANT_CACHE_TTL_MS));
    }
  } catch { /* Derivatives are optional; do not fail the product page. */ }
}
