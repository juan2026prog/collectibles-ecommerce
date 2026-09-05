import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Radio, Calendar, Bell, Filter, Sparkles, ArrowRight, ExternalLink } from 'lucide-react';
import type { ReleaseEvent } from '../../plugins/collector-radar/types';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

export default function RadarFeedPage() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  useEffect(() => {
    loadReleases();
  }, []);

  const loadReleases = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select(`
          *,
          brand:brands(id, name),
          license:licenses(id, name)
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SEO
        title="Radar del Coleccionista | Collectibles 2026"
        description="Monitoreo en tiempo real de anuncios oficiales, aperturas de pre-order y lanzamientos mundiales de figuras coleccionables."
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 animate-pulse">
              <Radio size={18} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-rose-400">Collectibles Radar</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Feed de Anuncios & Lanzamientos</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Cronología verificada de aperturas de preventa, demoras y fechas estimadas de distribución global.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/releases"
            className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 transition"
          >
            <Calendar size={15} className="text-sky-400" />
            <span>Ver Calendario Mensual</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {[
          { id: 'ALL', label: 'Todos los Anuncios' },
          { id: 'PREORDER', label: 'Pre-órdenes Activas' },
          { id: 'REVEAL', label: 'Revelados Oficiales' },
          { id: 'COMING', label: 'Próximos a Despachar' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
              activeFilter === tab.id
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:border-white/15'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed Cards */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500">Cargando radar de lanzamientos...</div>
      ) : filteredReleases.length === 0 ? (
        <div className="py-20 text-center bg-zinc-900/30 border border-white/5 rounded-2xl p-8">
          <p className="text-sm text-zinc-400">No hay lanzamientos registrados en esta sección.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReleases.map((release) => {
            const badge = getStatusBadgeConfig(release.status);
            const dateStr = formatReleaseDatePrecision(
              release.release_precision,
              release.release_date_start,
              release.date_display_text
            );

            return (
              <div
                key={release.id}
                className="bg-zinc-900/70 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition flex flex-col group shadow-lg"
              >
                {/* Image / Header */}
                <div className="relative aspect-video bg-zinc-950 flex items-center justify-center p-4 border-b border-white/5">
                  {release.official_image_url ? (
                    <img
                      src={release.official_image_url}
                      alt={release.title}
                      className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="text-center text-zinc-600">
                      <Radio size={32} className="mx-auto mb-1 opacity-50" />
                      <span className="text-[11px] font-mono">Arte Oficial Pendiente</span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                  </div>

                  {release.msrp && (
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-mono font-bold text-white">
                      MSRP USD ${release.msrp}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1">
                      {release.brand?.name && <span>{release.brand.name}</span>}
                      {release.license?.name && <span>• {release.license.name}</span>}
                    </div>

                    <Link to={`/radar/${release.slug}`}>
                      <h3 className="font-bold text-base text-white hover:text-rose-400 transition line-clamp-2">
                        {release.title}
                      </h3>
                    </Link>

                    {release.summary && (
                      <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                        {release.summary}
                      </p>
                    )}
                  </div>

                  {/* Footer Timeline & CTA */}
                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Lanzamiento Estimado</span>
                      <span className="text-xs font-bold text-zinc-200">{dateStr}</span>
                    </div>

                    <Link
                      to={`/radar/${release.slug}`}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-1.5 transition"
                    >
                      <span>Ver Ficha</span>
                      <ArrowRight size={13} />
                    </Link>
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
