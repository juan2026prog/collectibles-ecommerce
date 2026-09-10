import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Radio, Calendar, ArrowRight, Sparkles, Filter, 
  ShoppingBag, CheckCircle2, ShieldCheck, Tag, ExternalLink,
  Flame, Clock, ChevronRight, Eye
} from 'lucide-react';
import type { ReleaseEvent, RadarSignal, ReleaseStatus } from '../../plugins/collector-radar/types';
import { getRadarSignalConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

// ---------------------------------------------------------------------------
// Badge de señal editorial
// ---------------------------------------------------------------------------

function RadarSignalBadge({ signal }: { signal: RadarSignal | null | undefined }) {
  const cfg = getRadarSignalConfig(signal);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border backdrop-blur-md ${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.ring ?? ''}`}
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
// Placeholder Elegante Oficial de Collectibles
// ---------------------------------------------------------------------------
function CollectiblesImagePlaceholder({ title, brand }: { title?: string; brand?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-3 text-red-500 shadow-inner">
        <Radio size={24} className="animate-pulse" />
      </div>
      <p className="text-xs font-black uppercase tracking-wider text-white line-clamp-1">{brand || 'Collectibles'}</p>
      <span className="text-[10px] font-mono text-zinc-500 mt-1">Fotografía oficial en validación</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta Principal (Hero)
// ---------------------------------------------------------------------------
function HeroRadarCard({ item }: { item: ReleaseEvent }) {
  const [imgError, setImgError] = useState(false);
  const brandName = item.brand?.name || item.manufacturer || 'Oficial';
  const hasStoreProduct = Boolean(item.catalog_product_id);

  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group flex flex-col h-full rounded-3xl overflow-hidden border border-white/10 hover:border-red-500/50 transition-all duration-300 shadow-2xl bg-zinc-950"
    >
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:flex-1 min-h-[280px] bg-zinc-900 overflow-hidden">
        {item.official_image_url && !imgError ? (
          <img
            src={item.official_image_url}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-700"
            onError={() => setImgError(true)}
          />
        ) : (
          <CollectiblesImagePlaceholder title={item.title} brand={brandName} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
        
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <RadarSignalBadge signal={item.radar_signal} />
          {hasStoreProduct && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md">
              <ShoppingBag size={11} />
              En Tienda
            </span>
          )}
        </div>

        {item.msrp && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-xs font-mono font-bold text-white shadow-lg">
            USD {item.msrp}
          </div>
        )}
      </div>

      <div className="p-6 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-5 bg-zinc-950 border-t border-white/5">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
            <span>{brandName}</span>
            {item.product_line && <span>· {item.product_line}</span>}
            {item.scale && <span className="text-red-400">· {item.scale}</span>}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight group-hover:text-red-300 transition line-clamp-2">
            {item.title}
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">
            {item.radar_why || item.summary || item.description}
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs text-zinc-400">
            {item.date_display_text && (
              <span className="font-mono text-sky-400 font-bold flex items-center gap-1">
                <Calendar size={13} />
                {item.date_display_text}
              </span>
            )}
            {item.source_name && (
              <span className="text-zinc-500 flex items-center gap-1">
                <ShieldCheck size={13} className="text-emerald-500" />
                {item.source_name}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <span className="px-5 py-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 font-black text-xs tracking-wider uppercase flex items-center gap-2 group-hover:bg-red-500 group-hover:text-white transition-all shadow-lg">
            <span>Ver Ficha Radar</span>
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta Secundaria (Medium)
// ---------------------------------------------------------------------------
function MediumRadarCard({ item }: { item: ReleaseEvent }) {
  const [imgError, setImgError] = useState(false);
  const brandName = item.brand?.name || item.manufacturer || 'Oficial';
  const hasStoreProduct = Boolean(item.catalog_product_id);

  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group flex flex-col sm:flex-row flex-1 rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all duration-300 shadow-xl bg-zinc-950"
    >
      <div className="relative w-full sm:w-2/5 aspect-[16/10] sm:aspect-auto bg-zinc-900 overflow-hidden shrink-0 min-h-[160px]">
        {item.official_image_url && !imgError ? (
          <img
            src={item.official_image_url}
            alt={item.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <CollectiblesImagePlaceholder title={item.title} brand={brandName} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-zinc-950/80 to-transparent" />
        <div className="absolute top-3 left-3">
          <RadarSignalBadge signal={item.radar_signal} />
        </div>
      </div>

      <div className="p-5 flex flex-col justify-between gap-2.5 flex-1 min-w-0">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">
              {brandName} {item.product_line ? `· ${item.product_line}` : ''}
            </p>
            {hasStoreProduct && (
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                Tienda
              </span>
            )}
          </div>
          <h3 className="text-base font-black text-white leading-snug group-hover:text-sky-300 transition line-clamp-2">
            {item.title}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
            {item.radar_why || item.summary || item.description}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
          <span className="text-[11px] font-mono font-bold text-sky-400 truncate">
            {item.date_display_text || 'Fecha estimada'}
          </span>
          <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1 group-hover:text-white transition shrink-0">
            <span>Detalles</span>
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta Grilla (Grid Card)
// ---------------------------------------------------------------------------
function GridRadarCard({ item }: { item: ReleaseEvent }) {
  const [imgError, setImgError] = useState(false);
  const brandName = item.brand?.name || item.manufacturer || 'Oficial';
  const hasStoreProduct = Boolean(item.catalog_product_id);

  return (
    <Link
      to={`/radar/${item.slug}`}
      className="group rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 shadow-lg flex flex-col bg-zinc-900/60 hover:bg-zinc-900 h-full justify-between"
    >
      <div>
        <div className="relative w-full aspect-[16/10] bg-zinc-950 overflow-hidden">
          {item.official_image_url && !imgError ? (
            <img
              src={item.official_image_url}
              alt={item.title}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
              onError={() => setImgError(true)}
            />
          ) : (
            <CollectiblesImagePlaceholder title={item.title} brand={brandName} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          <div className="absolute top-2.5 left-2.5">
            <RadarSignalBadge signal={item.radar_signal} />
          </div>
          {hasStoreProduct && (
            <div className="absolute bottom-2.5 right-2.5 bg-emerald-500/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md shadow">
              En Catálogo
            </div>
          )}
        </div>

        <div className="p-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {brandName} {item.scale ? `· ${item.scale}` : ''}
          </p>
          <h4 className="text-sm font-black text-white leading-snug line-clamp-2 group-hover:text-zinc-200 transition">
            {item.title}
          </h4>
          <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
            {item.radar_why || item.summary || item.description}
          </p>
        </div>
      </div>

      <div className="p-4 pt-2 border-t border-white/5 flex items-center justify-between">
        <p className="text-[11px] font-mono text-zinc-400 truncate mr-2">
          {item.date_display_text || 'Próximamente'}
        </p>
        <span className="text-xs font-bold text-zinc-400 group-hover:text-white flex items-center gap-1 shrink-0 transition">
          Ver <ArrowRight size={11} />
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Página Principal
// ---------------------------------------------------------------------------
export default function RadarFeedPage() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');

  useEffect(() => {
    loadRadarReleases();
  }, []);

  const loadRadarReleases = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select(`
          *,
          brand:brands(id, name, slug),
          license:licenses(id, name, slug)
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReleases(data as any);
      }
    } catch (err) {
      console.error('Error loading releases for radar:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredReleases = useMemo(() => {
    return releases.filter(item => {
      // Filtro por Señal / Estado
      if (activeFilter !== 'ALL') {
        if (activeFilter === 'PREORDER' && item.status !== 'PREORDER_OPEN' && item.radar_signal !== 'PREVENTA_ABIERTA' && item.radar_signal !== 'PREVENTA_CERRANDO') return false;
        if (activeFilter === 'NEW' && item.radar_signal !== 'NUEVO_ANUNCIO' && item.status !== 'ANNOUNCED') return false;
        if (activeFilter === 'DEMAND' && item.radar_signal !== 'ALTA_DEMANDA' && item.radar_signal !== 'EXCLUSIVO') return false;
        if (activeFilter === 'RELEASED' && item.status !== 'RELEASED' && item.radar_signal !== 'ACABA_DE_SALIR') return false;
        if (activeFilter === 'STORE' && !item.catalog_product_id) return false;
      }

      // Filtro por Marca / Fabricante
      if (brandFilter !== 'ALL') {
        const itemBrand = (item.brand?.name || item.manufacturer || '').toLowerCase();
        if (!itemBrand.includes(brandFilter.toLowerCase())) return false;
      }

      return true;
    });
  }, [releases, activeFilter, brandFilter]);

  const heroItem = filteredReleases[0] || null;
  const mediumItems = filteredReleases.slice(1, 3);
  const secondaryItems = filteredReleases.slice(3);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    releases.forEach(r => {
      const b = r.brand?.name || r.manufacturer;
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [releases]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      <SEO
        title="Collectibles Radar — Lanzamientos Mundiales y Descubrimiento en Tiempo Real"
        description="Seguimiento en tiempo real de nuevos lanzamientos, preventas abiertas, figuras de colección y disponibilidad oficial."
        url="https://collectibles.uy/radar"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-red-400">
              Live Radar Feeds
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Collectibles Radar
          </h1>
          <p className="text-sm text-zinc-400 mt-1.5 max-w-xl">
            Descubrimiento continuo de lanzamientos reales con trazabilidad de fuentes oficiales, señales de mercado y fechas estimadas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/releases"
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition flex items-center gap-2 shadow"
          >
            <Calendar size={15} className="text-sky-400" />
            <span>Ver Calendario de Lanzamientos</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'ALL', label: 'Todos los Lanzamientos' },
            { id: 'PREORDER', label: 'Preventas' },
            { id: 'NEW', label: 'Novedades' },
            { id: 'DEMAND', label: 'Alta Demanda & Exclusivos' },
            { id: 'RELEASED', label: 'Lanzados Recientes' },
            { id: 'STORE', label: 'Disponibles en Collectibles 🇺🇾' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Brand Dropdown filter */}
        {availableBrands.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-zinc-500 font-bold uppercase">Fabricante:</span>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              aria-label="Filtrar por fabricante"
              className="bg-zinc-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-red-500"
            >
              <option value="ALL">Todas las marcas ({releases.length})</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-xs font-mono text-zinc-500">Sincronizando feed de Radar...</p>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="py-24 text-center max-w-md mx-auto bg-zinc-950 border border-white/10 rounded-3xl p-8">
          <Radio size={40} className="mx-auto mb-3 text-zinc-600" />
          <h3 className="text-base font-bold text-white mb-1">Sin lanzamientos para este filtro</h3>
          <p className="text-xs text-zinc-400 mb-4">Prueba seleccionando otro criterio o fabricante.</p>
          <button
            onClick={() => { setActiveFilter('ALL'); setBrandFilter('ALL'); }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition"
          >
            Restablecer Filtros
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Top Section: Hero + 2 Medium Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {heroItem && (
              <div className="lg:col-span-7 flex flex-col">
                <HeroRadarCard item={heroItem} />
              </div>
            )}
            
            {mediumItems.length > 0 && (
              <div className="lg:col-span-5 flex flex-col gap-6">
                {mediumItems.map((item) => (
                  <MediumRadarCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Secondary Grid Section */}
          {secondaryItems.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Flame size={16} className="text-orange-400" />
                  Más Novedades en Radar ({secondaryItems.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {secondaryItems.map((item) => (
                  <GridRadarCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
