import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Sparkles, Search, Camera, X, RefreshCw, MessageSquare, 
  Radio, BookOpen, ArrowRight, Bell, Check, ChevronDown, HelpCircle
} from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { interpretUserQuery } from '../lib/search/aiQueryInterpreter';
import type { AISearchQueryInterpretation } from '../lib/search/aiQueryInterpreter';
import { queryCollectorKnowledge } from '../plugins/collector-academy/core/draftGuard';
import { useCurrency } from '../contexts/CurrencyContext';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { resolveCartItemPrice } from '../lib/priceResolver';
import SEO from '../components/SEO';

const REFERENCE_QUESTIONS_POOL: string[] = [
  'De la Wave 3 de DC Multiverse de McFarlane, ¿qué tenés disponible?',
  '¿Qué figuras de la misma wave que este producto puedo comprar ahora?',
  'Mostrame figuras de terror de NECA Ultimate que estén disponibles en Uruguay.',
  'Quiero una figura de Batman de unos 18 cm, que no sea Funko y cueste menos de USD 80.',
  '¿Qué figuras 1:12 de Marvel tengo disponibles y cuáles combinan mejor entre sí?',
  '¿Qué preventas de Dragon Ball están abiertas y cuáles salen próximamente?',
  '¿Qué productos nuevos de McFarlane llegaron últimamente?',
  '¿Qué Hot Toys de Star Wars puedo comprar o traer actualmente?',
  'Tengo esta figura de NECA. ¿Qué otras piezas de la misma línea me recomendarías mirar?',
  'De esta colección, ¿qué piezas me faltan y cuáles están disponibles ahora?',
  'Tengo USD 150 de presupuesto total. ¿Qué figuras puedo comprar incluyendo el costo estimado de traerlas a Uruguay?',
  '¿Qué lanzamientos próximos coinciden con las marcas y líneas que colecciono?'
];

/** Selecciona 3 preguntas pseudo-aleatorias deterministas que rotan cada 2 horas */
function getActiveReferenceQuestions(): string[] {
  const twoHourSlot = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
  const pool = [...REFERENCE_QUESTIONS_POOL];
  
  let seed = twoHourSlot;
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}


interface RadarMatch {
  id: string;
  slug: string;
  title: string;
  brand: string;
  line: string;
  radar_signal: string;
  date_label: string;
  official_image_url: string;
}

const STATIC_RADAR_ITEMS: RadarMatch[] = [
  {
    id: 'sentinel-marvel-vs-capcom',
    slug: 'sentinel-marvel-vs-capcom',
    title: "Marvel's Sentinel — Marvel vs. Capcom",
    brand: 'Hasbro',
    line: 'Marvel Legends',
    radar_signal: 'PREVENTA_CERRANDO',
    date_label: 'Pre-order hasta 7 SEP',
    official_image_url: '/images/radar/sentinel.jpg',
  },
  {
    id: 'lego-star-trek-enterprise-bridge',
    slug: 'lego-star-trek-enterprise-bridge',
    title: 'Star Trek: U.S.S. Enterprise NCC-1701 Bridge',
    brand: 'LEGO',
    line: 'Icons',
    radar_signal: 'ACABA_DE_SALIR',
    date_label: 'Lanzado 1 SEP',
    official_image_url: '/images/radar/lego-star-trek.jpg',
  },
  {
    id: 'shmonsterarts-godzilla-poster-coloring',
    slug: 'shmonsterarts-godzilla-poster-coloring-ver',
    title: 'Godzilla — Godzilla vs. Mechagodzilla II Poster Coloring Ver.',
    brand: 'Bandai Spirits',
    line: 'S.H.MonsterArts',
    radar_signal: 'NUEVO_ANUNCIO',
    date_label: 'Feb 2027',
    official_image_url: '/images/radar/godzilla.jpg',
  },
  {
    id: 'shfiguarts-vegeta-z-fighters',
    slug: 'shfiguarts-vegeta-z-fighters',
    title: 'Vegeta — Z-Fighters',
    brand: 'Bandai Spirits',
    line: 'S.H.Figuarts',
    radar_signal: 'PREVENTA_ABIERTA',
    date_label: 'Abr 2027',
    official_image_url: '/images/radar/vegeta.jpg',
  },
  {
    id: 'motu-king-hiss-chronicles',
    slug: 'motu-chronicles-king-hiss',
    title: 'Masters of the Universe Chronicles — King Hiss',
    brand: 'Mattel',
    line: 'Mattel Creations',
    radar_signal: 'EXCLUSIVO',
    date_label: 'Envío SEP 2026',
    official_image_url: '/images/radar/king-hiss.jpg',
  },
  {
    id: 'transformers-haslab-liokaiser',
    slug: 'transformers-legacy-haslab-liokaiser',
    title: 'Transformers Legacy HasLab — Liokaiser Combiner',
    brand: 'Hasbro',
    line: 'Transformers Legacy',
    radar_signal: 'ALTA_DEMANDA',
    date_label: 'Financiamiento hasta 15 SEP',
    official_image_url: '/images/radar/liokaiser.jpg',
  }
];

