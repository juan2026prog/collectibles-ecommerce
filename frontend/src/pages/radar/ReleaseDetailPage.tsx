import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Radio, Calendar, ArrowLeft, ExternalLink, Bell, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import type { ReleaseEvent } from '../../plugins/collector-radar/types';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

export default function ReleaseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [release, setRelease] = useState<ReleaseEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertSubscribed, setAlertSubscribed] = useState(false);

  useEffect(() => {
    if (slug) loadRelease(slug);
  }, [slug]);

  const loadRelease = async (releaseSlug: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select(`
          *,
          brand:brands(id, name),
          license:licenses(id, name),
          milestones:release_milestones(*)
        `)
        .eq('slug', releaseSlug)
        .single();

      if (!error && data) {
        setRelease(data as any);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-zinc-500">Cargando ficha de lanzamiento...</div>;
  }

  if (!release) {
    return (
      <div className="py-24 text-center max-w-md mx-auto">
        <h2 className="text-lg font-bold text-white mb-2">Lanzamiento no encontrado</h2>
        <p className="text-xs text-zinc-400 mb-4">El evento solicitado no existe o fue despublicado.</p>
        <Link to="/radar" className="text-rose-400 text-xs font-bold hover:underline">
          ← Volver al Radar
        </Link>
      </div>
    );
  }

  const badge = getStatusBadgeConfig(release.status);
  const dateStr = formatReleaseDatePrecision(
    release.release_precision,
    release.release_date_start,
    release.date_display_text
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <SEO
        title={`${release.title} | Radar Collectibles 2026`}
        description={release.summary || release.description || 'Seguimiento de lanzamiento y pre-órdenes'}
      />

      {/* Back Link */}
      <Link to="/radar" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white mb-6 transition">
        <ArrowLeft size={14} />
        <span>Volver a Radar</span>
      </Link>

      {/* Top Banner */}
      <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Official Image */}
          <div className="aspect-square bg-zinc-950 rounded-xl p-4 flex items-center justify-center border border-white/5">
            {release.official_image_url ? (
              <img src={release.official_image_url} alt={release.title} className="max-h-full object-contain" />
            ) : (
              <div className="text-center text-zinc-600">
                <Radio size={48} className="mx-auto mb-2 opacity-50" />
                <span className="text-xs font-mono">Fotografía Oficial Pendiente</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider mb-3 ${badge.bg} ${badge.text} ${badge.border}`}>
                {badge.label}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{release.title}</h1>
              {release.subtitle && <p className="text-sm text-zinc-400 mt-1">{release.subtitle}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Marca / Fabricante</span>
                <span className="font-semibold text-white">{release.brand?.name || release.manufacturer || 'No informado'}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Licencia</span>
                <span className="font-semibold text-white">{release.license?.name || 'Oficial'}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">MSRP Referencial</span>
                <span className="font-mono font-bold text-emerald-400">{release.msrp ? `USD $${release.msrp}` : 'Por confirmar'}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Fecha Estimada</span>
                <span className="font-bold text-sky-400">{dateStr}</span>
              </div>
            </div>

            {/* Alert Subscribe CTA */}
            <div className="pt-3">
              <button
                onClick={() => setAlertSubscribed(!alertSubscribed)}
                className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border ${
                  alertSubscribed
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500 hover:bg-rose-600 text-white border-rose-500'
                }`}
              >
                {alertSubscribed ? <CheckCircle2 size={16} /> : <Bell size={16} />}
                <span>{alertSubscribed ? 'Alertas Activadas para este Lanzamiento' : 'Avisarme cuando abra la Pre-order'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Timeline */}
      <div className="space-y-6">
        {release.description && (
          <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Descripción Oficial</h3>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{release.description}</p>
          </div>
        )}

        {/* Source link */}
        {release.source_url && (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span>Fuente verificada:</span>
            <a href={release.source_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline inline-flex items-center gap-1">
              <span>{release.source_name || 'Sitio oficial'}</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
