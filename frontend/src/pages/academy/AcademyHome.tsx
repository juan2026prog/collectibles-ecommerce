import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  GraduationCap, BookOpen, Layers, Sparkles, Search, HelpCircle, 
  ArrowRight, ShieldCheck, Clock, ShoppingBag, Star,
  LayoutGrid, List, CheckCircle2, ChevronRight, Box
} from 'lucide-react';
import SEO from '../../components/SEO';

export interface AcademyArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  type: string;
  category_key: string;
  featured_image?: string;
  read_time_minutes?: number;
  category_name?: string;
  level?: string;
}

const ALL_ACADEMY_ARTICLES: AcademyArticle[] = [
  {
    id: 'art-empezar',
    title: 'Cómo Empezar una Colección sin Comprar Todo lo que Ves',
    slug: 'como-empezar-coleccion-figuras',
    excerpt: 'Una guía práctica para definir tu colección, controlar el presupuesto y evitar compras impulsivas. El punto de partida de todo coleccionista.',
    type: 'INICIO',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-escalas-nuevo',
    title: 'Guía de Escalas en Figuras de Colección: de 1:18 a 1:4',
    slug: 'guia-escalas-figuras-coleccion',
    excerpt: 'Aprende qué significan las escalas 1:18, 1:12, 1:10, 1:6 y 1:4, cuánto mide cada figura y cuáles pueden exhibirse juntas.',
    type: 'GUÍA',
    category_key: 'scales',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Escalas & Tamaños',
    level: 'Inicial'
  },
  {
    id: 'art-accion-vs-estatuas',
    title: 'Figuras de Acción vs Estatuas: ¿Qué Tipo de Colección es para Ti?',
    slug: 'figuras-accion-vs-estatuas',
    excerpt: 'Articulación, tamaño, materiales y precio: descubre las principales diferencias antes de elegir.',
    type: 'GUÍA',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-bootleg-nuevo',
    title: 'Cómo Reconocer una Figura Original y Evitar Bootlegs',
    slug: 'como-reconocer-figura-original-bootleg',
    excerpt: 'Aprende a identificar señales comunes de falsificaciones y qué revisar antes de comprar.',
    type: 'AUTENTICIDAD',
    category_key: 'authenticity',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Autenticidad & Copias',
    level: 'Inicial'
  },
  {
    id: 'art-materiales-nuevo',
    title: 'PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados',
    slug: 'materiales-figuras-pvc-abs-resina-diecast',
    excerpt: 'Qué diferencias existen entre PVC, ABS, resina y metal die-cast y cómo afectan peso, detalle y resistencia.',
    type: 'MATERIALES',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Materiales & Conservación',
    level: 'Intermedio'
  },
  {
    id: 'art-cuidar-nuevo',
    title: 'Cómo Cuidar y Exhibir tus Figuras sin Dañarlas',
    slug: 'como-cuidar-exhibir-figuras-coleccion',
    excerpt: 'Luz, polvo, humedad y temperatura: las reglas esenciales para conservar una colección durante años.',
    type: 'CUIDADO',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Materiales & Conservación',
    level: 'Inicial'
  },
  {
    id: 'art-misb',
    title: 'MISB, MIB, Loose y otros términos del coleccionismo',
    slug: 'misb-mib-loose-glosario-coleccionismo',
    excerpt: '¿MISB? ¿MIB? ¿Loose? Aprende los términos utilizados para describir el estado de figuras y coleccionables.',
    type: 'GLOSARIO',
    category_key: 'glossary',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Glosario & Términos',
    level: 'Inicial'
  },
  {
    id: 'art-edicion-limitada',
    title: 'Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan',
    slug: 'edicion-limitada-exclusive-chase-preorder',
    excerpt: 'Aprende la diferencia entre edición limitada, exclusiva, chase, preventa y reedición antes de comprar.',
    type: 'COMPRA',
    category_key: 'glossary',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Glosario & Términos',
    level: 'Inicial'
  }
];

