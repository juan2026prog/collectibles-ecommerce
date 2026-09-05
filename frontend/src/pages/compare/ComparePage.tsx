import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import {
  Scale, Shield, Share2, Check, X, Sparkles,
  ArrowLeft, Plus, Search, ShoppingCart, Filter, RefreshCw, Star
} from 'lucide-react';
import {
  DEFAULT_ATTRIBUTES,
  hydrateProductAttributes,
  generateCollectorVerdict,
  evaluateCollectorCompatibility
} from '../../plugins/collector-compare';
import type { ComparedProduct, AttributeDefinition, CollectorVerdict, CompatibilityResult } from '../../plugins/collector-compare';
import { useCartContext } from '../../contexts/CartContext';
import { useCollectorCompare } from '../../contexts/CompareContext';

// ── DEMO PRECARGADA: NECA Laurie Strode vs Chucky TV Series ──────────────────
// Productos reales del catalogo Collectibles. Datos tecnicos oficiales NECA.
const HORROR_DEMO_PRESET: ComparedProduct[] = [
  {
    id: 'd3b8cf71-eada-4ae5-bfc4-467cf80366a2',
    title: 'Laurie Strode Ultimate Halloween (2018) NECA',
    slug: 'laurie-strode-ultimate-halloween--2018--neca-2383',
    base_price: 3990,
    status: 'ACTIVE',
    condition: 'NEW_SEALED',
    brand_name: 'NECA',
    license_name: 'Halloween',
    category_name: 'Figuras de Accion',
    primary_image: 'https://http2.mlstatic.com/D_842296-MLU45571864464_042021-O.jpg',
    metadata: { height_cm: 18, articulation_points: 25, swap_heads: 2, accessories_count: 5, release_year: 2019 },
    normalized_attributes: {
      price:        { raw: 3990,         display: '$ 3.990 UYU',                              is_informed: true },
      brand:        { raw: 'NECA',       display: 'NECA',                                      is_informed: true },
      license:      { raw: 'Halloween',  display: 'Halloween (2018)',                          is_informed: true },
      product_line: { raw: 'Ultimate',   display: 'Ultimate',                                  is_informed: true },
      height:       { raw: 18,           display: '>7" / ~18 cm',                              is_informed: true, numeric_value: 18 },
      articulation: { raw: 25,           display: '25+ puntos articulados',                    is_informed: true, numeric_value: 25 },
      swap_heads:   { raw: 2,            display: '2 cabezas intercambiables',                 is_informed: true, numeric_value: 2 },
      accessories:  { raw: 5,            display: 'Escopeta, rifle, revolver, cuchillo y funda', is_informed: true, numeric_value: 5 },
      packaging:    { raw: 'window_box', display: 'Deluxe window box con solapa',              is_informed: true },
      release_year: { raw: 2019,         display: '2019',                                      is_informed: true, numeric_value: 2019 },
      condition:    { raw: 'NEW',        display: 'Nuevo sellado de fabrica',                  is_informed: true },
      availability: { raw: 'LOCAL',      display: 'Stock local Uruguay',                       is_informed: true },
    },
  },
  {
    id: 'eb98194b-03c3-47a2-88a8-7f38dc27605e',
    title: 'Chucky TV Series Ultimate NECA',
    slug: 'chucky-tv-series-ultimate-neca-4996',
    base_price: 3990,
    status: 'ACTIVE',
    condition: 'NEW_SEALED',
    brand_name: 'NECA',
    license_name: 'Chucky',
    category_name: 'Figuras de Accion',
    primary_image: 'https://http2.mlstatic.com/D_716119-MLU72394289582_102023-O.jpg',
    metadata: { height_cm: 10, articulation_points: 15, swap_heads: 4, accessories_count: 6, release_year: 2023 },
    normalized_attributes: {
      price:        { raw: 3990,         display: '$ 3.990 UYU',                              is_informed: true },
      brand:        { raw: 'NECA',       display: 'NECA',                                      is_informed: true },
      license:      { raw: 'Chucky',     display: 'Chucky (TV Series)',                        is_informed: true },
      product_line: { raw: 'Ultimate',   display: 'Ultimate',                                  is_informed: true },
      height:       { raw: 10,           display: '4" / ~10 cm',                              is_informed: true, numeric_value: 10 },
      articulation: { raw: 15,           display: '15+ puntos articulados',                    is_informed: true, numeric_value: 15 },
      swap_heads:   { raw: 4,            display: '4 cabezas intercambiables',                 is_informed: true, numeric_value: 4 },
      accessories:  { raw: 6,            display: 'Cuchillo, jeringas, manos y brazo quemado', is_informed: true, numeric_value: 6 },
      packaging:    { raw: 'window_box', display: 'Deluxe window box con solapa',              is_informed: true },
      release_year: { raw: 2023,         display: '2023',                                      is_informed: true, numeric_value: 2023 },
      condition:    { raw: 'NEW',        display: 'Nuevo sellado de fabrica',                  is_informed: true },
      availability: { raw: 'LOCAL',      display: 'Stock local Uruguay',                       is_informed: true },
    },
  },
];

