import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import { 
  Scale, Shield, Share2, Check, X, Sparkles, AlertCircle, 
  ArrowLeft, Plus, Search, ShoppingCart, ExternalLink, Filter
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

  // Search modal state for adding new product
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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

  useEffect(() => {
    const fetchComparisonData = async () => {
      if (productIds.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 1. Fetch attributes config from DB if available
        const { data: dbAttrs } = await supabase
          .from('compare_attributes')
          .select('*')
          .eq('is_visible', true)
          .order('sort_order', { ascending: true });

        const activeAttrs = (dbAttrs && dbAttrs.length > 0) ? dbAttrs : DEFAULT_ATTRIBUTES;
        setAttributes(activeAttrs);

        // 2. Fetch products via secure RPC (which strictly strips internal supplier costs)
        const { data: rawProducts, error: rpcError } = await supabase
          .rpc('get_products_for_comparison', { p_product_ids: productIds });

        if (rpcError) throw rpcError;

        if (rawProducts && Array.isArray(rawProducts)) {
          const hydrated = hydrateProductAttributes(rawProducts, activeAttrs);
          setProducts(hydrated);
        } else {
          setProducts([]);
        }
      } catch (err: any) {
        console.error('Error fetching comparison data:', err);
        setError(err.message || 'Error al cargar la comparación');
      } finally {
        setLoading(false);
      }
    };

    fetchComparisonData();
  }, [productIds]);

  // Verdict & Compatibility
  const verdict: CollectorVerdict = useMemo(() => {
    return generateCollectorVerdict(products);
  }, [products]);

  const compatibility: CompatibilityResult = useMemo(() => {
    return evaluateCollectorCompatibility(products);
  }, [products]);

  // Filter attributes if showDifferencesOnly is active
  const visibleAttributes = useMemo(() => {
    if (!showDifferencesOnly) return attributes;

    return attributes.filter(attr => {
      if (products.length <= 1) return true;
      const values = products.map(p => p.normalized_attributes?.[attr.attribute_key]?.display || 'No informado');
      // If all values are identical, hide the row
      const first = values[0];
      return !values.every(v => v === first);
    });
  }, [attributes, products, showDifferencesOnly]);

  const handleRemove = (idToRemove: string) => {
    const updated = productIds.filter(id => id !== idToRemove);
    removeFromCompare(idToRemove);
    if (updated.length > 0) {
      setSearchParams({ products: updated.join(',') });
    } else {
      navigate('/shop');
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Search for new product to add
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const { data } = await supabase
          .from('products')
          .select('id, title, base_price, product_images(url, is_primary)')
          .ilike('title', `%${searchQuery.trim()}%`)
          .limit(6);

        if (data) {
          const filtered = data.filter(p => !productIds.includes(p.id));
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, productIds]);

  const handleSelectProduct = (newId: string) => {
    if (productIds.length >= 4) return;
    addToCompare(newId);
    const nextIds = [...productIds, newId];
    setSearchParams({ products: nextIds.join(',') });
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-medium">Analizando especificaciones de catálogo...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-6 text-center">
        <Helmet>
          <title>Comparador del Coleccionista | Collectibles</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
          <Scale size={32} />
        </div>
        <h1 className="text-2xl font-black mb-2">No hay piezas seleccionadas</h1>
        <p className="text-zinc-400 max-w-md mb-6 text-sm">
          Agrega hasta 4 figuras o coleccionables desde la tienda para comparar escala, altura, precio y detalles de conservación.
        </p>
        <Link
          to="/shop"
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition"
        >
          Explorar catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white py-8 px-3 sm:px-6 lg:px-8">
      <Helmet>
        <title>Comparativa de Coleccionables ({products.length} piezas) | Collectibles</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              to="/shop"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-amber-400 mb-2 transition"
            >
              <ArrowLeft size={14} /> Volver a la tienda
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
                <Scale size={28} className="text-amber-500" />
                Comparador del Coleccionista
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {products.length} de 4
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDifferencesOnly(!showDifferencesOnly)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border ${
                showDifferencesOnly
                  ? 'bg-amber-500 text-black border-amber-500'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}
            >
              <Filter size={14} />
              <span>{showDifferencesOnly ? 'Solo Diferencias' : 'Ver Todas'}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-bold transition"
              title="Copiar enlace permanente"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>

            {products.length < 4 && (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition"
              >
                <Plus size={14} />
                <span>Agregar ({4 - products.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* AI Collector Verdict & Factual Findings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-amber-500/30 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles size={16} />
              Veredicto Factual del Coleccionista
            </div>
            <p className="text-sm font-medium text-zinc-200 leading-relaxed mb-3">
              {verdict.summary}
            </p>
            {verdict.key_findings.length > 0 && (
              <div className="space-y-1.5">
                {verdict.key_findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compatibility Card */}
          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Compatibilidad en Vitrina
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                  compatibility.status === 'COMPATIBLE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  compatibility.status === 'APPROXIMATELY_COMPATIBLE' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                  compatibility.status === 'NOT_RECOMMENDED' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                  'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}>
                  {compatibility.label}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-snug">
                {compatibility.reason}
              </p>
            </div>
            <div className="text-[10px] text-zinc-500 mt-3 pt-2 border-t border-zinc-800">
              Evaluación geométrica de escalas oficiales y alturas registradas.
            </div>
          </div>
        </div>

        {/* Comparison Matrix Table */}
        <div className="rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            {/* Products Header Row */}
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 z-20 backdrop-blur-md">
                <th className="p-4 w-44 text-xs font-black uppercase tracking-wider text-zinc-400 bg-zinc-900/90">
                  Especificación
                </th>
                {products.map(p => (
                  <th key={p.id} className="p-4 w-60 align-top">
                    <div className="flex flex-col h-full justify-between space-y-3">
                      <div className="relative">
                        <button
                          onClick={() => handleRemove(p.id)}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 flex items-center justify-center transition border border-zinc-700 z-10"
                          title="Quitar"
                        >
                          <X size={12} />
                        </button>

                        <div className="w-full aspect-square rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center mb-2">
                          {p.primary_image ? (
                            <img src={p.primary_image} alt={p.title} className="w-full h-full object-contain p-2" />
                          ) : (
                            <Scale size={24} className="text-zinc-600" />
                          )}
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {verdict.badges_by_product[p.id]?.map((b, bi) => (
                            <span key={bi} className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              {b}
                            </span>
                          ))}
                        </div>

                        <Link to={`/producto/${p.slug}`} className="text-sm font-bold text-white hover:text-amber-400 line-clamp-2 transition leading-snug">
                          {p.title}
                        </Link>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                        <span className="text-base font-black text-amber-400">
                          {p.normalized_attributes?.price?.display}
                        </span>
                        <button
                          onClick={() => addToCart({ id: p.id, title: p.title, price: p.base_price, image: p.primary_image } as any)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-lg transition flex items-center gap-1"
                        >
                          <ShoppingCart size={12} /> Comprar
                        </button>
                      </div>
                    </div>
                  </th>
                ))}

                {/* Empty slot placeholder column if < 4 */}
                {products.length < 4 && (
                  <th className="p-4 w-48 align-middle text-center bg-zinc-950/40">
                    <button
                      onClick={() => setIsSearchOpen(true)}
                      className="w-full h-48 border-2 border-dashed border-zinc-800 hover:border-amber-500/40 rounded-xl flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-amber-400 transition group p-4"
                    >
                      <Plus size={24} className="group-hover:scale-110 transition" />
                      <span className="text-xs font-bold">Agregar figura para comparar</span>
                    </button>
                  </th>
                )}
              </tr>
            </thead>

            {/* Attributes Body */}
            <tbody className="divide-y divide-zinc-900">
              {visibleAttributes.map(attr => (
                <tr key={attr.attribute_key} className="hover:bg-zinc-900/30 transition">
                  <td className="p-3.5 text-xs font-bold text-zinc-400 bg-zinc-950">
                    <div className="flex flex-col">
                      <span className="text-zinc-200">{attr.label}</span>
                      {attr.unit && <span className="text-[10px] text-zinc-600 uppercase font-mono">({attr.unit})</span>}
                    </div>
                  </td>

                  {products.map(p => {
                    const normVal = p.normalized_attributes?.[attr.attribute_key];
                    const isMissing = !normVal || !normVal.is_informed;

                    return (
                      <td key={p.id} className="p-3.5 text-xs font-medium">
                        <span className={isMissing ? 'text-zinc-600 italic' : 'text-zinc-200'}>
                          {normVal?.display || 'No informado'}
                        </span>
                      </td>
                    );
                  })}

                  {products.length < 4 && <td className="p-3.5 bg-zinc-950/20" />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Security / Confidentiality Guarantee */}
        <div className="text-center pt-4 pb-8 text-xs text-zinc-500 flex items-center justify-center gap-1.5">
          <Shield size={14} className="text-zinc-600" />
          <span>Comparador del Coleccionista Collectibles 2026. Datos técnicos y de disponibilidad verificados.</span>
        </div>
      </div>

      {/* Add Product Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">Agregar producto a la comparativa</h3>
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, personaje o franquicia..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800">
              {searching ? (
                <div className="p-4 text-center text-xs text-zinc-500">Buscando...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  {searchQuery ? 'No se encontraron resultados.' : 'Escribe para buscar piezas en catálogo.'}
                </div>
              ) : (
                searchResults.map(p => {
                  const img = p.product_images?.find((i: any) => i.is_primary)?.url || p.product_images?.[0]?.url;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProduct(p.id)}
                      className="p-3 flex items-center justify-between hover:bg-zinc-800/60 cursor-pointer rounded-xl transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {img ? <img src={img} alt="" className="w-full h-full object-contain" /> : <Scale size={16} className="text-zinc-600" />}
                        </div>
                        <span className="text-xs font-bold text-zinc-200 line-clamp-1">{p.title}</span>
                      </div>
                      <span className="text-xs font-black text-amber-400">$ {p.base_price}</span>
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
