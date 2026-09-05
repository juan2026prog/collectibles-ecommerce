import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Calendar, List, Clock, ChevronLeft, ChevronRight, ArrowRight, Radio } from 'lucide-react';
import type { ReleaseEvent } from '../../plugins/collector-radar/types';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

export default function ReleaseCalendarPage() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');

  useEffect(() => {
    loadCalendar();
  }, []);

  const loadCalendar = async () => {
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
        .order('release_date_start', { ascending: true });

      if (!error && data) {
        setReleases(data as any);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SEO
        title="Calendario de Lanzamientos 2026 / 2027 | Collectibles"
        description="Cronograma mensual de lanzamientos de figuras de colección, preórdenes y despachos."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={18} className="text-sky-400" />
            <span className="text-xs font-black uppercase tracking-widest text-sky-400">Release Calendar</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Calendario de Lanzamientos</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Programación de entregas por trimestre, mes y fecha estimada para coleccionistas.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-xl p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'list' ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <List size={14} />
            <span>Lista / Agenda</span>
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'calendar' ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Calendar size={14} />
            <span>Calendario</span>
          </button>
        </div>
      </div>

      {/* Releases List / Timeline */}
      {loading ? (
        <div className="py-24 text-center text-zinc-500">Cargando calendario de lanzamientos...</div>
      ) : releases.length === 0 ? (
        <div className="py-24 text-center text-zinc-400">No hay lanzamientos agendados.</div>
      ) : (
        <div className="space-y-4">
          {releases.map((release) => {
            const badge = getStatusBadgeConfig(release.status);
            const dateStr = formatReleaseDatePrecision(
              release.release_precision,
              release.release_date_start,
              release.date_display_text
            );

            return (
              <div
                key={release.id}
                className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-white/20 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-zinc-950 border border-white/5 p-2 flex items-center justify-center flex-shrink-0">
                    {release.official_image_url ? (
                      <img src={release.official_image_url} alt={release.title} className="max-h-full object-contain" />
                    ) : (
                      <Radio size={20} className="text-zinc-600" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${badge.bg} ${badge.text} ${badge.border}`}>
                        {badge.label}
                      </span>
                      {release.brand?.name && <span className="text-[11px] text-zinc-400">{release.brand.name}</span>}
                    </div>
                    <h3 className="font-bold text-sm sm:text-base text-white hover:text-sky-400 transition">
                      <Link to={`/radar/${release.slug}`}>{release.title}</Link>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{release.subtitle || release.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Fecha Estimada</span>
                    <span className="text-xs font-mono font-bold text-sky-400">{dateStr}</span>
                  </div>

                  <Link
                    to={`/radar/${release.slug}`}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition flex items-center gap-1.5"
                  >
                    <span>Detalles</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
