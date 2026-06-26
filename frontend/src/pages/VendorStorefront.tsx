import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Store, MapPin, Mail, Phone, ExternalLink, ShieldCheck, 
  Award, ChevronLeft, ChevronRight, Users, Star, ShoppingBag, 
  Clock, CheckCircle, Search, Grid, Sparkles, Calendar, 
  Tag, Globe
} from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { Helmet } from 'react-helmet-async';
import { useStoreCollections, useStoreFollowers, useStoreBadges } from '../hooks/useData';
import { useLocale } from '../contexts/LocaleContext';

export default function VendorStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [store, setStore] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [promotionsOptIn, setPromotionsOptIn] = useState<boolean>(false);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [storeBrands, setStoreBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  // Custom Search & Filter states
  const [innerSearch, setInnerSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'new' | 'featured'>('all');

  const cart = useCartContext();
  const { language } = useLocale();

  const formatPrice = (p: number) => `$${p.toLocaleString('es-UY')}`;

  function handleAddToCart(p: any) {
    const variant = p.variants?.[0];
    if (!variant) return;
    cart.addItem({ 
      product_id: p.id, 
      variant_id: variant.id, 
      quantity: 1, 
      title: p.title, 
      price: p.base_price + (variant.price_adjustment || 0), 
      image: getProductImage(p), 
      variant_name: variant.options ? Object.values(variant.options).join(' ') : 'Única', 
      category_id: p.category_id, 
      brand_id: p.brand_id, 
      vendor_id: p.vendor_id, 
      vendor_store_id: p.vendor_store_id || store?.id || null,
      vendor_name: store?.store_name || p.vendor?.store_name || 'Vendedor',
      vendor_store_name: store?.store_name || p.vendor?.store_name || 'Vendedor',
      vendor_slug: store?.slug || p.vendor?.slug || slug,
      vendor_store_slug: store?.slug || p.vendor?.slug || slug,
      vendor_logo: store?.logo_url || p.vendor?.logo_url,
      sku: variant.sku || null,
      unit_price: p.base_price + (variant.price_adjustment || 0),
      image_url: getProductImage(p),
      promotions_opt_in: promotionsOptIn,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || [] 
    });
  }

  // Follow State
  const { isFollowing, followersCount, toggleFollow, loading: followLoading } = useStoreFollowers(store?.id);

  // Collections State
  const { collections } = useStoreCollections(store?.id);

  // Badges State
  const { badges } = useStoreBadges(store?.id);

  useEffect(() => {
    if (!slug) return;
    setPage(1);
    setInnerSearch('');
    setSearchInput('');
    setSelectedCollectionId('');
    setActiveFilterTab('all');
    loadStoreData();
  }, [slug]);

  useEffect(() => {
    if (store) {
      loadProducts();
    }
  }, [store, page, innerSearch, selectedCollectionId, activeFilterTab]);

  async function loadStoreData() {
    setLoading(true);
    try {
      const { data: storeData, error: storeErr } = await supabase
        .from('vendor_stores')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (storeErr || !storeData) {
        setStore(null);
        setLoading(false);
        return;
      }

      setStore(storeData);

      const { data: vendorKyc } = await supabase
        .from('vendors')
        .select('kyc_status, promotions_opt_in')
        .eq('id', storeData.vendor_id)
        .maybeSingle();

      if (vendorKyc) {
        setKycStatus(vendorKyc.kyc_status);
        setPromotionsOptIn(vendorKyc.promotions_opt_in || false);
      }

      const { data: storeAddr } = await supabase
        .from('vendor_dispatch_addresses')
        .select('address, city, state')
        .eq('vendor_store_id', storeData.id)
        .eq('is_default', true)
        .maybeSingle();

      let finalAddr = storeAddr;
      if (!finalAddr) {
        const { data: vendorAddr } = await supabase
          .from('vendor_dispatch_addresses')
          .select('address, city, state')
          .eq('vendor_id', storeData.vendor_id)
          .is('vendor_store_id', null)
          .eq('is_default', true)
          .maybeSingle();
        finalAddr = vendorAddr;
      }

      if (finalAddr) {
        setPickupAddress(`${finalAddr.address}, ${finalAddr.city}, ${finalAddr.state}`);
      }

      const { data: assocBrands } = await supabase
        .from('vendor_store_brands')
        .select('brands(id, name, logo_url)')
        .eq('vendor_store_id', storeData.id)
        .eq('status', 'approved');

      const brandsList = assocBrands?.map((ab: any) => ab.brands).filter(Boolean) || [];
      setStoreBrands(brandsList);

    } catch (err) {
      console.error('Error loading store data:', err);
    }
    setLoading(false);
  }

  async function loadProducts() {
    if (!store) return;
    setLoadingProducts(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from('products')
        .select(`
          id, title, slug, base_price, compare_at_price, category_id, brand_id, vendor_id, vendor_store_id,
          product_images(url, is_primary),
          product_variants(id, price, stock, options, price_adjustment)
        `, { count: 'exact' })
        .eq('vendor_store_id', store.id)
        .eq('is_active', true);

      if (innerSearch) {
        q = q.or(`title.ilike.%${innerSearch}%,description.ilike.%${innerSearch}%`);
      }

      if (activeFilterTab === 'new') {
        q = q.eq('badge', 'new');
      } else if (activeFilterTab === 'featured') {
        q = q.eq('is_featured', true);
      }

      if (selectedCollectionId) {
        const { data: colProds } = await supabase
          .from('vendor_store_collection_products')
          .select('product_id')
          .eq('collection_id', selectedCollectionId);
        
        const pids = colProds?.map((x: any) => x.product_id) || [];
        if (pids.length === 0) {
          setProducts([]);
          setTotalProducts(0);
          setLoadingProducts(false);
          return;
        }
        q = q.in('id', pids);
      }

      q = q.order('created_at', { ascending: false }).range(from, to);

      const { data: productsData, count, error } = await q;

      if (!error && productsData) {
        const transformedProducts = productsData.map(p => ({
          ...p,
          images: p.product_images,
          variants: p.product_variants,
        }));
        setProducts(transformedProducts);
        if (count !== null) setTotalProducts(count);
      }
    } catch (err) {
      console.error('Error loading products:', err);
    }
    setLoadingProducts(false);
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setInnerSearch(searchInput);
  };

  const handleFollowClick = async () => {
    try {
      await toggleFollow();
    } catch (e: any) {
      alert(e.message || "Error al seguir la tienda.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#05070f]">
        <Store className="w-12 h-12 text-[#f00856] animate-pulse" />
        <p className="font-bold text-gray-500 uppercase tracking-widest text-sm">Cargando tienda oficial...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#05070f]">
        <Store className="w-16 h-16 text-gray-700" />
        <h1 className="text-2xl font-black text-white">Tienda no encontrada</h1>
        <p className="text-gray-500 font-bold">La tienda oficial que buscas no existe o está inactiva.</p>
        <Link to="/shop" className="mt-4 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-[#f00856] hover:text-white transition-colors">
          Volver al Catálogo
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(totalProducts / pageSize);

  const seoTitle = store.seo_title || `${store.store_name} - Tienda Oficial | Collectibles`;
  const seoDesc = store.seo_description || store.description || `Encuentra los productos de ${store.store_name} en Collectibles Uruguay. Figuras de acción, preventas y merchandising original con envíos nacionales.`;
  const canonicalUrl = `https://collectibles.uy/store/${slug}`;

  return (
    <div className="min-h-screen bg-[#05070f] pb-20 pt-20">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        {store.logo_url && <meta property="og:image" content={store.logo_url} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        {store.logo_url && <meta name="twitter:image" content={store.logo_url} />}
        
        {/* Schema.org for Store */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            "name": store.store_name,
            "description": seoDesc,
            "url": canonicalUrl,
            "image": store.logo_url || "https://collectibles.uy/logo.png",
            "telephone": store.contact_phone || undefined,
            "email": store.contact_email || undefined,
            "address": pickupAddress ? {
              "@type": "PostalAddress",
              "streetAddress": pickupAddress,
              "addressLocality": store.city || "Montevideo",
              "addressCountry": "UY"
            } : undefined,
            "aggregateRating": store.reviews_count > 0 ? {
              "@type": "AggregateRating",
              "ratingValue": store.rating,
              "reviewCount": store.reviews_count
            } : undefined
          })}
        </script>
      </Helmet>

      {/* Banner / Header */}
      <div className="bg-[#05070f] border-b border-white/5 relative z-10">
        {store.banner_url ? (
          <div className="h-64 md:h-96 w-full overflow-hidden relative">
            <img src={store.banner_url} alt={store.store_name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/40 to-transparent" />
          </div>
        ) : (
          <div className="h-44 md:h-72 w-full bg-gradient-to-r from-[#f00856]/10 to-indigo-500/10 relative">
             <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] to-transparent" />
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6 -mt-20 md:-mt-24 pb-8">
            <div className="w-36 h-36 md:w-44 md:h-44 rounded-[2.5rem] border border-white/10 bg-[#0a0d16] overflow-hidden shadow-2xl flex-shrink-0 relative z-20 flex items-center justify-center p-3">
              {store.logo_url ? (
                <img src={store.logo_url} alt={store.store_name} className="w-full h-full object-contain" />
              ) : (
                <Store className="w-16 h-16 text-white/20" />
              )}
            </div>
            
            <div className="flex-1 pb-2 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase">
                  {store.store_name}
                </h1>
                
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {badges
                      .filter((b: any) => {
                        const k = b.badge_key;
                        if (k === 'official_distributor' || k === 'exclusive_distributor' || k === 'verified' || k === 'premium' || k === 'official_seller') {
                          return false;
                        }
                        return true;
                      })
                      .map((badge: any) => {
                        const labelText = badge.badge_key === 'official_store'
                          ? (language === 'en' ? 'Official Store' : 'TIENDA OFICIAL')
                          : badge.label;
                        
                        return (
                          <span 
                            key={badge.id} 
                            className={`text-[9px] border px-3 py-1.5 rounded-full uppercase tracking-[0.2em] font-black shadow-sm ${badge.color_class || 'bg-white/5 border-white/10 text-slate-300'}`}
                            title={badge.description}
                          >
                            {labelText}
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>

              <p className="text-slate-300 mt-4 max-w-2xl text-sm leading-relaxed font-semibold">
                {store.description || 'Tienda oficial certificada en el ecosistema de Collectibles Uruguay.'}
              </p>

              {/* Mapped Brands */}
              {storeBrands.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Marcas Oficiales:</span>
                  {storeBrands.map((brand: any) => (
                    <span key={brand.id} className="text-[10px] bg-white/5 border border-white/10 text-slate-300 px-3 py-1 rounded-lg font-bold">
                      {brand.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* Action Bar (Follow & Contact) */}
            <div className="w-full md:w-auto flex flex-col gap-3 min-w-[240px]">
              <button
                onClick={handleFollowClick}
                disabled={followLoading}
                className={`w-full py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                  isFollowing 
                    ? 'bg-white/10 hover:bg-red-500/20 text-red-500 border border-red-500/30' 
                    : 'bg-white hover:bg-[#f00856] text-black hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                {isFollowing ? 'Dejar de seguir' : 'Seguir tienda'}
              </button>

              <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col gap-2.5 shadow-xl text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                {pickupAddress && (
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-3.5 h-3.5 text-[#f00856] shrink-0" /> <span className="truncate">{pickupAddress}</span>
                  </div>
                )}
                {store.website_url && (
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-3.5 h-3.5 text-[#f00856] shrink-0" /> 
                    <a href={store.website_url.startsWith('http') ? store.website_url : `https://${store.website_url}`} target="_blank" rel="noreferrer" className="hover:text-white transition-colors truncate">{store.website_url}</a>
                  </div>
                )}
                {store.contact_email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-3.5 h-3.5 text-[#f00856] shrink-0" /> <a href={`mailto:${store.contact_email}`} className="hover:text-white transition-colors truncate">{store.contact_email}</a>
                  </div>
                )}
                {store.years_in_platform > 0 && (
                  <div className="text-[10px] text-slate-500 border-t border-white/5 pt-2.5 mt-1">
                    Miembro desde hace {store.years_in_platform} {store.years_in_platform === 1 ? 'año' : 'años'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Reputación y Estadísticas (Fase 1) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="flex items-center justify-center gap-1 text-amber-400 mb-1.5">
              <Star className="w-5 h-5 fill-current" />
              <span className="text-xl font-black text-white">{Number(store.rating || 0).toFixed(1)}</span>
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Calificación</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">({store.reviews_count} opiniones)</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="text-xl font-black text-white mb-1.5 flex items-center justify-center gap-1.5">
              <ShoppingBag className="w-5 h-5 text-[#f00856]" />
              <span>{store.sales_count.toLocaleString()}</span>
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Ventas totales</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">{store.completed_orders} completadas</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="text-xl font-black text-white mb-1.5 flex items-center justify-center gap-1.5">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>{followersCount.toLocaleString()}</span>
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Seguidores</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">Comunidad activa</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="text-xl font-black text-emerald-400 mb-1.5 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-5 h-5" />
              <span>{Number(store.response_rate || 100).toFixed(0)}%</span>
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Entregas a tiempo</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">{store.late_shipments} demoradas</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="text-xl font-black text-white mb-1.5 flex items-center justify-center gap-1.5">
              <Clock className="w-5 h-5 text-cyan-400" />
              <span>{store.response_time_minutes ? `${store.response_time_minutes} min` : 'N/A'}</span>
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Tiempo de Respuesta</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">Atención al cliente</p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
            <div className="text-xl font-black text-white mb-1.5">
              {store.created_products}
            </div>
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Productos</p>
            <p className="text-[10px] text-slate-400 mt-1 font-bold">En catálogo público</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar Filters */}
          <div className="space-y-6 lg:sticky lg:top-24 h-fit">
            
            {/* Buscador Interno (Fase 2) */}
            <div className="glass p-6 rounded-3xl border border-white/5 shadow-xl">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#f00856] mb-3">Buscar en la tienda</h4>
              <form onSubmit={handleSearchSubmit} className="relative">
                <input 
                  type="text" 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ej. Transformers, LEGO Star Wars..."
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-3 pl-4 pr-10 text-xs font-semibold focus:outline-none focus:border-[#f00856] transition-colors"
                />
                <button type="submit" className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors">
                  <Search className="w-4 h-4" />
                </button>
              </form>
              {innerSearch && (
                <button 
                  onClick={() => { setInnerSearch(''); setSearchInput(''); }}
                  className="text-[10px] text-red-400 font-bold uppercase mt-2.5 hover:text-red-300 transition-colors"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>

            {/* Colecciones de la Tienda (Fase 11) */}
            {collections.length > 0 && (
              <div className="glass p-6 rounded-3xl border border-white/5 shadow-xl">
                <h4 className="text-xs font-black uppercase tracking-widest text-[#f00856] mb-4">Colecciones</h4>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setSelectedCollectionId(''); setPage(1); }}
                    className={`text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      selectedCollectionId === '' 
                        ? 'bg-[#f00856] text-white' 
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Todo el catálogo
                  </button>
                  {collections.map((col: any) => (
                    <button
                      key={col.id}
                      onClick={() => { setSelectedCollectionId(col.id); setPage(1); }}
                      className={`text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                        selectedCollectionId === col.id 
                          ? 'bg-[#f00856] text-white font-black' 
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <span className="truncate">{col.name}</span>
                      <Tag className="w-3.5 h-3.5 opacity-50 shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product Listing */}
          <div className="lg:col-span-3 space-y-8">
            
            {/* Filter Tabs (All, New, Featured) */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => { setActiveFilterTab('all'); setPage(1); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeFilterTab === 'all' 
                      ? 'bg-white text-black font-black shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" /> Todo
                </button>
                <button
                  onClick={() => { setActiveFilterTab('featured'); setPage(1); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeFilterTab === 'featured' 
                      ? 'bg-white text-black font-black shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Destacados
                </button>
                <button
                  onClick={() => { setActiveFilterTab('new'); setPage(1); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeFilterTab === 'new' 
                      ? 'bg-white text-black font-black shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" /> Novedades
                </button>
              </div>

              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Mostrando {products.length} de {totalProducts} productos
              </div>
            </div>

            {loadingProducts ? (
              <div className="text-center py-24 glass rounded-[2.5rem] border border-white/5 shadow-2xl">
                <Store className="w-12 h-12 text-[#f00856] mx-auto mb-6 animate-pulse" />
                <h3 className="text-lg font-black text-white mb-3 tracking-widest uppercase">Cargando productos...</h3>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-24 glass rounded-[2.5rem] border border-white/5 shadow-2xl">
                <Store className="w-16 h-16 text-white/10 mx-auto mb-6" />
                <h3 className="text-xl font-black text-white mb-3">Sin resultados</h3>
                <p className="text-slate-500 max-w-md mx-auto font-bold">No se encontraron productos que coincidan con la búsqueda o filtros aplicados.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  {products.map(product => (
                    <ProductGridCard 
                      key={product.id} 
                      product={product} 
                      onAddToCart={handleAddToCart}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pt-12 flex justify-center border-t border-white/5">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
                        disabled={page === 1}
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>
                      <span className="text-xs font-bold text-slate-400">
                        Página {page} de {totalPages}
                      </span>
                      <button 
                        onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
                        disabled={page >= totalPages}
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                      >
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
