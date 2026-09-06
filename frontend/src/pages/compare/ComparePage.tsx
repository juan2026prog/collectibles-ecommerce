import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import { 
  Scale, Shield, Share2, Check, X, Sparkles, 
  ArrowLeft, Plus, Search, ShoppingCart, RefreshCw, Star,
  Eye, CheckCircle2, ChevronDown, ChevronUp, SlidersHorizontal, ArrowRight
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
      scale:        { raw: '1:10',       display: '1:10 (7 pulg. / ~18 cm)',                          is_informed: true },
      height:       { raw: 18,           display: '18 cm (7.1 pulg.)',                                is_informed: true, numeric_value: 18 },
      articulation: { raw: 25,           display: '25+ puntos',                                       is_informed: true, numeric_value: 25 },
      swap_heads:   { raw: 2,            display: '2 cabezas (expresiones)',                          is_informed: true, numeric_value: 2 },
      accessories:  { raw: 5,            display: '5 armas (rifle, escopeta, revólver, cuchillo)',    is_informed: true, numeric_value: 5 },
      materials:    { raw: 'PVC/ABS',    display: 'PVC & ABS esculpido premium',                      is_informed: true },
      packaging:    { raw: 'window_box', display: 'Deluxe Window Box con solapa imantada',           is_informed: true },
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
      license:      { raw: 'Chucky',     display: 'Chucky (TV Series)',                               is_informed: true },
      product_line: { raw: 'Ultimate',   display: 'Ultimate',                                         is_informed: true },
      scale:        { raw: '1:10',       display: '1:10 escala (~10 cm)',                             is_informed: true },
      height:       { raw: 10,           display: '10 cm (4.0 pulg.)',                                is_informed: true, numeric_value: 10 },
      articulation: { raw: 15,           display: '15+ puntos',                                       is_informed: true, numeric_value: 15 },
      swap_heads:   { raw: 4,            display: '4 cabezas intercambiables',                        is_informed: true, numeric_value: 4 },
      accessories:  { raw: 6,            display: '6 piezas (cuchillo, jeringas, brazo quemado)',     is_informed: true, numeric_value: 6 },
      materials:    { raw: 'PVC/ABS',    display: 'PVC & ABS esculpido UV',                           is_informed: true },
      packaging:    { raw: 'window_box', display: 'Deluxe Window Box con solapa imantada',           is_informed: true },
      release_year: { raw: 2023,         display: '2023',                                             is_informed: true, numeric_value: 2023 },
      condition:    { raw: 'NEW',        display: 'Nuevo · Sellado de fábrica',                       is_informed: true },
      availability: { raw: 'LOCAL',      display: 'En stock local · Entrega inmediata 🇺🇾',           is_informed: true },
    },
  },
];

// ── SECCIONES DE LA TABLA MATRICIAL ───────────────────────────────────────────
interface MatrixSection {
  id: string;
  title: string;
  rows: {
    key: string;
    label: string;
    shortLabel?: string;
  }[];
}

const MATRIX_SECTIONS: MatrixSection[] = [
  {
    id: 'dimensions',
    title: 'Dimensiones & Físico',
    rows: [
      { key: 'height', label: 'Altura Real', shortLabel: 'Altura' },
      { key: 'scale', label: 'Escala Oficial', shortLabel: 'Escala' },
      { key: 'articulation', label: 'Puntos de Articulación', shortLabel: 'Articulación' },
    ]
  },
  {
    id: 'accessories',
    title: 'Accesorios & Contenido',
    rows: [
      { key: 'swap_heads', label: 'Cabezas / Rostros Extra', shortLabel: 'Rostros' },
      { key: 'accessories', label: 'Arsenal / Accesorios', shortLabel: 'Accesorios' },
      { key: 'materials', label: 'Materiales Principales', shortLabel: 'Material' },
    ]
  },
  {
    id: 'collector',
    title: 'Detalles de Colección',
    rows: [
      { key: 'brand', label: 'Fabricante', shortLabel: 'Marca' },
      { key: 'license', label: 'Franquicia / Saga', shortLabel: 'Saga' },
      { key: 'product_line', label: 'Línea de Figura', shortLabel: 'Línea' },
      { key: 'release_year', label: 'Año de Fabricación', shortLabel: 'Año' },
      { key: 'packaging', label: 'Packaging', shortLabel: 'Caja' },
    ]
  },
  {
    id: 'commercial',
    title: 'Compra & Disponibilidad',
    rows: [
      { key: 'condition', label: 'Condición', shortLabel: 'Estado' },
      { key: 'availability', label: 'Disponibilidad', shortLabel: 'Stock' },
      { key: 'price', label: 'Precio', shortLabel: 'Precio' },
    ]
  }
];

