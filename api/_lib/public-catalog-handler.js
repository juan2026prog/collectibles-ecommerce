import { getCatalogRepository, parseFilters, selectCatalog, catalogReadError, catalogErrorMetadata } from './public-catalog.js';
import { readMediaVariants } from './media-variants.js';

const CARD_FIELDS = `id,title,slug,base_price,compare_at_price,badge,is_featured,is_active,status,vendor_id,vendor_store_id,brand_id,category_id,condition,created_at,
  category:categories(id,name,slug),brand:brands!products_brand_id_fkey(id,name,slug,logo_url),
  images:product_images(id,url,alt_text,is_primary,sort_order),variants:product_variants(id,sku,price_adjustment,inventory_count),
  vendor:vendors(id,store_name,slug,logo_url),vendor_store:vendor_stores(id,store_name,slug,logo_url,is_official),
  product_group_items(group_id,group:product_groups(id,name,slug,is_active,sort_order,badge_image_url,badge_storage_path,badge_alt_text))`;

export function createCatalogHandler(getRepository = getCatalogRepository) {
  return async function handler(req, res) {
    const startedAt = Date.now();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    let filters;
    try { filters = parseFilters(req.query || {}); }
    catch { return res.status(400).json({ error: 'Invalid catalog filters' }); }
    if (filters.collection_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.collection_id)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }
    try {
      const repo = getRepository();
      const { catalog, stale = false, age_ms = 0 } = await repo.get();
      let collectionIds = null;
      if (filters.collection_id) {
        let rows;
        try { rows = await repo.readAll('vendor_store_collection_products', 'product_id', q => q.eq('collection_id', filters.collection_id), 'product_id', AbortSignal.timeout(4000)); }
        catch (error) { throw catalogReadError('collection', 'vendor_store_collection_products', error); }
        collectionIds = new Set(rows.map(p => p.product_id));
      }
      const selected = selectCatalog(catalog, filters, collectionIds);
      let products = [];
      let cardsDegraded = false;
      if (filters.mode !== 'facets' && selected.selected.length) {
        const localIds = selected.selected.filter(p => p.origin === 'local').map(p => p.id);
        const intlIds = selected.selected.filter(p => p.origin === 'international').map(p => p.id);
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
        const readCards = async (query, kind) => {
          try {
            const result = await (typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query);
            if (result.error) throw result.error;
            return result;
          } catch (error) {
            const failure = catalogReadError('cards', kind, error);
            controller.abort(failure);
            throw failure;
          }
        };
        try {
          const [local, international] = await Promise.all([
            localIds.length ? readCards(repo.client.from('products').select(CARD_FIELDS).in('id', localIds).eq('status','published').eq('is_active',true), 'products') : { data: [] },
            intlIds.length ? readCards(repo.client.from('international_products')
              .select('id,title,description,brand,image_url,final_price_usd,amazon_list_price_usd,created_at,status,collectibles_category_id,collectibles_subcategory_id')
              .in('id', intlIds).eq('status','published'), 'international_products') : { data: [] },
          ]);
          const cards = new Map((local.data || []).map(p => [`local:${p.id}`, p]));
          for (const p of international.data || []) {
            const category = catalog.categories.find(c => c.id === p.collectibles_category_id);
            cards.set(`international:${p.id}`, {
              id:p.id,slug:p.id,title:p.title,description:p.description,created_at:p.created_at,
              base_price:Number(p.final_price_usd),compare_at_price:Number(p.amazon_list_price_usd || p.final_price_usd),
              images:[{ id:p.id,url:p.image_url,is_primary:true }],image_url:p.image_url,
              brand:{name:p.brand || 'Importado',slug:p.brand ? p.brand.toLowerCase() : 'importado'},
              category:category || null,subcategory:catalog.categories.find(c=>c.id===p.collectibles_subcategory_id) || null,
              collectibles_category_id:p.collectibles_category_id,collectibles_subcategory_id:p.collectibles_subcategory_id,
              source_provider:'zinc',is_international:true,is_active:true,status:p.status,
              raw_international_data:p,international_products:[p],
            });
          }
          products = selected.selected.map(p => cards.get(`${p.origin}:${p.id}`)).filter(Boolean);
        } catch (cardsError) {
          console.error('[public-catalog] Upstream unavailable', {
            ...catalogErrorMetadata(cardsError), elapsed_ms: Date.now() - startedAt,
            region: /^[a-z0-9-]{1,24}$/.test(process.env.VERCEL_REGION || '') ? process.env.VERCEL_REGION : 'unknown',
            fallback_cards: true,
          });
          cardsDegraded = true;
          products = selected.selected.map(p => {
            const brand = catalog.brands.find(b => b.id === p.brand_id);
            const category = catalog.categories.find(c => c.id === p.category_id);
            return {
              id: p.id,
              slug: p.slug || p.id,
              title: p.title,
              description: p.description,
              base_price: Number(p.origin === 'international' ? p.final_price_usd * (filters.exchangeRate || 1) : (p.base_price || 0)),
              created_at: p.created_at,
              status: p.status,
              is_active: p.is_active,
              badge: p.badge,
              is_featured: p.is_featured,
              condition: p.condition,
              brand_id: p.brand_id,
              category_id: p.category_id,
              brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug, logo_url: brand.logo_url } : null,
              category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
              images: [],
              variants: [],
              is_international: p.origin === 'international',
              is_degraded: true,
              stock_verified: false,
            };
          });
        }
      }
      const imageVariants = cardsDegraded ? [] : await readMediaVariants(repo.client, filters.mode === 'facets' ? catalog : products);
      const ageSeconds = Math.floor(age_ms / 1000);
      const staleSeverity = !stale ? 'fresh' : age_ms < 1800000 ? 'soft' : 'hard';

      // This response is anonymous and identical for every caller; never forward cookies or user JWTs.
      res.setHeader('X-Catalog-Snapshot', stale ? 'stale' : 'fresh');
      res.setHeader('X-Catalog-Snapshot-Age', String(ageSeconds));
      res.setHeader('X-Catalog-Stale-Severity', staleSeverity);
      if (cardsDegraded) {
        res.setHeader('X-Catalog-Degraded', 'cards-fallback');
      }
      if (stale || cardsDegraded) {
        res.setHeader('Cache-Control', 'public, max-age=0');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      }
      res.setHeader('X-Catalog-Version', '2026-10-stability-2');
      return res.status(200).json({
        products,
        image_variants: imageVariants,
        count: selected.count,
        facets: selected.facets,
        snapshot_meta: {
          stale,
          age_seconds: ageSeconds,
          severity: staleSeverity,
          checkout_revalidation_required: stale,
          cards_degraded: cardsDegraded,
        },
        ...(filters.mode === 'facets' ? { taxonomies: {
          categories: catalog.categories, brands: catalog.brands, licenses: catalog.licenses, themes: catalog.themes,
        } } : {})
      });
    } catch (error) {
      console.error('[public-catalog] Upstream unavailable', {
        ...catalogErrorMetadata(error), elapsed_ms: Date.now() - startedAt,
        region: /^[a-z0-9-]{1,24}$/.test(process.env.VERCEL_REGION || '') ? process.env.VERCEL_REGION : 'unknown',
      });
      res.setHeader('Retry-After', '30');
      return res.status(503).json({ error: 'El catálogo está temporalmente demorado. Intentá nuevamente en unos segundos.' });
    }
  };
}

export default createCatalogHandler();
