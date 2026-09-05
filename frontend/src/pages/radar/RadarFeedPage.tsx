import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Radio, Calendar, Bell, Sparkles, ArrowRight, Check, ShoppingBag, Search, Tag, ShieldCheck, Flame } from 'lucide-react';
import type { ReleaseEvent } from '../../plugins/collector-radar/types';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

export default function RadarFeedPage() {
  const { user } = useAuth();
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadReleases();
    loadSubscriptions();
  }, [user]);

  const loadSubscriptions = () => {
    try {
      const stored = localStorage.getItem('radar_subscribed_releases');
      if (stored) {
        setSubscribedIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore
    }
  };

  const toggleSubscribe = async (releaseId: string, releaseTitle: string) => {
    const next = new Set(subscribedIds);
    const isSubscribed = next.has(releaseId);

    if (isSubscribed) {
      next.delete(releaseId);
    } else {
      next.add(releaseId);
      if (user) {
        await supabase.from('release_alerts').insert({
          user_id: user.id,
          release_id: releaseId,
          alert_channel: 'push',
          created_at: new Date().toISOString()
        }).catch(() => {});
      }
    }

    setSubscribedIds(next);
    localStorage.setItem('radar_subscribed_releases', JSON.stringify(Array.from(next)));
  };

  const loadReleases = async () => {
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
      console.error('Error loading radar releases:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredReleases = releases.filter((r) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'PREORDER') return r.status === 'PREORDER_OPEN' || r.status === 'PREORDER_SOON';
    if (activeFilter === 'REVEAL') return r.status === 'ANNOUNCED' || r.status === 'REVEALED';
    if (activeFilter === 'COMING') return r.status === 'COMING_SOON' || r.status === 'SHIPPING';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-8">
      <SEO
        title="Radar del Coleccionista: Lanzamientos, Novedades & Preventas | Collectibles 2026"
        description="Monitorea en tiempo real anuncios oficiales de fabricantes mundiales, aperturas de preventa y fechas estimadas de distribución."
      />

      {/* Hero Header Explicativo */}
      <div className="bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950 border border-rose-500/20 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-widest">
              <Radio size={14} className="animate-pulse" />
              <span>Collectibles Radar & Releases</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Radar del Coleccionista: Lanzamientos & Preventas
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Monitoreamos los anuncios de las principales marcas del mundo (NECA, Hot Toys, Bandai, Hasbro, McFarlane). 
              Activa alertas instantáneas antes de que se agoten las preventas y encuentra alternativas disponibles en nuestro catálogo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/releases"
              className="px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-bold text-white flex items-center gap-2 transition shadow-lg"
            >
              <Calendar size={16} className="text-sky-400" />
              <span>Ver Calendario 2026/27</span>
            </Link>
          </div>
        </div>

        {/* 3 Pilares del Radar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 pt-6 border-t border-white/10 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Flame size={16} className="text-rose-400 shrink-0" />
            <span>1. Novedades y drops revelados en eventos mundiales.</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Bell size={16} className="text-amber-400 shrink-0" />
            <span>2. Alertas 1-clic para avisarte cuando abra el stock.</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Sparkles size={16} className="text-fuchsia-400 shrink-0" />
            <span>3. Conexión directa con figuras similares en tienda.</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'ALL', label: 'Todos los Lanzamientos' },
          { id: 'PREORDER', label: 'Preventas Abiertas' },
          { id: 'REVEAL', label: 'Revelados Recientes' },
          { id: 'COMING', label: 'Próximos a Despachar' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
              activeFilter === tab.id
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-md'
                : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed Cards Grid */}
      {loading ? (
        <div className="py-24 text-center text-zinc-500 animate-pulse font-medium">
          Sintonizando radar de lanzamientos y drops mundiales...
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="py-20 text-center bg-zinc-900/30 border border-white/5 rounded-3xl p-8">
          <p className="text-sm text-zinc-400">No hay lanzamientos registrados en esta sección.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReleases.map((release) => {
            const badge = getStatusBadgeConfig(release.status);
            const isSubscribed = subscribedIds.has(release.id);
            const dateStr = formatReleaseDatePrecision(
              release.release_precision,
              release.release_date_start,
              release.date_display_text
            );

            const hasInCatalog = !!release.catalog_product_id;
            const searchKeyword = release.brand?.name || release.license?.name || release.title.split(' ')[0];

            return (
              <div
                key={release.id}
                className="bg-zinc-900/80 border border-white/10 rounded-2xl overflow-hidden hover:border-rose-500/30 transition-all duration-300 flex flex-col group shadow-xl hover:shadow-2xl"
              >
                {/* Image Showcase */}
                <div className="relative aspect-video bg-zinc-950 flex items-center justify-center p-4 border-b border-white/5 overflow-hidden">
                  {release.official_image_url ? (
                    <img
                      src={release.official_image_url}
                      alt={release.title}
                      className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="text-center text-zinc-600">
                      <Radio size={36} className="mx-auto mb-2 opacity-40" />
                      <span className="text-[11px] font-mono">Arte Oficial Pendiente</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                  </div>

                  {release.msrp && (
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-mono font-bold text-white">
                      MSRP USD ${release.msrp}
                    </div>
                  )}
                </div>

                {/* Content Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    {/* Brand & License Tags */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
                      <div className="flex items-center gap-2 truncate">
                        {release.brand?.name && (
                          <span className="font-bold text-zinc-300">{release.brand.name}</span>
                        )}
                        {release.license?.name && (
                          <span className="text-zinc-500">• {release.license.name}</span>
                        )}
                      </div>

                      {/* 1-Click Subscribe Alert */}
                      <button
                        type="button"
                        onClick={() => toggleSubscribe(release.id, release.title)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                          isSubscribed
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-zinc-800 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-700'
                        }`}
                      >
                        {isSubscribed ? <Check size={12} className="text-emerald-400" /> : <Bell size={12} className="text-amber-400" />}
                        <span className="text-[10px]">
                          {isSubscribed ? 'Alerta Activa' : 'Avisarme'}
                        </span>
                      </button>
                    </div>

                    <Link to={`/radar/${release.slug}`}>
                      <h3 className="font-bold text-base text-white hover:text-rose-400 transition line-clamp-2 leading-snug">
                        {release.title}
                      </h3>
                    </Link>

                    {release.summary && (
                      <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                        {release.summary}
                      </p>
                    )}
                  </div>

                  {/* Commercial Intent & Cross-Sell CTAs */}
                  <div className="pt-3 border-t border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Lanzamiento Estimado:</span>
                      <span className="font-bold text-zinc-200">{dateStr}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {hasInCatalog ? (
                        <Link
                          to={`/producto/${release.slug}`}
                          className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg"
                        >
                          <ShoppingBag size={14} />
                          <span>Comprar en Tienda</span>
                        </Link>
                      ) : (
                        <Link
                          to={`/search?q=${encodeURIComponent(searchKeyword)}`}
                          className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
                        >
                          <Sparkles size={13} className="text-rose-400" />
                          <span>Buscar similares en Tienda</span>
                        </Link>
                      )}

                      <Link
                        to={`/radar/${release.slug}`}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl flex items-center justify-center transition"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
