import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  GraduationCap, BookOpen, Layers, Sparkles, Search, HelpCircle, 
  ArrowRight, ShieldCheck, Flame, Box, Clock, ShoppingBag, Star,
  Package, AlertTriangle, Wrench, Heart
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
  level?: string;
}

// ── Orden editorial propuesto ──────────────────────────────────────────────────
// 1. Cómo Empezar (featured hero)
// 2. Guía de Escalas (featured hero)
// 3. Figuras de Acción vs Estatuas
// 4. Materiales: PVC, ABS, Resina y Die-Cast
// 5. Cómo Reconocer Originales y Bootlegs
// 6. Cómo Cuidar y Exhibir
// 7. MISB, MIB, Loose y Glosario
// 8. Limited, Exclusive, Chase y Pre-Order

const FEATURED_ARTICLES: AcademyArticle[] = [
  {
    id: 'art-empezar',
    title: 'Cómo Empezar una Colección sin Comprar Todo lo que Ves',
    slug: 'como-empezar-coleccion-figuras',
    excerpt: 'Una guía práctica para definir tu colección, controlar el presupuesto y evitar compras impulsivas. El punto de partida de todo coleccionista.',
    type: 'INICIO',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Collector Academy',
    level: 'Inicial'
  },
  {
    id: 'art-escalas-nuevo',
    title: 'Guía de Escalas en Figuras de Colección: de 1:18 a 1:4',
    slug: 'guia-escalas-figuras-coleccion',
    excerpt: 'Aprende qué significan las escalas 1:18, 1:12, 1:10, 1:6 y 1:4, cuánto mide cada figura y cuáles pueden exhibirse juntas.',
    type: 'GUÍA',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Escalas y Tamaños',
    level: 'Inicial'
  }
];

const BASICS_ARTICLES: AcademyArticle[] = [
  {
    id: 'art-accion-vs-estatuas',
    title: 'Figuras de Acción vs Estatuas: ¿Qué Tipo de Colección es para Ti?',
    slug: 'figuras-accion-vs-estatuas',
    excerpt: 'Articulación, tamaño, materiales y precio: descubre las principales diferencias antes de elegir.',
    type: 'GUÍA',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Introducción al coleccionismo',
    level: 'Inicial'
  },
  {
    id: 'art-materiales-nuevo',
    title: 'PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados',
    slug: 'materiales-figuras-pvc-abs-resina-diecast',
    excerpt: 'Qué diferencias existen entre PVC, ABS, resina y metal die-cast y cómo afectan peso, detalle y resistencia.',
    type: 'MATERIALES',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Materiales',
    level: 'Intermedio'
  },
  {
    id: 'art-bootleg-nuevo',
    title: 'Cómo Reconocer una Figura Original y Evitar Bootlegs',
    slug: 'como-reconocer-figura-original-bootleg',
    excerpt: 'Aprende a identificar señales comunes de falsificaciones y qué revisar antes de comprar.',
    type: 'AUTENTICIDAD',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Autenticidad',
    level: 'Inicial'
  },
  {
    id: 'art-cuidar-nuevo',
    title: 'Cómo Cuidar y Exhibir tus Figuras sin Dañarlas',
    slug: 'como-cuidar-exhibir-figuras-coleccion',
    excerpt: 'Luz, polvo, humedad y temperatura: las reglas esenciales para conservar una colección durante años.',
    type: 'CUIDADO',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Conservación',
    level: 'Inicial'
  }
];

const TERMINOLOGY_ARTICLES: AcademyArticle[] = [
  {
    id: 'art-misb',
    title: 'MISB, MIB, Loose y otros términos del coleccionismo',
    slug: 'misb-mib-loose-glosario-coleccionismo',
    excerpt: '¿MISB? ¿MIB? ¿Loose? Aprende los términos utilizados para describir el estado de figuras y coleccionables.',
    type: 'GLOSARIO',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Glosario',
    level: 'Inicial'
  },
  {
    id: 'art-edicion-limitada',
    title: 'Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan',
    slug: 'edicion-limitada-exclusive-chase-preorder',
    excerpt: 'Aprende la diferencia entre edición limitada, exclusiva, chase, preventa y reedición antes de comprar.',
    type: 'GUÍAS DE COMPRA',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Guías de compra',
    level: 'Inicial'
  }
];

