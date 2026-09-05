import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  GraduationCap, BookOpen, Layers, Sparkles, Search, HelpCircle, 
  ArrowRight, ShieldCheck, Flame, Box, Clock, ShoppingBag 
} from 'lucide-react';
import SEO from '../../components/SEO';

export interface AcademyArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  type: string;
  featured_image?: string;
  read_time_minutes?: number;
  category_name?: string;
}

const CURATED_DEFAULT_ARTICLES: AcademyArticle[] = [
  {
    id: 'art-escalas',
    title: 'Guía Definitiva de Escalas: 1:12 vs 1:10 vs 1:6 en Figuras de Acción',
    slug: 'guia-de-escalas-coleccionables',
    excerpt: 'Descubre las diferencias reales de tamaño, articulación y compatibilidad de vitrinas entre marcas líderes como Hot Toys, NECA, Hasbro y MAFEX.',
    type: 'GUÍA TÉCNICA',
    featured_image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&q=80',
    read_time_minutes: 6,
    category_name: 'Escalas y Tamaños'
  },
  {
    id: 'art-bootlegs',
    title: 'Cómo Detectar Bootlegs y Copias No Oficiales vs Figuras Originales',
    slug: 'como-detectar-bootlegs-figuras-originales',
    excerpt: 'Aprende a identificar sellos holográficos de Toei/Bandai, calidades de pintura defectuosas, números de serie y empaques sospechosos antes de comprar.',
    type: 'AUTENTICIDAD',
    featured_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80',
    read_time_minutes: 8,
    category_name: 'Autenticidad'
  },
  {
    id: 'art-materiales',
    title: 'PVC vs Resina Polystone vs Diecast: Cuidados y Conservación',
    slug: 'pvc-vs-resina-vs-diecast-cuidados',
    excerpt: 'Por qué la resina no tolera caídas, cómo evitar el efecto "sudor plástico" en PVC por calor y la protección anticorrosión en partes metálicas Diecast.',
    type: 'PRESERVACIÓN',
    featured_image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&q=80',
    read_time_minutes: 5,
    category_name: 'Materiales'
  },
  {
    id: 'art-vitrinas',
    title: 'Vitrinas para Coleccionistas: Iluminación LED, Polvo y Control UV',
    slug: 'vitrinas-iluminacion-led-y-control-uv',
    excerpt: 'La luz solar directa y las lámparas halógenas amarillean los plásticos. Configura vitrinas con LEDs fríos sin emisión UV y sellos antipolvo.',
    type: 'GUÍA DE EXHIBICIÓN',
    featured_image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&q=80',
    read_time_minutes: 7,
    category_name: 'Conservación'
  }
];

