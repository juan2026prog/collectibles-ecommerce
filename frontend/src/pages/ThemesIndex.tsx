import { Link } from 'react-router-dom';
import { Layers, ChevronRight } from 'lucide-react';
import { useThemes } from '../hooks/useData';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';

export default function ThemesIndex() {
  const { themes, loading } = useThemes(true); // only active with published products

  const seoTitle = generateMetaTitle('shop', 'Temáticas y Categorías Comerciales');
  const seoDesc = generateMetaDescription('shop', null, 'Explora coleccionables por temática: Anime & Manga, Cómics, Cine & TV, Videojuegos, Horror, Música y Deportes.');
  const canonicalUrl = generateCanonical('themes');

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-10">
      <SEO title={seoTitle} description={seoDesc} url={canonicalUrl} />

      {/* Header Banner */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs uppercase font-black tracking-[0.2em] text-[#f00856] bg-[#f00856]/10 px-3.5 py-1.5 rounded-full border border-[#f00856]/20 inline-flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Temáticas Comerciales
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
          Explora por Themes
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          Navega nuestro catálogo a través de los grandes universos temáticos donde conviven tus licencias y franquicias favoritas.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-[#f00856] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando temáticas...</p>
        </div>
      ) : themes.length === 0 ? (
        <div className="py-16 text-center bg-white/5 rounded-3xl border border-white/10 max-w-lg mx-auto p-8">
          <p className="text-white font-bold text-lg mb-2">No hay Themes con productos publicados actualmente.</p>
          <Link to="/shop" className="btn-primary text-xs py-2 px-4 rounded-xl">Ir al catálogo general</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {themes.map(t => (
            <Link
              key={t.id}
              to={`/themes/${t.slug}`}
              className="group relative rounded-3xl bg-[#090d18] border border-white/10 hover:border-[#f00856]/60 p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-[#f00856]/15 overflow-hidden"
            >
              {/* 16:9 Hero Image Container */}
              <div className="w-full aspect-video rounded-2xl bg-white/5 border border-white/10 overflow-hidden mb-4 relative">
                {t.image_url ? (
                  <img
                    src={t.image_url}
                    alt={t.image_alt || `Coleccionables de ${t.name}`}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#f00856]/20 to-purple-900/40 flex items-center justify-center">
                    <Layers className="w-10 h-10 text-white/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#090d18] via-transparent to-transparent opacity-60" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-white group-hover:text-[#f00856] transition-colors tracking-tight">
                  {t.name}
                </h2>
                {t.description && (
                  <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between mt-4">
                <span className="text-xs font-mono font-bold text-slate-400">
                  {t.published_product_count ?? 0} {(t.published_product_count === 1 ? 'producto' : 'productos')}
                </span>
                <span className="text-xs font-bold text-[#f00856] group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Explorar <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