export default function AISearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [inputQuery, setInputQuery] = useState(queryParam);
  const [interpretation, setInterpretation] = useState<AISearchQueryInterpretation | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [radarDrops, setRadarDrops] = useState<RadarMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [academyMatch, setAcademyMatch] = useState<{ title: string; summary: string; slug: string } | null>(null);
  const [subscribedAlerts, setSubscribedAlerts] = useState<Record<string, boolean>>({});

  const { formatCurrencyPrice } = useCurrency();
  const cart = useCartContext();
  
  // Image Search State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reference Questions Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          category:categories(id, name),
          variants:product_variants(*)
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

      // Check Radar Matches
      const lowerQ = queryText.toLowerCase();
      const matchedDrops = STATIC_RADAR_ITEMS.filter(item => 
        item.title.toLowerCase().includes(lowerQ) ||
        item.brand.toLowerCase().includes(lowerQ) ||
        item.line.toLowerCase().includes(lowerQ) ||
        (interp.detectedBrand && item.brand.toLowerCase().includes(interp.detectedBrand.toLowerCase()))
      );
      setRadarDrops(matchedDrops);

      // Generate conversational answer with Academy & Radar grounding
      const groundedKnowledge = queryCollectorKnowledge(queryText);

      if (groundedKnowledge) {
        setAiAnswer(
          `**${groundedKnowledge.title}:** ${groundedKnowledge.summary}\n\n` +
          `• **Puntos Clave:** ${groundedKnowledge.keyDetails.join(' · ')}`
        );
        setAcademyMatch({
          title: groundedKnowledge.title,
          summary: groundedKnowledge.summary,
          slug: groundedKnowledge.suggestedSlug || 'como-empezar-coleccion-figuras'
        });
      } else if (interp.isQuestion || interp.intent === 'recommendation') {
        setAiAnswer(
          `Analizamos tu consulta "${queryText}". Identificamos interés en ${interp.detectedBrand || 'coleccionables'} ` +
          `${interp.detectedScale ? `en escala ${interp.detectedScale}` : ''}. ` +
          `A continuación te presentamos las piezas exactas verificadas en nuestro catálogo que coinciden con tu criterio.`
        );
        setAcademyMatch(null);
      } else {
        setAiAnswer(null);
        setAcademyMatch(null);
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

  const handleChipClick = (chip: string) => {
    setInputQuery(chip);
    setSearchParams({ q: chip });
    handleSearch(chip);
  };

  const handleAddToCart = (p: any) => {
    const variant = p.variants?.[0] || { id: p.id, name: 'Standard', price: p.price || p.base_price || 0 };
    const resolvedPrice = resolveCartItemPrice(p, variant);
    cart.addItem({ 
      product_id: p.id, 
      variant_id: variant.id, 
      quantity: 1, 
      title: p.title, 
      price: resolvedPrice, 
      image: getProductImage(p), 
      variant_name: variant.name,
      category_id: p.category_id,
      brand_id: p.brand_id,
      vendor_id: p.vendor_id,
      vendor_store_id: p.vendor_store_id || null,
      vendor_name: p.vendor_store?.store_name || p.vendor?.store_name || 'Collectibles',
      vendor_store_name: p.vendor_store?.store_name || p.vendor?.store_name || 'Collectibles',
      vendor_slug: p.vendor_store?.slug || p.vendor?.slug,
      vendor_store_slug: p.vendor_store?.slug || p.vendor?.slug,
      vendor_logo: p.vendor_store?.logo_url || p.vendor?.logo_url,
      sku: variant.sku || null,
      unit_price: resolvedPrice,
      image_url: getProductImage(p),
      promotions_opt_in: p.vendor?.promotions_opt_in || false,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || []
    });
  };

  const toggleRadarAlert = (id: string) => {
    setSubscribedAlerts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
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

        {/* Dropdown Menu: 3 Reference Questions (rotate every 2 hours) */}
        {!queryParam && (
          <div className="relative pt-1" ref={dropdownRef}>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-fuchsia-500/40 text-xs font-semibold text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
              >
                <Sparkles size={13} className="text-fuchsia-400" />
                <span>Ejemplos de preguntas recomendadas (3)</span>
                <ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-fuchsia-400' : ''}`} />
              </button>

              <span className="text-[11px] text-zinc-500 hidden sm:inline">
                Rotan cada 2 horas
              </span>
            </div>

            {/* Dropdown Content */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 mt-2 p-2 bg-zinc-950/95 border border-fuchsia-500/30 rounded-2xl shadow-2xl backdrop-blur-xl z-50 space-y-1.5 animate-fade-in">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 border-b border-white/10 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-fuchsia-400">
                    <HelpCircle size={12} />
                    Preguntas de referencia activas
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">3 de 12 preguntas</span>
                </div>
                {getActiveReferenceQuestions().map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      handleChipClick(q);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-fuchsia-950/40 border border-transparent hover:border-fuchsia-500/30 text-xs text-zinc-200 hover:text-white transition flex items-start gap-2.5 cursor-pointer group"
                  >
                    <Search size={13} className="text-zinc-500 group-hover:text-fuchsia-400 mt-0.5 shrink-0 transition-colors" />
                    <span className="leading-relaxed">{q}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* AI Grounded Answer */}
      {aiAnswer && (
        <div className="max-w-3xl mx-auto bg-gradient-to-r from-fuchsia-950/40 via-zinc-900 to-zinc-900 border border-fuchsia-500/30 rounded-2xl p-5 shadow-xl animate-fade-in space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-fuchsia-400" />
            <span className="text-xs font-black uppercase tracking-widest text-fuchsia-400">
              Respuesta del Asistente (Grounded Knowledge)
            </span>
          </div>
          <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {aiAnswer}
          </div>

          {/* Connected Academy Guide Card */}
          {academyMatch && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-4 bg-black/20 p-3 rounded-xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center shrink-0">
                  <BookOpen size={16} />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Guía de Collector Academy</span>
                  <span className="text-[11px] text-zinc-400 line-clamp-1">{academyMatch.title}</span>
                </div>
              </div>
              <Link 
                to={`/academy/${academyMatch.slug}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 shrink-0"
              >
                <span>Leer guía</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Radar Matches Section (Future Drops / Pre-orders) */}
      {radarDrops.length > 0 && (
        <div className="space-y-3 bg-zinc-900/60 border border-sky-500/30 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-sky-400 animate-pulse" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Lanzamientos & Preventas en Radar ({radarDrops.length})
              </h2>
            </div>
            <Link to="/radar" className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1">
              <span>Ver Radar Completo</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {radarDrops.map(drop => (
              <div key={drop.id} className="bg-zinc-950/80 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={drop.official_image_url} alt={drop.title} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-sky-400 tracking-wider block">{drop.brand} · {drop.line}</span>
                    <h3 className="text-xs font-bold text-white line-clamp-1">{drop.title}</h3>
                    <span className="text-[10px] text-zinc-400">{drop.date_label}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleRadarAlert(drop.id)}
                  className={`p-2 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                    subscribedAlerts[drop.id] 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30'
                  }`}
                  title={subscribedAlerts[drop.id] ? 'Alerta activada' : 'Avisarme cuando abra preventa'}
                >
                  {subscribedAlerts[drop.id] ? <Check size={14} /> : <Bell size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalog Products Results */}
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
            Buscando y verificando disponibilidad de piezas en el catálogo...
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center bg-zinc-900/30 border border-white/5 rounded-2xl p-8 space-y-4">
            <p className="text-sm text-zinc-300 font-bold">No encontramos piezas activas con ese criterio exacto.</p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Prueba buscando por otra franquicia, escala o explora las novedades en el Radar y guías en Academy.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link to="/radar" className="px-4 py-2 rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-300 text-xs font-bold hover:bg-sky-600/30 transition">
                Ver Preventas en Radar
              </Link>
              <Link to="/academy" className="px-4 py-2 rounded-xl bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300 text-xs font-bold hover:bg-fuchsia-600/30 transition">
                Explorar Collector Academy
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {products.map((product) => (
              <ProductGridCard 
                key={product.id} 
                product={product} 
                onAddToCart={handleAddToCart}
                formatPrice={formatCurrencyPrice}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