const DEFAULT_GLOSSARY = [
  { term: 'MISB', definition: 'Mint In Sealed Box: Pieza completamente nueva, sin abrir y con precinto de fábrica original intacto.', category: 'GRADING' },
  { term: 'MIB', definition: 'Mint In Box: La pieza está en excelentes condiciones con su caja, aunque puede haber sido abierta anteriormente.', category: 'GRADING' },
  { term: 'NIB', definition: 'New In Box: Producto nuevo dentro de su packaging. Verificar siempre si conserva sellos originales.', category: 'GRADING' },
  { term: 'Loose', definition: 'Figura fuera de su empaque original. Puede incluir todos o algunos accesorios. No implica mal estado.', category: 'GRADING' },
  { term: 'CIB', definition: 'Complete In Box: Conserva su caja y todos los accesorios principales originales. Común en videojuegos y vintage.', category: 'GRADING' },
  { term: 'Chase', definition: 'Variante más rara o limitada de una figura, distribuida aleatoriamente entre unidades estándar de una misma producción.', category: 'COMPRA' },
  { term: 'Bootleg / KO', definition: 'Copia no autorizada o falsificación sin licencia oficial del fabricante original.', category: 'AUTENTICIDAD' },
  { term: 'Pinless Joints', definition: 'Articulaciones sin remaches visibles en codos y rodillas, que brindan una estética superior y más limpia.', category: 'TÉCNICO' },
  { term: 'Diecast', definition: 'Aleación de metal fundido a presión que añade peso, estabilidad y acabados metálicos reales a partes específicas.', category: 'MATERIALES' },
  { term: 'Complete', definition: 'Pieza que conserva todos sus componentes originales: accesorios, manos, bases, manuales e inserts.', category: 'GRADING' },
  { term: 'Pre-Order', definition: 'Reserva de un producto antes de su lanzamiento. La fecha de entrega es estimada, no siempre garantizada.', category: 'COMPRA' },
  { term: 'PERS', definition: 'Parallel Eyeball Rolling System: tecnología de ojos móviles usada en figuras Hot Toys para mayor realismo facial.', category: 'TÉCNICO' }
];

const CATEGORY_TABS = [
  { key: 'all', label: 'Todas las Guías', icon: BookOpen },
  { key: 'start', label: 'Primeros Pasos', icon: GraduationCap },
  { key: 'scales', label: 'Escalas & Tamaños', icon: Layers },
  { key: 'authenticity', label: 'Autenticidad & Bootlegs', icon: ShieldCheck },
  { key: 'care', label: 'Materiales & Cuidados', icon: Box },
  { key: 'glossary', label: 'Glosario & Términos', icon: HelpCircle },
];

const TYPE_COLORS: Record<string, string> = {
  'INICIO': 'bg-sky-500 text-black',
  'GUÍA': 'bg-emerald-500 text-black',
  'AUTENTICIDAD': 'bg-red-500 text-white',
  'MATERIALES': 'bg-violet-500 text-white',
  'CUIDADO': 'bg-amber-500 text-black',
  'GLOSARIO': 'bg-zinc-600 text-white',
  'COMPRA': 'bg-orange-500 text-black',
  'GUÍAS DE COMPRA': 'bg-orange-500 text-black',
};

function getTypeBadgeClass(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-zinc-700 text-white';
}