const HORROR_ATTRIBUTES: AttributeDefinition[] = [
  { attribute_key: 'price',        label: 'Precio',                  category_scope: 'all', data_type: 'currency',  priority: 'critical', sort_order: 1,  is_visible: true },
  { attribute_key: 'brand',        label: 'Fabricante',              category_scope: 'all', data_type: 'text',      priority: 'critical', sort_order: 2,  is_visible: true },
  { attribute_key: 'license',      label: 'Franquicia',              category_scope: 'all', data_type: 'text',      priority: 'high',     sort_order: 3,  is_visible: true },
  { attribute_key: 'product_line', label: 'Linea',                   category_scope: 'all', data_type: 'text',      priority: 'high',     sort_order: 4,  is_visible: true },
  { attribute_key: 'height',       label: 'Altura real',             category_scope: 'all', data_type: 'dimension', unit: 'cm',           priority: 'critical', sort_order: 5,  is_visible: true },
  { attribute_key: 'articulation', label: 'Articulacion',            category_scope: 'all', data_type: 'number',    unit: 'puntos',       priority: 'critical', sort_order: 6,  is_visible: true },
  { attribute_key: 'swap_heads',   label: 'Cabezas intercambiables', category_scope: 'all', data_type: 'number',    priority: 'high',     sort_order: 7,  is_visible: true },
  { attribute_key: 'accessories',  label: 'Accesorios principales',  category_scope: 'all', data_type: 'text',      priority: 'high',     sort_order: 8,  is_visible: true },
  { attribute_key: 'packaging',    label: 'Packaging coleccionista', category_scope: 'all', data_type: 'text',      priority: 'medium',   sort_order: 9,  is_visible: true },
  { attribute_key: 'release_year', label: 'Lanzamiento',             category_scope: 'all', data_type: 'number',    priority: 'low',      sort_order: 10, is_visible: true },
  { attribute_key: 'condition',    label: 'Condicion',               category_scope: 'all', data_type: 'text',      priority: 'medium',   sort_order: 11, is_visible: true },
  { attribute_key: 'availability', label: 'Disponibilidad',          category_scope: 'all', data_type: 'text',      priority: 'critical', sort_order: 12, is_visible: true },
];

// ── Winner detection logic ───────────────────────────────────────────────────
// Higher numeric value = better for these attributes
const WINNER_HIGHER_BETTER = ['height', 'articulation', 'swap_heads', 'accessories'];
// Always show as tie (same value or not comparable numerically)
const WINNER_ALWAYS_TIE    = ['price', 'brand', 'license', 'product_line', 'packaging', 'condition', 'availability', 'release_year'];

type WinnerResult = string | 'tie' | null;

function getRowWinner(attrKey: string, products: ComparedProduct[]): WinnerResult {
  if (products.length !== 2) return null;
  if (WINNER_ALWAYS_TIE.includes(attrKey)) {
    const v0 = products[0].normalized_attributes?.[attrKey]?.raw;
    const v1 = products[1].normalized_attributes?.[attrKey]?.raw;
    return v0 === v1 ? 'tie' : null;
  }
  if (WINNER_HIGHER_BETTER.includes(attrKey)) {
    const n0 = (products[0].normalized_attributes?.[attrKey]?.numeric_value ?? products[0].normalized_attributes?.[attrKey]?.raw) as number | undefined;
    const n1 = (products[1].normalized_attributes?.[attrKey]?.numeric_value ?? products[1].normalized_attributes?.[attrKey]?.raw) as number | undefined;
    if (typeof n0 !== 'number' || typeof n1 !== 'number') return null;
    if (n0 === n1) return 'tie';
    return n0 > n1 ? products[0].id : products[1].id;
  }
  return null;
}

