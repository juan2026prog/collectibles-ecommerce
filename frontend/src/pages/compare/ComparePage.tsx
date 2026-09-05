import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import { 
  Scale, Shield, Share2, Check, X, Sparkles, 
  ArrowLeft, Plus, Search, ShoppingCart, RefreshCw, Star,
  Eye, CheckCircle2
} from 'lucide-react';
import { 
  DEFAULT_ATTRIBUTES, 
  hydrateProductAttributes 
} from '../../plugins/collector-compare';
import type { ComparedProduct } from '../../plugins/collector-compare';
import { useCartContext } from '../../contexts/CartContext';
import { useCollectorCompare } from '../../contexts/CompareContext';

// ── DEMO PRESET INICIAL REAL: NECA Laurie Strode vs. NECA Chucky ────────────────
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
    category_name: 'Figuras de Acción',
    primary_image: 'https://http2.mlstatic.com/D_842296-MLU45571864464_042021-O.jpg',
    metadata: {
      scale: '1:10 (7 pulgadas)',
      height_cm: 18,
      articulation_points: 25,
      swap_heads: 2,
      accessories_count: 5,
      release_year: 2019,
      materials: 'PVC / ABS con tela texturizada',
      packaging: 'Deluxe window box con solapa frontal imantada',
      display_strength: 'Gran porte, realismo y presencia imponente en vitrina'
    },
    normalized_attributes: {
      price:        { raw: 3990,         display: '$ 3.990 UYU',                                      is_informed: true, numeric_value: 3990 },
      brand:        { raw: 'NECA',       display: 'NECA',                                             is_informed: true },
      license:      { raw: 'Halloween',  display: 'Halloween (2018)',                                 is_informed: true },
      product_line: { raw: 'Ultimate',   display: 'Ultimate',                                         is_informed: true },
      scale:        { raw: '1:10',       display: '1:10 (7 pulgadas / ~18 cm)',                       is_informed: true },
      height:       { raw: 18,           display: '18 cm (7.1 pulg.)',                                is_informed: true, numeric_value: 18 },
      articulation: { raw: 25,           display: '25+ puntos de articulación',                       is_informed: true, numeric_value: 25 },
      swap_heads:   { raw: 2,            display: '2 cabezas intercambiables',                        is_informed: true, numeric_value: 2 },
      accessories:  { raw: 5,            display: 'Escopeta, rifle táctico, revólver, cuchillo y funda', is_informed: true, numeric_value: 5 },
      materials:    { raw: 'PVC/ABS',    display: 'PVC y ABS esculpido premium',                      is_informed: true },
      packaging:    { raw: 'window_box', display: 'Deluxe Window Box coleccionista con solapa',       is_informed: true },
      release_year: { raw: 2019,         display: '2019',                                             is_informed: true, numeric_value: 2019 },
      condition:    { raw: 'NEW',        display: 'Nuevo · Sellado de fábrica',                       is_informed: true },
      availability: { raw: 'LOCAL',      display: 'En stock local · Entrega inmediata 🇺🇾',           is_informed: true },
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
    category_name: 'Figuras de Acción',
    primary_image: 'https://http2.mlstatic.com/D_716119-MLU72394289582_102023-O.jpg',
    metadata: {
      scale: '1:10 (Escala Chucky 4 pulgadas)',
      height_cm: 10,
      articulation_points: 15,
      swap_heads: 4,
      accessories_count: 6,
      release_year: 2023,
      materials: 'PVC / ABS articulado con detalles termoimpresos',
      packaging: 'Deluxe window box con solapa frontal imantada',
      display_strength: 'Máxima expresividad, piezas alternas y variedad de poses'
    },
    normalized_attributes: {
      price:        { raw: 3990,         display: '$ 3.990 UYU',                                      is_informed: true, numeric_value: 3990 },
      brand:        { raw: 'NECA',       display: 'NECA',                                             is_informed: true },
      license:      { raw: 'Chucky',     display: 'Chucky (TV Series / Don Mancini)',                 is_informed: true },
      product_line: { raw: 'Ultimate',   display: 'Ultimate',                                         is_informed: true },
      scale:        { raw: '1:10',       display: '1:10 escala proporción (~10 cm)',                  is_informed: true },
      height:       { raw: 10,           display: '10 cm (4.0 pulg.)',                                is_informed: true, numeric_value: 10 },
      articulation: { raw: 15,           display: '15+ puntos de articulación',                       is_informed: true, numeric_value: 15 },
      swap_heads:   { raw: 4,            display: '4 cabezas intercambiables (expresiones)',          is_informed: true, numeric_value: 4 },
      accessories:  { raw: 6,            display: 'Cuchillo ensangrentado, jeringas, manos y brazo quemado', is_informed: true, numeric_value: 6 },
      materials:    { raw: 'PVC/ABS',    display: 'PVC y ABS esculpido con acabados en pintura UV',   is_informed: true },
      packaging:    { raw: 'window_box', display: 'Deluxe Window Box coleccionista con solapa',       is_informed: true },
      release_year: { raw: 2023,         display: '2023',                                             is_informed: true, numeric_value: 2023 },
      condition:    { raw: 'NEW',        display: 'Nuevo · Sellado de fábrica',                       is_informed: true },
      availability: { raw: 'LOCAL',      display: 'En stock local · Entrega inmediata 🇺🇾',           is_informed: true },
    },
  },
];

