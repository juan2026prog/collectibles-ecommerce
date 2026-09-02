import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Award, Layers, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useProducts } from '../hooks/useData';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductSkeleton } from '../components/Skeletons';
import SEO from '../components/SEO';
import { generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';

export default function LicenseDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [license, setLicense] = useState<any>(null);
  const [themes, setThemes] = useState<any[]>([]);
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [sortBy, setSortBy] = useState('default');

  const { addToCart } = useCartContext();
  const { formatCurrencyPrice } = useCurrency();

  useEffect(() => {
    async function fetchLicenseData() {
      if (!slug) return;
      setLoadingLicense(true);
      const { data: licData } = await supabase
        .from('licenses')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (licData) {
        setLicense(licData);
        // Fetch themes associated with this license
        const { data: ltData } = await supabase
          .from('license_themes')
          .select('themes(id, name, slug)')
          .eq('license_id', licData.id);

        if (ltData) {
          setThemes(ltData.map(item => item.themes).filter(Boolean));
        }
      } else {
        setLicense(null);
      }
      setLoadingLicense(false);
    }
    fetchLicenseData();
  }, [slug]);

  const { products, count, loading: productsLoading } = useProducts({
    license: slug,
    sortBy,
    limit: 30
  });

  if (loadingLicense) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 text-center">
        <div className="w-10 h-10 border-4 border-[#f00856] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando franquicia...</p>
      </div>
    );
  }

  if (!license) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 text-center min-h-[50vh] flex flex-col justify-center items-center">
        <h2 className="text-3xl font-black text-white">Licencia no encontrada</h2>
        <p className="text-slate-400 mt-2">La franquicia que buscas no existe o ha sido desactivada.</p>
        <Link to="/licencias" className="btn-primary mt-6 text-xs py-2.5 px-5 rounded-xl">Ver todas las licencias</Link>
      </div>
    );
  }

  const seoTitle = generateMetaTitle('shop', license.name);
  const seoDesc = generateMetaDescription('shop', license.description, license.name);
  const canonicalUrl = generateCanonical('licencias', license.slug);

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-8">
      <SEO title={seoTitle} description={seoDesc} image={license.logo_url} url={canonicalUrl} />

      {/* Breadcrumbs */}
      <nav className="flex items-center text-xs font-bold uppercase tracking-wider text-slate-400 flex-wrap gap-2">
        <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
        <span className="text-slate-600">/</span>
        <Link to="/licencias" className="hover:text-white transition-colors">Licencias</Link>
        <span className="text-slate-600">/</span>
        <span className="text-white">{license.name}</span>
      </nav>

      {/* Banner / Header Card */}
      <div className="relative rounded-3xl bg-white/5 border border-white/10 overflow-hidden p-6 sm:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10 shadow-2xl">
        {license.banner_url && (
          <div className="absolute inset-0 z-0 opacity-20 bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${license.banner_url})` }} />
        )}
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-white p-3 shrink-0 flex items-center justify-center border border-white/20 shadow-xl z-10">
          {license.logo_url ? (
            <img src={license.logo_url} alt={license.name} className="w-full h-full object-contain" />
          ) : (
            <Award className="w-12 h-12 text-slate-700" />
          )}
        </div>

        <div className="flex-1 text-center md:text-left z-10 space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-black tracking-widest text-[#f00856] bg-[#f00856]/10 px-3 py-1 rounded-full border border-[#f00856]/20">
              Franquicia Oficial
            </span>
            {themes.map(t => (
              <Link key={t.id} to={`/themes/${t.slug}`} className="text-[10px] uppercase font-black tracking-widest text-purple-300 bg-purple-950/60 px-3 py-1 rounded-full border border-purple-500/30 hover:border-purple-400 transition-colors">
                {t.name}
              </Link>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            {license.name}
          </h1>

          {license.description && (
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">
              {license.description}
            </p>
          )}

          <div className="pt-2 text-xs font-mono font-bold text-slate-400">
            {count} {count === 1 ? 'producto disponible' : 'productos disponibles'}
          </div>
        </div>
      </div>

      {/* Catalog & Sorting Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <h2 className="text-xl font-black text-white tracking-tight">Productos de {license.name}</h2>
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
          <p className="text-white font-bold text-lg">Actualmente no hay productos disponibles para {license.name}.</p>
          <p className="text-slate-400 text-xs mt-1">Explora otras licencias o vuelve pronto.</p>
          <Link to="/licencias" className="btn-primary inline-block mt-4 text-xs py-2 px-4 rounded-xl">Ver más licencias</Link>
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
