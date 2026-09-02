import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, Award } from 'lucide-react';
import { useLicenses } from '../hooks/useData';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';

export default function LicensesIndex() {
  const [search, setSearch] = useState('');
  const { licenses, loading } = useLicenses(true); // only active with published_product_count > 0

  const filtered = useMemo(() => {
    if (!search.trim()) return licenses;
    const term = search.toLowerCase().trim();
    return licenses.filter(l => l.name.toLowerCase().includes(term) || l.slug.toLowerCase().includes(term));
  }, [licenses, search]);

  const featuredLicenses = useMemo(() => {
    return filtered.filter(l => l.is_featured);
  }, [filtered]);

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
          <Award className="w-3.5 h-3.5" /> Universos & Franquicias
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
            onChange={e => setSearch(e.target.value)}
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
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center bg-white/5 rounded-3xl border border-white/10 max-w-lg mx-auto p-8">
          <p className="text-white font-bold text-lg mb-2">No encontramos licencias para "{search}"</p>
          <p className="text-slate-400 text-xs mb-4">Intenta buscar con otro término o explora las disponibles.</p>
          <button onClick={() => setSearch('')} className="btn-primary text-xs py-2 px-4 rounded-xl">Limpiar búsqueda</button>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Featured Licenses */}
          {!search && featuredLicenses.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-wider">Destacadas</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {featuredLicenses.map(l => (
                  <Link
                    key={l.id}
                    to={`/licencias/${l.slug}`}
                    className="group bg-white/5 border border-white/10 hover:border-[#f00856]/50 rounded-2xl p-4 flex flex-col items-center text-center transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#f00856]/10"
                  >
                    <div className="w-20 h-20 bg-white/10 rounded-xl p-2 mb-3 flex items-center justify-center overflow-hidden border border-white/5 group-hover:scale-105 transition-transform">
                      {l.logo_url ? (
                        <img src={l.logo_url} alt={l.name} className="w-full h-full object-contain" />
                      ) : (
                        <Award className="w-8 h-8 text-slate-500" />
                      )}
                    </div>
                    <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-[#f00856] transition-colors">{l.name}</h3>
                    <span className="text-[10px] text-slate-400 mt-1 font-mono font-semibold">
                      {l.published_product_count ?? 0} {l.published_product_count === 1 ? 'producto' : 'productos'}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Alphabetical Index */}
          <section className="space-y-10">
            <h2 className="text-xl font-black text-white uppercase tracking-wider border-b border-white/10 pb-4">
              Todas las Licencias
            </h2>

            {groupedByLetter.map(group => (
              <div key={group.letter} className="space-y-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#f00856] text-white font-black text-base shadow-md shadow-[#f00856]/30">
                  {group.letter}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {group.items.map(l => (
                    <Link
                      key={l.id}
                      to={`/licencias/${l.slug}`}
                      className="group bg-white/[0.03] border border-white/10 hover:border-[#f00856]/40 hover:bg-white/[0.06] rounded-xl p-3.5 flex items-center gap-3 transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/10 p-1 shrink-0 flex items-center justify-center border border-white/5">
                        {l.logo_url ? (
                          <img src={l.logo_url} alt={l.name} className="w-full h-full object-contain" />
                        ) : (
                          <Award className="w-5 h-5 text-slate-400" />
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
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