export default function AcademyHome() {
  const [articles, setArticles] = useState<AcademyArticle[]>([]);
  const [scales, setScales] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');

  useEffect(() => {
    loadAcademyData();
  }, []);

  const loadAcademyData = async () => {
    try {
      setLoading(true);
      const [artRes, scaRes, gloRes] = await Promise.all([
        supabase.from('academy_content').select('*').eq('status', 'PUBLISHED').limit(10),
        supabase.from('academy_scales').select('*').order('created_at', { ascending: true }),
        supabase.from('academy_glossary').select('*').eq('status', 'PUBLISHED').limit(16)
      ]);

      if (artRes.data && artRes.data.length > 0) {
        // Merge with curated images if missing
        const merged = artRes.data.map(dbArt => {
          const fallback = CURATED_DEFAULT_ARTICLES.find(c => c.slug === dbArt.slug);
          return {
            ...dbArt,
            featured_image: dbArt.featured_image || fallback?.featured_image || 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&q=80',
            read_time_minutes: dbArt.read_time_minutes || fallback?.read_time_minutes || 5,
            category_name: fallback?.category_name || dbArt.type
          };
        });
        setArticles(merged);
      } else {
        setArticles(CURATED_DEFAULT_ARTICLES);
      }

      setScales(scaRes.data && scaRes.data.length > 0 ? scaRes.data : [
        { scale_key: '1:6', label: 'Escala 1/6 (Sixth Scale)', approx_height_cm: '28 - 32 cm', description: 'Gama alta con ropa de tela real y máximo realismo facial (Hot Toys, Sideshow, Damtoys).' },
        { scale_key: '1:10', label: 'Escala 7 Pulgadas', approx_height_cm: '18 - 19 cm', description: 'Formato robusto de cine y terror (NECA Ultimate, McFarlane DC Multiverse).' },
        { scale_key: '1:12', label: 'Escala 1/12 (6 Pulgadas)', approx_height_cm: '15 - 16 cm', description: 'El estándar de acción articulada más popular del mundo (Medicom MAFEX, Hasbro Marvel Legends, Bandai S.H. Figuarts, Mezco One:12).' },
        { scale_key: '1:4', label: 'Escala 1/4 (Quarter Scale)', approx_height_cm: '45 - 55 cm', description: 'Piezas monumentales de resina y estatuas de museo con detalles hiper-realistas.' }
      ]);

      setGlossary(gloRes.data && gloRes.data.length > 0 ? gloRes.data : [
        { term: 'MISB', definition: 'Mint In Sealed Box: Pieza completamente nueva, sin abrir y con precinto de fábrica original intacto.', category: 'GRADING' },
        { term: 'Chase', definition: 'Variante rara o limitada de una figura estándar distribuida aleatoriamente en una de cada varias cajas.', category: 'TERMINOLOGÍA' },
        { term: 'Bootleg / KO', definition: 'Copia no autorizada o falsificación sin licencia oficial del fabricante.', category: 'AUTENTICIDAD' },
        { term: 'Loose', definition: 'Figura fuera de su empaque original, completa o sin accesorios, lista para exhibición.', category: 'GRADING' },
        { term: 'Pinless Joints', definition: 'Articulaciones sin remaches visibles en codos y rodillas, brindando una estética superior.', category: 'TÉCNICO' },
        { term: 'Diecast', definition: 'Aleación de metal fundido a presión que añade peso, estabilidad y acabados metálicos reales.', category: 'MATERIALES' }
      ]);
    } catch (err) {
      console.error(err);
      setArticles(CURATED_DEFAULT_ARTICLES);
    } finally {
      setLoading(false);
    }
  };

  const filteredArticles = articles.filter(art => {
    if (activeCategory === 'TODOS') return true;
    return art.category_name?.toUpperCase().includes(activeCategory) || art.type.toUpperCase().includes(activeCategory);
  });

  const filteredGlossary = glossary.filter(g => 
    g.term.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white py-10 px-4 sm:px-6 lg:px-8 space-y-16">
      <SEO
        title="Collector Academy | Guías Técnicas, Escalas y Preservación"
        description="Aprende sobre escalas (1:12 vs 1:6), autenticidad de figuras, cuidado de resina/PVC, iluminación de vitrinas y glosario técnico de coleccionismo."
      />

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
          <GraduationCap size={16} />
          <span>Collector Academy • Academia de Coleccionismo</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          La Enciclopedia Técnica & Editorial del Coleccionista
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Aprende a elegir la escala perfecta, conservar tus piezas de PVC y Resina, evitar estafas con copias Bootleg y potenciar tu vitrina con figuras 100% auténticas.
        </p>

        {/* Quick Topics Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {['TODOS', 'ESCALAS', 'AUTENTICIDAD', 'MATERIALES', 'CONSERVACIÓN'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                activeCategory === cat
                  ? 'bg-emerald-500 text-black border-emerald-500'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Featured Editorial Guides Grid */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
            <BookOpen size={24} className="text-emerald-400" />
            <span>Guías Editoriales Destacadas</span>
          </h2>
          <span className="text-xs text-zinc-500 font-medium">Contenido editorial verificado</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-500">Cargando guías técnicas...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredArticles.map((art) => (
              <Link
                key={art.id}
                to={`/academy/${art.slug}`}
                className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden group transition flex flex-col justify-between shadow-xl"
              >
                <div>
                  <div className="w-full h-44 bg-zinc-950 overflow-hidden relative">
                    {art.featured_image && (
                      <img 
                        src={art.featured_image} 
                        alt={art.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md text-emerald-400 border border-emerald-500/30">
                      {art.type}
                    </span>
                  </div>

                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <Clock size={12} />
                      <span>{art.read_time_minutes || 5} min de lectura</span>
                    </div>
                    <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition line-clamp-2 leading-snug">
                      {art.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                      {art.excerpt}
                    </p>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition">
                    <span>Leer guía completa</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Scales Reference Section */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
              <Layers size={24} className="text-sky-400" />
              <span>Tabla Maestra de Escalas & Alturas</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Guía rápida de proporciones para saber exactamente cuánto ocupará una pieza en tu vitrina.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {scales.map((s, idx) => (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between hover:border-zinc-700 transition">
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xl font-black text-white">{s.scale_key}</span>
                  <span className="text-xs font-mono text-sky-400 font-bold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                    {s.approx_height_cm}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-zinc-200 mb-1.5">{s.label}</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">{s.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Compatibilidad vitrina</span>
                <span className="text-sky-400 font-bold">Verificada</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Glossary Interactive Mini-Hub */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
              <HelpCircle size={24} className="text-amber-400" />
              <span>Diccionario del Coleccionista</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Glosario con los términos más utilizados en compras internacionales, estado de cajas y foros de coleccionismo.</p>
          </div>

          <div className="w-full sm:w-72 relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar término (MISB, Chase, KO)..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGlossary.map((g, idx) => (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">{g.term}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                  {g.category}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{g.definition}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Commercial Banner / Catalog Entry */}
      <div className="max-w-7xl mx-auto p-8 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider">
            <ShieldCheck size={16} />
            <span>Figuras 100% Originales & Garantizadas</span>
          </div>
          <h3 className="text-2xl font-black text-white">¿Listo para sumar una pieza a tu colección?</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl">
            Aplica todo lo aprendido en la Academy y explora figuras en stock inmediato en Uruguay y preventas internacionales con franquicia de USD 200.
          </p>
        </div>
        <Link
          to="/shop"
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm rounded-xl transition flex items-center gap-2 shadow-lg flex-shrink-0"
        >
          <ShoppingBag size={16} />
          <span>Ver Catálogo de la Tienda</span>
        </Link>
      </div>
    </div>
  );
}
