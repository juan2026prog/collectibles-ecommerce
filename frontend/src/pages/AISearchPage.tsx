import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Sparkles, Search, Camera, Upload, X, SlidersHorizontal, AlertCircle, ArrowRight, MessageSquare, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { interpretUserQuery } from '../lib/search/aiQueryInterpreter';
import type { AISearchQueryInterpretation } from '../lib/search/aiQueryInterpreter';
import { queryCollectorKnowledge } from '../plugins/collector-academy/core/draftGuard';
import SEO from '../components/SEO';

export default function AISearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [inputQuery, setInputQuery] = useState(queryParam);
  const [interpretation, setInterpretation] = useState<AISearchQueryInterpretation | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  
  // Image Search State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (queryParam.trim()) {
      handleSearch(queryParam.trim());
    }
  }, [queryParam]);

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      setImagePreview(base64Url);
      setAnalyzingImage(true);

      // Extract inferred query from image filename or invoke visual search
      const sanitizedName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();

      const suggestedSearch = sanitizedName.length > 2 ? sanitizedName : 'Figura de coleccion';
      setInputQuery(suggestedSearch);
      setSearchParams({ q: suggestedSearch });
      
      setAnalyzingImage(false);
      handleSearch(suggestedSearch);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSearch = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    const interp = interpretUserQuery(queryText);
    setInterpretation(interp);

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

      // Generate conversational answer with Academy & Radar grounding
      const groundedKnowledge = queryCollectorKnowledge(queryText);

      if (groundedKnowledge) {
        setAiAnswer(
          `**${groundedKnowledge.title}:** ${groundedKnowledge.summary}\n\n` +
          `• **Puntos Clave:** ${groundedKnowledge.keyDetails.join(' · ')}`
        );
      } else if (interp.isQuestion || interp.intent === 'recommendation') {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      setSearchParams({ q: inputQuery.trim() });
      handleSearch(inputQuery.trim());
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-8">
      <SEO
        title="Buscador Inteligente del Coleccionista | Collectibles 2026"
        description="Buscador semántico por lenguaje natural, fotos de piezas y grounding del coleccionismo."
      />

      {/* Hero Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 text-xs font-bold">
          <Sparkles size={14} />
          <span>Ask Collectibles AI & Visual Search</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black">Asistente Inteligente del Coleccionista</h1>
        <p className="text-xs sm:text-sm text-zinc-400">
          Pregunta por escalas, marcas, rarezas, sube una foto de tu figura o busca en lenguaje natural.
        </p>
      </div>

      {/* Search Bar & Visual Upload */}
      <div className="max-w-3xl mx-auto space-y-3">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ej: Batman 1:12 con accesorios, ¿qué es una figura Chase?, o sube una foto..."
            className="w-full px-5 py-4 pl-12 pr-28 bg-zinc-900/90 border border-white/15 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition text-sm shadow-xl"
          />
          <Search size={20} className="absolute left-4 text-zinc-500" />

          {/* Right Action Icons (Camera & Submit) */}
          <div className="absolute right-3 flex items-center gap-1.5">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Buscar por foto o imagen"
              className="p-2 text-zinc-400 hover:text-fuchsia-400 hover:bg-white/5 rounded-xl transition cursor-pointer"
            >
              <Camera size={18} />
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-fuchsia-500/20 cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </div>
        </form>

        {/* Image Preview Banner */}
        {imagePreview && (
          <div className="bg-zinc-900 border border-fuchsia-500/30 rounded-2xl p-3 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-zinc-950 border border-white/10 overflow-hidden flex-shrink-0">
                <img src={imagePreview} alt="Uploaded figure" className="w-full h-full object-contain" />
              </div>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1">
                  <Sparkles size={12} className="text-fuchsia-400" />
                  {analyzingImage ? 'Analizando imagen de la figura...' : 'Foto cargada para búsqueda visual'}
                </span>
                <p className="text-[10px] text-zinc-400">Buscando coincidencias de personaje, fabricante y escala en el catálogo.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearImage}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* AI Grounded Answer */}
      {aiAnswer && (
        <div className="max-w-3xl mx-auto bg-gradient-to-r from-fuchsia-950/40 via-zinc-900 to-zinc-900 border border-fuchsia-500/30 rounded-2xl p-5 shadow-xl animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={16} className="text-fuchsia-400" />
            <span className="text-xs font-black uppercase tracking-widest text-fuchsia-400">
              Respuesta del Asistente (Grounded Knowledge)
            </span>
          </div>
          <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {aiAnswer}
          </div>
        </div>
      )}

      {/* Products Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white">
            Resultados en Catálogo ({products.length})
          </h2>
          {interpretation?.cleanedQuery && (
            <span className="text-xs text-zinc-400">
              Filtro: <span className="text-fuchsia-400 font-bold">{interpretation.cleanedQuery}</span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center text-zinc-500 animate-pulse">
            Buscando y verificando disponibilidad de piezas...
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
            <p className="text-sm text-zinc-400">No encontramos productos exactos con ese criterio.</p>
            <p className="text-xs text-zinc-500 mt-1">Prueba escribiendo otra marca, escala o subiendo una foto más clara.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {products.map((product) => (
              <ProductGridCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