// ── Star rating mini component ───────────────────────────────────────────────
const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex items-center gap-0.5">
    {[1,2,3,4,5].map(i => (
      <Star key={i} size={12} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'} />
    ))}
    <span className="text-[10px] text-zinc-500 ml-1">{rating}/5</span>
  </div>
);

// ── Hero cards + VS divider ──────────────────────────────────────────────────
interface HeroSectionProps {
  products: ComparedProduct[];
  onSwap: (idx: number) => void;
}

const HeroCompareSection: React.FC<HeroSectionProps> = ({ products, onSwap }) => {
  if (products.length < 2) return null;
  const [p0, p1] = products;

  const Card = ({ p, idx }: { p: ComparedProduct; idx: number }) => (
    <div className="flex-1 flex flex-col items-center gap-3.5 p-5 sm:p-6 rounded-2xl bg-[#0c1322] border border-amber-500/40 hover:border-amber-500 shadow-xl shadow-amber-500/10 hover:shadow-amber-500/20 transition-all duration-300 group relative">
      {/* Product Image Container: white frame with amber border like store items */}
      <div className="w-full max-w-[210px] aspect-square rounded-xl bg-white border border-amber-500/30 group-hover:border-amber-500/60 overflow-hidden flex items-center justify-center p-3 shadow-md transition-all">
        {p.primary_image ? (
          <img
            src={p.primary_image}
            alt={p.title}
            className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <Scale size={40} className="text-zinc-400" />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center">
        <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
          {p.brand_name}
        </span>
        <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
          {p.normalized_attributes?.product_line?.display || 'Ultimate'}
        </span>
      </div>

      <div className="text-center space-y-1">
        <Link
          to={`/producto/${p.slug}`}
          className="text-sm sm:text-base font-black text-white hover:text-amber-400 transition leading-snug line-clamp-2"
        >
          {p.title}
        </Link>
        <p className="text-xs text-zinc-400">{p.license_name}</p>
      </div>

      <StarRating rating={4} />

      <div className="text-2xl font-black text-amber-400 tracking-tight">
        {p.normalized_attributes?.price?.display || `$ ${p.base_price.toLocaleString('es-UY')} UYU`}
      </div>

      <button
        onClick={() => onSwap(idx)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-amber-500/10 text-zinc-200 hover:text-amber-400 text-xs font-bold transition-all border border-zinc-700 hover:border-amber-500/50"
      >
        <RefreshCw size={12} />
        <span>Cambiar producto</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-4">
      <Card p={p0} idx={0} />
      <div className="flex sm:flex-col items-center justify-center gap-3 py-2 sm:py-0 sm:px-2 flex-shrink-0">
        <div className="hidden sm:block w-px flex-1 bg-gradient-to-b from-transparent via-amber-500/40 to-transparent" />
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 flex-shrink-0 border-2 border-black">
          <span className="text-black font-black text-xs">VS</span>
        </div>
        <div className="hidden sm:block w-px flex-1 bg-gradient-to-b from-transparent via-amber-500/40 to-transparent" />
      </div>
      <Card p={p1} idx={1} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export const ComparePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { removeFromCompare, addToCompare } = useCollectorCompare();
  const { addToCart } = useCartContext();

  const [products, setProducts] = useState<ComparedProduct[]>([]);
  const [attributes, setAttributes] = useState<AttributeDefinition[]>(DEFAULT_ATTRIBUTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Search/swap modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [swapTargetIdx, setSwapTargetIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Parse product IDs from URL
  const productIds = useMemo(() => {
    const raw = searchParams.get('products') || '';
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
      .slice(0, 4);
  }, [searchParams]);

  // Fetch or load demo
  useEffect(() => {
    const fetchData = async () => {
      // No URL params → auto-load Laurie vs Chucky demo
      if (productIds.length === 0) {
        setProducts(HORROR_DEMO_PRESET);
        setAttributes(HORROR_ATTRIBUTES);
        setIsDemoMode(true);
        setLoading(false);
        return;
      }

      // URL params present → fetch live from DB
      try {
        setLoading(true);
        setError(null);
        setIsDemoMode(false);

        const { data: dbAttrs } = await supabase
          .from('compare_attributes')
          .select('*')
          .eq('is_visible', true)
          .order('sort_order', { ascending: true });

        const activeAttrs = (dbAttrs && dbAttrs.length > 0) ? dbAttrs : DEFAULT_ATTRIBUTES;
        setAttributes(activeAttrs);

        const { data: rawProducts, error: rpcError } = await supabase
          .rpc('get_products_for_comparison', { p_product_ids: productIds });

        if (rpcError) throw rpcError;

        if (rawProducts && Array.isArray(rawProducts)) {
          setProducts(hydrateProductAttributes(rawProducts, activeAttrs));
        } else {
          setProducts([]);
        }
      } catch (err: any) {
        console.error('Error fetching comparison data:', err);
        setError(err.message || 'Error al cargar la comparacion');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [productIds]);

  const verdict: CollectorVerdict = useMemo(() => generateCollectorVerdict(products), [products]);
  const compatibility: CompatibilityResult = useMemo(() => evaluateCollectorCompatibility(products), [products]);

  const visibleAttributes = useMemo(() => {
    if (!showDifferencesOnly) return attributes;
    return attributes.filter(attr => {
      if (products.length <= 1) return true;
      const vals = products.map(p => p.normalized_attributes?.[attr.attribute_key]?.display || 'No informado');
      return !vals.every(v => v === vals[0]);
    });
  }, [attributes, products, showDifferencesOnly]);

  const handleRemove = (id: string) => {
    const updated = productIds.filter(x => x !== id);
    removeFromCompare(id);
    if (updated.length > 0) setSearchParams({ products: updated.join(',') });
    else navigate('/shop');
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openSwapModal = (idx: number | null) => {
    setSwapTargetIdx(idx);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchOpen(true);
  };

  // Search in catalog
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const { data } = await supabase
          .from('products')
          .select('id, title, slug, base_price, product_images(url, is_primary)')
          .ilike('title', `%${searchQuery.trim()}%`)
          .limit(6);
        if (data) setSearchResults(data.filter(p => !productIds.includes(p.id)));
      } catch (e) { console.error(e); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, productIds]);

  const handleSelectProduct = (p: any) => {
    if (isDemoMode && swapTargetIdx !== null) {
      // Replace one demo card with a real catalog product
      const img = p.product_images?.find((i: any) => i.is_primary)?.url || p.product_images?.[0]?.url || null;
      const newEntry: ComparedProduct = {
        id: p.id, title: p.title, slug: p.slug || p.id,
        base_price: p.base_price, status: 'ACTIVE', condition: 'NEW_SEALED',
        brand_name: p.brand_name || '', license_name: '', category_name: '',
        primary_image: img,
        normalized_attributes: {
          price: { raw: p.base_price, display: `$ ${Number(p.base_price).toLocaleString('es-UY')} UYU`, is_informed: true },
          availability: { raw: 'LOCAL', display: 'Stock local Uruguay', is_informed: true },
        },
      };
      setProducts(prev => { const n = [...prev]; n[swapTargetIdx] = newEntry; return n; });
    } else {
      if (productIds.length >= 4) return;
      addToCompare(p.id);
      setSearchParams({ products: [...productIds, p.id].join(',') });
    }
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-4">
      <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
      <p className="text-zinc-400 text-sm font-medium">Analizando especificaciones de catalogo...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-4">
      <p className="text-red-400 text-sm">{error}</p>
      <Link to="/shop" className="mt-4 text-amber-400 text-xs underline">Volver a la tienda</Link>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0f12] text-white py-8 px-3 sm:px-6 lg:px-8">
      <Helmet>
        <title>
          {isDemoMode
            ? 'Comparador del Coleccionista | NECA Laurie Strode vs Chucky | Collectibles'
            : `Comparativa (${products.length} piezas) | Collectibles`}
        </title>
        {isDemoMode
          ? <meta name="description" content="Compara NECA Ultimate Laurie Strode vs Chucky TV Series: altura, articulacion, accesorios y veredicto del coleccionista." />
          : <meta name="robots" content="noindex, nofollow" />}
      </Helmet>

      <div className="max-w-5xl mx-auto space-y-7">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link to="/shop" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-amber-400 mb-2 transition">
              <ArrowLeft size={14} /> Volver a la tienda
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
                <Scale size={26} className="text-amber-500" /> Comparador del Coleccionista
              </h1>
              {isDemoMode && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Demo precargada
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Control Segmentado Claro: Ver todas las filas vs Solo diferencias */}
            <div className="flex items-center p-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-inner">
              <button
                type="button"
                onClick={() => setShowDifferencesOnly(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !showDifferencesOnly
                    ? 'bg-amber-500 text-black shadow-md font-black'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Mostrar todas las especificaciones y atributos"
              >
                <span>Todas las filas</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDifferencesOnly(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  showDifferencesOnly
                    ? 'bg-amber-500 text-black shadow-md font-black'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Ocultar atributos donde ambas figuras son iguales"
              >
                <Filter size={13} />
                <span>Solo diferencias</span>
              </button>
            </div>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-bold transition"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>

            {!isDemoMode && products.length < 4 && (
              <button
                onClick={() => openSwapModal(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition"
              >
                <Plus size={14} /> <span>Agregar ({4 - products.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Hero Cards ── */}
        <HeroCompareSection products={products} onSwap={openSwapModal} />

        {/* ── Live mode verdict ── */}
        {!isDemoMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-amber-500/30 shadow-xl">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
                <Sparkles size={16} /> Veredicto Factual del Coleccionista
              </div>
              <p className="text-sm font-medium text-zinc-200 leading-relaxed mb-3">{verdict.summary}</p>
              {verdict.key_findings.length > 0 && (
                <div className="space-y-1.5">
                  {verdict.key_findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                      <span className="text-amber-500 font-bold">•</span><span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Compatibilidad en Vitrina</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                  compatibility.status === 'COMPATIBLE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : compatibility.status === 'APPROXIMATELY_COMPATIBLE' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : compatibility.status === 'NOT_RECOMMENDED' ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}>
                  {compatibility.label}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-snug">{compatibility.reason}</p>
            </div>
          </div>
        )}

        {/* ── Comparison Table ── */}
        <div className="rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="p-4 w-44 text-xs font-black uppercase tracking-wider text-zinc-500 bg-zinc-900/90">
                  Especificacion
                </th>
                {products.map((p, idx) => (
                  <th key={p.id} className="p-4 w-64 align-top">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Figura {idx + 1}</span>
                        {isDemoMode
                          ? <button onClick={() => openSwapModal(idx)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-amber-400 transition"><RefreshCw size={10} /> Cambiar</button>
                          : <button onClick={() => handleRemove(p.id)} className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 flex items-center justify-center transition border border-zinc-700" title="Quitar"><X size={11} /></button>
                        }
                      </div>
                      <div className="w-full aspect-square max-h-32 rounded-xl bg-white border border-amber-500/30 overflow-hidden flex items-center justify-center p-2 shadow-sm">
                        {p.primary_image
                          ? <img src={p.primary_image} alt={p.title} className="max-w-full max-h-full object-contain" />
                          : <Scale size={20} className="text-zinc-400" />
                        }
                      </div>
                      <Link to={`/producto/${p.slug}`} className="text-xs font-bold text-white hover:text-amber-400 line-clamp-2 transition leading-snug">{p.title}</Link>
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                        <span className="text-sm font-black text-amber-400">
                          {p.normalized_attributes?.price?.display || `$ ${p.base_price.toLocaleString('es-UY')}`}
                        </span>
                        <button
                          onClick={() => addToCart({ id: p.id, title: p.title, price: p.base_price, image: p.primary_image } as any)}
                          className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] rounded-lg transition flex items-center gap-1"
                        >
                          <ShoppingCart size={11} /> Comprar
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
                {!isDemoMode && products.length < 4 && (
                  <th className="p-4 w-48 align-middle text-center bg-zinc-950/40">
                    <button onClick={() => openSwapModal(null)} className="w-full h-48 border-2 border-dashed border-zinc-800 hover:border-amber-500/40 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-amber-400 transition group p-4">
                      <Plus size={24} className="group-hover:scale-110 transition" />
                      <span className="text-xs font-bold">Agregar figura</span>
                    </button>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-900">
              {visibleAttributes.map(attr => {
                const winner = getRowWinner(attr.attribute_key, products);
                const isTie = winner === 'tie';
                return (
                  <tr key={attr.attribute_key} className="hover:bg-zinc-900/20 transition">
                    <td className="p-3.5 text-xs font-bold bg-zinc-950">
                      <div className="flex flex-col">
                        <span className="text-zinc-300">{attr.label}</span>
                        {attr.unit && <span className="text-[10px] text-zinc-600 uppercase font-mono">({attr.unit})</span>}
                      </div>
                    </td>
                    {products.map(p => {
                      const normVal = p.normalized_attributes?.[attr.attribute_key];
                      const isMissing = !normVal || !normVal.is_informed;
                      const isWinner = !isTie && winner === p.id;
                      return (
                        <td key={p.id} className={`p-3.5 text-xs font-medium transition ${isWinner ? 'bg-emerald-950/40 border-l border-emerald-900/40' : ''}`}>
                          <div className="flex items-center gap-1.5">
                            {isWinner && <Check size={13} className="text-emerald-400 flex-shrink-0" />}
                            {isTie && <span className="text-amber-500/60 text-[10px] font-black flex-shrink-0">~</span>}
                            <span className={
                              isMissing ? 'text-zinc-600 italic'
                              : isWinner ? 'text-emerald-300 font-semibold'
                              : isTie ? 'text-amber-400/80'
                              : 'text-zinc-300'
                            }>
                              {normVal?.display || 'No informado'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    {!isDemoMode && products.length < 4 && <td className="p-3.5 bg-zinc-950/20" />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Editorial Conclusion (demo mode only) ── */}
        {isDemoMode && products.length === 2 && (
          <div className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-amber-500/20 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles size={18} className="text-amber-400" />
              <h2 className="text-base font-black text-white">¿Cual elegir?</h2>
              <span className="text-[10px] text-zinc-500 font-medium">Veredicto editorial Collectibles</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Laurie card */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-900/30 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden flex-shrink-0">
                    {products[0].primary_image && <img src={products[0].primary_image} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">Elegi Laurie Strode si...</p>
                    <p className="text-[10px] text-zinc-500 line-clamp-1">{products[0].title}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {[
                    'Buscas mayor tamano y presencia en vitrina',
                    'Priorizas realismo en figura humana de horror cinematografico',
                    'Queres la figura con mas puntos de articulacion (25+)',
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                      <Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />{t}
                    </li>
                  ))}
                </ul>
                <Link to={`/producto/${products[0].slug}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition">
                  Ver en catalogo →
                </Link>
              </div>

              {/* Chucky card */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-900/30 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden flex-shrink-0">
                    {products[1].primary_image && <img src={products[1].primary_image} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">Elegi Chucky si...</p>
                    <p className="text-[10px] text-zinc-500 line-clamp-1">{products[1].title}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {[
                    'Priorizas variedad de expresiones (4 cabezas intercambiables)',
                    'Queres mas accesorios y posibilidades de exhibicion',
                    'Te interesa un personaje compacto de alta fidelidad TV',
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                      <Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />{t}
                    </li>
                  ))}
                </ul>
                <Link to={`/producto/${products[1].slug}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition">
                  Ver en catalogo →
                </Link>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 text-center pt-2 border-t border-zinc-800">
              Datos tecnicos verificados · Fuente: especificaciones oficiales NECA para ambas figuras.
            </p>
          </div>
        )}

        {/* ── Demo: "Explore more" banner ── */}
        {isDemoMode && (
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">¿Queres comparar otras figuras?</p>
              <p className="text-xs text-zinc-400">Toca "Cambiar producto" en cualquiera de las cards, o explora el catalogo completo.</p>
            </div>
            <Link to="/shop" className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm rounded-xl transition">
              Explorar Catalogo
            </Link>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center pt-2 pb-8 text-xs text-zinc-600 flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-zinc-700" />
          <span>Comparador del Coleccionista Collectibles 2026 · Datos tecnicos verificados.</span>
        </div>
      </div>

      {/* ── Search / Swap Modal ── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                {swapTargetIdx !== null ? 'Cambiar figura' : 'Agregar figura a la comparativa'}
              </h3>
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, franquicia, marca..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
              {searching ? (
                <div className="p-4 text-center text-xs text-zinc-500">Buscando en catalogo...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  {searchQuery ? 'No se encontraron resultados.' : 'Escribe para buscar piezas en catalogo.'}
                </div>
              ) : searchResults.map(p => {
                const img = p.product_images?.find((i: any) => i.is_primary)?.url || p.product_images?.[0]?.url;
                return (
                  <div key={p.id} onClick={() => handleSelectProduct(p)} className="p-3 flex items-center justify-between hover:bg-zinc-800/60 cursor-pointer rounded-xl transition">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-white border border-amber-500/20 overflow-hidden flex-shrink-0 flex items-center justify-center p-1 shadow-sm">
                        {img ? <img src={img} alt="" className="max-w-full max-h-full object-contain" /> : <Scale size={16} className="text-zinc-400" />}
                      </div>
                      <span className="text-xs font-bold text-zinc-200 line-clamp-1">{p.title}</span>
                    </div>
                    <span className="text-xs font-black text-amber-400">$ {Number(p.base_price).toLocaleString('es-UY')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparePage;
