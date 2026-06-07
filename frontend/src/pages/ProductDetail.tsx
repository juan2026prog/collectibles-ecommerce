import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ShoppingCart, Minus, Plus, Truck, ShieldCheck, Star, ChevronDown, Heart } from 'lucide-react';
import { useProduct } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlistContext } from '../contexts/WishlistContext';
import { usePromotions, getApplicablePromotions, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useCurrency } from '../contexts/CurrencyContext';
import { ProductBadge } from '../components/ProductBadge';
import { getProductImage, resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { analytics } from '../lib/analytics';
import { trackViewContent, trackAddToCart, generateMetaEventId } from '../lib/meta/metaPixel';
import SEO from '../components/SEO';
import { useSiteSettings } from '../hooks/useSiteSettings';
import SoldByCard from '../components/SoldByCard';

export default function ProductDetail() {
  const { settings } = useSiteSettings();
  const { slug } = useParams();
  const { product, loading } = useProduct(slug);
  const cart = useCartContext();
  const { user } = useAuth();
  const { formatCurrencyPrice } = useCurrency();
  const { promotions } = usePromotions();
  const { toggleWishlist, isInWishlist } = useWishlistContext();
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [openMobileTab, setOpenMobileTab] = useState<'description' | 'specs' | null>('description');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };
  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null || !images.length) return;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      // Swipe left -> next image
      setSelectedImage(prev => (prev + 1) % images.length);
    }
    if (diff < -50) {
      // Swipe right -> prev image
      setSelectedImage(prev => (prev - 1 + images.length) % images.length);
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  useEffect(() => {
    const handleScroll = () => {
      const mainBtn = document.getElementById('main-add-to-cart');
      if (mainBtn) {
        const rect = mainBtn.getBoundingClientRect();
        setShowStickyBar(rect.bottom < 0);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (product) {
      analytics.track({
        eventName: 'ViewContent',
        eventData: {
          content_name: product.title,
          content_ids: [product.id],
          content_type: 'product',
          value: product.base_price,
          currency: 'UYU'
        },
        user: { email: user?.email || undefined }
      });
      
      try {
        const eventId = generateMetaEventId('ViewContent', product.id);
        trackViewContent(eventId, {
          content_ids: [product.id],
          content_name: product.title,
          category: product.category?.name,
          brand: product.brand?.name,
          value: product.base_price,
          currency: 'UYU'
        });
      } catch (e) {
        console.warn("Meta tracking error", e);
      }
    }
  }, [product, user]);

  if (loading) return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="grid md:grid-cols-2 gap-10">
        <div className="animate-pulse bg-white/10  aspect-square" />
        <div className="space-y-4">
          <div className="animate-pulse bg-white/10 h-8 w-3/4 rounded" />
          <div className="animate-pulse bg-white/10 h-6 w-1/4 rounded" />
          <div className="animate-pulse bg-white/10 h-20 rounded" />
        </div>
      </div>
    </div>
  );

  if (!product || product.is_active === false) return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-500">Este producto no está disponible actualmente</h1>
      <Link to="/shop" className="btn-primary mt-4">Volver a la tienda</Link>
    </div>
  );

  const productImage = getProductImage(product);
  const { images = [], variants = [], reviews = [] } = product || {};
  const selectedVariant = variants[selectedVariantIdx] || variants[0];
  const stock = selectedVariant?.inventory_count || 0;
  const finalPrice = product.base_price + (selectedVariant?.price_adjustment || 0);
  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
  const currentImage = images[selectedImage]?.url;
  const displayImage = currentImage ? resolveImage(currentImage) : productImage;

  const applicablePromos = product ? getApplicablePromotions({
    product_id: product.id,
    category_id: product.category?.id,
    brand_id: product.brand?.id,
    vendor_id: product.vendor_id,
    tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || []
  }, promotions) : [];

  let promoDiscount = 0;
  if (applicablePromos.length > 0 && product) {
    const item = {
      product_id: product.id,
      category_id: product.category?.id,
      brand_id: product.brand?.id,
      vendor_id: product.vendor_id,
      tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || [],
      price: finalPrice,
      quantity: 1
    };
    const result = evaluateItemDiscountDetailed(item, applicablePromos);
    promoDiscount = result.discount;
  }

  const displayPrice = finalPrice - promoDiscount;
  const hasDiscount = (product?.compare_at_price || 0) > product?.base_price || promoDiscount > 0;
  const displayOldPrice = promoDiscount > 0 ? finalPrice : product?.compare_at_price;

  /** Commercial stock display: don't show exact count publicly */
  function getStockLabel(count: number): { text: string; className: string } {
    if (count <= 0) return { text: 'Agotado', className: 'text-red-400' };
    if (count <= 3) return { text: 'Últimas unidades', className: 'text-amber-400' };
    return { text: 'Disponible', className: 'text-green-400' };
  }

  const stockInfo = getStockLabel(stock);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.pageX - left - window.scrollX) / width) * 100;
    const y = ((e.pageY - top - window.scrollY) / height) * 100;
    setMousePos({ x, y });
  };

  function addToCart() {
    if (!selectedVariant) return;
    if (stock <= 0) return;
    if (quantity > stock) return;

    cart.addItem({
      product_id: product.id,
      variant_id: selectedVariant.id,
      quantity,
      title: product.title,
      price: finalPrice,
      image: productImage,
      variant_name: selectedVariant.name,
      category_id: product.category?.id,
      brand_id: product.brand?.id,
      vendor_id: product.vendor_id,
      vendor_name: product.vendor?.store_name,
      vendor_slug: product.vendor?.slug,
      vendor_logo: product.vendor?.logo_url,
      tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || [],
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);

    analytics.track({
      eventName: 'AddToCart',
      eventData: {
        content_name: product.title,
        content_ids: [product.id],
        content_type: 'product',
        value: finalPrice * quantity,
        currency: 'UYU'
      },
      user: { email: user?.email || undefined }
    });

  }

  const seoTitle = product.seo_title || `${product.title} - Comprar Online`;
  const seoDescription = product.seo_description || product.short_description || product.title;
  const productUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const productSchema: any = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": seoTitle,
    "image": [
      displayImage
     ],
    "description": seoDescription,
    "sku": selectedVariant?.sku || product.id,
    "brand": {
      "@type": "Brand",
      "name": product.brand?.name || "Generic"
    },
    "url": productUrl,
    "offers": {
      "@type": "Offer",
      "url": productUrl,
      "priceCurrency": "UYU",
      "price": finalPrice,
      "availability": stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition",
      "seller": {
        "@type": "Organization",
        "name": "Collectibles Uruguay"
      }
    }
  };

  if (reviews && reviews.length > 0) {
    productSchema.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": avgRating.toFixed(1),
      "reviewCount": reviews.length
    };
    productSchema.review = reviews.slice(0, 5).map((r: any) => ({
      "@type": "Review",
      "author": { "@type": "Person", "name": r.user_name || "Anónimo" },
      "datePublished": new Date(r.created_at).toISOString().split('T')[0],
      "reviewBody": r.body,
      "reviewRating": { "@type": "Rating", "bestRating": "5", "ratingValue": r.rating, "worstRating": "1" }
    }));
  }

  const breadcrumbElements = [
    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://collectibles.uy/" }
  ];
  if (product.category) {
    breadcrumbElements.push({
      "@type": "ListItem",
      "position": 2,
      "name": product.category.name,
      "item": `https://collectibles.uy/categoria/${product.category.slug}`
    });
    breadcrumbElements.push({
      "@type": "ListItem",
      "position": 3,
      "name": product.title,
      "item": productUrl
    });
  } else {
    breadcrumbElements.push({
      "@type": "ListItem",
      "position": 2,
      "name": product.title,
      "item": productUrl
    });
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbElements
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <SEO
        title={seoTitle}
        description={seoDescription}
        image={displayImage}
        type="product"
        schema={[productSchema, breadcrumbSchema]}
      />

      <nav className="flex items-center text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex-wrap gap-2">
        <Link to="/" className="hover:text-primary-500 transition-colors">Inicio</Link>
        <span className="opacity-30">/</span>
        {product.category && (
          <>
            <Link to={`/categoria/${product.category.slug}`} className="hover:text-primary-500 transition-colors">{product.category.name}</Link>
            <span className="opacity-30">/</span>
          </>
        )}
        <span className="text-white line-clamp-1">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-8">
        {/* GALLERY SECTION */}
        <section className="flex flex-col gap-4">
          <div
            className="w-full aspect-square md:aspect-auto md:h-[450px] lg:h-[500px] rounded-2xl bg-white flex items-center justify-center relative overflow-hidden group cursor-crosshair border border-slate-200 hover:border-slate-300 transition-colors shadow-sm"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={displayImage}
              alt={product.title}
              className={`max-w-[75%] max-h-[75%] object-contain mix-blend-multiply transition-all duration-700 ${isHovering ? 'scale-105' : 'scale-100'}`}
            />
            
            {/* Magnifier Lens */}
            {isHovering && (
              <div
                className="absolute pointer-events-none border border-slate-200 shadow-xl bg-no-repeat z-20 rounded-full bg-white hidden lg:block"
                style={{
                  left: `${mousePos.x}%`,
                  top: `${mousePos.y}%`,
                  width: '300px',
                  height: '300px',
                  transform: 'translate(-50%, -50%)',
                  backgroundImage: `url(${displayImage})`,
                  backgroundSize: '250%',
                  backgroundPosition: `${mousePos.x}% ${mousePos.y}%`,
                }}
              />
            )}
          </div>

          <div className="grid grid-cols-4 gap-4 mt-2">
            {images.slice(0, 4).map((img: any, i: number) => {
              const src = resolveImage(img.url);
              return (
                <button
                  key={img.id || i}
                  onClick={() => setSelectedImage(i)}
                  onMouseEnter={() => setSelectedImage(i)}
                  className={`relative rounded-xl aspect-square overflow-hidden transition-all duration-300 bg-white ${i === selectedImage ? 'ring-2 ring-[#f00856] ring-offset-2 ring-offset-[#05070f] scale-[0.98] opacity-100' : 'border border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'}`}
                >
                  <img src={src} alt="" className="w-full h-full object-contain p-2 mix-blend-multiply" />
                </button>
              );
            })}
          </div>
        </section>

        {/* INFO SECTION */}
        <section>
          <div className="label-tag">{settings['product_tag_label'] || 'Ficha de producto'}</div>
          
          {applicablePromos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 mb-2">
              {applicablePromos.map(promo => promo.badge_text && (
                <span 
                  key={promo.id}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md text-white shadow-lg shadow-black/20"
                  style={{ 
                    backgroundColor: promo.badge_bg || '#f00856', 
                    color: promo.badge_color || '#ffffff' 
                  }}
                >
                  {promo.badge_text}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-4xl md:text-6xl font-black leading-[1.1] mt-3 tracking-tight text-white">
            {product.title}
          </h1>
          
          {/* Reviews — only show if there are real reviews */}
          {reviews.length > 0 && (
            <div className="flex items-center gap-4 mt-5">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                ))}
              </div>
              <span className="text-sm font-bold text-slate-500">{reviews.length} valoraciones</span>
            </div>
          )}

          <p className="text-slate-300 mt-6 text-lg leading-relaxed max-w-xl">
            {product.short_description || "Una pieza pensada para coleccionistas que buscan algo más que un producto."}
          </p>

          {/* VARIANT SELECTOR — only shows if multiple variants */}
          {variants.length > 1 && (
            <div className="mt-6">
              <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em] mb-3">Variante</div>
              <div className="flex flex-wrap gap-2">
                {variants.map((v: any, idx: number) => (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedVariantIdx(idx); setQuantity(1); }}
                    className={`px-5 py-3 rounded-full text-sm font-bold transition-all border-2 ${
                      selectedVariantIdx === idx
                        ? 'border-[#f00856] bg-[#f00856]/10 text-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {v.name}
                    {v.price_adjustment > 0 && <span className="ml-1 text-xs opacity-60">(+${v.price_adjustment})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="glass rounded-[2rem] p-6 sm:p-8 mt-8 border border-white/10 shadow-lg relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em] mb-1">Precio actual</div>
                <div className="text-4xl sm:text-5xl font-black text-white flex items-end gap-3 flex-wrap">
                  <span>{formatCurrencyPrice(displayPrice)}</span>
                  {hasDiscount && (
                    <span className="text-xl sm:text-2xl text-slate-500 line-through font-bold mb-1">
                      {formatCurrencyPrice(displayOldPrice)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-400 mt-2 flex items-center gap-2 font-medium">
                   <Truck className="w-4 h-4 text-[#f00856]" /> {settings['product_shipping_calc_label'] || 'Envío calculado al finalizar'}
                </div>
                <div className={`text-sm font-bold mt-2 flex items-center gap-2 ${stockInfo.className}`}>
                  <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                  {stockInfo.text}
                </div>
              </div>

              {/* QUANTITY SELECTOR + ADD TO CART */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                <div className="flex items-center justify-between border border-white/10 bg-white/5 rounded-full overflow-hidden w-full sm:w-32 shadow-inner">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-center font-black text-lg text-white">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(stock, quantity + 1))}
                    className="w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
                    disabled={quantity >= stock}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  id="main-add-to-cart"
                  onClick={addToCart}
                  disabled={stock <= 0}
                  className={`btn-primary rounded-full px-8 py-4 sm:py-0 sm:h-12 flex-1 sm:flex-none flex items-center justify-center gap-3 text-sm uppercase tracking-widest font-black transition-all shadow-lg shadow-[#f00856]/20 hover:shadow-[#f00856]/40 ${
                    stock <= 0 ? 'opacity-50 cursor-not-allowed bg-slate-800' : 'hover:-translate-y-1'
                  } ${addedToCart ? 'bg-green-500 border-green-500 hover:bg-green-600 shadow-green-500/20' : ''}`}
                >
                  <ShoppingCart className="w-5 h-5" />
                  {addedToCart ? 'Agregado' : stock <= 0 ? 'Agotado' : 'Comprar Ahora'}
                </button>
                <button
                  onClick={() => toggleWishlist(product)}
                  className={`w-12 h-12 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center rounded-full border transition-all ${isInWishlist(product.id) ? 'bg-[#f00856]/10 border-[#f00856]' : 'border-white/10 hover:border-white/30 bg-white/5'}`}
                  title={isInWishlist(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                >
                  <Heart className={`w-5 h-5 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-slate-300'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* SELLER INFO — real data, no Math.random */}
          {product.brand?.name && (
            <div className="glass rounded-[2rem] p-6 mt-4">
              <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em]">{settings['product_sold_by_label'] || 'Vendido por'}</div>
              <div className="flex items-center justify-between gap-4 mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#f00856] flex items-center justify-center font-black text-xl shadow-lg shadow-[#f00856]/20">
                    {product.brand.name[0]}
                  </div>
                  <div>
                     <div className="font-black text-xl text-white">{product.brand.name}</div>
                  </div>
                </div>
                <span className="badge hidden sm:inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-green-400" /> {settings['product_distributor_label'] || 'Distribuidor oficial'}
                </span>
              </div>
            </div>
          )}

          <SoldByCard 
            vendorId={product.vendor_id} 
            vendorName={product.vendor?.store_name} 
            vendorLogo={product.vendor?.logo_url ? resolveImage(product.vendor.logo_url) : undefined}
            vendorSlug={product.vendor?.slug}
          />

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">{settings['product_trust_title_1'] || '⚡ Entrega'}</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">{settings['product_trust_desc_1'] || '24-48 horas'}</p>
            </div>
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">{settings['product_trust_title_2'] || '✅ Estado'}</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">{settings['product_trust_desc_2'] || 'Nuevo / Sellado'}</p>
            </div>
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">{settings['product_trust_title_3'] || '🔄 Devolución'}</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">{settings['product_trust_desc_3'] || '14 días gratis'}</p>
            </div>
          </div>
        </section>
      </div>

      {/* DESKTOP TABS / DETAILS */}
      <section className="hidden lg:grid grid-cols-[1fr_.8fr] gap-6 mt-10">
        <div className="glass rounded-[2.5rem] p-8 md:p-12">
          <div className="label-tag">Historia del producto</div>
          <h2 className="text-3xl md:text-4xl font-black mt-3 text-white tracking-tight">{settings['product_history_title'] || '¿Por qué importa?'}</h2>
          <div className="prose prose-invert mt-6 max-w-none text-slate-300 leading-relaxed text-lg">
             {product.description ? (
               <p>{product.description}</p>
             ) : (
               <p>{settings['product_history_default_text'] || 'Cada detalle ha sido verificado para garantizar su autenticidad y estado. Contexto del personaje, rareza, franquicia y valor para coleccionistas.'}</p>
             )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-[2.5rem] p-8 h-full">
            <div className="label-tag">Especificaciones</div>
            <h2 className="text-3xl font-black mt-3 text-white tracking-tight">{settings['product_specs_title'] || 'Detalles técnicos'}</h2>
            <div className="space-y-3 mt-6">
              <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Categoría</span>
                <b className="text-white">{product.category?.name || 'N/A'}</b>
              </div>
              <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Marca</span>
                <b className="text-white">{product.brand?.name || 'N/A'}</b>
              </div>
              {selectedVariant?.sku && !selectedVariant.sku.startsWith('COL-ML') && (
                <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                  <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">SKU</span>
                  <b className="text-white font-mono">{selectedVariant.sku}</b>
                </div>
              )}
              <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Disponibilidad</span>
                <b className={stockInfo.className}>{stockInfo.text}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MOBILE ACCORDIONS (lg:hidden) */}
      <section className="lg:hidden mt-10 space-y-4">
        {/* Accordion 1: Description */}
        <div className="glass rounded-[2rem] overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => setOpenMobileTab(openMobileTab === 'description' ? null : 'description')}
            className="w-full p-6 flex justify-between items-center text-left"
          >
            <div>
              <div className="label-tag">Historia del producto</div>
              <h3 className="text-lg font-black text-white mt-1 uppercase tracking-tight">{settings['product_history_title'] || '¿Por qué importa?'}</h3>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openMobileTab === 'description' ? 'rotate-180 text-[#f00856]' : ''}`} />
          </button>
          {openMobileTab === 'description' && (
            <div className="px-6 pb-6 pt-2 prose prose-invert text-slate-300 text-sm leading-relaxed border-t border-white/5 animate-fade-in">
              {product.description ? (
                <p>{product.description}</p>
              ) : (
                <p>{settings['product_history_default_text'] || 'Cada detalle ha sido verificado para garantizar su autenticidad y estado. Contexto del personaje, rareza, franquicia y valor para coleccionistas.'}</p>
              )}
            </div>
          )}
        </div>

        {/* Accordion 2: Specs */}
        <div className="glass rounded-[2rem] overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => setOpenMobileTab(openMobileTab === 'specs' ? null : 'specs')}
            className="w-full p-6 flex justify-between items-center text-left"
          >
            <div>
              <div className="label-tag">Especificaciones</div>
              <h3 className="text-lg font-black text-white mt-1 uppercase tracking-tight">{settings['product_specs_title'] || 'Detalles técnicos'}</h3>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openMobileTab === 'specs' ? 'rotate-180 text-[#f00856]' : ''}`} />
          </button>
          {openMobileTab === 'specs' && (
            <div className="px-6 pb-6 pt-2 space-y-3 border-t border-white/5 animate-fade-in">
              <div className="soft rounded-xl p-4 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Categoría</span>
                <b className="text-white">{product.category?.name || 'N/A'}</b>
              </div>
              <div className="soft rounded-xl p-4 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Marca</span>
                <b className="text-white">{product.brand?.name || 'N/A'}</b>
              </div>
              {selectedVariant?.sku && !selectedVariant.sku.startsWith('COL-ML') && (
                <div className="soft rounded-xl p-4 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">SKU</span>
                  <b className="text-white font-mono">{selectedVariant.sku}</b>
                </div>
              )}
              <div className="soft rounded-xl p-4 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Disponibilidad</span>
                <b className={stockInfo.className}>{stockInfo.text}</b>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* REVIEWS SECTION */}
      <section className="mt-16 border-t border-white/10 pt-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <div className="label-tag">{settings['product_reviews_label'] || 'Opiniones de compradores'}</div>
            <h2 className="text-4xl font-black mt-2 text-white">{settings['product_reviews_title'] || 'Lo que dicen los coleccionistas'}</h2>
          </div>
          {/* "Escribir reseña" disabled — no backend handler */}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 glass rounded-[2rem] p-12 text-center">
               <Star className="w-12 h-12 text-slate-700 mx-auto mb-4" />
               <p className="text-slate-400 font-bold">Aún no hay reseñas para este producto.</p>
               <p className="text-sm text-slate-500 mt-1">Sé el primero en compartir tu experiencia.</p>
            </div>
          ) : (
            reviews.map((r: any) => (
              <div key={r.id} className="glass rounded-[2rem] p-6 hover:border-[#f00856]/30 transition-all group">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                  ))}
                </div>
                <p className="text-white font-black mb-2 group-hover:text-[#f00856] transition-colors">{r.title || 'Reseña de coleccionista'}</p>
                <p className="text-sm text-slate-400 leading-relaxed mb-4 line-clamp-3">{r.body}</p>
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-white/5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-slate-400">
                    {r.user_name?.[0] || 'U'}
                  </div>
                  <span className="text-xs font-bold text-slate-500">{r.user_name || 'Anónimo'} · {new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* MOBILE STICKY BUY BAR */}
      {showStickyBar && stock > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#05070f]/95 backdrop-blur-md border-t border-white/10 p-4 animate-slide-up lg:hidden">
          <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src={displayImage}
                alt={product.title}
                className="w-12 h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0"
              />
              <div className="overflow-hidden">
                <p className="text-white font-black text-sm truncate uppercase tracking-tight">{product.title}</p>
                <p className="text-[#f00856] font-black text-sm">{formatCurrencyPrice(finalPrice)}</p>
              </div>
            </div>
            <button
              onClick={addToCart}
              className={`btn-primary rounded-full px-6 py-3 flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-black transition-all shadow-lg shadow-[#f00856]/20 hover:shadow-[#f00856]/40 ${
                addedToCart ? 'bg-green-500 border-green-500 hover:bg-green-600 shadow-green-500/20' : ''
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              {addedToCart ? 'Agregado' : 'Comprar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
