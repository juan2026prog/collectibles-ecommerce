import { Link } from 'react-router-dom';
import { Layers, Film, Gamepad2, Tv, Skull, Music2, Trophy, BookOpen } from 'lucide-react';
import { useThemes } from '../hooks/useData';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';

const THEME_ICONS: Record<string, any> = {
  'anime-manga': Tv,
  'comics': BookOpen,
  'cine-tv': Film,
  'videojuegos': Gamepad2,
  'horror': Skull,
  'musica': Music2,
  'deportes': Trophy,
};

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
        <span className="text-xs uppercase font-black tracking-[0.2em] text-purple-400 bg-purple-950/60 px-3.5 py-1.5 rounded-full border border-purple-500/30 inline-flex items-center gap-1.5">
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
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando temáticas...</p>
        </div>
      ) : themes.length === 0 ? (
        <div className="py-16 text-center bg-white/5 rounded-3xl border border-white/10 max-w-lg mx-auto p-8">
          <p className="text-white font-bold text-lg mb-2">No hay Themes con productos publicados actualmente.</p>
          <Link to="/shop" className="btn-primary text-xs py-2 px-4 rounded-xl">Ir al catálogo general</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {themes.map(t => {
            const Icon = THEME_ICONS[t.slug] || Layers;
            return (
              <Link
                key={t.id}
                to={`/themes/${t.slug}`}
                className="group relative rounded-3xl bg-white/[0.03] border border-white/10 hover:border-purple-500/50 p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-500/10 overflow-hidden"
              >
                <div className="space-y-4 relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-lg">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white group-hover:text-purple-300 transition-colors tracking-tight">
                      {t.name}
                    </h2>
                    {t.description && (
                      <p className="text-slate-400 text-xs mt-2 line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 flex items-center justify-between mt-6 relative z-10">
                  <span className="text-xs font-mono font-bold text-slate-400">
                    {t.published_product_count ?? 0} {(t.published_product_count === 1 ? 'producto' : 'productos')}
                  </span>
                  <span className="text-xs font-bold text-purple-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Ver colección →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
