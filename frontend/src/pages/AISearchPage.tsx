import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Sparkles, Search, Camera, X, RefreshCw, MessageSquare, 
  Radio, BookOpen, ArrowRight, Bell, Check, ChevronDown, 
  HelpCircle, Globe, Calendar, Flame, Shield, ArrowUpRight, Plus,
  MessageCircle
} from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { 
  interpretUserQuery, 
  generateDirectEditorialAnswer, 
  generateContextualQuestions 
} from '../lib/search/aiQueryInterpreter';
import type { AISearchQueryInterpretation } from '../lib/search/aiQueryInterpreter';
import { queryCollectorKnowledge } from '../plugins/collector-academy/core/draftGuard';
import { useCurrency } from '../contexts/CurrencyContext';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { resolveCartItemPrice } from '../lib/priceResolver';
import SEO from '../components/SEO';

const HERO_SUGGESTION_CHIPS = [
  'Dragon Ball',
  'Preventas',
  'S.H.Figuarts',
  'Próximos lanzamientos',
  'McFarlane DC',
  'NECA Horror',
  'Hot Toys 1:6',
  'Marvel Legends'
];

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

type ResultFilterTab = 'all' | 'in_stock' | 'preorder' | 'international';

export default function AISearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [inputQuery, setInputQuery] = useState(queryParam);
  const [interpretation, setInterpretation] = useState<AISearchQueryInterpretation | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [relaxedProducts, setRelaxedProducts] = useState<any[]>([]);
  const [radarDrops, setRadarDrops] = useState<RadarMatch[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Editorial AI Answer State
  const [editorialAnswer, setEditorialAnswer] = useState<{
    headline: string;
    summary: string;
    breakdown: string[];
    nextHighlight?: string;
  } | null>(null);
  const [academyMatch, setAcademyMatch] = useState<{ title: string; summary: string; slug: string } | null>(null);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  
  // Quick Filter Tab
  const [activeTab, setActiveTab] = useState<ResultFilterTab>('all');
  
  // Alerts & Subscriptions
  const [subscribedAlerts, setSubscribedAlerts] = useState<Record<string, boolean>>({});
  const [searchAlertCreated, setSearchAlertCreated] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const { formatCurrencyPrice } = useCurrency();
  const cart = useCartContext();
  
  // Image Search State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reference Questions Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('public_site_config')
      .select('value')
      .eq('key', 'social_whatsapp_url')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const raw = data.value.replace(/[\s\-\(\)\+]/g, '');
          setWhatsappNumber(raw);
        }
      });
  }, []);

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
    setInputQuery(queryParam);
    if (queryParam.trim()) {
      handleSearch(queryParam.trim());
    } else {
      setProducts([]);
      setRelaxedProducts([]);
      setRadarDrops([]);
      setEditorialAnswer(null);
      setAcademyMatch(null);
      setInterpretation(null);
      setSearchAlertCreated(false);
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
    setActiveTab('all');
    setSearchAlertCreated(false);

    const interp = interpretUserQuery(queryText);
    setInterpretation(interp);

    try {
      const searchTerm = interp.cleanedQuery || interp.detectedLicense || interp.detectedBrand || interp.detectedLine || queryText.trim();

      // 1. Query Local Products with full relations
      let localQuery = supabase
        .from('products')
        .select(`
          id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, created_at,
          category:categories(id, name, slug),
          brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
          images:product_images(id, url, alt_text, is_primary),
          variants:product_variants(id, sku, price_adjustment, inventory_count),
          vendor:vendors(id, store_name, slug, logo_url),
          vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official)
        `)
        .eq('is_active', true)
        .limit(36);

      if (searchTerm) {
        localQuery = localQuery.ilike('title', `%${searchTerm}%`);
      }

      if (interp.priceMax) {
        localQuery = localQuery.lte('base_price', interp.priceMax);
      }
      if (interp.priceMin) {
        localQuery = localQuery.gte('base_price', interp.priceMin);
      }

      const { data: localData, error: localErr } = await localQuery;
      let directResults: any[] = (!localErr && localData) ? localData : [];

      // 2. Query International Products
      let intlQuery = supabase
        .from('international_products')
        .select('id, title, slug, final_price_usd, amazon_list_price_usd, image_url, brand, category, status')
        .eq('status', 'published')
        .limit(24);

      if (searchTerm) {
        intlQuery = intlQuery.ilike('title', `%${searchTerm}%`);
      }

      if (interp.priceMax) {
        intlQuery = intlQuery.lte('final_price_usd', interp.priceMax);
      }
      if (interp.priceMin) {
        intlQuery = intlQuery.gte('final_price_usd', interp.priceMin);
      }

      const { data: intlData } = await intlQuery;

      if (intlData && intlData.length > 0) {
        const mappedIntl = intlData.map(item => ({
          id: item.id,
          title: item.title,
          slug: item.slug || `intl-${item.id}`,
          base_price: Number(item.final_price_usd || item.amazon_list_price_usd || 0),
          price: Number(item.final_price_usd || item.amazon_list_price_usd || 0),
          compare_at_price: Number(item.amazon_list_price_usd || item.final_price_usd || 0),
          images: [{ id: item.id, url: item.image_url, is_primary: true }],
          image_url: item.image_url,
          brand: { name: item.brand || 'Importado', slug: item.brand ? item.brand.toLowerCase() : 'importado' },
          category: { name: item.category || 'Coleccionables', slug: 'coleccionables' },
          source_provider: 'zinc',
          is_international: true,
          is_active: true,
          status: item.status
        }));
        directResults = [...directResults, ...mappedIntl];
      }

      setProducts(directResults);

      // 3. Radar Matches
      const lowerQ = queryText.toLowerCase();
      const matchedDrops = STATIC_RADAR_ITEMS.filter(item => 
        item.title.toLowerCase().includes(lowerQ) ||
        item.brand.toLowerCase().includes(lowerQ) ||
        item.line.toLowerCase().includes(lowerQ) ||
        (interp.detectedBrand && item.brand.toLowerCase().includes(interp.detectedBrand.toLowerCase())) ||
        (interp.detectedLicense && item.title.toLowerCase().includes(interp.detectedLicense.toLowerCase()))
      );
      setRadarDrops(matchedDrops);

      // 4. Relaxed Fallback when 0 exact results: always provide top featured products
      if (directResults.length === 0) {
        const { data: fallbackLocal } = await supabase
          .from('products')
          .select(`
            id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, created_at,
            category:categories(id, name, slug),
            brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
            images:product_images(id, url, alt_text, is_primary),
            variants:product_variants(id, sku, price_adjustment, inventory_count),
            vendor:vendors(id, store_name, slug, logo_url),
            vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official)
          `)
          .eq('is_active', true)
          .limit(12);

        setRelaxedProducts(fallbackLocal || []);
      } else {
        setRelaxedProducts([]);
      }

      // 5. Direct Editorial Answer Generation
      const directAnswer = generateDirectEditorialAnswer(interp, directResults, matchedDrops);
      setEditorialAnswer(directAnswer);

      // 6. Contextual Related Questions
      const questions = generateContextualQuestions(interp);
      setRelatedQuestions(questions);

      // 7. Academy Knowledge Grounding Link
      const groundedKnowledge = queryCollectorKnowledge(queryText);
      if (groundedKnowledge) {
        setAcademyMatch({
          title: groundedKnowledge.title,
          summary: groundedKnowledge.summary,
          slug: groundedKnowledge.suggestedSlug || 'como-empezar-coleccion-figuras'
        });
      } else {
        setAcademyMatch(null);
      }

      // Log search for AI telemetry
      await supabase.from('ai_search_logs').insert({
        query: queryText,
        results_count: directResults.length,
        filters_detected: {
          brand: interp.detectedBrand,
          license: interp.detectedLicense,
          line: interp.detectedLine,
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

  const handleRemoveFilterToken = (tokenToRemove: string) => {
    const updatedQuery = inputQuery
      .replace(new RegExp(tokenToRemove, 'gi'), '')
      .replace(/\s+/g, ' ')
      .trim();

    if (updatedQuery) {
      setInputQuery(updatedQuery);
      setSearchParams({ q: updatedQuery });
      handleSearch(updatedQuery);
    } else {
      setInputQuery('');
      setSearchParams({});
    }
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

  const handleCreateSearchAlert = () => {
    setSearchAlertCreated(true);
  };

  const getWhatsAppUrl = () => {
    const msg = encodeURIComponent(`¡Hola! Estuve buscando "${queryParam || inputQuery}" en Collectibles y me gustaría cotizar para traerlo o saber si tienen opciones disponibles.`);
    if (whatsappNumber) {
      return `https://wa.me/${whatsappNumber}?text=${msg}`;
    }
    return `https://wa.me/?text=${msg}`;
  };

  // Filtered Products based on Quick Tab
  const displayedProducts = useMemo(() => {
    const sourceList = products.length > 0 ? products : relaxedProducts;
    if (activeTab === 'all') return sourceList;
    if (activeTab === 'in_stock') return sourceList.filter(p => !p.is_preorder && p.status !== 'preorder');
    if (activeTab === 'preorder') return sourceList.filter(p => p.is_preorder || p.status === 'preorder');
    if (activeTab === 'international') return sourceList.filter(p => p.is_international || p.source_provider === 'zinc');
    return sourceList;
  }, [products, relaxedProducts, activeTab]);

  const inStockCount = useMemo(() => {
    const source = products.length > 0 ? products : relaxedProducts;
    return source.filter(p => !p.is_preorder && p.status !== 'preorder').length;
  }, [products, relaxedProducts]);

  const preorderCount = useMemo(() => {
    const source = products.length > 0 ? products : relaxedProducts;
    return source.filter(p => p.is_preorder || p.status === 'preorder').length;
  }, [products, relaxedProducts]);

  const internationalCount = useMemo(() => {
    const source = products.length > 0 ? products : relaxedProducts;
    return source.filter(p => p.is_international || p.source_provider === 'zinc').length;
  }, [products, relaxedProducts]);

  const hasSearchQuery = Boolean(queryParam.trim());
  const isFallbackRecommendations = products.length === 0 && relaxedProducts.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 text-white min-h-[80vh]">
      <SEO
        title={hasSearchQuery ? `Buscando "${queryParam}" | Collectibles AI` : 'Asistente Inteligente del Coleccionista | Collectibles'}
        description="Buscador inteligente con AI Overview, lenguaje natural y catálogo de figuras de colección."
      />

      {/* ========================================================================= */}
      {/* 1. ESTADO INICIAL — ANTES DE REALIZAR UNA BÚSQUEDA (HERO LIMPIO)           */}
      {/* ========================================================================= */}
      {!hasSearchQuery ? (
        <div className="max-w-3xl mx-auto space-y-7 py-8 sm:py-12 animate-fade-in">
          {/* Hero Branding */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f00856]/10 border border-[#f00856]/30 text-[#f00856] text-xs font-black uppercase tracking-wider">
              <Sparkles size={14} className="animate-pulse" />
              <span>COLLECTIBLES AI · BÚSQUEDA INTELIGENTE</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Asistente Inteligente del Coleccionista
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto font-medium">
              Buscá por nombre, franquicia, escala, presupuesto o subí una foto de la figura.
            </p>
          </div>

          {/* Main Hero Search Bar */}
          <div className="space-y-3.5">
            <form onSubmit={handleSubmit} className="relative flex items-center shadow-2xl">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ej: Dragon Ball S.H.Figuarts, Batman 1:12 menos de USD 80..."
                className="w-full px-5 py-4 pl-12 pr-28 bg-zinc-900/95 border border-white/15 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#f00856] transition text-sm sm:text-base shadow-xl"
              />
              <Search size={20} className="absolute left-4 text-zinc-500" />

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
                  title="Buscar por foto"
                  className="p-2 text-zinc-400 hover:text-[#f00856] hover:bg-white/5 rounded-xl transition cursor-pointer"
                >
                  <Camera size={19} />
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#f00856] to-pink-600 hover:from-[#d00749] hover:to-pink-500 text-white font-black text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-[#f00856]/25 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>Buscar</span>
                </button>
              </div>
            </form>

            {/* Suggestion Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider shrink-0">Popular:</span>
              {HERO_SUGGESTION_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-3 py-1 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 hover:border-[#f00856]/40 text-zinc-300 hover:text-white transition-all text-xs shrink-0 cursor-pointer font-medium"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Dropdown: Reference Questions */}
            <div className="relative pt-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-[#f00856]/40 text-xs font-semibold text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
              >
                <Sparkles size={13} className="text-[#f00856]" />
                <span>Ejemplos de preguntas al asistente</span>
                <ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-[#f00856]' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 mt-2 p-2 bg-zinc-950 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl z-50 space-y-1 animate-fade-in">
                  <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 border-b border-white/10 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#f00856]">
                      <HelpCircle size={12} />
                      Consultas recomendadas
                    </span>
                  </div>
                  {getActiveReferenceQuestions().map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        handleChipClick(q);
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#f00856]/10 border border-transparent hover:border-[#f00856]/30 text-xs text-zinc-200 hover:text-white transition flex items-start gap-2.5 cursor-pointer group"
                    >
                      <Search size={13} className="text-zinc-500 group-hover:text-[#f00856] mt-0.5 shrink-0 transition-colors" />
                      <span className="leading-relaxed">{q}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Access Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-3.5 text-center space-y-1">
              <Sparkles size={18} className="text-[#f00856] mx-auto" />
              <h3 className="text-xs font-bold text-white">AI Overview</h3>
              <p className="text-[10px] text-zinc-400">Resumen y stock en 1 segundo</p>
            </div>
            <Link to="/radar" className="bg-zinc-900/40 border border-white/5 hover:border-sky-500/30 rounded-2xl p-3.5 text-center space-y-1 transition">
              <Radio size={18} className="text-sky-400 mx-auto" />
              <h3 className="text-xs font-bold text-white">Radar de Preventas</h3>
              <p className="text-[10px] text-zinc-400">Alertas de drops y reservas</p>
            </Link>
            <Link to="/academy" className="bg-zinc-900/40 border border-white/5 hover:border-fuchsia-500/30 rounded-2xl p-3.5 text-center space-y-1 transition">
              <BookOpen size={18} className="text-fuchsia-400 mx-auto" />
              <h3 className="text-xs font-bold text-white">Academy</h3>
              <p className="text-[10px] text-zinc-400">Guías de autenticidad y escalas</p>
            </Link>
            <Link to="/vault" className="bg-zinc-900/40 border border-white/5 hover:border-emerald-500/30 rounded-2xl p-3.5 text-center space-y-1 transition">
              <Shield size={18} className="text-emerald-400 mx-auto" />
              <h3 className="text-xs font-bold text-white">The Vault</h3>
              <p className="text-[10px] text-zinc-400">Tu vitrina y colección</p>
            </Link>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. ESTADO RESULTADOS — AI OVERVIEW MINIMALISTA + PRODUCTOS INMEDIATOS      */
        /* ========================================================================= */
        <div className="space-y-4 animate-fade-in">
          {/* Compact Top Search Bar */}
          <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-3.5 sm:p-4 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f00856] animate-ping" />
                <h1 className="text-xs sm:text-sm font-black text-white tracking-wide uppercase">
                  Collectibles AI Search
                </h1>
              </div>

              <Link 
                to="/ai-search"
                onClick={() => setInputQuery('')}
                className="text-[11px] font-bold text-zinc-400 hover:text-white transition flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10"
              >
                <span>Nueva búsqueda</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <form onSubmit={handleSubmit} className="relative flex items-center">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Consultar al asistente..."
                className="w-full px-4 py-2 pl-9 pr-24 bg-zinc-950 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#f00856] transition text-xs sm:text-sm"
              />
              <Search size={15} className="absolute left-3 text-zinc-500" />

              <div className="absolute right-2 flex items-center gap-1">
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
                  title="Buscar por foto"
                  className="p-1.5 text-zinc-400 hover:text-[#f00856] hover:bg-white/5 rounded-lg transition cursor-pointer"
                >
                  <Camera size={15} />
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1 bg-[#f00856] hover:bg-[#d00749] text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  <span>Buscar</span>
                </button>
              </div>
            </form>

            {/* Detected Criteria Chips (Ultra-compact) */}
            {interpretation && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px]">
                {interpretation.detectedLicense && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-200 font-semibold text-[11px]">
                    Franquicia: <strong className="text-white">{interpretation.detectedLicense}</strong>
                    <button type="button" onClick={() => handleRemoveFilterToken(interpretation.detectedLicense!)} className="text-zinc-400 hover:text-[#f00856] ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                )}
                {interpretation.detectedBrand && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-200 font-semibold text-[11px]">
                    Marca: <strong className="text-white">{interpretation.detectedBrand}</strong>
                    <button type="button" onClick={() => handleRemoveFilterToken(interpretation.detectedBrand!)} className="text-zinc-400 hover:text-[#f00856] ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                )}
                {interpretation.detectedScale && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-200 font-semibold text-[11px]">
                    Escala: <strong className="text-white">{interpretation.detectedScale}</strong>
                    <button type="button" onClick={() => handleRemoveFilterToken(interpretation.detectedScale!)} className="text-zinc-400 hover:text-[#f00856] ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Image Preview if Loaded */}
          {imagePreview && (
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-white/10 overflow-hidden shrink-0">
                  <img src={imagePreview} alt="Uploaded figure" className="w-full h-full object-contain" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <Sparkles size={11} className="text-[#f00856]" />
                    {analyzingImage ? 'Analizando imagen...' : 'Foto cargada para búsqueda visual'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearImage}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* AI OVERVIEW CARD (MINIMALISTA, ELEGANTE, 1-2 LÍNEAS + ACTION PILLS)        */}
          {/* ========================================================================= */}
          {editorialAnswer && (
            <div className="bg-gradient-to-r from-[#f00856]/10 via-purple-950/20 to-zinc-900/70 border border-[#f00856]/25 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5 backdrop-blur-sm">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-[#f00856]/20 text-[#f00856]">
                    <Sparkles size={14} className="animate-pulse" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                    <span>AI Overview</span>
                    <span className="text-zinc-500 font-normal text-[11px]">· {editorialAnswer.headline}</span>
                  </h2>
                </div>
                {radarDrops.length > 0 && (
                  <Link to="/radar" className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1">
                    <Radio size={12} className="animate-pulse" />
                    <span>{radarDrops.length} en Radar</span>
                  </Link>
                )}
              </div>

              {/* Concise AI Insight (1 to 2 lines) */}
              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-medium">
                {editorialAnswer.summary}
              </p>

              {/* Highlights Breakdown (if any) */}
              {editorialAnswer.breakdown && editorialAnswer.breakdown.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-0.5 text-xs">
                  {editorialAnswer.breakdown.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-zinc-300 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f00856]" />
                      {item}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Pills Row (1-click interactive quick actions) */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {/* 1. Alert button */}
                <button
                  type="button"
                  onClick={handleCreateSearchAlert}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm ${
                    searchAlertCreated
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10'
                  }`}
                >
                  {searchAlertCreated ? <Check size={13} /> : <Bell size={13} className="text-[#f00856]" />}
                  <span>{searchAlertCreated ? 'Alerta guardada' : 'Avisarme si ingresa'}</span>
                </button>

                {/* 2. WhatsApp Custom Order */}
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <MessageCircle size={13} />
                  <span>Cotizar por encargo</span>
                </a>

                {/* 3. Radar shortcut */}
                <Link
                  to="/radar"
                  className="px-3 py-1.5 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 border border-sky-500/30 text-sky-300 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Radio size={13} />
                  <span>Ver Preventas Radar</span>
                </Link>

                {/* 4. Academy guide link (if available) */}
                {academyMatch && (
                  <Link
                    to={`/academy/${academyMatch.slug}`}
                    className="px-3 py-1.5 rounded-xl bg-fuchsia-950/40 hover:bg-fuchsia-900/50 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    <BookOpen size={13} />
                    <span>Guía: {academyMatch.title}</span>
                  </Link>
                )}
              </div>

              {/* Related Follow-up Questions (Horizontal Clean Chips) */}
              {relatedQuestions.length > 0 && (
                <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0 mr-1">
                    Relacionado:
                  </span>
                  {relatedQuestions.slice(0, 3).map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleChipClick(q)}
                      className="px-2.5 py-1 rounded-lg bg-black/30 hover:bg-white/10 border border-white/5 hover:border-[#f00856]/40 text-[11px] text-zinc-300 hover:text-white transition whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      <Search size={10} className="text-zinc-500" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Radar Drops Quick Preview (if matched) */}
          {radarDrops.length > 0 && (
            <div className="bg-zinc-900/50 border border-sky-500/20 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Radio size={14} className="text-sky-400 animate-pulse" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Lanzamientos oficiales en Radar ({radarDrops.length})
                  </h3>
                </div>
                <Link to="/radar" className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  <span>Ver todos</span>
                  <ArrowRight size={11} />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {radarDrops.map(drop => (
                  <div key={drop.id} className="bg-zinc-950 border border-white/10 rounded-xl p-2 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                        <img src={drop.official_image_url} alt={drop.title} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[9px] font-black uppercase text-sky-400 tracking-wider block truncate">{drop.brand} · {drop.line}</span>
                        <h4 className="text-xs font-bold text-white truncate">{drop.title}</h4>
                        <span className="text-[10px] text-zinc-400">{drop.date_label}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleRadarAlert(drop.id)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                        subscribedAlerts[drop.id] 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30'
                      }`}
                      title={subscribedAlerts[drop.id] ? 'Alerta activada' : 'Avisarme de preventa'}
                    >
                      {subscribedAlerts[drop.id] ? <Check size={12} /> : <Bell size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PRODUCTOS DEL CATÁLOGO (PROTAGÓNICOS Y VISIBLES SIN SCROLL EXCESIVO)       */}
          {/* ========================================================================= */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  {products.length > 0 
                    ? `${displayedProducts.length} ${displayedProducts.length === 1 ? 'Figura Encontrada' : 'Figuras Encontradas'}`
                    : `Figuras Recomendadas & Populares (${displayedProducts.length})`
                  }
                </h3>
                {isFallbackRecommendations && (
                  <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[10px] font-bold">
                    Sugerencias del catálogo
                  </span>
                )}
              </div>

              {/* Quick Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                    activeTab === 'all' 
                      ? 'bg-[#f00856] text-white shadow-sm' 
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                  }`}
                >
                  Todos ({products.length > 0 ? products.length : relaxedProducts.length})
                </button>

                {inStockCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('in_stock')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                      activeTab === 'in_stock' 
                        ? 'bg-[#f00856] text-white shadow-sm' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    En Stock ({inStockCount})
                  </button>
                )}

                {preorderCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('preorder')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                      activeTab === 'preorder' 
                        ? 'bg-sky-600 text-white shadow-sm' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Preventa ({preorderCount})
                  </button>
                )}

                {internationalCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('international')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                      activeTab === 'international' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Internacional ({internationalCount})
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-zinc-400 space-y-2">
                <RefreshCw size={24} className="animate-spin mx-auto text-[#f00856]" />
                <p className="text-xs font-medium">Buscando y verificando disponibilidad de piezas...</p>
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="py-12 text-center bg-zinc-900/30 border border-white/5 rounded-2xl p-6">
                <p className="text-xs text-zinc-400 font-medium">No hay productos en esta pestaña específica.</p>
                <button 
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className="mt-2 text-xs font-bold text-[#f00856] underline"
                >
                  Ver todos los resultados
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {displayedProducts.map((product) => (
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
      )}
    </div>
  );
}

