import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, Award, ChevronRight } from 'lucide-react';
import { useLicenses } from '../hooks/useData';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';
import { getResponsiveMediaProps } from '../utils/responsiveMedia';

const ALPHABET = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function LicensesIndex() {
  const [search, setSearch] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const { licenses, loading } = useLicenses(true); // only active with published_product_count > 0

  const filtered = useMemo(() => {
    let result = licenses;
    if (search.trim()) {
      const term = search.toLowerCase().trim();
      result = result.filter(l => l.name.toLowerCase().includes(term) || l.slug.toLowerCase().includes(term));
    }
    if (selectedLetter) {
      result = result.filter(l => {
        const firstLetter = l.name.trim().charAt(0).toUpperCase();
        if (selectedLetter === '#') return !/[A-Z]/.test(firstLetter);
        return firstLetter === selectedLetter;
      });
    }
    return result;
  }, [licenses, search, selectedLetter]);

  const featuredLicenses = useMemo(() => {
    return licenses.filter(l => l.is_featured);
  }, [licenses]);

  // Group alphabetical
  const groupedByLetter = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach(l => {
      const firstLetter = l.name.trim().charAt(0).toUpperCase();
      const letterKey = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
      const existing = map.get(letterKey) || [];
      existing.push(l);
      map.set(letterKey, existing);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map(letter => ({
      letter,
      items: map.get(letter) || []
    }));
  }, [filtered]);

  const seoTitle = generateMetaTitle('shop', 'Licencias y Franquicias');
  const seoDesc = generateMetaDescription('shop', null, 'Explora nuestra colección oficial por licencia: Star Wars, Marvel, Dragon Ball, Pokémon, Disney y más.');
  const canonicalUrl = generateCanonical('licencias');

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8 md:py-12">
      <SEO title={seoTitle} description={seoDesc} url={canonicalUrl} />

      {/* Header Banner */}
      <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
        <span className="text-xs uppercase font-black tracking-[0.2em] text-[#f00856] bg-[#f00856]/10 px-3.5 py-1.5 rounded-full border border-[#f00856]/20 inline-flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" /> Franquicias Oficiales
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
          Catálogo por Licencias
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          Encuentra tus figuras, estatuas y coleccionables oficiales organizados por tu propiedad intelectual o franquicia favorita.
        </p>

        {/* Live Search Bar */}
        <div className="pt-4 max-w-md mx-auto relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedLetter(null); }}
            placeholder="Buscar franquicia (ej: Star Wars, Marvel, Goku)..."
            className="w-full bg-white/5 border border-white/15 rounded-full pl-11 pr-5 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-[#f00856] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando licencias...</p>
        </div>
      ) : licenses.length === 0 ? (
        <div className="py-16 text-center bg-white/5 rounded-3xl border border-white/10 max-w-lg mx-auto p-8">
          <p className="text-white font-bold text-lg mb-2">No se encontraron licencias activas actualmente.</p>
          <Link to="/shop" className="btn-primary text-xs py-2 px-4 rounded-xl">Ir al catálogo</Link>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Featured Licenses (4 columns on Desktop) */}
          {!search && !selectedLetter && featuredLicenses.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-wider">Licencias Destacadas</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {featuredLicenses.map(l => (
                  <Link
                    key={l.id}
                    to={`/licencias/${l.slug}`}
                    className="group bg-[#090d18] border border-white/10 hover:border-[#f00856]/60 rounded-2xl p-6 flex flex-col items-center justify-between text-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-[#f00856]/15 relative overflow-hidden"
                  >
                    {/* Hero Logo Container */}
                    <div className="w-full h-24 bg-white/[0.03] rounded-xl p-3 mb-4 flex items-center justify-center border border-white/5 group-hover:border-[#f00856]/30 transition-colors">
                      {l.logo_url ? (
                        (() => {
                          const media = getResponsiveMediaProps(l.logo_url, 'license', l.logo_alt || `Logo de ${l.name}`);
                          return (
                            <img
                              src={media.src}
                              srcSet={media.srcSet}
                              sizes={media.sizes}
                              alt={media.alt}
                              width={media.width}
                              height={media.height}
                              loading="lazy"
                              className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          );
                        })()
                      ) : (
                        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-black text-slate-300 tracking-wider uppercase">
                          {l.name}
                        </div>
                      )}
                    </div>

                    <div className="w-full space-y-1">
                      <h3 className="font-black text-white text-base group-hover:text-[#f00856] transition-colors truncate">
                        {l.name}
                      </h3>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400 font-mono">
                        <span>
                          {l.published_product_count ?? 0} {l.published_product_count === 1 ? 'producto' : 'productos'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#f00856] group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Alphabetical Index Selector Bar */}
          <section className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <h2 className="text-xl font-black text-white uppercase tracking-wider">
                Todas las Licencias
              </h2>

              {/* Letter selector pills */}
              <div className="flex flex-wrap gap-1 items-center max-w-full overflow-x-auto no-scrollbar py-1">
                <button
                  onClick={() => setSelectedLetter(null)}
                  className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all ${
                    selectedLetter === null
                      ? 'bg-[#f00856] text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  TODAS
                </button>
                {ALPHABET.map(letter => (
                  <button
                    key={letter}
                    onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
                    className={`w-7 h-7 text-xs font-black rounded-lg transition-all flex items-center justify-center ${
                      selectedLetter === letter
                        ? 'bg-[#f00856] text-white shadow-md shadow-[#f00856]/40'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center bg-white/5 rounded-2xl border border-white/10 p-6">
                <p className="text-white font-bold text-sm">No hay licencias para el filtro seleccionado.</p>
                <button onClick={() => { setSearch(''); setSelectedLetter(null); }} className="mt-3 text-xs text-[#f00856] hover:underline font-bold">
                  Ver todas las licencias
                </button>
              </div>
            ) : (
              groupedByLetter.map(group => (
                <div key={group.letter} className="space-y-4">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#f00856] text-white font-black text-sm shadow-md shadow-[#f00856]/30">
                    {group.letter}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {group.items.map(l => (
                      <Link
                        key={l.id}
                        to={`/licencias/${l.slug}`}
                        className="group bg-white/[0.03] border border-white/10 hover:border-[#f00856]/40 hover:bg-white/[0.06] rounded-xl p-3 flex items-center gap-3 transition-all"
                      >
                        <div className="w-10 h-8 rounded-lg bg-white/5 p-1 shrink-0 flex items-center justify-center border border-white/5 overflow-hidden">
                          {l.logo_url ? (
                            <img src={l.logo_url} alt={l.logo_alt || l.name} loading="lazy" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[8px] font-black text-slate-400 uppercase truncate">
                              {l.name.substring(0, 3)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-white text-xs truncate group-hover:text-[#f00856] transition-colors">{l.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            [{l.published_product_count ?? 0}]
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
