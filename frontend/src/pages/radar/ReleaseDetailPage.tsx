import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Radio, Calendar, ArrowLeft, ExternalLink, Bell, ShieldCheck, 
  Clock, CheckCircle2, ShoppingBag, ArrowRight, Tag, Scale, Sparkles 
} from 'lucide-react';
import type { ReleaseEvent } from '../../plugins/collector-radar/types';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../../plugins/collector-radar/core/releaseEngine';
import SEO from '../../components/SEO';

export default function ReleaseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [release, setRelease] = useState<ReleaseEvent | null>(null);
  const [linkedProduct, setLinkedProduct] = useState<{ id: string; title: string; slug: string; base_price?: number } | null>(null);
  const [matchingProducts, setMatchingProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertSubscribed, setAlertSubscribed] = useState(false);
  const [imgError, setImgError] = useState(false);

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
        .maybeSingle();

      if (!error && data) {
        setRelease(data as any);

        // Track RADAR_OPEN signal & DemandSignalEngine RADAR_CLICK
        import('../../services/sourcing/personalizationEngine').then(({ recordSignal }) => {
          recordSignal({
            eventType: 'RADAR_OPEN',
            entities: {
              license: data.license?.name,
              brand: data.brand?.name || data.manufacturer,
              character: data.character,
              line: data.product_line
            }
          });
        }).catch(() => {});

        import('../../services/sourcing/demandSignalEngine').then(({ captureDemandSignal }) => {
          captureDemandSignal({
            signal_type: 'RADAR_CLICK',
            interpreted_query: {
              brand: data.brand?.name || data.manufacturer,
              franchise: data.license?.name,
              license: data.license?.name,
              line: data.product_line,
              character: data.character
            },
            source: 'radar'
          }).then(sig => {
            import('../../services/sourcing/catalogGapEngine').then(({ processSignalIntoCatalogGap }) => {
              processSignalIntoCatalogGap(sig);
            });
          });
        }).catch(() => {});

        // Fetch matching catalog products for this Radar release
        const term = data.license?.name || data.character || data.brand?.name || data.product_line;
        if (term) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, title, slug, base_price, category_id, brand:brands(name)')
            .ilike('title', `%${term}%`)
            .limit(6);

          if (prods && prods.length > 0) {
            import('../../services/sourcing/personalizationEngine').then(({ rankProducts }) => {
              rankProducts(prods, { surface: 'RADAR' }).then(ranked => {
                setMatchingProducts(ranked);
              });
            }).catch(() => {
              setMatchingProducts(prods.map(p => ({ product: p, reasons: [] })));
            });
          }
        }

        // Si tiene catalog_product_id, consultar el producto en tienda
        if (data.catalog_product_id) {
          const { data: prod } = await supabase
            .from('products')
            .select('id, title, slug, base_price')
            .eq('id', data.catalog_product_id)
            .maybeSingle();
          if (prod) {
            setLinkedProduct(prod);
          }
        }
      }
    } catch (err) {
      console.error('Error loading release detail:', err);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-xs font-mono text-zinc-500">Cargando ficha de lanzamiento...</p>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="py-24 text-center max-w-md mx-auto">
        <Radio size={40} className="mx-auto mb-3 text-zinc-600" />
        <h2 className="text-lg font-bold text-white mb-2">Lanzamiento no encontrado</h2>
        <p className="text-xs text-zinc-400 mb-4">El evento solicitado no existe o fue despublicado.</p>
        <Link to="/radar" className="inline-flex items-center gap-1.5 text-rose-400 text-xs font-bold hover:underline">
          <ArrowLeft size={14} />
          <span>Volver al Radar</span>
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
  const brandName = release.brand?.name || release.manufacturer || 'Fabricante Oficial';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <SEO
        title={`${release.title} | Radar Collectibles`}
        description={release.summary || release.description || 'Seguimiento oficial de lanzamiento, especificaciones y pre-órdenes'}
        url={`https://collectibles.uy/radar/${slug}`}
      />

      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link to="/radar" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition">
          <ArrowLeft size={14} />
          <span>Volver a Radar</span>
        </Link>

        {release.source_url && (
          <a
            href={release.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Fuente: {release.source_name || 'Sitio Oficial'}</span>
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Top Main Banner */}
      <div className="bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Image Block */}
          <div className="aspect-square bg-zinc-900 rounded-2xl p-4 flex items-center justify-center border border-white/5 overflow-hidden">
            {release.official_image_url && !imgError ? (
              <img
                src={release.official_image_url}
                alt={release.title}
                className="max-h-full max-w-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="text-center p-6 text-zinc-500">
                <Radio size={48} className="mx-auto mb-3 opacity-40 text-red-500" />
                <p className="text-xs font-black uppercase text-white mb-1">{brandName}</p>
                <span className="text-[11px] font-mono opacity-60">Imagen aún no disponible</span>
              </div>
            )}
          </div>

          {/* Info Details */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                  {badge.label}
                </span>
                {release.confidence_score && (
                  <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    Confianza: {release.confidence_score}%
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{release.title}</h1>
              {release.subtitle && <p className="text-sm text-zinc-400 mt-1.5">{release.subtitle}</p>}
            </div>

            {/* Spec Matrix */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-2xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Fabricante</span>
                <span className="font-bold text-white mt-0.5 block">{brandName}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-2xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Línea / Escala</span>
                <span className="font-bold text-white mt-0.5 block">{release.product_line || 'Línea Regular'} {release.scale ? `· ${release.scale}` : ''}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-2xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">MSRP Referencial</span>
                <span className="font-mono font-bold text-emerald-400 mt-0.5 block">{release.msrp ? `USD $${release.msrp}` : 'Por confirmar'}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-2xl">
                <span className="text-zinc-500 uppercase font-bold text-[10px] block">Fecha Estimada</span>
                <span className="font-bold text-sky-400 mt-0.5 block">{dateStr}</span>
              </div>
            </div>

            {/* Store Connection CTA */}
            {linkedProduct ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    Disponible en Collectibles Uruguay
                  </span>
                  <p className="text-xs font-bold text-white mt-0.5">En stock o preventa local asegurada</p>
                </div>
                <Link
                  to={`/producto/${linkedProduct.slug}`}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition shadow"
                >
                  <span>Ver Producto</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              /* Alert CTA */
              <button
                onClick={() => setAlertSubscribed(!alertSubscribed)}
                className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer border ${
                  alertSubscribed
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-red-500 hover:bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/20'
                }`}
              >
                {alertSubscribed ? <CheckCircle2 size={16} /> : <Bell size={16} />}
                <span>{alertSubscribed ? 'Alertas Activadas para este Lanzamiento' : 'Avisarme cuando haya novedades'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Editorial Why In Radar */}
      {release.radar_why && (
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-400 mb-2">
            <Sparkles size={15} />
            <span>Por qué está en Radar</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{release.radar_why}</p>
        </div>
      )}

      {/* Description */}
      {release.description && (
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Descripción Oficial del Producto</h3>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{release.description}</p>
        </div>
      )}

      {/* SOURCING INTELLIGENCE — VER PRODUCTOS VINCULADOS */}
      {matchingProducts.length > 0 && (
        <div className="bg-zinc-900/80 border border-[#f00856]/30 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#f00856] flex items-center gap-1.5 mb-1">
                <Sparkles size={14} /> Sourcing Intelligence · Personalizado
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">PRODUCTOS EN CATÁLOGO DE ESTE EVENTO</h3>
            </div>
            <Link
              to={`/shop?q=${encodeURIComponent(release.license?.name || release.character || release.brand?.name || '')}`}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-[#f00856] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1 transition"
            >
              <span>Ver Todos</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {matchingProducts.map(({ product, reasons }) => (
              <div key={product.id} className="bg-zinc-950 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-[#f00856]/40 transition">
                <div>
                  {reasons && reasons.length > 0 && (
                    <span className="text-[9px] font-bold text-[#f00856] bg-[#f00856]/10 px-2 py-0.5 rounded-full inline-block mb-2">
                      {reasons[0].label}
                    </span>
                  )}
                  <h4 className="text-sm font-black text-white line-clamp-2">{product.title}</h4>
                  <p className="text-xs font-mono font-bold text-emerald-400 mt-1">
                    USD ${product.base_price || 0}
                  </p>
                </div>
                <Link
                  to={`/producto/${product.slug}`}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-[#f00856] text-white text-xs font-black uppercase tracking-wider text-center transition block"
                >
                  VER PRODUCTO
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

