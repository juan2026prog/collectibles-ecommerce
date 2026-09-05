import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Radio, Calendar, ArrowRight } from 'lucide-react';
import type { ReleaseEvent, RadarSignal } from '../../plugins/collector-radar/types';
import { getRadarSignalConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

// ---------------------------------------------------------------------------
// Datos estáticos — 7 items verificados al 5-SEP-2026
// ---------------------------------------------------------------------------

interface RadarItem {
  id: string;
  slug: string;
  title: string;
  brand: string;
  line: string;
  radar_signal: RadarSignal;
  radar_why: string;
  radar_context: string;
  cta_label: string;
  official_image_url: string;
  category: string;
  date_label: string;
  msrp?: string;
}

const STATIC_RADAR_ITEMS: RadarItem[] = [
  {
    id: 'sentinel-marvel-vs-capcom',
    slug: 'sentinel-marvel-vs-capcom',
    title: "Marvel's Sentinel — Marvel vs. Capcom",
    brand: 'Hasbro',
    line: 'Marvel Legends',
    radar_signal: 'PREVENTA_CERRANDO',
    radar_why:
      'Una de las piezas Marvel Legends más llamativas del momento — y la ventana de preventa cierra en días.',
    radar_context: '28 cm · Preventa hasta 7 SEP · Marvel',
    cta_label: 'Ver por qué está en Radar',
    official_image_url:
      'https://hasbropulse.com/cdn/shop/files/G40975L00_main.jpg',
    category: 'Marvel',
    date_label: 'Preventa hasta 7 SEP',
  },
  {
    id: 'lego-star-trek-enterprise-bridge',
    slug: 'lego-star-trek-enterprise-bridge',
    title: 'Star Trek: U.S.S. Enterprise NCC-1701 Bridge',
    brand: 'LEGO',
    line: 'Icons',
    radar_signal: 'ACABA_DE_SALIR',
    radar_why:
      'Franquicia histórica + 60° aniversario + lanzamiento grande dirigido a coleccionistas adultos.',
    radar_context: '1.701 piezas · Disponible desde 1 SEP · Star Trek',
    cta_label: 'Explorar lanzamiento',
    official_image_url:
      'https://www.lego.com/cdn/cs/set/assets/blt9a42f7c0dd50f5a6/76390.jpg',
    category: 'LEGO · Star Trek',
    date_label: 'Lanzado 1 SEP',
    msrp: 'USD 199,99',
  },
  {
    id: 'shmonsterarts-godzilla-poster-coloring',
    slug: 'shmonsterarts-godzilla-poster-coloring-ver',
    title: 'Godzilla — Godzilla vs. Mechagodzilla II Poster Coloring Ver.',
    brand: 'Bandai Spirits',
    line: 'S.H.MonsterArts',
    radar_signal: 'NUEVO_ANUNCIO',
    radar_why:
      'Nueva interpretación de Godzilla basada en el arte promocional de la película — acaba de aparecer en el mercado.',
    radar_context: 'Preventa desde 3 SEP · Lanzamiento FEB 2027 · Godzilla',
    cta_label: 'Ver novedad',
    official_image_url:
      'https://tamashiinations.com/na/asset/product/2024/10/BDMK-66009_main.jpg',
    category: 'Godzilla',
    date_label: 'Feb 2027',
  },
  {
    id: 'shfiguarts-vegeta-z-fighters',
    slug: 'shfiguarts-vegeta-z-fighters',
    title: 'Vegeta — Z-Fighters',
    brand: 'Bandai Spirits',
    line: 'S.H.Figuarts',
    radar_signal: 'PREVENTA_ABIERTA',
    radar_why:
      'Bandai abrió en tanda simultánea Trunks, Vegeta, Naruto y múltiples reediciones — movimiento de línea, no producto aislado.',
    radar_context: 'Preventa desde 1 SEP · ABR 2027 · Dragon Ball',
    cta_label: 'Seguir en Radar',
    official_image_url:
      'https://tamashiinations.com/na/asset/product/2024/09/BDMK-67001_main.jpg',
    category: 'Dragon Ball',
    date_label: 'Abr 2027',
  },
  {
    id: 'motu-king-hiss-chronicles',
    slug: 'motu-chronicles-king-hiss',
    title: 'Masters of the Universe Chronicles — King Hiss',
    brand: 'Mattel',
    line: 'Mattel Creations',
    radar_signal: 'EXCLUSIVO',
    radar_why:
      'Exclusivo de Mattel Creations con límite de 3 unidades por cliente, transformación serpiente y 30 puntos de articulación.',
    radar_context: 'Creations Exclusive · 6,5" · MOTU · Envío SEP 2026',
    cta_label: 'Ver exclusiva',
    official_image_url:
      'https://cdn.creations.mattel.com/images/mattel-creations/products/2024/king-hiss-main.jpg',
    category: 'MOTU',
    date_label: 'Envío SEP 2026',
  },
  {
    id: 'transformers-haslab-liokaiser',
    slug: 'transformers-legacy-haslab-liokaiser',
    title: 'Transformers Legacy HasLab — Liokaiser Combiner',
    brand: 'Hasbro',
    line: 'HasLab',
    radar_signal: 'ALTA_DEMANDA',
    radar_why:
      '23.553 backers sobre una meta de 10.000 — la campaña más exitosa de la tanda. Las entregas arrancan ahora.',
    radar_context: '23.553 backers · Meta: 10.000 · Entrega SEP 2026',
    cta_label: 'Ver fenómeno',
    official_image_url:
      'https://hasbropulse.com/cdn/shop/files/haslab-liokaiser-main.jpg',
    category: 'Transformers · HasLab',
    date_label: 'Entrega SEP 2026',
  },
  {
    id: 'hot-toys-stitch-lilo',
    slug: 'hot-toys-stitch-lilo-stitch',
    title: 'Stitch — Lilo & Stitch',
    brand: 'Hot Toys',
    line: 'Movie Masterpiece Series',
    radar_signal: 'AGOTADO',
    radar_why:
      'La versión hiperrealista de Stitch llegó al mercado después de meses de expectativa — y ya aparece sin disponibilidad.',
    radar_context: '39 cm · USD 215 · Disney · Difícil de conseguir',
    cta_label: 'Ver en Radar',
    official_image_url:
      'https://www.sideshowtoy.com/wp-content/uploads/2024/05/LMS016-stitch-hot-toys-main.jpg',
    category: 'Disney',
    date_label: 'Disponibilidad limitada',
    msrp: 'USD 215',
  },
];

// ---------------------------------------------------------------------------
// Badge de señal editorial
// ---------------------------------------------------------------------------

function RadarSignalBadge({ signal }: { signal: RadarSignal | null | undefined }) {
  const cfg = getRadarSignalConfig(signal);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.ring ?? ''}`}
    >
      {cfg.pulse ? (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      ) : (
        <span className="text-[11px] leading-none">{cfg.icon}</span>
      )}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hero Card — 2 columnas en desktop
// ---------------------------------------------------------------------------

function HeroRadarCard({ item }: { item: RadarItem }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group col-span-1 md:col-span-2 rounded-2xl overflow-hidden border border-white/10 hover:border-red-500/40 transition-all duration-300 shadow-2xl flex flex-col bg-zinc-950"
    >
      {/* Image */}
      <div className="relative w-full aspect-[16/9] md:aspect-[21/9] bg-zinc-900 overflow-hidden">
        {!imgError ? (
          <img
            src={item.official_image_url}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700">
            <Radio size={48} className="opacity-30 mb-2" />
            <span className="text-xs font-mono opacity-40">Imagen oficial pendiente</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
        <div className="absolute top-4 left-4">
          <RadarSignalBadge signal={item.radar_signal} />
        </div>
        {item.msrp && (
          <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-mono font-bold text-white">
            {item.msrp}
          </div>
        )}
      </div>
      {/* Body */}
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
            {item.brand} · {item.line}
          </p>
          <h2 className="text-lg sm:text-xl font-black text-white leading-snug group-hover:text-red-300 transition line-clamp-2">
            {item.title}
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">{item.radar_why}</p>
          <p className="text-[11px] text-zinc-500">{item.radar_context}</p>
        </div>
        <div className="shrink-0">
          <span className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 font-bold text-xs flex items-center gap-1.5 group-hover:bg-red-500/20 transition">
            {item.cta_label}
            <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Medium Card — columna individual
// ---------------------------------------------------------------------------

function MediumRadarCard({ item }: { item: RadarItem }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all duration-300 shadow-xl flex flex-col bg-zinc-950"
    >
      <div className="relative w-full aspect-[4/3] bg-zinc-900 overflow-hidden">
        {!imgError ? (
          <img
            src={item.official_image_url}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <Radio size={32} className="opacity-30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
        <div className="absolute top-3 left-3">
          <RadarSignalBadge signal={item.radar_signal} />
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1 justify-between">
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
            {item.brand} · {item.line}
          </p>
          <h3 className="text-sm font-black text-white leading-snug group-hover:text-white/80 transition line-clamp-2">
            {item.title}
          </h3>
          <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
            {item.radar_why}
          </p>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-[10px] text-zinc-500">{item.date_label}</span>
          <span className="text-[10px] font-bold text-zinc-300 flex items-center gap-1 group-hover:text-white transition">
            {item.cta_label} <ArrowRight size={10} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Secondary Card — grilla de 4
// ---------------------------------------------------------------------------

function SecondaryRadarCard({ item }: { item: RadarItem }) {
  const [imgError, setImgError] = useState(false);
  const cfg = getRadarSignalConfig(item.radar_signal);
  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg flex flex-col bg-zinc-900/60 hover:bg-zinc-900"
    >
      <div className="relative w-full aspect-[3/2] bg-zinc-950 overflow-hidden">
        {!imgError ? (
          <img
            src={item.official_image_url}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <Radio size={24} className="opacity-30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
        <div className="absolute top-2.5 left-2.5">
          <RadarSignalBadge signal={item.radar_signal} />
        </div>
      </div>
      <div className="p-3.5 flex flex-col gap-2 flex-1 justify-between">
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${cfg.text}`}>
            {item.brand} · {item.line}
          </p>
          <h4 className="text-xs font-black text-white leading-snug line-clamp-2">
            {item.title}
          </h4>
          <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
            {item.radar_why}
          </p>
        </div>
        <div className="pt-2 border-t border-white/5">
          <p className="text-[10px] text-zinc-500">{item.radar_context}</p>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function RadarFeedPage() {
  const [dbItems, setDbItems] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFromSupabase();
  }, []);

  const loadFromSupabase = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select(`*, brand:brands(id, name, slug), license:licenses(id, name, slug)`)
        .eq('is_published', true)
        .not('radar_signal', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        setDbItems(data as any);
      }
    } catch {
      // fallback a datos estáticos
    } finally {
      setLoading(false);
    }
  };

  const toRadarItem = (r: ReleaseEvent): RadarItem => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand?.name ?? r.manufacturer ?? '',
    line: r.product_line ?? '',
    radar_signal: (r.radar_signal as RadarSignal) ?? 'MERECE_ATENCION',
    radar_why: r.radar_why ?? r.summary ?? '',
    radar_context: r.radar_context ?? r.date_display_text ?? '',
    cta_label: 'Ver en Radar',
    official_image_url: r.official_image_url ?? '',
    category: r.license?.name ?? r.brand?.name ?? '',
    date_label: r.date_display_text ?? '',
    msrp: r.msrp ? `USD ${r.msrp}` : undefined,
  });

  const useStatic = !loading && dbItems.length === 0;
  const heroItem   = useStatic ? STATIC_RADAR_ITEMS[0]       : (dbItems[0] ? toRadarItem(dbItems[0]) : null);
  const mediumItems  = useStatic ? STATIC_RADAR_ITEMS.slice(1, 3)  : dbItems.slice(1, 3).map(toRadarItem);
  const secondaryItems = useStatic ? STATIC_RADAR_ITEMS.slice(3, 7) : dbItems.slice(3, 7).map(toRadarItem);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      <SEO
        title="Collectibles Radar — Qué está pasando ahora en coleccionismo"
        description="No solo cuándo sale, sino por qué importa. Preventas cerrando, anuncios nuevos, exclusivos y alta demanda en figuras de colección."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-red-400">Ahora en el Radar</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Collectibles Radar</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-lg">
            No solo cuándo sale —{' '}
            <em>por qué hay que prestarle atención</em>.
            Preventas cerrando, anuncios nuevos, alta demanda y exclusivos.
          </p>
        </div>

        <Link
          to="/releases"
          className="self-start sm:self-center flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/20 text-xs font-bold text-zinc-300 hover:text-white transition shrink-0"
        >
          <Calendar size={14} className="text-sky-400" />
          Ver Calendario de Lanzamientos
          <ArrowRight size={12} />
        </Link>
      </div>

      {/* Radar vs Calendar pill */}
      <div className="flex gap-3 max-w-xs">
        <div className="flex-1 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-red-400">Radar</p>
          <p className="text-[11px] text-zinc-300 font-medium mt-0.5">Por qué importa</p>
        </div>
        <div className="flex-1 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">Calendar</p>
          <p className="text-[11px] text-zinc-300 font-medium mt-0.5">Cuándo sale</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-24 text-center text-zinc-500 animate-pulse font-medium">
          Sintonizando el Radar...
        </div>
      )}

      {/* Layout principal */}
      {!loading && heroItem && (
        <>
          {/* Fila 1: Hero (2 cols) + 2 medium */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <HeroRadarCard item={heroItem} />
            {mediumItems.map((item) => (
              <MediumRadarCard key={item.id} item={item} />
            ))}
          </div>

          {/* Sección 2: grilla de 4 */}
          {secondaryItems.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-px flex-1 bg-white/5" />
                <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 shrink-0">
                  Lo que merece atención ahora
                </p>
                <div className="h-px flex-1 bg-white/5" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {secondaryItems.map((item) => (
                  <SecondaryRadarCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Vocabulario de señales al pie */}
      <div className="pt-6 border-t border-white/5">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-3">
          Vocabulario de señales Radar
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              'PREVENTA_CERRANDO', 'NUEVO_ANUNCIO', 'ACABA_DE_SALIR',
              'PREVENTA_ABIERTA', 'ALTA_DEMANDA', 'EXCLUSIVO',
              'REEDICION', 'AGOTADO', 'VUELVE_A_STOCK', 'MERECE_ATENCION',
            ] as RadarSignal[]
          ).map((s) => (
            <RadarSignalBadge key={s} signal={s} />
          ))}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 text-center pb-2">
        Datos verificados al 5 de septiembre de 2026 · Fuentes: fabricantes oficiales
      </p>
    </div>
  );
}
