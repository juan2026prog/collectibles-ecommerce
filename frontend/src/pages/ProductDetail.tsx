import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Minus, Plus, Truck, ShieldCheck, Star, ChevronDown, Heart, Trophy } from 'lucide-react';
import { useProduct, useProductBuyBox } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useInternationalCartContext } from '../contexts/InternationalCartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlistContext } from '../contexts/WishlistContext';
import { usePromotions, getApplicablePromotions, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useCurrency } from '../contexts/CurrencyContext';
import { useLocale } from '../contexts/LocaleContext';
import { getProductGroupBadge } from '../hooks/useData';
import { getProductImage, resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { analytics } from '../lib/analytics';
import { trackViewContent, trackAddToCart, generateMetaEventId } from '../lib/meta/metaPixel';
import { trackGA4Event, trackClarityEvent } from '../lib/analyticsTracker';
import SEO from '../components/SEO';
import { resolveCartItemPrice } from '../lib/priceResolver';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { formatUSD } from '../lib/formatters';
import SoldByCard from '../components/SoldByCard';
import AdminTechnicalPanel from '../components/AdminTechnicalPanel';
import { calculateUruboxEstimate, getEstimatedWeightKg } from '../lib/urubox';

export default function ProductDetail() {
  const viewTrackedRef = useRef('');
  const { settings } = useSiteSettings();
  const { slug } = useParams();
  const { product, loading } = useProduct(slug);
  const groupBadge = getProductGroupBadge(product);
  const { buyBox, loading: buyBoxLoading } = useProductBuyBox(product?.id);
  const cart = useCartContext();
  const internationalCart = useInternationalCartContext();
  const { user } = useAuth();
  const { formatCurrencyPrice } = useCurrency();
  const { language } = useLocale();
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

      // GA4 & Clarity Tracking (Phase 2 & 6)
      if (viewTrackedRef.current !== product.id) {
        viewTrackedRef.current = product.id;

        trackGA4Event('view_item', {
          currency: 'UYU',
          value: product.base_price,
          items: [{
            item_id: String(product.id),
            item_name: String(product.title),
            item_brand: product.brand?.name || undefined,
            item_category: product.category?.name || undefined,
            price: Number(product.base_price),
            quantity: 1
          }]
        });

        trackClarityEvent('product_viewed');
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
  
  const activeBuyBox = buyBox?.[selectedVariant?.id] || null;
  const bbWinner = activeBuyBox?.winner || null;
  const hideVendors = false;
  const bbOtherOptions = activeBuyBox?.other_options || [];

  const stock = bbWinner ? Number(bbWinner.stock) : (selectedVariant?.inventory_count || 0);
  const finalPrice = bbWinner && !bbWinner.is_collectibles && bbWinner.price !== undefined ? Number(bbWinner.price) : (product ? (Number(product.base_price || 0) + Number((bbWinner ? bbWinner.price_adjustment : selectedVariant?.price_adjustment) || 0)) : 0);
    
  const winnerIsCollectibles = bbWinner ? bbWinner.is_collectibles : !product?.vendor_id;
  const winnerVendorId = bbWinner ? bbWinner.vendor_id : (product?.vendor_id || null);
  const storeName = bbWinner 
    ? bbWinner.vendor_name 
    : (product?.vendor_id 
        ? (product.vendor_store?.display_name || product.vendor_store?.store_name || product.vendor_store?.name || product.vendor?.company_name || product.vendor?.store_name || 'Vendedor')
        : 'Collectibles.uy');
  const winnerVendorName = winnerIsCollectibles ? 'Collectibles.uy' : storeName;
  const winnerHasLogistics = bbWinner ? bbWinner.has_logistics : false;

  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
  const currentImage = images[selectedImage]?.url;
  const displayImage = currentImage ? resolveImage(currentImage) : productImage;

  const applicablePromos = product ? getApplicablePromotions({
    product_id: product.id,
    category_id: product.category?.id,
    brand_id: product.brand?.id,
    vendor_id: product.vendor_id,
    promotions_opt_in: product.vendor?.promotions_opt_in || false,
    tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || []
  }, promotions) : [];

  let promoDiscount = 0;
  if (applicablePromos.length > 0 && product) {
    const item = {
      product_id: product.id,
      category_id: product.category?.id,
      brand_id: product.brand?.id,
      vendor_id: product.vendor_id,
      promotions_opt_in: product.vendor?.promotions_opt_in || false,
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

  // Cálculo Urubox en vivo
  const intlProduct = product?.international_products?.[0] || product?.international_products;
  const rawWeightGrams = intlProduct?.weight_grams;
  const weightKg = rawWeightGrams ? rawWeightGrams / 1000 : getEstimatedWeightKg(product?.category?.name);
  
  const uruboxEstimate = calculateUruboxEstimate({
    weight_kg: weightKg,
    category: product?.category?.name,
    destination_type: 'no_local_delivery'
  });
  const uruboxEstimatedCost = uruboxEstimate.total_urubox_usd;
  const totalEstimatedCost = Number(((intlProduct?.final_price_usd || product?.base_price) + uruboxEstimatedCost).toFixed(2));

  function addToCart(selectedOption?: any) {
    // Filter out browser events/MouseEvents passed as variant/selectedOption
    const isEvent = selectedOption && (
      selectedOption instanceof Event ||
      (typeof Event !== 'undefined' && selectedOption instanceof Event) ||
      selectedOption.nativeEvent ||
      selectedOption.target ||
      typeof selectedOption.preventDefault === 'function'
    );
    const option = isEvent ? undefined : selectedOption;

    if (!selectedVariant) return;
    
    // Resolve price using central helper
    const targetPrice = resolveCartItemPrice(product, option || selectedVariant);
    const targetStock = option ? option.stock : stock;
    const targetVendorId = option ? option.vendor_id : winnerVendorId;
    const targetVendorName = option ? option.vendor_name : winnerVendorName;
    const targetVpvId = option ? option.vpv_id : (bbWinner && !bbWinner.is_collectibles ? bbWinner.vpv_id : null);

    const targetStoreId = option 
      ? option.vendor_store_id 
      : (bbWinner && !bbWinner.is_collectibles ? bbWinner.vendor_store_id : (product.vendor_store_id || null));
      
    const targetStoreName = option 
      ? option.vendor_name 
      : (bbWinner ? bbWinner.vendor_name : (product.vendor_store?.store_name || product.vendor?.store_name || 'Collectibles'));

    const targetStoreSlug = option 
      ? option.vendor_store_slug 
      : (bbWinner && !bbWinner.is_collectibles ? bbWinner.vendor_store_slug : (product.vendor_store?.slug || product.vendor?.slug));

    const targetStoreLogo = option 
      ? option.vendor_store_logo 
      : (bbWinner && !bbWinner.is_collectibles ? bbWinner.vendor_store_logo : (product.vendor_store?.logo_url || product.vendor?.logo_url));

    const targetStoreBadges = option 
      ? (option.vendor_store_badges || []) 
      : (bbWinner && !bbWinner.is_collectibles 
          ? (bbWinner.vendor_store_badges || []) 
          : (product.vendor_store?.vendor_store_badge_assignments?.filter((x: any) => x.status === 'active' && x.approved_by && x.approved_at).map((x: any) => x.vendor_store_badges).filter(Boolean) || []));

    if (targetStock <= 0) return;
    if (quantity > targetStock) return;

    if (product.source_provider === 'zinc' || product.source_provider === 'amazon') {
      const intlProduct = product.international_products?.[0] || product.international_products;
      const weightKg = intlProduct?.weight_grams ? intlProduct.weight_grams / 1000 : undefined;
      
      internationalCart.addItem({
        product_id: product.id,
        variant_id: selectedVariant.id,
        title: product.title,
        price_usd: Number(intlProduct?.final_price_usd) || product.base_price,
        image_url: resolveImage(images[0]?.url) || product.image_url,
        quantity: quantity,
        weight_kg,
        raw_data: intlProduct?.raw_data,
        international_data: intlProduct
      });
      // Navegar directo al checkout internacional o carrito
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      return;
    }

    cart.addItem({
      product_id: product.id,
      variant_id: selectedVariant.id,
      vendor_product_variant_id: targetVpvId, // Will be null for Collectibles
      quantity: option ? 1 : quantity,
      title: product.title,
      price: targetPrice,
      image: productImage,
      variant_name: selectedVariant.name,
      category_id: product.category?.id,
      brand_id: product.brand?.id,
      vendor_id: targetVendorId,
      vendor_store_id: targetStoreId,
      vendor_name: targetStoreName,
      vendor_store_name: targetStoreName,
      vendor_slug: targetStoreSlug,
      vendor_store_slug: targetStoreSlug,
      vendor_logo: targetStoreLogo,
      vendor_store_badges: targetStoreBadges,
      sku: selectedVariant.sku || null,
      unit_price: targetPrice,
      image_url: productImage,
      promotions_opt_in: option
        ? (option.promotions_opt_in || false)
        : (product.vendor?.promotions_opt_in || false),
      tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || [],
      is_international: product.source_provider === 'zinc',
      urubox_estimate: product.international_products?.urubox_estimated_cost_usd || 0,
      weight_kg: weightKg,
      category_name: product.category?.name
    });

    if (!option) {
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }

    analytics.track({
      eventName: 'AddToCart',
      eventData: {
        content_name: product.title,
        content_ids: [product.id],
        content_type: 'product',
        value: targetPrice * (option ? 1 : quantity),
        currency: 'UYU'
      }
    });

    const metaEventId = generateMetaEventId('AddToCart', product.id);
    trackAddToCart(metaEventId, {
      content_ids: [product.id],
      contents: [{ id: product.id, quantity: option ? 1 : quantity, item_price: targetPrice }],
      value: targetPrice * (option ? 1 : quantity),
      currency: 'UYU'
    });

    // GA4 & Clarity Tracking (Phase 2 & 6)
    trackGA4Event('add_to_cart', {
      currency: 'UYU',
      value: targetPrice * (option ? 1 : quantity),
      items: [{
        item_id: String(product.id),
        item_name: String(product.title),
        item_brand: product.brand?.name || undefined,
        item_category: product.category?.name || undefined,
        item_variant: option ? option.name : undefined,
        price: Number(targetPrice),
        quantity: option ? 1 : quantity
      }]
    });

    trackClarityEvent('product_added_to_cart');
  }


  const vendorNameSuffix = hideVendors ? '' : (!winnerIsCollectibles ? ` (Vendido por ${winnerVendorName})` : '');
  const seoTitle = (product.seo_title || `${product.title} - Comprar Online`) + vendorNameSuffix;
  const seoDescription = (product.seo_description || product.short_description || product.title) + (hideVendors ? '' : (!winnerIsCollectibles ? ` - Vendido por ${winnerVendorName} en Collectibles.` : ''));
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
          "name": winnerVendorName
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
      <AdminTechnicalPanel product={product} />

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
            {groupBadge && (
              <div className="absolute top-4 left-4 z-20 w-14 h-14 md:w-16 md:h-16 pointer-events-none drop-shadow-md select-none">
                <img
                  src={groupBadge.url}
                  alt={groupBadge.alt}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <img
              src={displayImage}
              alt={product.title}
              referrerPolicy="no-referrer"
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
                  <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-contain p-2 mix-blend-multiply" />
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

          {/* AMAZON BADGES */}
          {product.source_provider === 'zinc' && product.international_products?.amazon_discount_percent > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 mb-2">
              <span className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md text-white shadow-lg shadow-black/20 bg-[#f00856]">
                {product.international_products?.amazon_discount_percent > 40 ? '🔥 Liquidación' : product.international_products?.amazon_discount_percent > 25 ? '🔥 Gran Oferta' : '🔥 Oferta Amazon'}
              </span>
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
                {product.source_provider === 'zinc' ? (
                  <>
                    <div className="flex flex-col gap-1 mb-4 border-b border-white/10 pb-4">
                      {product.international_products?.amazon_list_price_usd && (
                        <div className="text-sm text-slate-400 font-bold flex items-center gap-2">
                          <span className="line-through">{formatUSD(product.international_products?.amazon_list_price_usd)}</span>
                          <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded text-[10px] uppercase">{product.international_products?.amazon_discount_percent}% OFF</span>
                        </div>
                      )}
                      <div className="text-2xl font-bold text-white">{formatUSD(product.international_products?.amazon_current_price_usd || product.base_price)}</div>
                    </div>
                    <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em] mb-1 mt-4">Precio final Collectibles</div>
                    <div className="text-4xl sm:text-5xl font-black text-white flex items-end gap-3 flex-wrap">
                      <span>{formatCurrencyPrice(displayPrice)}</span>
                    </div>

                    <div className="mt-4 border-t border-white/5 pt-4">
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="text-slate-400">Precio Collectibles</span>
                        <span className="font-medium text-white">{formatUSD(intlProduct?.final_price_usd || product.base_price)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-slate-400">Estimación Urubox</span>
                        <span className="font-medium text-white">{formatUSD(uruboxEstimatedCost)}</span>
                      </div>
                      <div className="flex justify-between items-center text-base font-bold bg-[#f00856]/10 p-2 rounded-lg text-[#f00856] border border-[#f00856]/20">
                        <span>Total estimado puesto en Uruguay</span>
                        <span>{formatUSD(totalEstimatedCost)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 text-center">
                        Estimación basada en peso informado o estimado. El costo final puede variar según el peso real del courier.
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {intlProduct?.amazon_delivery_type && (
                        <div className="font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded">
                          {intlProduct.amazon_delivery_type.includes('prime') ? '✓ Prime' : 'Disponibilidad Amazon'}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#f00856] bg-[#f00856]/10 px-3 py-1 rounded-full">
                       🌎 Importación Internacional
                    </div>
                    <div className="text-xs text-slate-400 mt-2">Compra protegida por Collectibles. Envío a tu courier en USA.</div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
                
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
                  onClick={() => {
                    const isAdding = !isInWishlist(product.id);
                    toggleWishlist(product);
                    if (isAdding) {
                      trackGA4Event('add_to_wishlist', {
                        currency: 'UYU',
                        value: product.base_price,
                        items: [{
                          item_id: String(product.id),
                          item_name: String(product.title),
                          item_brand: product.brand?.name || undefined,
                          item_category: product.category?.name || undefined,
                          price: Number(product.base_price),
                          quantity: 1
                        }]
                      });
                    }
                  }}
                  className={`w-12 h-12 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center rounded-full border transition-all ${isInWishlist(product.id) ? 'bg-[#f00856]/10 border-[#f00856]' : 'border-white/10 hover:border-white/30 bg-white/5'}`}
                  title={isInWishlist(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                >
                  <Heart className={`w-5 h-5 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-slate-300'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* MARCA CARD */}
          {product.brand?.name && (
            <div className="glass rounded-[2rem] p-6 mt-4">
              <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em]">MARCA</div>
              <div className="flex items-center justify-between gap-4 mt-4">
                <div className="flex items-center gap-3">
                  {product.brand.logo_url && (
                    <img 
                      src={resolveImage(product.brand.logo_url)} 
                      alt={product.brand.name} 
                      className="w-10 h-10 rounded-xl object-contain border border-white/10"
                    />
                  )}
                  <span className="font-black text-xl text-white">{product.brand.name}</span>
                </div>
                {/* Official Store Badge under strict conditions */}
                {(() => {
                  if (!product.vendor_store) return null;
                  if (
                    product.vendor_store.is_official &&
                    product.vendor_store.status === 'active' &&
                    product.vendor_store.approved_by &&
                    product.vendor_store.approved_at
                  ) {
                    return (
                      <span className="text-[10px] px-2 py-1 font-black leading-none uppercase rounded bg-red-500 text-white border border-red-400 tracking-wider">
                        {language === 'en' ? 'Official Store' : 'TIENDA OFICIAL'}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          {/* VENDIDO Y DESPACHADO POR */}
          <SoldByCard 
            vendorId={product.vendor_id || undefined} 
            vendorName={product.vendor_id ? storeName : 'Collectibles.uy'} 
            vendorLogo={product.vendor_id ? (product.vendor_store?.logo_url || product.vendor?.logo_url) : undefined}
            vendorSlug={product.vendor_id ? (product.vendor_store?.slug || product.vendor?.slug) : undefined}
            badges={[]}
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
                referrerPolicy="no-referrer"
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
