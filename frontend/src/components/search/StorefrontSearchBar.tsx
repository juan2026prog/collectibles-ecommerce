import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, Sparkles, X, Clock, TrendingUp, ArrowRight, Tag, Shield } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getProductImage } from "../../lib/imageUtils";
import { useCurrency } from "../../contexts/CurrencyContext";

interface BrandItem {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

interface LicenseItem {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

interface ProductItem {
  id: string;
  title: string;
  slug: string;
  price: number;
  currency?: string;
  images?: string[];
  brand?: { name: string } | null;
}

interface StorefrontSearchBarProps {
  aiSearchEnabled?: boolean;
  allBrands?: BrandItem[];
  activeLicenses?: LicenseItem[];
  className?: string;
}

const POPULAR_SEARCHES = ["Hot Toys", "Dragon Ball", "Batman", "Marvel Legends", "Preventas", "NECA"];
const MAX_RECENT_SEARCHES = 6;

export default function StorefrontSearchBar({
  aiSearchEnabled = false,
  allBrands = [],
  activeLicenses = [],
  className = ""
}: StorefrontSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [matchedBrands, setMatchedBrands] = useState<BrandItem[]>([]);
  const [matchedLicenses, setMatchedLicenses] = useState<LicenseItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("recent_searches");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { formatCurrencyPrice } = useCurrency();

  const saveRecentSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    try {
      const current = recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...current].slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(updated);
      localStorage.setItem("recent_searches", JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const removeRecentSearch = (e: React.MouseEvent, termToRemove: string) => {
    e.stopPropagation();
    try {
      const updated = recentSearches.filter(s => s !== termToRemove);
      setRecentSearches(updated);
      localStorage.setItem("recent_searches", JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const clearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem("recent_searches");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setProducts([]);
      setMatchedBrands([]);
      setMatchedLicenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handler = setTimeout(async () => {
      const lower = trimmed.toLowerCase();

      const bMatches = allBrands
        .filter(b => (b.name || "").toLowerCase().includes(lower))
        .slice(0, 3);
      setMatchedBrands(bMatches);

      const lMatches = activeLicenses
        .filter(l => (l.name || "").toLowerCase().includes(lower))
        .slice(0, 3);
      setMatchedLicenses(lMatches);

      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, title, slug, price, currency, images, brand:brands(name)")
          .ilike("title", "%" + trimmed + "%")
          .limit(5);

        if (!error && data) {
          setProducts(data as ProductItem[]);
        }
      } catch (err) {
        console.error("Error fetching autocomplete products:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [query, allBrands, activeLicenses]);

  const handleExecuteSearch = (termToSearch: string) => {
    const val = termToSearch.trim();
    if (!val) return;
    saveRecentSearch(val);
    setIsOpen(false);
    navigate("/shop?q=" + encodeURIComponent(val));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecuteSearch(query);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const hasResults = products.length > 0 || matchedBrands.length > 0 || matchedLicenses.length > 0;
  const isTyping = query.trim().length >= 2;

  return (
    <div ref={containerRef} className={"relative flex-1 max-w-sm " + className}>
      <div className="relative flex items-center">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={aiSearchEnabled ? "Buscar figuras, marcas... o prueba IA ✨" : "Buscar figuras, marcas..."}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-12 py-2.5 text-xs font-medium text-white placeholder-slate-400 focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-all outline-none"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}

        {aiSearchEnabled && (
          <Link
            to="/ai-search"
            onClick={() => setIsOpen(false)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-[#f00856]/20 text-[#f00856] hover:bg-[#f00856]/30 transition"
            title="Búsqueda Inteligente con IA"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0f1d] border border-white/15 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden z-[150] animate-in fade-in zoom-in-95 duration-150">
          {!isTyping && (
            <div className="p-4 space-y-4">
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-[#f00856]" /> Búsquedas recientes
                    </span>
                    <button
                      type="button"
                      onClick={clearAllRecent}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition"
                    >
                      Borrar todo
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map(term => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          handleExecuteSearch(term);
                        }}
                        className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#f00856]/15 border border-white/10 hover:border-[#f00856]/40 text-xs text-slate-300 hover:text-white transition"
                      >
                        <span>{term}</span>
                        <span
                          onClick={(e) => removeRecentSearch(e, term)}
                          className="text-slate-500 hover:text-rose-400 p-0.5 rounded"
                        >
                          <X className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3 h-3 text-amber-400" /> Lo más buscado
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_SEARCHES.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setQuery(item);
                        handleExecuteSearch(item);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/10 border border-white/5 hover:border-white/20 text-xs font-semibold text-slate-300 hover:text-white transition"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isTyping && (
            <div className="max-h-[70vh] overflow-y-auto no-scrollbar divide-y divide-white/5">
              {loading && !hasResults && (
                <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-[#f00856] border-t-transparent rounded-full animate-spin" />
                  Buscando en catálogo...
                </div>
              )}

              {!loading && !hasResults && (
                <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                  <p>No se encontraron resultados directos para "{query}".</p>
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch(query)}
                    className="inline-flex items-center gap-1.5 text-[#f00856] hover:underline font-bold text-xs"
                  >
                    Buscar en toda la tienda <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {(matchedBrands.length > 0 || matchedLicenses.length > 0) && (
                <div className="p-3 bg-white/[0.02]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {matchedBrands.length > 0 && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1.5 px-1">
                          Marcas
                        </span>
                        <div className="space-y-1">
                          {matchedBrands.map(b => (
                            <Link
                              key={b.id}
                              to={"/marca/" + b.slug}
                              onClick={() => {
                                saveRecentSearch(b.name);
                                setIsOpen(false);
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-bold text-slate-200 hover:text-white transition"
                            >
                              <Tag className="w-3 h-3 text-[#f00856]" />
                              <span className="truncate">{b.name}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {matchedLicenses.length > 0 && (
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1.5 px-1">
                          Licencias
                        </span>
                        <div className="space-y-1">
                          {matchedLicenses.map(l => (
                            <Link
                              key={l.id}
                              to={"/licencias/" + l.slug}
                              onClick={() => {
                                saveRecentSearch(l.name);
                                setIsOpen(false);
                              }}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-bold text-slate-200 hover:text-white transition"
                            >
                              <Shield className="w-3 h-3 text-sky-400" />
                              <span className="truncate">{l.name}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {products.length > 0 && (
                <div className="p-3 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1 px-1">
                    Productos sugeridos
                  </span>
                  {products.map(p => {
                    const imgUrl = getProductImage(p.images);
                    return (
                      <Link
                        key={p.id}
                        to={"/producto/" + p.slug}
                        onClick={() => {
                          saveRecentSearch(p.title);
                          setIsOpen(false);
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          <img
                            src={imgUrl}
                            alt={p.title}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate group-hover:text-[#f00856] transition-colors">
                            {p.title}
                          </p>
                          <p className="text-[11px] font-black text-[#f00856]">
                            {formatCurrencyPrice(p.price)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleExecuteSearch(query)}
                className="w-full px-4 py-3 bg-[#f00856]/10 hover:bg-[#f00856]/20 text-[#f00856] text-xs font-bold flex items-center justify-between transition"
              >
                <span>Ver todos los resultados para "{query}"</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