export const ComparePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { removeFromCompare, addToCompare } = useCollectorCompare();
  const { addToCart } = useCartContext();

  const [products, setProducts] = useState<ComparedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Filtros interactivos
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Sticky tracking
  const tableRef = useRef<HTMLDivElement>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

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
      if (productIds.length === 0) {
        setProducts(HORROR_DEMO_PRESET);
        setIsDemoMode(true);
        setLoading(false);
        return;
      }

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

  // Scroll listener para Header Sticky
  useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current) return;
      const rect = tableRef.current.getBoundingClientRect();
      setShowStickyHeader(rect.top < 80 && rect.bottom > 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Búsqueda en modal
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

        if (error) console.error('Supabase error in modal:', error);

        if (!isCancelled && data) {
          const currentIds = products.map(p => p.id);
          const filtered = data.filter(p => !currentIds.includes(p.id));
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error('Search error in modal:', err);
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

  // Manejadores
  const handleRemoveProduct = (idToRemove: string) => {
    if (isDemoMode) {
      const remaining = products.filter(p => p.id !== idToRemove);
      if (remaining.length === 0) navigate('/shop');
      else setProducts(remaining);
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
    setTimeout(() => setCopied(false), 2000);
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
    setAddedToast('¡Figuras agregadas a tu carrito!');
    setTimeout(() => setAddedToast(null), 3000);
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Helper para verificar si una fila tiene diferencias entre productos
  const isRowDifferent = (attrKey: string) => {
    if (products.length <= 1) return false;
    const firstVal = (products[0].normalized_attributes?.[attrKey]?.display || (products[0].metadata as any)?.[attrKey] || '').toLowerCase().trim();
    for (let i = 1; i < products.length; i++) {
      const currentVal = (products[i].normalized_attributes?.[attrKey]?.display || (products[i].metadata as any)?.[attrKey] || '').toLowerCase().trim();
      if (currentVal !== firstVal) return true;
    }
    return false;
  };

  // Precio total del conjunto
  const totalPrice = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.base_price || 0), 0);
  }, [products]);

  const isTwo = products.length === 2;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-[#f00856]/20 border-t-[#f00856] rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-xs font-semibold tracking-wide">Construyendo tabla comparativa...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-4 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <Link to="/shop" className="text-[#f00856] hover:underline text-xs font-bold">Volver al catálogo</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 selection:bg-[#f00856]/30 selection:text-white pb-24">
      <Helmet>
        <title>
          {isTwo 
            ? `${products[0]?.title} vs ${products[1]?.title} | Comparador Oficial`
            : `Comparativa de ${products.length} figuras | Collectibles`}
        </title>
        <meta name="description" content="Tabla comparativa técnica y directa entre figuras de colección. Especificaciones, medidas y accesorios cara a cara." />
      </Helmet>

      {/* ── TOAST NOTIFICATION ── */}
      {addedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111726] border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-bold text-white">{addedToast}</span>
        </div>
      )}

      {/* ── STICKY HEADER FLOTANTE AL HACER SCROLL ── */}
      {showStickyHeader && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-b border-white/10 shadow-2xl py-2 px-4 animate-in fade-in duration-150">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
              <Scale size={14} className="text-[#f00856]" />
              <span className="hidden sm:inline">Comparador</span>
            </div>

            <div className="flex items-center gap-4 divide-x divide-white/10 overflow-x-auto py-1">
              {products.map((p, idx) => (
                <div key={p.id} className={`flex items-center gap-2.5 ${idx > 0 ? 'pl-4' : ''}`}>
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-0.5 flex-shrink-0 flex items-center justify-center">
                    {p.primary_image ? (
                      <img src={p.primary_image} alt="" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <Scale size={12} className="text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[160px]">{p.title}</p>
                    <p className="text-[11px] font-black text-amber-400">$ {p.base_price.toLocaleString('es-UY')}</p>
                  </div>
                  <button
                    onClick={() => handleAddToCartSingle(p)}
                    className="p-1.5 rounded-lg bg-[#f00856] hover:bg-[#d00749] text-white transition flex-shrink-0 cursor-pointer"
                    title={`Comprar ${p.title}`}
                  >
                    <ShoppingCart size={13} />
                  </button>
                </div>
              ))}
            </div>

            {isTwo && (
              <button
                onClick={handleAddBothToCart}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg border border-white/10 transition cursor-pointer flex-shrink-0"
              >
                <span>Llevar ambos</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CONTENEDOR PRINCIPAL ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* ── BARRA SUPERIOR DE NAVEGACIÓN Y CONTROLES ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
          <div className="space-y-1">
            <Link
              to="/shop"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-[#f00856] transition"
            >
              <ArrowLeft size={13} /> Volver al catálogo
            </Link>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <Scale size={22} className="text-[#f00856]" />
                Tabla Comparativa
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/5 border border-white/10 text-zinc-300">
                {products.length} {products.length === 1 ? 'figura' : 'figuras'}
              </span>
            </div>
          </div>

          {/* Barra de herramientas */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Switch Diferencias */}
            <button
              onClick={() => setOnlyDiffs(prev => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                onlyDiffs 
                  ? 'bg-amber-400/10 border-amber-400/50 text-amber-300' 
                  : 'bg-[#111726] border-white/10 text-zinc-400 hover:text-white'
              }`}
              title="Ocultar especificaciones idénticas"
            >
              <SlidersHorizontal size={13} className={onlyDiffs ? 'text-amber-400' : 'text-zinc-400'} />
              <span>Solo diferencias</span>
              {onlyDiffs && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
            </button>

            {/* Compartir */}
            <button
              onClick={handleShareLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111726] hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-bold transition cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
              <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>

            {/* Agregar figura */}
            {products.length < 4 && (
              <button
                onClick={() => handleOpenSearchModal(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#f00856] hover:bg-[#d00749] text-white text-xs font-bold transition cursor-pointer shadow-md shadow-[#f00856]/20"
              >
                <Plus size={13} />
                <span>Agregar</span>
              </button>
            )}
          </div>
        </div>

        {/* ── TABLA MATRICIAL UNIFICADA (DESKTOP & TABLET) ── */}
        <div ref={tableRef} className="rounded-2xl bg-[#111726] border border-white/10 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left table-fixed">
              {/* Encabezados de Columnas con Productos */}
              <thead>
                <tr className="bg-[#0b0f19] border-b border-white/10">
                  {/* Columna de etiquetas fija */}
                  <th className="w-48 sm:w-56 p-4 align-top bg-[#0b0f19] border-r border-white/5">
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                        Especificación
                      </span>
                      <p className="text-[11px] text-zinc-500 font-normal">
                        Parámetros directos de fábrica
                      </p>
                    </div>
                  </th>

                  {/* Columnas de Productos */}
                  {products.map((p, idx) => (
                    <th key={p.id} className="p-4 align-top min-w-[200px] border-r border-white/5 last:border-r-0">
                      <div className="flex flex-col items-center text-center gap-2.5 relative">
                        {/* Botón quitar */}
                        <button
                          onClick={() => handleRemoveProduct(p.id)}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#080c14] border border-white/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                          title="Quitar"
                        >
                          <X size={12} />
                        </button>

                        {/* Imagen de Producto */}
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center shadow-md">
                          {p.primary_image ? (
                            <img src={p.primary_image} alt={p.title} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <Scale size={28} className="text-zinc-400" />
                          )}
                        </div>

                        {/* Título y Marca */}
                        <div className="space-y-0.5 w-full">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                            {p.brand_name || 'NECA'}
                          </span>
                          <Link 
                            to={`/producto/${p.slug}`} 
                            className="text-xs sm:text-sm font-bold text-white hover:text-[#f00856] line-clamp-2 transition leading-tight block"
                          >
                            {p.title}
                          </Link>
                        </div>

                        {/* Precio */}
                        <div className="text-base sm:text-lg font-black text-amber-400 tracking-tight">
                          $ {p.base_price.toLocaleString('es-UY')} UYU
                        </div>

                        {/* Botones de acción */}
                        <div className="w-full flex items-center gap-1.5 pt-1">
                          <button
                            onClick={() => handleAddToCartSingle(p)}
                            className="flex-1 py-2 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-[#f00856]/20 cursor-pointer"
                          >
                            <ShoppingCart size={12} /> Comprar
                          </button>
                          <button
                            onClick={() => handleOpenSearchModal(idx)}
                            className="p-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl border border-white/10 transition cursor-pointer"
                            title="Cambiar figura"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Cuerpo de la Tabla por Secciones */}
              <tbody className="divide-y divide-white/5">
                {MATRIX_SECTIONS.map((section) => {
                  const visibleRows = onlyDiffs 
                    ? section.rows.filter(r => isRowDifferent(r.key))
                    : section.rows;

                  if (visibleRows.length === 0) return null;

                  const isCollapsed = collapsedSections[section.id];

                  return (
                    <React.Fragment key={section.id}>
                      {/* Cabecera de Categoría Colapsable */}
                      <tr 
                        onClick={() => toggleSection(section.id)}
                        className="bg-[#0e1422] hover:bg-[#131b2e] cursor-pointer transition select-none"
                      >
                        <td 
                          colSpan={products.length + 1} 
                          className="py-2.5 px-4 text-xs font-black uppercase tracking-wider text-amber-400/90"
                        >
                          <div className="flex items-center justify-between">
                            <span>{section.title}</span>
                            <ChevronDown 
                              size={14} 
                              className={`text-zinc-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                            />
                          </div>
                        </td>
                      </tr>

                      {/* Filas de Atributos */}
                      {!isCollapsed && visibleRows.map((row) => {
                        const isDiff = isRowDifferent(row.key);

                        return (
                          <tr key={row.key} className="hover:bg-white/[0.02] transition">
                            {/* Etiqueta de la Fila */}
                            <td className="py-3 px-4 text-xs font-bold text-zinc-300 bg-[#111726]/90 border-r border-white/5">
                              <div className="flex items-center gap-1.5">
                                <span>{row.label}</span>
                                {isDiff && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Valor diferente"></span>
                                )}
                              </div>
                            </td>

                            {/* Valores de los Productos */}
                            {products.map((p) => {
                              const val = p.normalized_attributes?.[row.key]?.display || (p.metadata as any)?.[row.key] || 'No informado';
                              const isInformed = val !== 'No informado';

                              return (
                                <td 
                                  key={p.id} 
                                  className="py-3 px-4 text-xs text-center border-r border-white/5 last:border-r-0"
                                >
                                  <span className={isInformed ? 'font-medium text-zinc-200' : 'text-zinc-600 italic'}>
                                    {val}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── VEREDICTO RÁPIDO & CONCLUSIÓN SINTÉTICA ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#111726] to-[#0d1322] border border-white/10 p-5 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              <h2 className="text-sm sm:text-base font-black text-white">Veredicto Rápido de Elección</h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">¿Cuál se adapta mejor a tu vitrina?</span>
          </div>

          {/* Tarjetas de Decisión Clave (2 columnas) */}
          {isTwo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Producto 1 */}
              <div className="p-4 rounded-xl bg-[#080c14] border border-white/5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white p-0.5 border border-slate-200 flex-shrink-0 flex items-center justify-center">
                    {products[0]?.primary_image && <img src={products[0].primary_image} alt="" className="max-w-full max-h-full object-contain" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-400">Elegí {products[0]?.title.split(' ')[0]} si:</span>
                    <p className="text-xs font-bold text-zinc-200 truncate">{products[0]?.title}</p>
                  </div>
                </div>
                <ul className="text-xs text-zinc-300 space-y-1.5 pl-1">
                  <li className="flex items-start gap-1.5">
                    <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Mayor <strong>altura y presencia física (18 cm)</strong> en repisa.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Máximo rango de <strong>articulación (25+ puntos)</strong> para poses complejas.</span>
                  </li>
                </ul>
              </div>

              {/* Producto 2 */}
              <div className="p-4 rounded-xl bg-[#080c14] border border-white/5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white p-0.5 border border-slate-200 flex-shrink-0 flex items-center justify-center">
                    {products[1]?.primary_image && <img src={products[1].primary_image} alt="" className="max-w-full max-h-full object-contain" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-400">Elegí {products[1]?.title.split(' ')[0]} si:</span>
                    <p className="text-xs font-bold text-zinc-200 truncate">{products[1]?.title}</p>
                  </div>
                </div>
                <ul className="text-xs text-zinc-300 space-y-1.5 pl-1">
                  <li className="flex items-start gap-1.5">
                    <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Mayor variedad de <strong>rostros intercambiables (4 expresiones)</strong>.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Más <strong>accesorios de exhibición</strong> y escala compacta.</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {products.map(p => (
                <div key={p.id} className="p-3 rounded-xl bg-[#080c14] border border-white/5 space-y-1">
                  <span className="text-[10px] font-black uppercase text-amber-400">{p.brand_name}</span>
                  <p className="text-xs font-bold text-white line-clamp-1">{p.title}</p>
                  <p className="text-[11px] text-zinc-400">$ {p.base_price.toLocaleString('es-UY')} UYU</p>
                </div>
              ))}
            </div>
          )}

          {/* Barra de Cierre / Combo */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-300 text-center sm:text-left">
              <span className="text-white font-bold">Garantía Collectibles:</span> Todas las piezas son 100% originales, nuevas en caja sellada con stock local.
            </div>
            {isTwo && (
              <button
                onClick={handleAddBothToCart}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#f00856] hover:bg-[#d00749] text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-[#f00856]/25 cursor-pointer whitespace-nowrap"
              >
                <ShoppingCart size={13} />
                <span>Agregar ambas figuras (${totalPrice.toLocaleString('es-UY')} UYU)</span>
              </button>
            )}
          </div>
        </div>

        {/* ── FOOTER DE CONFIANZA ── */}
        <div className="text-center pt-2 text-xs text-zinc-500 flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-zinc-600" />
          <span>Comparador del Coleccionista · Collectibles Store Uruguay</span>
        </div>
      </div>

      {/* ── MODAL DE BÚSQUEDA Y SELECCIÓN DE PRODUCTOS ── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-white/15 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-base text-white">
                  {swapTargetIdx !== null ? 'Cambiar figura' : 'Agregar figura a la comparativa'}
                </h3>
                <p className="text-xs text-zinc-400">Busca por nombre, franquicia o fabricante</p>
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
                className="w-full bg-[#080c14] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#f00856] transition"
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
                        <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center p-1 shadow-sm">
                          {img ? <img src={img} alt="" className="max-w-full max-h-full object-contain" /> : <Scale size={15} className="text-zinc-400" />}
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