const CURATED_DEFAULT_ARTICLES: AcademyArticle[] = [
  ...FEATURED_ARTICLES,
  ...BASICS_ARTICLES,
  ...TERMINOLOGY_ARTICLES
];

// ── Glossary data ──────────────────────────────────────────────────────────────
const DEFAULT_GLOSSARY = [
  { term: 'MISB', definition: 'Mint In Sealed Box: Pieza completamente nueva, sin abrir y con precinto de fábrica original intacto.', category: 'GRADING' },
  { term: 'MIB', definition: 'Mint In Box: La pieza está en excelentes condiciones con su caja, aunque puede haber sido abierta anteriormente.', category: 'GRADING' },
  { term: 'NIB', definition: 'New In Box: Producto nuevo dentro de su packaging. Verificar siempre si conserva sellos originales.', category: 'GRADING' },
  { term: 'Loose', definition: 'Figura fuera de su empaque original. Puede incluir todos o algunos accesorios. No implica mal estado.', category: 'GRADING' },
  { term: 'CIB', definition: 'Complete In Box: Conserva su caja y todos los accesorios principales originales. Común en videojuegos y vintage.', category: 'GRADING' },
  { term: 'Chase', definition: 'Variante más rara o limitada de una figura, distribuida aleatoriamente entre unidades estándar de una misma producción.', category: 'TERMINOLOGÍA' },
  { term: 'Bootleg / KO', definition: 'Copia no autorizada o falsificación sin licencia oficial del fabricante original.', category: 'AUTENTICIDAD' },
  { term: 'Pinless Joints', definition: 'Articulaciones sin remaches visibles en codos y rodillas, que brindan una estética superior y más limpia.', category: 'TÉCNICO' },
  { term: 'Diecast', definition: 'Aleación de metal fundido a presión que añade peso, estabilidad y acabados metálicos reales a partes específicas.', category: 'MATERIALES' },
  { term: 'Complete', definition: 'Pieza que conserva todos sus componentes originales: accesorios, manos, bases, manuales e inserts.', category: 'GRADING' },
  { term: 'Pre-Order', definition: 'Reserva de un producto antes de su lanzamiento. La fecha de entrega es estimada, no siempre garantizada.', category: 'COMPRA' },
  { term: 'PERS', definition: 'Parallel Eyeball Rolling System: tecnología de ojos móviles usada en figuras Hot Toys para mayor realismo facial.', category: 'TÉCNICO' }
];

// ── Type badge colors ─────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'INICIO': 'bg-sky-500 text-black',
  'GUÍA': 'bg-emerald-500 text-black',
  'AUTENTICIDAD': 'bg-red-500 text-white',
  'MATERIALES': 'bg-violet-500 text-white',
  'CUIDADO': 'bg-amber-500 text-black',
  'GLOSARIO': 'bg-zinc-600 text-white',
  'GUÍAS DE COMPRA': 'bg-orange-500 text-black',
  'GUÍA TÉCNICA': 'bg-emerald-500 text-black',
  'PRESERVACIÓN': 'bg-teal-500 text-black',
  'CONSERVACIÓN': 'bg-cyan-500 text-black',
};

function getTypeBadgeClass(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-zinc-700 text-white';
}