export default function AcademyHome() {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGlossaryCategory, setSelectedGlossaryCategory] = useState<string>('TODOS');
  const [glossarySearch, setGlossarySearch] = useState<string>('');
  const [selectedScaleIndex, setSelectedScaleIndex] = useState<number>(1); // Default to 1:12
  
  const [scales, setScales] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadAcademyData();
  }, []);

  const loadAcademyData = async () => {
    try {
      setLoading(true);
      const [scaRes, gloRes] = await Promise.all([
        supabase.from('academy_scales').select('*').order('created_at', { ascending: true }),
        supabase.from('academy_glossary').select('*').eq('status', 'PUBLISHED').limit(50)
      ]);

      setScales(scaRes.data && scaRes.data.length > 0 ? scaRes.data : [
        { scale_key: '1:18', label: 'Escala 1:18 (3.75 pulgadas)', approx_height_cm: '9,5 – 10,5 cm', description: 'Escala histórica de figuras vintage (Star Wars 1977, G.I. Joe) y vehículos. Ideal para dioramas masivos y colecciones numerosas en poco espacio.' },
        { scale_key: '1:12', label: 'Escala 1:12 (Six Inch)', approx_height_cm: '15 – 18 cm', description: 'El estándar rey del coleccionismo mundial moderno: Marvel Legends, MAFEX, S.H. Figuarts, Mezco One:12. Gran detalle, articulación y fácil exhibición.' },
        { scale_key: '1:10', label: 'Escala 1:10 (7 pulgadas)', approx_height_cm: '18 – 22 cm', description: 'Muy utilizada en estatuas y líneas de NECA / McFarlane. Mayor peso y presencia escultórica con menor articulación interna.' },
        { scale_key: '1:6', label: 'Escala 1:6 (Sixth Scale / 12")', approx_height_cm: '28 – 32 cm', description: 'Alta gama hiperrealista con trajes de tela real cosidos a mano, cabezas pintadas con ojos móviles (PERS) y metal Die-cast (Hot Toys, Sideshow, InArt).' },
        { scale_key: '1:4', label: 'Escala 1:4 (Quarter Scale)', approx_height_cm: '45 – 55 cm', description: 'Grandes piezas centrales de museo y estatuas de resina premium. Requieren vitrinas reforzadas y espacio exclusivo dedicado.' },
        { scale_key: '1:1', label: 'Escala 1:1 (Life-Size / Busto)', approx_height_cm: '160 – 190 cm (Bustos: 60 – 90 cm)', description: 'Réplicas exactas a tamaño real 1:1 con ojos protésicos de vidrio, pelo de silicona insertado y nivel de detalle cinematográfico de museo.' },
      ]);

      setGlossary(gloRes.data && gloRes.data.length > 0 ? gloRes.data : DEFAULT_GLOSSARY);
    } catch (err) {
      console.error(err);
      setGlossary(DEFAULT_GLOSSARY);
    } finally {
      setLoading(false);
    }
  };

  // Filtrado de artículos según tab y buscador
  const filteredArticles = useMemo(() => {
    return ALL_ACADEMY_ARTICLES.filter(art => {
      const matchesTab = activeTab === 'all' || art.category_key === activeTab;
      const matchesQuery = searchQuery.trim() === '' || 
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.category_name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesQuery;
    });
  }, [activeTab, searchQuery]);

  // Categorías de glosario únicas
  const glossaryCategories = useMemo(() => {
    const cats = Array.from(new Set(glossary.map(g => g.category || 'GENERAL')));
    return ['TODOS', ...cats];
  }, [glossary]);

  // Filtrado de glosario
  const filteredGlossary = useMemo(() => {
    return glossary.filter(g => {
      const matchesCategory = selectedGlossaryCategory === 'TODOS' || g.category === selectedGlossaryCategory;
      const matchesSearch = glossarySearch.trim() === '' ||
        g.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
        g.definition.toLowerCase().includes(glossarySearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [glossary, selectedGlossaryCategory, glossarySearch]);

  const activeScale = scales[selectedScaleIndex] || scales[0];

  return (
    <div className="min-h-screen bg-[#0a0c0e] text-white py-8 px-4 sm:px-6 lg:px-8 space-y-12">
      <SEO
        title="Collector Academy | Enciclopedia & Guías del Coleccionista"
        description="Aprende sobre escalas (1:18 a 1:1 Life-Size), autenticidad de figuras, materiales PVC/resina/die-cast, cómo empezar tu colección, glosario MISB/MIB/Loose y mucho más."
      />

      {/* ── 1. HEADER HERO COMPACTO ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800/80 p-6 sm:p-10 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
                <GraduationCap size={15} />
                <span>Collector Academy • Base de Conocimiento Editorial</span>
              </div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                Aprende, compara y colecciona como un experto
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                Guías técnicas independientes sobre escalas, autenticidad, cuidado de piezas y terminología internacional de figuras de colección.
              </p>
              
              {/* Quick stats badges */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <BookOpen size={13} className="text-emerald-400" /> 8 Guías completas
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <Layers size={13} className="text-sky-400" /> 6 Escalas analizadas
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <HelpCircle size={13} className="text-amber-400" /> Glosario técnico
                </span>
              </div>
            </div>

            {/* Quick Search Box */}
            <div className="w-full lg:w-80 flex-shrink-0 bg-zinc-950/80 backdrop-blur border border-zinc-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Search size={14} className="text-emerald-400" /> Buscar en la Academy
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: Escalas, Bootleg, Resina..."
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                />
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-white"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="text-[11px] text-zinc-500">
                Tip: Filtra por categoría o término para encontrar la guía precisa.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. SECCIÓN PRINCIPAL: TABS Y FEED DE ARTÍCULOS ─────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Barra de navegación de Tabs + Controles de Vista */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          
          {/* Scrollable Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {CATEGORY_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* View Switcher & Counter */}
          <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0">
            <span className="text-xs text-zinc-500 font-medium">
              {filteredArticles.length} {filteredArticles.length === 1 ? 'guía' : 'guías'}
            </span>
            
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setViewMode('grid')}
                title="Vista de cuadrícula"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid' 
                    ? 'bg-zinc-800 text-emerald-400 shadow' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="Vista de lista compacta"
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'list' 
                    ? 'bg-zinc-800 text-emerald-400 shadow' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── MODO GRID COMPACTO ── */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredArticles.map((art) => (
              <Link
                key={art.id}
                to={`/academy/${art.slug}`}
                className="group flex flex-col bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden transition duration-300 shadow-lg hover:shadow-emerald-500/5"
              >
                {/* Image header */}
                <div className="relative w-full h-44 bg-zinc-950 overflow-hidden">
                  {art.featured_image && (
                    <img
                      src={art.featured_image}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/20" />
                  
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                      {art.type}
                    </span>
                    {art.level && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/70 backdrop-blur text-zinc-300 border border-zinc-700">
                        {art.level}
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-2.5 left-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-300 bg-black/60 backdrop-blur px-2 py-0.5 rounded-md">
                    <Clock size={11} className="text-emerald-400" />
                    <span>{art.read_time_minutes} min lectura</span>
                  </div>
                </div>

                {/* Content body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      {art.category_name}
                    </div>
                    <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition leading-snug line-clamp-2">
                      {art.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {art.excerpt}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition">
                    <span>Leer guía completa</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── MODO LISTA COMPACTA EDITORIAL ── */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {filteredArticles.map((art) => (
              <Link
                key={art.id}
                to={`/academy/${art.slug}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-850 transition duration-200 shadow-md"
              >
                <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-zinc-950 overflow-hidden flex-shrink-0 relative">
                    {art.featured_image && (
                      <img
                        src={art.featured_image}
                        alt={art.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    )}
                  </div>

                  {/* Texts */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                        {art.type}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {art.category_name}
                      </span>
                      <span className="text-zinc-600 hidden sm:inline">·</span>
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <Clock size={11} className="text-emerald-400" />
                        {art.read_time_minutes} min
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition truncate">
                      {art.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed">
                      {art.excerpt}
                    </p>
                  </div>
                </div>

                {/* Arrow action */}
                <div className="flex items-center justify-end sm:justify-center flex-shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    Leer <ChevronRight size={13} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {filteredArticles.length === 0 && (
          <div className="py-12 text-center rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
            <BookOpen size={32} className="mx-auto text-zinc-600" />
            <div className="text-sm font-bold text-zinc-300">No se encontraron guías</div>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              No hay artículos que coincidan con los filtros seleccionados o el término de búsqueda "{searchQuery}".
            </p>
            <button
              onClick={() => { setActiveTab('all'); setSearchQuery(''); }}
              className="px-4 py-2 bg-emerald-500 text-black text-xs font-bold rounded-xl hover:bg-emerald-400 transition"
            >
              Restablecer filtros
            </button>
          </div>
        )}
      </div>

      {/* ── 3. VISUALIZADOR INTERACTIVO DE ESCALAS (COMPACTO) ────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2 text-white">
              <Layers size={20} className="text-sky-400" />
              <span>Comparador Interactivo de Escalas</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Selecciona una escala para ver su altura real y compatibilidad en vitrina.</p>
          </div>
          <Link 
            to="/academy/guia-escalas-figuras-coleccion"
            className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Guía completa <ArrowRight size={12} />
          </Link>
        </div>

        {/* Escalas Selector Bar + Ficha activa compacta */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Selector pills list */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
            {scales.map((s, idx) => {
              const isSelected = selectedScaleIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedScaleIndex(idx)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500/80 text-white shadow-lg'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base font-black text-white">{s.scale_key}</span>
                    <span className="text-[10px] font-mono font-bold text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10">
                      {s.approx_height_cm?.split('–')[0]?.trim()}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-300 truncate">
                    {s.label.split('(')[1]?.replace(')', '') || s.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Ficha técnica activa */}
          <div className="lg:col-span-7 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-black text-white">{activeScale?.scale_key}</span>
                  <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/30">
                    {activeScale?.label}
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-zinc-300 bg-zinc-800 px-3 py-1 rounded-lg">
                  Altura: <span className="text-emerald-400">{activeScale?.approx_height_cm}</span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                {activeScale?.description}
              </p>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Compatibilidad verificada para vitrinas estándar tipo IKEA / Detolf</span>
              </div>
              <Link
                to="/academy/guia-escalas-figuras-coleccion"
                className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                Ver comparativa visual <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. DICCIONARIO INTERACTIVO Y GLOSARIO (COMPACTO) ────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2 text-white">
              <HelpCircle size={20} className="text-amber-400" />
              <span>Diccionario Rápido del Coleccionista</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Términos esenciales para calificar estado de figuras (MISB, MIB) y compras.</p>
          </div>

          <div className="w-full sm:w-64 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={glossarySearch}
              onChange={(e) => setGlossarySearch(e.target.value)}
              placeholder="Buscar: MISB, Chase, Loose..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {glossaryCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedGlossaryCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${
                selectedGlossaryCategory === cat
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Glossary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredGlossary.map((g, idx) => (
            <div key={idx} className="bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-3.5 space-y-1.5 transition">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-white">{g.term}</span>
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                  {g.category}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {g.definition}
              </p>
            </div>
          ))}

          {filteredGlossary.length === 0 && (
            <div className="col-span-full py-6 text-center text-zinc-500 text-xs">
              No se encontraron términos para "{glossarySearch}"
            </div>
          )}
        </div>
      </div>

      {/* ── 5. CTA BANNER COMPACTO ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-5 shadow-xl">
        <div className="space-y-1.5 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-wider">
            <ShieldCheck size={15} />
            <span>Figuras 100% Originales & Garantizadas</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">¿Listo para sumar una pieza a tu colección?</h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Aplica lo aprendido y explora figuras en stock inmediato en Uruguay y preventas internacionales con franquicia de USD 200.
          </p>
        </div>
        <Link
          to="/shop"
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl transition flex items-center gap-2 shadow-lg flex-shrink-0"
        >
          <ShoppingBag size={15} />
          <span>Ver Catálogo de Tienda</span>
        </Link>
      </div>
    </div>
  );
}
