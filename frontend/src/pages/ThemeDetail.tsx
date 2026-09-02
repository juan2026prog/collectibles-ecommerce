import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layers, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useProducts } from '../hooks/useData';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';

export default function ThemeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [theme, setTheme] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loadingTheme, setLoadingTheme] = useState(true);
  const [sortBy, setSortBy] = useState('default');

  const { addToCart } = useCartContext();
  const { formatCurrencyPrice } = useCurrency();

  useEffect(() => {
    async function fetchThemeData() {
      if (!slug) return;
      setLoadingTheme(true);
      const { data: themeData } = await supabase
        .from('themes')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (themeData) {
        setTheme(themeData);
        // Fetch licenses associated with this theme
        const { data: ltData } = await supabase
          .from('license_themes')
          .select('licenses(id, name, slug, logo_url, is_active)')
          .eq('theme_id', themeData.id);

        if (ltData) {
          const lics = ltData.map(item => item.licenses).filter((l: any) => l && l.is_active !== false);
          setLicenses(lics);
        }
      } else {
        setTheme(null);
      }
      setLoadingTheme(false);
    }
    fetchThemeData();
  }, [slug]);

  const { products, count, loading: productsLoading } = useProducts({
    theme: slug,
    sortBy,
    limit: 30
  });

  if (loadingTheme) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 text-center">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando temática...</p>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 text-center min-h-[50vh] flex flex-col justify-center items-center">
        <h2 className="text-3xl font-black text-white">Theme no encontrado</h2>
        <p className="text-slate-400 mt-2">La temática que buscas no existe o ha sido desactivada.</p>
        <Link to="/themes" className="btn-primary mt-6 text-xs py-2.5 px-5 rounded-xl">Ver todos los Themes</Link>
      </div>
    );
  }

  const seoTitle = generateMetaTitle('shop', theme.name);
  const seoDesc = generateMetaDescription('shop', theme.description, theme.name);
  const canonicalUrl = generateCanonical('shop', `themes/${theme.slug}`);

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-8">
      <SEO title={seoTitle} description={seoDesc} url={canonicalUrl} />

      {/* Breadcrumbs */}
      <nav className="flex items-center text-xs font-bold uppercase tracking-wider text-slate-400 flex-wrap gap-2">
        <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
        <span className="text-slate-600">/</span>
        <Link to="/themes" className="hover:text-white transition-colors">Themes</Link>
        <span className="text-slate-600">/</span>
        <span className="text-white">{theme.name}</span>
      </nav>

      {/* Theme Header */}
      <div className="rounded-3xl bg-gradient-to-r from-purple-950/40 via-white/5 to-white/5 border border-purple-500/20 p-6 sm:p-10 space-y-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-black tracking-widest text-purple-300 bg-purple-950/80 px-3.5 py-1 rounded-full border border-purple-500/30 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Temática Comercial
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
          {theme.name}
        </h1>

        {theme.description && (
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
            {theme.description}
          </p>
        )}

        {/* Associated License Chips */}
        {licenses.length > 0 && (
          <div className="pt-2 space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Licencias asociadas en este Theme:</span>
            <div className="flex flex-wrap gap-2">
              {licenses.map(l => (
                <Link
                  key={l.id}
                  to={`/licencias/${l.slug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#f00856]/50 text-xs font-bold text-slate-300 hover:text-white transition-all"
                >
                  <Award className="w-3.5 h-3.5 text-[#f00856]" />
                  <span>{l.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 text-xs font-mono font-bold text-slate-400">
          {count} {count === 1 ? 'producto disponible' : 'productos disponibles'}
        </div>
      </div>

      {/* Catalog & Sorting Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <h2 className="text-xl font-black text-white tracking-tight">Productos de {theme.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ordenar por:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs font-bold text-white rounded-xl px-3 py-2 outline-none cursor-pointer focus:border-[#f00856]"
          >
            <option value="default" className="bg-[#05070f]">Destacados</option>
            <option value="price-low" className="bg-[#05070f]">Menor Precio</option>
            <option value="price-high" className="bg-[#05070f]">Mayor Precio</option>
            <option value="newest" className="bg-[#05070f]">Más Recientes</option>
            <option value="name" className="bg-[#05070f]">Nombre (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Product Grid */}
      {productsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => <ProductSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center bg-white/5 rounded-3xl border border-white/10 p-8">
          <p className="text-white font-bold text-lg">Actualmente no hay productos disponibles en {theme.name}.</p>
          <Link to="/themes" className="btn-primary inline-block mt-4 text-xs py-2 px-4 rounded-xl">Ver otros Themes</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map(p => (
            <ProductGridCard
              key={p.id}
              product={p}
              onAddToCart={() => addToCart(p)}
              formatPrice={(price) => formatCurrencyPrice(price)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