export default function AcademyHome() {
  const [dbArticles, setDbArticles] = useState<AcademyArticle[]>([]);
  const [scales, setScales] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAcademyData();
  }, []);

  const loadAcademyData = async () => {
    try {
      setLoading(true);
      const [scaRes, gloRes] = await Promise.all([
        supabase.from('academy_scales').select('*').order('created_at', { ascending: true }),
        supabase.from('academy_glossary').select('*').eq('status', 'PUBLISHED').limit(20)
      ]);

      setScales(scaRes.data && scaRes.data.length > 0 ? scaRes.data : [
        { scale_key: '1:18', label: 'Escala 1:18 (3.75 pulgadas)', approx_height_cm: '9,5 – 10,5 cm', description: 'Escala histórica de figuras vintage y vehículos. Ideal para colecciones numerosas y dioramas.' },
        { scale_key: '1:12', label: 'Escala 1:12 (Six Inch)', approx_height_cm: '15 – 18 cm', description: 'El estándar rey de figuras articuladas: Marvel Legends, Mafex, SH Figuarts, Mezco.' },
        { scale_key: '1:10', label: 'Escala 1:10 (7 pulgadas)', approx_height_cm: '18 – 22 cm', description: 'Muy utilizada en estatuas premium. Mayor libertad de escultura sin articulaciones complejas.' },
        { scale_key: '1:6', label: 'Escala 1:6 (Sixth Scale)', approx_height_cm: '28 – 32 cm', description: 'Alta gama con ropa de tela real y máximo realismo facial: Hot Toys, Sideshow, Damtoys.' },
        { scale_key: '1:4', label: 'Escala 1:4 (Quarter Scale)', approx_height_cm: '45 – 55 cm', description: 'Grandes piezas de museo y estatuas premium de alto impacto visual.' },
        { scale_key: '1:1', label: 'Escala 1:1 (Life-Size / Busto)', approx_height_cm: '160 – 190 cm (Bustos: 60 – 90 cm)', description: 'Réplicas a tamaño real 1:1 y bustos de museo con ojos de silicona, pelo injertado y máximo impacto.' },
      ]);

      setGlossary(gloRes.data && gloRes.data.length > 0 ? gloRes.data : DEFAULT_GLOSSARY);
    } catch (err) {
      console.error(err);
      setScales([]);
      setGlossary(DEFAULT_GLOSSARY);
    } finally {
      setLoading(false);
    }
  };

  const filteredGlossary = glossary.filter(g =>
    g.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white py-10 px-4 sm:px-6 lg:px-8 space-y-20">
      <SEO
        title="Collector Academy | Guías de Coleccionismo, Escalas y Autenticidad"
        description="Aprende sobre escalas (1:18 a 1:1 Life-Size), autenticidad de figuras, materiales PVC/resina/die-cast, cómo empezar tu colección, glosario MISB/MIB/Loose y mucho más."
      />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
          <GraduationCap size={16} />
          <span>Collector Academy • La Enciclopedia del Coleccionista</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          Todo lo que necesitas saber<br className="hidden sm:block" /> para coleccionar mejor
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Guías editoriales independientes sobre escalas, autenticidad, materiales, glosario técnico y estrategias de colección. Sin publicidad, sin sesgo.
        </p>

        {/* Stats pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {[
            { icon: <BookOpen size={13} />, label: '8 guías disponibles' },
            { icon: <HelpCircle size={13} />, label: '12 términos en el glosario' },
            { icon: <Layers size={13} />, label: '6 escalas documentadas' },
          ].map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
              {s.icon}
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── NIVEL A: GUÍAS DESTACADAS (2 hero cards) ─────────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
            <Star size={22} className="text-emerald-400" />
            <span>Guías Destacadas</span>
          </h2>
          <span className="text-xs text-zinc-500 font-medium">Por dónde empezar</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURED_ARTICLES.map((art) => (
            <Link
              key={art.id}
              to={`/academy/${art.slug}`}
              className="group relative rounded-3xl overflow-hidden border border-zinc-800 hover:border-emerald-500/60 transition shadow-2xl bg-zinc-900 flex flex-col"
            >
              {/* Image */}
              <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-zinc-950">
                {art.featured_image && (
                  <img
                    src={art.featured_image}
                    alt={art.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />

                {/* Badges */}
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${getTypeBadgeClass(art.type)}`}>
                    {art.type}
                  </span>
                  {art.level && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-black/60 backdrop-blur text-zinc-300 border border-zinc-700">
                      {art.level}
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex flex-col gap-3 flex-1 justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <Clock size={12} />
                    <span>{art.read_time_minutes} min de lectura</span>
                    <span>·</span>
                    <span className="text-zinc-600">{art.category_name}</span>
                  </div>
                  <h3 className="font-black text-lg text-white group-hover:text-emerald-400 transition leading-snug">
                    {art.title}
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {art.excerpt}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                  <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition flex items-center gap-1.5">
                    Leer guía completa <ArrowRight size={13} />
                  </span>
                  <span className="text-[10px] text-zinc-600 font-medium">Editorial Collectibles</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── NIVEL B: APRENDE LO BÁSICO (grilla 4 cols) ───────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
            <BookOpen size={22} className="text-sky-400" />
            <span>Aprende lo Básico</span>
          </h2>
          <span className="text-xs text-zinc-500 font-medium">Guías esenciales del coleccionista</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BASICS_ARTICLES.map((art) => (
            <Link
              key={art.id}
              to={`/academy/${art.slug}`}
              className="bg-zinc-900 border border-zinc-800 hover:border-sky-500/40 rounded-2xl overflow-hidden group transition flex flex-col justify-between shadow-xl"
            >
              <div>
                <div className="w-full h-40 bg-zinc-950 overflow-hidden relative">
                  {art.featured_image && (
                    <img
                      src={art.featured_image}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
                  <span className={`absolute top-3 left-3 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${getTypeBadgeClass(art.type)}`}>
                    {art.type}
                  </span>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <Clock size={11} />
                    <span>{art.read_time_minutes} min</span>
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-sky-400 transition line-clamp-2 leading-snug">
                    {art.title}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                    {art.excerpt}
                  </p>
                </div>
              </div>

              <div className="px-4 pb-4">
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-bold text-sky-400 group-hover:translate-x-1 transition">
                  <span>Leer guía</span>
                  <ArrowRight size={13} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── NIVEL C: GLOSARIO TÉCNICO (grilla compacta) ──────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
            <HelpCircle size={22} className="text-amber-400" />
            <span>Glosario Técnico</span>
          </h2>
          <span className="text-xs text-zinc-500 font-medium">Términos esenciales para comprar mejor</span>
        </div>

        {/* Terminology articles as horizontal compact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TERMINOLOGY_ARTICLES.map((art) => (
            <Link
              key={art.id}
              to={`/academy/${art.slug}`}
              className="group flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-2xl overflow-hidden transition shadow-lg"
            >
              {/* Thumb */}
              <div className="w-24 h-20 flex-shrink-0 bg-zinc-950 overflow-hidden relative">
                {art.featured_image && (
                  <img
                    src={art.featured_image}
                    alt={art.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                )}
              </div>
              {/* Text */}
              <div className="flex-1 py-3 pr-4 space-y-1">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                  {art.type}
                </span>
                <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition leading-snug line-clamp-2">
                  {art.title}
                </h3>
                <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Clock size={10} />
                  <span>{art.read_time_minutes} min</span>
                  <ArrowRight size={10} className="ml-auto text-amber-400/60 group-hover:text-amber-400 group-hover:translate-x-1 transition" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── TABLA DE ESCALAS ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
              <Layers size={22} className="text-sky-400" />
              <span>Tabla Maestra de Escalas</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Guía rápida de alturas para saber exactamente cuánto ocupará una pieza en tu vitrina.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 text-sm">Cargando tabla de escalas...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {scales.map((s, idx) => (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between hover:border-sky-500/40 transition">
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xl font-black text-white">{s.scale_key}</span>
                    <span className="text-[11px] font-mono text-sky-400 font-bold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
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
        )}
      </div>

      {/* ── DICCIONARIO INTERACTIVO ───────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2.5 text-white">
              <HelpCircle size={22} className="text-amber-400" />
              <span>Diccionario del Coleccionista</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Términos más utilizados en compras internacionales, estado de cajas y foros de coleccionismo.</p>
          </div>

          <div className="w-full sm:w-72 relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar: MISB, Chase, Loose..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredGlossary.map((g, idx) => (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-white">{g.term}</span>
                <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                  {g.category}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{g.definition}</p>
            </div>
          ))}

          {filteredGlossary.length === 0 && (
            <div className="col-span-full py-8 text-center text-zinc-500 text-sm">
              No se encontraron términos para "{searchTerm}"
            </div>
          )}
        </div>
      </div>

      {/* ── CTA BANNER ───────────────────────────────────────────────────────── */}
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
