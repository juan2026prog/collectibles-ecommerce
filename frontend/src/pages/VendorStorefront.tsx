import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Store, MapPin, Mail, Phone, ExternalLink, ShieldCheck, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { Helmet } from 'react-helmet-async';

export default function VendorStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [store, setStore] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [storeBrands, setStoreBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  
  const cart = useCartContext();

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
      vendor_slug: store?.slug || p.vendor?.slug || slug,
      vendor_logo: store?.logo_url || p.vendor?.logo_url,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || [] 
    });
  }

  useEffect(() => {
    if (!slug) return;
    setPage(1);
    loadStoreData();
  }, [slug]);

  useEffect(() => {
    if (store) {
      loadProducts();
    }
  }, [store, page]);

  async function loadStoreData() {
    setLoading(true);
    try {
      // 1. Fetch store from vendor_stores
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

      // 2. Fetch KYC status from parent vendor account
      const { data: vendorKyc } = await supabase
        .from('vendors')
        .select('kyc_status')
        .eq('id', storeData.vendor_id)
        .maybeSingle();

      if (vendorKyc) {
        setKycStatus(vendorKyc.kyc_status);
      }

      // 3. Fetch dispatch address (store specific with fallback to vendor default)
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

      // 4. Fetch approved store brands
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

      const { data: productsData, count, error } = await supabase
        .from('products')
        .select(`
          id, title, slug, base_price, compare_at_price, category_id, brand_id, vendor_id, vendor_store_id,
          product_images(url, is_primary),
          product_variants(id, price, stock, options, price_adjustment)
        `, { count: 'exact' })
        .eq('vendor_store_id', store.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(from, to);

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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Store className="w-12 h-12 text-[#f00856] animate-pulse" />
        <p className="font-bold text-gray-500 uppercase tracking-widest text-sm">Cargando tienda...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-[#05070f]">
        <Store className="w-16 h-16 text-gray-700" />
        <h1 className="text-2xl font-black text-white">Tienda no encontrada</h1>
        <p className="text-gray-500">La tienda oficial que buscas no existe o está inactiva.</p>
        <Link to="/shop" className="mt-4 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-[#f00856] hover:text-white transition-colors">
          Volver al Catálogo
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(totalProducts / pageSize);

  const seoTitle = store.seo_title || `${store.store_name} - Tienda Oficial | Collectibles`;
  const seoDesc = store.seo_description || store.description || `Productos de ${store.store_name} en Collectibles Uruguay. Encontrá figuras de acción y coleccionables con envío a todo el país.`;
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
            "image": store.logo_url || "https://collectibles.uy/logo.png"
          })}
        </script>
      </Helmet>

      {/* Banner / Header */}
      <div className="bg-[#05070f] border-b border-white/5 relative z-10">
        {store.banner_url ? (
          <div className="h-64 md:h-80 w-full overflow-hidden relative">
            <img src={store.banner_url} alt={store.store_name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/50 to-transparent" />
          </div>
        ) : (
          <div className="h-40 md:h-64 w-full bg-gradient-to-r from-[#f00856]/10 to-indigo-500/10 relative">
             <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] to-transparent" />
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6 -mt-16 md:-mt-20 pb-8">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-[2rem] border border-white/10 bg-[#0a0d16] overflow-hidden shadow-2xl flex-shrink-0 relative z-20 flex items-center justify-center">
              {store.logo_url ? (
                <img src={store.logo_url} alt={store.store_name} className="w-full h-full object-contain p-2" />
              ) : (
                <Store className="w-12 h-12 text-white/20" />
              )}
            </div>
            
            <div className="flex-1 pb-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                  {store.store_name}
                </h1>
                
                <div className="flex gap-2">
                  {store.is_official && (
                    <span className="flex items-center gap-1 text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full uppercase tracking-[0.15em] font-black">
                      <Award className="w-3.5 h-3.5" /> {store.official_badge_text || 'OFICIAL'}
                    </span>
                  )}
                  {kycStatus === 'approved' && (
                    <span className="flex items-center gap-1 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-[0.15em] font-black" title="Vendedor Verificado">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verificado
                    </span>
                  )}
                </div>
              </div>

              <p className="text-slate-400 mt-3 max-w-2xl text-sm leading-relaxed font-bold">
                {store.description || 'Tienda oficial en Collectibles.'}
              </p>

              {/* Mapped Brands badges */}
              {storeBrands.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Marcas Oficiales:</span>
                  {storeBrands.map((brand: any) => (
                    <span key={brand.id} className="text-[10px] bg-white/5 border border-white/10 text-slate-300 px-2.5 py-1 rounded-md font-bold">
                      {brand.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* Contact Info Widget */}
            <div className="w-full md:w-auto glass rounded-2xl p-6 border border-white/5 flex flex-col gap-3 shadow-xl">
              {pickupAddress && (
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <MapPin className="w-4 h-4 text-[#f00856]" /> {pickupAddress}
                </div>
              )}
              {store.contact_email && (
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <Mail className="w-4 h-4 text-[#f00856]" /> <a href={`mailto:${store.contact_email}`} className="hover:text-white transition-colors">{store.contact_email}</a>
                </div>
              )}
              {store.contact_phone && (
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <Phone className="w-4 h-4 text-[#f00856]" /> <a href={`tel:${store.contact_phone}`} className="hover:text-white transition-colors">{store.contact_phone}</a>
                </div>
              )}
              {store.social_links?.instagram && (
                <div className="flex items-center gap-3 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <ExternalLink className="w-4 h-4 text-[#f00856]" /> 
                  <a href={`https://instagram.com/${store.social_links.instagram.replace('@','')}`} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Instagram</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 gap-4">
          <div>
             <h3 className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-2">Store Collection</h3>
             <h2 className="text-4xl font-black text-white tracking-tighter">Catálogo de la Tienda <span className="text-slate-600">({totalProducts})</span></h2>
          </div>
          
          {/* Top Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loadingProducts}
                className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <span className="text-sm font-bold text-slate-300 px-4">
                {page} / {totalPages}
              </span>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loadingProducts}
                className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </div>
          )}
        </div>

        {loadingProducts ? (
          <div className="text-center py-24 glass rounded-[3rem] border border-white/5 shadow-2xl">
            <Store className="w-12 h-12 text-[#f00856] mx-auto mb-6 animate-pulse" />
            <h3 className="text-xl font-black text-white mb-3 tracking-widest uppercase">Cargando productos...</h3>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24 glass rounded-[3rem] border border-white/5 shadow-2xl">
            <Store className="w-20 h-20 text-white/10 mx-auto mb-6" />
            <h3 className="text-2xl font-black text-white mb-3">No hay productos disponibles</h3>
            <p className="text-slate-500 max-w-md mx-auto font-bold">Esta tienda oficial aún no tiene productos activos o están sin stock.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
              {products.map(product => (
                <ProductGridCard 
                  key={product.id} 
                  product={product} 
                  onAddToCart={handleAddToCart}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
            
            {/* Bottom Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-16 flex justify-center">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
                    disabled={page === 1}
                    className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-sm font-bold text-slate-400">
                    Página {page} de {totalPages}
                  </span>
                  <button 
                    onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 400, behavior: 'smooth' }); }}
                    disabled={page >= totalPages}
                    className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
  );
}
