import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Sparkles, Clock, X, Tag, ArrowRight, ShieldCheck, Layers, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getProductImage } from '../../lib/imageUtils';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useSearchHistory } from '../../hooks/useSearchHistory';
import { useFeatures } from '../../contexts/FeatureToggleContext';

interface PredictiveSearchDropdownProps {
  query: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectTerm: (term: string) => void;
  className?: string;
}

interface SearchProductMatch {
  id: string;
  title: string;
  slug: string;
  base_price?: number;
  price?: number;
  images?: string[];
  status?: string;
  brand?: { name: string } | null;
}

interface SearchBrandMatch {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

interface SearchLicenseMatch {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

export function PredictiveSearchDropdown({
  query,
  isOpen,
  onClose,
  onSelectTerm,
  className = ''
}: PredictiveSearchDropdownProps) {
  const navigate = useNavigate();
  const { formatCurrencyPrice } = useCurrency();
  const { features } = useFeatures();
  const { recentSearches, popularTerms, saveSearch, removeSearch, clearAllSearches } = useSearchHistory();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SearchProductMatch[]>([]);
  const [brands, setBrands] = useState<SearchBrandMatch[]>([]);
  const [licenses, setLicenses] = useState<SearchLicenseMatch[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!isOpen) return;

    if (!trimmedQuery || trimmedQuery.length < 2) {
      setProducts([]);
      setBrands([]);
      setLicenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [prodRes, brandRes, licRes] = await Promise.all([
          supabase
            .from('products')
            .select('id, title, slug, price, base_price, images, status, brand:brands!products_brand_id_fkey(name)')
            .ilike('title', `%${trimmedQuery}%`)
            .limit(4),
          supabase
            .from('brands')
            .select('id, name, slug, logo_url')
            .ilike('name', `%${trimmedQuery}%`)
            .limit(3),
          supabase
            .from('licenses')
            .select('id, name, slug, logo_url')
            .ilike('name', `%${trimmedQuery}%`)
            .limit(3)
        ]);

        setProducts((prodRes.data as any[]) || []);
        setBrands((brandRes.data as any[]) || []);
        setLicenses((licRes.data as any[]) || []);
      } catch (err) {
        console.error('Error during predictive search:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [trimmedQuery, isOpen]);

  if (!isOpen) return null;

  const hasResults = products.length > 0 || brands.length > 0 || licenses.length > 0;
  const isTyping = trimmedQuery.length >= 2;

  const handleSelect = (term: string, url?: string) => {
    saveSearch(term);
    onClose();
    if (url) {
      navigate(url);
    } else {
      onSelectTerm(term);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`absolute top-full left-0 right-0 mt-2 bg-[#080d1a] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 backdrop-blur-xl z-[150] overflow-hidden animate-fade-in ${className}`}
    >
      {/* ─── CASO 1: SIN TEXTO O MENOS DE 2 CARACTERES (HISTORIAL & POPULARES) ─── */}
      {!isTyping && (
        <div className="p-4 space-y-4">
          {recentSearches.length > 0 && (
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-[#f00856]" /> Búsquedas recientes
                </span>
                <button
                  type="button"
                  onClick={clearAllSearches}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Borrar todo
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    className="inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-300 transition-all group"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(term, `/shop?q=${encodeURIComponent(term)}`)}
                      className="hover:text-white font-medium truncate max-w-[160px]"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearch(term);
                      }}
                      className="text-slate-500 hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity ml-1"
                      aria-label={`Eliminar ${term}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
              <Tag className="w-3 h-3 text-[#f00856]" /> Sugerencias populares
            </span>
            <div className="flex flex-wrap gap-1.5">
              {popularTerms.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSelect(chip, `/shop?q=${encodeURIComponent(chip)}`)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white/5 hover:bg-[#f00856]/15 hover:text-[#f00856] border border-white/10 hover:border-[#f00856]/40 text-slate-300 transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {features.aiSearchEnabled && (
            <div className="pt-2 border-t border-white/5">
              <Link
                to="/ai-search"
                onClick={onClose}
                className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-[#f00856]/10 to-amber-500/10 border border-[#f00856]/20 hover:border-[#f00856]/40 transition group"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#f00856]" />
                  <span className="text-xs font-bold text-white group-hover:text-[#f00856] transition-colors">
                    ¿Buscás algo específico? Probá la búsqueda con IA
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#f00856] group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ─── CASO 2: BUSCANDO (CARGANDO) ─── */}
      {isTyping && loading && (
        <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-[#f00856]" />
          <span>Buscando coincidencias en el catálogo...</span>
        </div>
      )}

      {/* ─── CASO 3: RESULTADOS ENCONTRADOS ─── */}
      {isTyping && !loading && hasResults && (
        <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto no-scrollbar">
          {/* SECCIÓN 1: PRODUCTOS */}
          {products.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-[#f00856]" /> Productos ({products.length})
              </div>
              <div className="space-y-1 mt-1">
                {products.map((p) => {
                  const img = getProductImage(p);
                  const price = Number(p.base_price || p.price || 0);
                  return (
                    <Link
                      key={p.id}
                      to={`/p/${p.slug}`}
                      onClick={() => handleSelect(p.title)}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                        <img src={img} alt={p.title} className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate group-hover:text-[#f00856] transition-colors">
                          {p.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.brand?.name && (
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">
                              {p.brand.name}
                            </span>
                          )}
                          <span className="text-[11px] font-black text-[#f00856]">
                            {formatCurrencyPrice(price)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECCIÓN 2: MARCAS Y LICENCIAS */}
          {(brands.length > 0 || licenses.length > 0) && (
            <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2">
              {brands.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Marcas
                  </div>
                  <div className="space-y-1 mt-0.5">
                    {brands.map((b) => (
                      <Link
                        key={b.id}
                        to={`/marca/${b.slug}`}
                        onClick={() => handleSelect(b.name)}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 text-xs text-slate-300 hover:text-white transition truncate font-semibold"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{b.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {licenses.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Licencias
                  </div>
                  <div className="space-y-1 mt-0.5">
                    {licenses.map((l) => (
                      <Link
                        key={l.id}
                        to={`/licencias/${l.slug}`}
                        onClick={() => handleSelect(l.name)}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 text-xs text-slate-300 hover:text-white transition truncate font-semibold"
                      >
                        <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{l.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── CASO 4: SIN COINCIDENCIAS DIRECTAS ─── */}
      {isTyping && !loading && !hasResults && (
        <div className="p-4 text-center space-y-2">
          <p className="text-xs text-slate-400">
            No encontramos coincidencias exactas para <span className="text-white font-bold">"{trimmedQuery}"</span>
          </p>
          {features.aiSearchEnabled && (
            <Link
              to={`/ai-search?q=${encodeURIComponent(trimmedQuery)}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f00856]/15 border border-[#f00856]/30 text-[#f00856] text-xs font-bold hover:bg-[#f00856]/25 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Buscar con IA en todo el catálogo
            </Link>
          )}
        </div>
      )}

      {/* ─── FOOTER CTA: VER TODOS LOS RESULTADOS ─── */}
      {isTyping && (
        <div className="p-2 bg-white/[0.02] border-t border-white/5">
          <button
            type="button"
            onClick={() => handleSelect(trimmedQuery, `/shop?q=${encodeURIComponent(trimmedQuery)}`)}
            className="w-full py-2 px-3 rounded-xl bg-[#f00856]/10 hover:bg-[#f00856]/20 border border-[#f00856]/30 text-xs font-black text-[#f00856] flex items-center justify-between transition group"
          >
            <span>Ver todos los resultados para "{trimmedQuery}"</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}
    </div>
  );
}
