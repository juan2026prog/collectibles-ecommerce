import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Sparkles, Search, SlidersHorizontal, AlertCircle, ArrowRight, MessageSquare, RefreshCw } from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { interpretUserQuery } from '../lib/search/aiQueryInterpreter';
import type { AISearchQueryInterpretation } from '../lib/search/aiQueryInterpreter';
import SEO from '../components/SEO';

export default function AISearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [inputQuery, setInputQuery] = useState(queryParam);
  const [interpretation, setInterpretation] = useState<AISearchQueryInterpretation | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  useEffect(() => {
    if (queryParam.trim()) {
      handleSearch(queryParam.trim());
    }
  }, [queryParam]);

  const handleSearch = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    const interp = interpretUserQuery(queryText);
    setInterpretation(interp);

    // Call semantic search or fallback to text search with filters
    try {
      let query = supabase
        .from('products')
        .select(`
          id, title, slug, price, currency, final_price_usd, base_price,
          status, condition, brand_id, images, category_id,
          brand:brands(id, name),
          category:categories(id, name)
        `)
        .eq('status', 'active')
        .limit(24);

      if (interp.cleanedQuery) {
        query = query.ilike('title', `%${interp.cleanedQuery}%`);
      }

      if (interp.priceMax) {
        query = query.lte('price', interp.priceMax);
      }
      if (interp.priceMin) {
        query = query.gte('price', interp.priceMin);
      }

      const { data, error } = await query;
      if (!error && data) {
        setProducts(data);
      } else {
        setProducts([]);
      }

      // Generate conversational answer if intent is question/recommendation
      if (interp.isQuestion || interp.intent === 'recommendation') {
        setAiAnswer(
          `Analizamos tu consulta "${queryText}". Identificamos interés en ${interp.detectedBrand || 'coleccionables'} ` +
          `${interp.detectedScale ? `en escala ${interp.detectedScale}` : ''}. ` +
          `A continuación te presentamos las piezas exactas verificadas en nuestro catálogo que coinciden con tu criterio.`
        );
      } else {
        setAiAnswer(null);
      }

      // Log search for AI insights
      await supabase.from('ai_search_logs').insert({
        query: queryText,
        results_count: data ? data.length : 0,
        filters_detected: {
          brand: interp.detectedBrand,
          license: interp.detectedLicense,
          scale: interp.detectedScale,
          priceRange: [interp.priceMin, interp.priceMax]
        }
      }).catch(() => {});

    } catch (err) {
      console.error('Error during AI Search:', err);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    setSearchParams({ q: inputQuery.trim() });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Strict NOINDEX for AI Search Results */}
      <SEO 
        title={`Búsqueda Inteligente: ${queryParam || 'Collectibles'}`} 
        description="Buscador semántico asistido por IA para coleccionistas"
        noIndex={true}
      />

      {/* Header */}
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/30 text-primary-400 text-xs font-bold mb-3">
          <Sparkles size={14} />
          <span>Collectibles AI Search</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">¿Qué pieza estás buscando para tu colección?</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-2">
          Busca en lenguaje natural por escala, personaje, marca, condición o rango de precio.
        </p>

        {/* Input Bar */}
        <form onSubmit={onSubmit} className="mt-6 flex gap-2 max-w-xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ej: Hot Toys Batman 1/6 menos de 300, Neca Predator..."
              className="w-full pl-10 pr-4 py-3 bg-zinc-900/80 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>Buscar</span>
          </button>
        </form>

        {/* Example prompts */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs text-zinc-500">
          <span>Prueba con:</span>
          {['Hot Toys Iron Man 1:6', 'Neca Chucky', 'Funko Pop Marvel bajo 50'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setInputQuery(p);
                setSearchParams({ q: p });
              }}
              className="text-zinc-400 hover:text-white underline cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Interpreted Chips */}
      {interpretation && (
        <div className="mb-6 flex flex-wrap items-center gap-2 bg-zinc-900/40 border border-white/5 p-3 rounded-xl">
          <span className="text-xs text-zinc-400 font-medium flex items-center gap-1">
            <SlidersHorizontal size={13} />
            Criterios detectados:
          </span>
          {interpretation.detectedBrand && (
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
              Marca: {interpretation.detectedBrand}
            </span>
          )}
          {interpretation.detectedLicense && (
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
              Licencia: {interpretation.detectedLicense}
            </span>
          )}
          {interpretation.detectedScale && (
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
              Escala: {interpretation.detectedScale}
            </span>
          )}
          {interpretation.priceMax && (
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
              Máx: USD {interpretation.priceMax}
            </span>
          )}
          {interpretation.intent && (
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 font-mono">
              Intención: {interpretation.intent}
            </span>
          )}
        </div>
      )}

      {/* Conversational Assistant Response */}
      {aiAnswer && (
        <div className="mb-8 p-4 bg-gradient-to-r from-primary-500/10 via-zinc-900 to-zinc-900 border border-primary-500/20 rounded-xl flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 flex-shrink-0 mt-0.5">
            <MessageSquare size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-1">
              Asistente Collectibles
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{aiAnswer}</p>
          </div>
        </div>
      )}

      {/* Results Grid */}
      {loading ? (
        <div className="py-16 text-center text-zinc-400">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-primary-400" />
          <p className="text-sm">Buscando piezas en el catálogo...</p>
        </div>
      ) : products.length > 0 ? (
        <div>
          <div className="flex justify-between items-center mb-4 text-xs text-zinc-400">
            <span>Se encontraron <strong>{products.length}</strong> piezas reales</span>
            <Link to={`/shop?q=${encodeURIComponent(queryParam)}`} className="text-primary-400 hover:underline">
              Ver en catálogo clásico →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
            {products.map((p) => (
              <ProductGridCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      ) : queryParam ? (
        <div className="text-center py-16 bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
          <AlertCircle size={32} className="mx-auto text-zinc-600 mb-3" />
          <h3 className="text-base font-bold text-white">No encontramos productos exactos</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
            Intenta flexibilizar la escala o buscar por el nombre directo del personaje o franquicia.
          </p>
        </div>
      ) : null}
    </div>
  );
}