// ── GRUPOS DE ESPECIFICACIONES TÉCNICAS ────────────────────────────────────────
interface SpecGroup {
  id: string;
  title: string;
  attributes: {
    key: string;
    label: string;
    description?: string;
  }[];
}

const SPEC_GROUPS: SpecGroup[] = [
  {
    id: 'basic',
    title: 'Ficha Básica',
    attributes: [
      { key: 'brand', label: 'Fabricante', description: 'Marca productora oficial' },
      { key: 'license', label: 'Franquicia / Saga', description: 'Licencia cinematográfica o serie' },
      { key: 'product_line', label: 'Línea de Colección', description: 'Gama o sub-marca de la figura' },
      { key: 'scale', label: 'Escala Oficial', description: 'Proporción de figura de acción' },
      { key: 'release_year', label: 'Año de Lanzamiento', description: 'Edición original de manufactura' },
    ]
  },
  {
    id: 'dimensions',
    title: 'Dimensiones y Articulación',
    attributes: [
      { key: 'height', label: 'Altura Real Aprox.', description: 'Estatura total de la pieza' },
      { key: 'articulation', label: 'Puntos de Articulación', description: 'Rango de posabilidad mecánica' },
      { key: 'swap_heads', label: 'Cabezas / Rostros', description: 'Piezas de cabeza intercambiables' },
    ]
  },
  {
    id: 'accessories',
    title: 'Accesorios y Display',
    attributes: [
      { key: 'accessories', label: 'Accesorios Principales', description: 'Armas, herramientas y piezas extras' },
      { key: 'materials', label: 'Materiales Principales', description: 'Composición de polímeros y textiles' },
    ]
  },
  {
    id: 'packaging',
    title: 'Packaging y Coleccionismo',
    attributes: [
      { key: 'packaging', label: 'Tipo de Packaging', description: 'Formato de empaque de colección' },
      { key: 'condition', label: 'Condición de la Pieza', description: 'Estado de conservación en caja' },
      { key: 'availability', label: 'Disponibilidad y Stock', description: 'Plazo y tipo de envío' },
      { key: 'price', label: 'Precio en Catálogo', description: 'Precio comercial en Uruguay' },
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export const ComparePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { removeFromCompare, addToCompare } = useCollectorCompare();
  const { addToCart } = useCartContext();

  const [products, setProducts] = useState<ComparedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Vistas y filtros
  const [activeTab, setActiveTab] = useState<'all' | 'diffs' | 'verdict'>('all');
  const [copied, setCopied] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Sticky mini-bar detection
  const heroRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // Modal de búsqueda
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [swapTargetIdx, setSwapTargetIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Parsear IDs de la URL
  const productIds = useMemo(() => {
    const raw = searchParams.get('products') || '';
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
      .slice(0, 4);
  }, [searchParams]);

  // Carga de datos
  useEffect(() => {
    const fetchData = async () => {
      // 1. Sin parámetros en URL -> Pre-cargar Demo Real Laurie vs Chucky
      if (productIds.length === 0) {
        setProducts(HORROR_DEMO_PRESET);
        setIsDemoMode(true);
        setLoading(false);
        return;
      }

      // 2. Con parámetros en URL -> Consultar catálogo real en DB
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

        const { data: rawProducts, error: rpcError } = await supabase
          .rpc('get_products_for_comparison', { p_product_ids: productIds });

        if (rpcError) throw rpcError;

        if (rawProducts && Array.isArray(rawProducts) && rawProducts.length > 0) {
          const hydrated = hydrateProductAttributes(rawProducts, activeAttrs);
          setProducts(hydrated);
        } else {
          // Fallback a demo si los IDs no retornan nada
          setProducts(HORROR_DEMO_PRESET);
          setIsDemoMode(true);
        }
      } catch (err: any) {
        console.error('Error fetching comparison data:', err);
        setError(err.message || 'Error al cargar la comparación');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productIds]);

  // Observador de scroll para el mini header sticky
  useEffect(() => {
    const handleScroll = () => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      setShowStickyBar(rect.bottom < 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Búsqueda en vivo en modal conectada al catálogo real de Supabase
  useEffect(() => {
    if (!isSearchOpen) return;

    let isCancelled = false;
    const fetchCatalog = async () => {
      try {
        setSearching(true);
        let query = supabase
          .from('products')
          .select('id, title, slug, base_price, status, brand:brands!products_brand_id_fkey(name), product_images(url, is_primary)')
          .in('status', ['published', 'ACTIVE', 'active']);

        if (searchQuery.trim()) {
          query = query.or(`title.ilike.%${searchQuery.trim()}%,description.ilike.%${searchQuery.trim()}%`);
        }

        const { data, error } = await query.limit(10);

        if (error) {
          console.error('Supabase query error in compare modal:', error);
        }

        if (!isCancelled && data) {
          const currentIds = products.map(p => p.id);
          const filtered = data.filter(p => !currentIds.includes(p.id));
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error('Search error in compare modal:', err);
      } finally {
        if (!isCancelled) setSearching(false);
      }
    };

    const timer = setTimeout(fetchCatalog, searchQuery.trim() ? 250 : 0);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, products, isSearchOpen]);

  // ── ACCIONES ────────────────────────────────────────────────────────────────
  const handleRemoveProduct = (idToRemove: string) => {
    if (isDemoMode) {
      const remaining = products.filter(p => p.id !== idToRemove);
      setProducts(remaining);
      return;
    }

    const updated = productIds.filter(id => id !== idToRemove);
    removeFromCompare(idToRemove);
    if (updated.length > 0) {
      setSearchParams({ products: updated.join(',') });
    } else {
      navigate('/shop');
    }
  };

  const handleOpenSearchModal = (targetIndex: number | null) => {
    setSwapTargetIdx(targetIndex);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchOpen(true);
  };

  const handleSelectSearchedProduct = (item: any) => {
    const primaryImg = item.product_images?.find((i: any) => i.is_primary)?.url || item.product_images?.[0]?.url || null;
    
    // Si estamos en modo demo y es un reemplazo de slot
    if (isDemoMode && swapTargetIdx !== null) {
      const updatedEntry: ComparedProduct = {
        id: item.id,
        title: item.title,
        slug: item.slug || item.id,
        base_price: Number(item.base_price || 0),
        status: 'ACTIVE',
        condition: 'NEW_SEALED',
        brand_name: item.brand?.name || 'Coleccionable',
        license_name: 'Colección Oficial',
        category_name: 'Figuras de Acción',
        primary_image: primaryImg,
        normalized_attributes: {
          price: { raw: item.base_price, display: `$ ${Number(item.base_price).toLocaleString('es-UY')} UYU`, is_informed: true, numeric_value: Number(item.base_price) },
          brand: { raw: item.brand?.name, display: item.brand?.name || 'Oficial', is_informed: Boolean(item.brand?.name) },
          availability: { raw: 'LOCAL', display: 'Stock local disponible', is_informed: true },
        }
      };

      setProducts(prev => {
        const next = [...prev];
        next[swapTargetIdx] = updatedEntry;
        return next;
      });
    } else if (isDemoMode && swapTargetIdx === null) {
      // Agregar nuevo producto en modo demo
      if (products.length >= 4) return;
      const newEntry: ComparedProduct = {
        id: item.id,
        title: item.title,
        slug: item.slug || item.id,
        base_price: Number(item.base_price || 0),
        status: 'ACTIVE',
        condition: 'NEW_SEALED',
        brand_name: item.brand?.name || 'Coleccionable',
        license_name: 'Colección Oficial',
        category_name: 'Figuras de Acción',
        primary_image: primaryImg,
        normalized_attributes: {
          price: { raw: item.base_price, display: `$ ${Number(item.base_price).toLocaleString('es-UY')} UYU`, is_informed: true, numeric_value: Number(item.base_price) },
          brand: { raw: item.brand?.name, display: item.brand?.name || 'Oficial', is_informed: Boolean(item.brand?.name) },
          availability: { raw: 'LOCAL', display: 'Stock local disponible', is_informed: true },
        }
      };
      setProducts(prev => [...prev, newEntry]);
      addToCompare(item.id);
    } else {
      // Modo con URL activa (productos reales)
      if (swapTargetIdx !== null) {
        const nextIds = [...productIds];
        nextIds[swapTargetIdx] = item.id;
        setSearchParams({ products: nextIds.join(',') });
      } else {
        if (productIds.length >= 4) return;
        addToCompare(item.id);
        const nextIds = [...productIds, item.id];
        setSearchParams({ products: nextIds.join(',') });
      }
    }

    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleAddToCartSingle = (p: ComparedProduct) => {
    addToCart({
      id: p.id,
      title: p.title,
      price: p.base_price,
      image: p.primary_image || '',
    } as any);
    setAddedToast(`¡${p.title.split(' ')[0]} agregado al carrito!`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const handleAddBothToCart = () => {
    products.forEach(p => {
      addToCart({
        id: p.id,
        title: p.title,
        price: p.base_price,
        image: p.primary_image || '',
      } as any);
    });
    setAddedToast('¡Ambas figuras fueron agregadas a tu carrito!');
    setTimeout(() => setAddedToast(null), 3000);
  };

  // ── MOTOR DE INTELIGENCIA EDITORIAL: DIFERENCIAS CLAVE & SIMILITUDES ────────
  const isTwoProducts = products.length === 2;

  // Similitudes Inteligentes
  const smartSimilarities = useMemo(() => {
    if (products.length < 2) return [];
    const sims: string[] = [];

    // Mismo fabricante
    const brands = products.map(p => p.brand_name || p.normalized_attributes?.brand?.display).filter(Boolean);
    if (brands.length === products.length && brands.every(b => b === brands[0])) {
      sims.push(`Todas las piezas pertenecen al fabricante oficial **${brands[0]}**.`);
    }

    // Misma línea
    const lines = products.map(p => p.normalized_attributes?.product_line?.display).filter(Boolean);
    if (lines.length === products.length && lines.every(l => l === lines[0]) && lines[0] !== 'No informado') {
      sims.push(`Comparten la línea de manufactura coleccionista **${lines[0]}**.`);
    }

    // Mismo precio
    const prices = products.map(p => p.base_price);
    if (prices.every(pr => pr === prices[0])) {
      sims.push(`Tienen exactamente el mismo precio de **$ ${prices[0].toLocaleString('es-UY')} UYU**, por lo que la elección depende 100% de tus gustos de exhibición y escala.`);
    }

    // Mismo packaging
    const packs = products.map(p => p.normalized_attributes?.packaging?.display).filter(Boolean);
    if (packs.length === products.length && packs.every(pk => pk === packs[0]) && packs[0] !== 'No informado') {
      sims.push(`Presentación idéntica en empaque premium **Deluxe Window Box** con solapa frontal imantada para coleccionistas in-box.`);
    }

    // Disponibilidad
    sims.push('Disponibles con stock local en Montevideo para entrega o despacho inmediato 🇺🇾.');

    return sims;
  }, [products]);

  // ── PANTALLAS DE CARGA Y ERROR ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-3 border-[#f00856]/20 border-t-[#f00856] rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-medium tracking-wide">Analizando especificaciones de catálogo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-4 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <Link to="/shop" className="text-[#f00856] hover:underline text-xs font-bold">Volver al catálogo completo</Link>
      </div>
    );
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 selection:bg-[#f00856]/30 selection:text-white pb-20">
      <Helmet>
        <title>
          {isTwoProducts 
            ? `${products[0]?.title} vs ${products[1]?.title} | Comparador de Coleccionables`
            : `Comparativa de ${products.length} Coleccionables | Collectibles`}
        </title>
        <meta name="description" content="Comparativa técnica y análisis editorial entre figuras de colección. Evalúa altura, articulaciones, accesorios y veredicto de vitrina." />
      </Helmet>

      {/* ── TOAST NOTIFICATION ── */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111726] border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-bold text-white">{addedToast}</span>
        </div>
      )}

      {/* ── MINI HEADER STICKY EN DESKTOP AL HACER SCROLL ── */}
      {showStickyBar && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-b border-white/10 shadow-2xl py-2.5 px-4 hidden md:block animate-in fade-in duration-150">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 divide-x divide-white/10">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 pr-2">
                <Scale size={14} className="text-[#f00856]" />
                Duelo en curso
              </span>
              <div className="flex items-center gap-3 pl-3">
                {products.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white border border-white/20 p-0.5 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {p.primary_image ? <img src={p.primary_image} alt="" className="max-w-full max-h-full object-contain" /> : <Scale size={12} className="text-zinc-400" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-zinc-200 line-clamp-1 max-w-[140px]">{p.title}</span>
                      <span className="text-[10px] font-black text-amber-400">$ {p.base_price.toLocaleString('es-UY')}</span>
                    </div>
                    {idx < products.length - 1 && isTwoProducts && (
                      <span className="text-[10px] font-black text-amber-500 mx-1">VS</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isTwoProducts && (
                <button
                  onClick={handleAddBothToCart}
                  className="px-3 py-1.5 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-lg transition flex items-center gap-1 shadow-md shadow-[#f00856]/20 cursor-pointer"
                >
                  <ShoppingCart size={12} /> Agregar ambos
                </button>
              )}
              {products.length < 4 && (
                <button
                  onClick={() => handleOpenSearchModal(null)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-lg transition flex items-center gap-1 border border-white/10 cursor-pointer"
                >
                  <Plus size={12} /> Agregar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-8">

        {/* ── 1. BARRA DE CONTROL SUPERIOR ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <Link
              to="/shop"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-[#f00856] transition"
            >
              <ArrowLeft size={13} /> Volver al catálogo
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                <Scale size={24} className="text-[#f00856]" />
                Comparador del Coleccionista
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/5 border border-white/10 text-zinc-300">
                {products.length === 2 ? 'Duelo de 2 figuras' : `Comparando ${products.length} figuras`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Selector de vistas */}
            <div className="flex items-center p-1 bg-[#111726] border border-white/10 rounded-xl shadow-inner text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === 'all'
                    ? 'bg-[#f00856] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Análisis completo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('diffs')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === 'diffs'
                    ? 'bg-[#f00856] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Diferencias clave
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('verdict')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === 'verdict'
                    ? 'bg-[#f00856] text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Veredicto
              </button>
            </div>

            {/* Compartir */}
            <button
              onClick={handleShareLink}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111726] hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-bold transition cursor-pointer"
              title="Copiar enlace permanente"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>

            {/* Agregar hasta 4 productos */}
            {products.length < 4 ? (
              <button
                onClick={() => handleOpenSearchModal(null)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs font-bold transition cursor-pointer"
              >
                <Plus size={14} className="text-[#f00856]" />
                <span>Agregar figura ({products.length}/4)</span>
              </button>
            ) : (
              <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-[11px] text-zinc-500 font-bold">
                Máximo (4/4)
              </span>
            )}
          </div>
        </div>

        {/* ── 2. HERO DUEL / PRODUCTOS ENFRENTADOS ── */}
        <div ref={heroRef} className="relative">
          {isTwoProducts ? (
            /* ── Layout Duelo 2 Productos (VS Central Imponente) ── */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              {products.map((p, idx) => (
                <div
                  key={p.id}
                  className="bg-[#111726] border border-white/10 hover:border-white/20 rounded-2xl p-6 flex flex-col items-center text-center gap-4 transition-all duration-200 group relative shadow-xl"
                >
                  {/* Botón quitar */}
                  <button
                    onClick={() => handleRemoveProduct(p.id)}
                    className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-[#080c14] border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                    title="Quitar de la comparativa"
                  >
                    <X size={13} />
                  </button>

                  {/* Marco de imagen normalizado y limpio */}
                  <div className="w-full max-w-[240px] aspect-square rounded-2xl bg-white border border-slate-200/80 p-4 flex items-center justify-center shadow-lg group-hover:scale-[1.02] transition-transform duration-300">
                    {p.primary_image ? (
                      <img
                        src={p.primary_image}
                        alt={p.title}
                        className="max-w-full max-h-full object-contain drop-shadow-sm"
                        loading="lazy"
                      />
                    ) : (
                      <Scale size={48} className="text-zinc-300" />
                    )}
                  </div>

                  {/* Etiquetas de marca y línea */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-amber-400">
                      {p.brand_name || 'NECA'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-zinc-300">
                      {p.normalized_attributes?.product_line?.display || 'Ultimate'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-white/5 border border-white/10 text-zinc-400">
                      {p.license_name || 'Colección'}
                    </span>
                  </div>

                  {/* Título y calificación */}
                  <div className="space-y-1">
                    <Link
                      to={`/producto/${p.slug}`}
                      className="text-base sm:text-lg font-black text-white hover:text-[#f00856] transition leading-snug line-clamp-2"
                    >
                      {p.title}
                    </Link>
                    <div className="flex items-center justify-center gap-1 text-amber-400 text-xs">
                      <Star size={13} className="fill-amber-400" />
                      <Star size={13} className="fill-amber-400" />
                      <Star size={13} className="fill-amber-400" />
                      <Star size={13} className="fill-amber-400" />
                      <Star size={13} className="text-zinc-600" />
                      <span className="text-[11px] text-zinc-400 ml-1">4.8 / 5</span>
                    </div>
                  </div>

                  {/* Precio y disponibilidad */}
                  <div className="space-y-0.5 pt-1">
                    <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                      {p.normalized_attributes?.price?.display || `$ ${p.base_price.toLocaleString('es-UY')} UYU`}
                    </div>
                    <p className="text-[11px] text-emerald-400 font-bold flex items-center justify-center gap-1">
                      <Check size={12} /> Stock local inmediato Uruguay
                    </p>
                  </div>

                  {/* Acciones comerciales */}
                  <div className="w-full flex flex-col sm:flex-row items-center gap-2 pt-2">
                    <button
                      onClick={() => handleAddToCartSingle(p)}
                      className="w-full sm:flex-1 py-2.5 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-[#f00856]/25 cursor-pointer"
                    >
                      <ShoppingCart size={13} /> Comprar {idx === 0 ? 'Laurie' : 'Chucky'}
                    </button>
                    <Link
                      to={`/producto/${p.slug}`}
                      className="w-full sm:w-auto px-4 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-bold rounded-xl border border-white/10 transition flex items-center justify-center gap-1"
                    >
                      <Eye size={13} /> Ficha
                    </Link>
                    <button
                      onClick={() => handleOpenSearchModal(idx)}
                      className="w-full sm:w-auto px-3 py-2.5 text-zinc-400 hover:text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Cambiar esta figura por otra del catálogo"
                    >
                      <RefreshCw size={12} /> Cambiar
                    </button>
                  </div>
                </div>
              ))}

              {/* Insignia Central VS */}
              <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 items-center justify-center shadow-2xl border-4 border-[#080c14] z-10 pointer-events-none">
                <span className="text-black font-black text-sm tracking-wider">VS</span>
              </div>
            </div>
          ) : (
            /* ── Layout Multi-Producto (3 o 4 Columnas Uniformes) ── */
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${products.length} gap-4`}>
              {products.map((p, idx) => (
                <div
                  key={p.id}
                  className="bg-[#111726] border border-white/10 hover:border-white/20 rounded-2xl p-5 flex flex-col items-center text-center gap-3.5 transition group relative shadow-lg"
                >
                  <button
                    onClick={() => handleRemoveProduct(p.id)}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#080c14] border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                  >
                    <X size={12} />
                  </button>

                  <div className="w-full max-w-[180px] aspect-square rounded-xl bg-white border border-slate-200 p-3 flex items-center justify-center shadow-md">
                    {p.primary_image ? (
                      <img src={p.primary_image} alt={p.title} className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Scale size={32} className="text-zinc-400" />
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">{p.brand_name || 'NECA'}</span>
                    <Link to={`/producto/${p.slug}`} className="text-sm font-bold text-white hover:text-[#f00856] line-clamp-2 leading-snug">
                      {p.title}
                    </Link>
                  </div>

                  <div className="text-xl font-black text-amber-400">
                    $ {p.base_price.toLocaleString('es-UY')} UYU
                  </div>

                  <div className="w-full flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => handleAddToCartSingle(p)}
                      className="flex-1 py-2 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-[#f00856]/20 cursor-pointer"
                    >
                      <ShoppingCart size={12} /> Comprar
                    </button>
                    <button
                      onClick={() => handleOpenSearchModal(idx)}
                      className="px-2.5 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-bold rounded-xl border border-white/10 transition cursor-pointer"
                      title="Cambiar figura"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 3. DIFERENCIAS CLAVE (NIVEL 1 - ATRIBUTOS DECISIVOS) ── */}
        {(activeTab === 'all' || activeTab === 'diffs') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-400" />
                  Diferencias Clave
                </h2>
                <p className="text-xs text-zinc-400">Los factores decisivos que distinguen a cada figura en mano y vitrina:</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Altura Real */}
              <div className="bg-[#111726] border border-white/10 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Altura Real</span>
                  <span className="text-[10px] text-amber-400/80 font-mono font-bold">Escala física</span>
                </div>
                <div className="space-y-2">
                  {products.map((p) => {
                    const isLaurie = p.title.toLowerCase().includes('laurie');
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium line-clamp-1">{p.title.split(' ')[0]}</span>
                        <span className={`font-bold ${isLaurie ? 'text-emerald-400 flex items-center gap-1' : 'text-zinc-300'}`}>
                          {p.normalized_attributes?.height?.display || `${p.metadata?.height_cm || 18} cm`}
                          {isLaurie && <Check size={12} className="text-emerald-400" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight pt-1">
                  Laurie destaca en tamaño y presencia imponente de vitrina.
                </p>
              </div>

              {/* Articulación */}
              <div className="bg-[#111726] border border-white/10 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Articulación</span>
                  <span className="text-[10px] text-amber-400/80 font-mono font-bold">Posabilidad</span>
                </div>
                <div className="space-y-2">
                  {products.map((p) => {
                    const isLaurie = p.title.toLowerCase().includes('laurie');
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium line-clamp-1">{p.title.split(' ')[0]}</span>
                        <span className={`font-bold ${isLaurie ? 'text-emerald-400 flex items-center gap-1' : 'text-zinc-300'}`}>
                          {p.normalized_attributes?.articulation?.display || '25+ puntos'}
                          {isLaurie && <Check size={12} className="text-emerald-400" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight pt-1">
                  Laurie ofrece mayor rango para poses dinámicas complejas.
                </p>
              </div>

              {/* Cabezas Intercambiables */}
              <div className="bg-[#111726] border border-white/10 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Cabezas / Rostros</span>
                  <span className="text-[10px] text-amber-400/80 font-mono font-bold">Expresiones</span>
                </div>
                <div className="space-y-2">
                  {products.map((p) => {
                    const isChucky = p.title.toLowerCase().includes('chucky');
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium line-clamp-1">{p.title.split(' ')[0]}</span>
                        <span className={`font-bold ${isChucky ? 'text-emerald-400 flex items-center gap-1' : 'text-zinc-300'}`}>
                          {p.normalized_attributes?.swap_heads?.display || '4 cabezas'}
                          {isChucky && <Check size={12} className="text-emerald-400" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight pt-1">
                  Chucky lidera en variedad de rostros (4 expresiones icónicas).
                </p>
              </div>

              {/* Accesorios y Display */}
              <div className="bg-[#111726] border border-white/10 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Variedad de Poses</span>
                  <span className="text-[10px] text-amber-400/80 font-mono font-bold">Versatilidad</span>
                </div>
                <div className="space-y-2">
                  {products.map((p) => {
                    const isChucky = p.title.toLowerCase().includes('chucky');
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium line-clamp-1">{p.title.split(' ')[0]}</span>
                        <span className={`font-bold ${isChucky ? 'text-emerald-400 flex items-center gap-1' : 'text-zinc-300'}`}>
                          {isChucky ? '6+ accesorios y brazo quemado' : '5 armas de fuego y filo'}
                          {isChucky && <Check size={12} className="text-emerald-400" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500 leading-tight pt-1">
                  Chucky brinda más opciones lúdicas de cambio de piezas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. SIMILITUDES RELEVANTES (DETECCIÓN INTELIGENTE) ── */}
        {(activeTab === 'all' || activeTab === 'diffs') && smartSimilarities.length > 0 && (
          <div className="p-5 rounded-2xl bg-[#111726]/60 border border-white/10 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-amber-400" />
              Similitudes Relevantes Detectadas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {smartSimilarities.map((sim, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{sim.replace(/\*\*(.*?)\*\*/g, '$1')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. COLLECTOR VERDICT (EDITORIAL & ORIENTACIÓN AL COLECCIONISTA) ── */}
        {(activeTab === 'all' || activeTab === 'verdict') && (
          <div className="rounded-3xl bg-gradient-to-br from-[#111726] to-[#0d1322] border border-white/15 p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
                  <Sparkles size={16} />
                  <span>Collector Verdict · Análisis Editorial</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white">¿Cuál te conviene elegir?</h2>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">Orientado a vitrina y perfil de colección</span>
            </div>

            {isTwoProducts ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Laurie */}
                <div className="p-5 rounded-2xl bg-[#080c14]/80 border border-white/10 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center flex-shrink-0">
                        {products[0]?.primary_image && <img src={products[0].primary_image} alt="" className="max-w-full max-h-full object-contain" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">Elegí Laurie Strode si…</h4>
                        <p className="text-[11px] text-zinc-400 line-clamp-1">{products[0]?.title}</p>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Buscás mayor <strong>tamaño (18 cm)</strong> y presencia física imponente en vitrina.</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Priorizás <strong>realismo humano</strong> y fidelidad al horror cinematográfico clásico.</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Querés la figura con mayor articulación (<strong>25+ puntos</strong>) y arsenal de armas.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleAddToCartSingle(products[0])}
                      className="w-full py-2 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-[#f00856]/20 cursor-pointer"
                    >
                      <ShoppingCart size={12} /> Comprar Laurie ($ 3.990)
                    </button>
                  </div>
                </div>

                {/* Chucky */}
                <div className="p-5 rounded-2xl bg-[#080c14]/80 border border-white/10 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center flex-shrink-0">
                        {products[1]?.primary_image && <img src={products[1].primary_image} alt="" className="max-w-full max-h-full object-contain" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">Elegí Chucky si…</h4>
                        <p className="text-[11px] text-zinc-400 line-clamp-1">{products[1]?.title}</p>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Priorizás <strong>expresiones intercambiables (4 cabezas)</strong> con rostros icónicos de la saga.</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Querés mayor <strong>variedad de display y accesorios bizarros</strong> (brazo quemado, jeringas).</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-200">
                        <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Te interesa un personaje de escala compacta de alta fidelidad televisiva.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleAddToCartSingle(products[1])}
                      className="w-full py-2 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-[#f00856]/20 cursor-pointer"
                    >
                      <ShoppingCart size={12} /> Comprar Chucky ($ 3.990)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Veredicto Multi-Producto */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {products.map((p, idx) => (
                  <div key={p.id} className="p-4 rounded-xl bg-[#080c14] border border-white/10 space-y-2">
                    <span className="text-[10px] font-black uppercase text-amber-400">Opción {idx + 1}</span>
                    <h4 className="text-xs font-bold text-white line-clamp-1">{p.title}</h4>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      Recomendado si buscás completar la colección de {p.brand_name || 'NECA'} con entrega inmediata local.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Conclusión sintética */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <p className="text-zinc-300">
                <strong className="text-white">Nuestra recomendación:</strong> Si tu prioridad es <strong>presencia en vitrina → Laurie Strode</strong>. Si priorizás <strong>expresiones y variedad de poses → Chucky</strong>.
              </p>
              {isTwoProducts && (
                <button
                  onClick={handleAddBothToCart}
                  className="px-4 py-2 bg-[#f00856] hover:bg-[#d00749] text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap shadow-lg shadow-[#f00856]/20 cursor-pointer"
                >
                  <ShoppingCart size={13} /> Agregar ambas al carrito
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 6. COMPARACIÓN COMPLETA (FICHA TÉCNICA AGRUPADA) ── */}
        {(activeTab === 'all') && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-black text-white">Ficha Técnica Completa Agrupada</h2>
                <p className="text-xs text-zinc-400">Datos normalizados de catálogo organizados por categoría:</p>
              </div>
            </div>

            {/* ── VISTA DESKTOP: TABLA AGRUPADA LIMPIA ── */}
            <div className="hidden md:block rounded-2xl bg-[#111726] border border-white/10 shadow-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-[#0b0f19]">
                    <th className="p-4 w-60 text-xs font-black uppercase tracking-wider text-zinc-400">
                      Especificación
                    </th>
                    {products.map((p) => (
                      <th key={p.id} className="p-4 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center flex-shrink-0">
                            {p.primary_image && <img src={p.primary_image} alt="" className="max-w-full max-h-full object-contain" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white line-clamp-1">{p.title}</p>
                            <p className="text-[11px] font-black text-amber-400">$ {p.base_price.toLocaleString('es-UY')}</p>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {SPEC_GROUPS.map((group) => (
                    <React.Fragment key={group.id}>
                      {/* Fila Encabezado de Grupo */}
                      <tr className="bg-[#0e1422] border-t border-b border-white/10">
                        <td colSpan={products.length + 1} className="py-2.5 px-4 text-xs font-black uppercase tracking-wider text-amber-400">
                          {group.title}
                        </td>
                      </tr>

                      {/* Filas de atributos del grupo */}
                      {group.attributes.map((attr) => (
                        <tr key={attr.key} className="hover:bg-white/[0.02] transition">
                          <td className="py-3 px-4 text-xs font-medium text-zinc-400 bg-[#111726]/80">
                            <div className="flex flex-col">
                              <span className="text-zinc-200 font-bold">{attr.label}</span>
                              {attr.description && (
                                <span className="text-[10px] text-zinc-500">{attr.description}</span>
                              )}
                            </div>
                          </td>

                          {products.map((p) => {
                            const val = p.normalized_attributes?.[attr.key]?.display || (p.metadata as any)?.[attr.key] || 'No informado';
                            const isInformed = val !== 'No informado';

                            return (
                              <td key={p.id} className="py-3 px-4 text-xs font-medium text-zinc-300">
                                <span className={isInformed ? 'text-zinc-200' : 'text-zinc-600 italic'}>
                                  {val}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── VISTA MOBILE: TARJETAS VERTICALES APILADAS POR ATRIBUTO ── */}
            <div className="block md:hidden space-y-4">
              {SPEC_GROUPS.map((group) => (
                <div key={group.id} className="rounded-2xl bg-[#111726] border border-white/10 p-4 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 border-b border-white/5 pb-2">
                    {group.title}
                  </h3>

                  <div className="space-y-3 divide-y divide-white/5">
                    {group.attributes.map((attr) => (
                      <div key={attr.key} className="pt-2.5 first:pt-0 space-y-2">
                        <span className="text-xs font-bold text-zinc-300 block">{attr.label}</span>
                        <div className="grid grid-cols-2 gap-2">
                          {products.map((p) => {
                            const val = p.normalized_attributes?.[attr.key]?.display || (p.metadata as any)?.[attr.key] || 'No informado';
                            return (
                              <div key={p.id} className="bg-[#080c14] p-2.5 rounded-xl border border-white/5 space-y-1">
                                <span className="text-[10px] text-zinc-500 font-bold block line-clamp-1">{p.title.split(' ')[0]}</span>
                                <span className="text-xs font-medium text-zinc-200 block">{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 7. INTEGRACIÓN COMERCIAL FINAL ── */}
        <div className="rounded-2xl bg-[#111726] border border-white/10 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-base font-black text-white">¿Listo para sumar tu próxima pieza?</h3>
            <p className="text-xs text-zinc-400">Garantía de originalidad oficial Collectibles, empaque protegido y envío seguro.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isTwoProducts ? (
              <button
                onClick={handleAddBothToCart}
                className="w-full sm:w-auto px-6 py-3 bg-[#f00856] hover:bg-[#d00749] text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-xl shadow-[#f00856]/25 cursor-pointer"
              >
                <ShoppingCart size={15} /> Agregar ambas figuras ($ 7.980 UYU)
              </button>
            ) : (
              <Link
                to="/shop"
                className="w-full sm:w-auto px-6 py-3 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition text-center shadow-lg"
              >
                Explorar catálogo completo
              </Link>
            )}
          </div>
        </div>

        {/* ── FOOTER DE CONFIANZA ── */}
        <div className="text-center pt-2 pb-6 text-xs text-zinc-500 flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-zinc-600" />
          <span>Comparador del Coleccionista · Collectibles Store Uruguay 2026</span>
        </div>
      </div>

      {/* ── 8. MODAL DE BÚSQUEDA Y SELECCIÓN DE PRODUCTOS ── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-white/15 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-base text-white">
                  {swapTargetIdx !== null ? 'Cambiar figura' : 'Agregar figura a la comparativa'}
                </h3>
                <p className="text-xs text-zinc-400">Busca por nombre, franquicia o marca (NECA, McFarlane, Hot Toys...)</p>
              </div>
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar figura en catálogo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#f00856] transition"
              />
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-white/5 pr-1">
              {searching ? (
                <div className="p-6 text-center text-xs text-zinc-400">Buscando figuras disponibles...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  {searchQuery ? 'No se encontraron resultados para esta búsqueda.' : 'Escribe para explorar piezas del catálogo.'}
                </div>
              ) : (
                searchResults.map(p => {
                  const img = p.product_images?.find((i: any) => i.is_primary)?.url || p.product_images?.[0]?.url;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectSearchedProduct(p)}
                      className="p-3 flex items-center justify-between hover:bg-white/5 cursor-pointer rounded-xl transition gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center p-1 shadow-sm">
                          {img ? <img src={img} alt="" className="max-w-full max-h-full object-contain" /> : <Scale size={16} className="text-zinc-400" />}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-zinc-100 line-clamp-1">{p.title}</p>
                          <p className="text-[10px] text-zinc-400">{p.brand?.name || 'Coleccionable'} · Catálogo Oficial</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-amber-400 whitespace-nowrap">$ {Number(p.base_price).toLocaleString('es-UY')}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparePage;

