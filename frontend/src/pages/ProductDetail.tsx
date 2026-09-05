import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Minus, Plus, Star, ChevronDown, Heart, Zap, ZoomIn, Archive } from 'lucide-react';
import { useProduct, useProductBuyBox, useProducts, getProductGroupBadge, getAllProductGroupBadges } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useInternationalCartContext } from '../contexts/InternationalCartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlistContext } from '../contexts/WishlistContext';
import { usePromotions, getApplicablePromotions, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useCurrency } from '../contexts/CurrencyContext';
import { useLocale } from '../contexts/LocaleContext';
import { resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { useImageProtection } from '../hooks/useImageProtection';
import { analytics } from '../lib/analytics';
import { trackGA4Event } from '../lib/analyticsTracker';
import { trackViewContent, generateMetaEventId } from '../lib/meta/metaPixel';
import SEO from '../components/SEO';
import { generateProductSchema, generateBreadcrumbs, generateMetaTitle, generateMetaDescription, generateCanonical } from '../utils/seoHelpers';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { formatUSD } from '../lib/formatters';
import SoldByCard from '../components/SoldByCard';
import ProductShippingBlock from '../components/ProductShippingBlock';
import { sanitizeProductDescription } from '../lib/descriptionSanitizer';
import AdminTechnicalPanel from '../components/AdminTechnicalPanel';
import { calculateUruboxEstimate, getEstimatedWeightKg } from '../lib/urubox';
import { isValidInternalSku } from '../lib/skuUtils';
import { ProductGridCard } from '../components/ProductGridCard';
import { calculateArgentinaShippingStatus } from '../lib/mbeLogisticsUtils';
import { getConditionLabel } from '../config/conditionConfig';
import InternationalCuposBadge from '../components/international/InternationalCuposBadge';
import InternationalWaitlistModal from '../components/international/InternationalWaitlistModal';
import { resolveProductInventory } from '../lib/canonicalStock';
import { AddToCompareButton } from '../components/compare/AddToCompareButton';
import { ProductUruguayCostDrawer } from '../components/customs/ProductUruguayCostDrawer';

// ── COMPONENTE SECCIÓN PRODUCTOS RELACIONADOS ──
function RelatedProductsSection({ currentProductId, categorySlug }: { currentProductId: string; categorySlug?: string }) {
  const { products } = useProducts({ category: categorySlug, limit: 6 });
  const { formatCurrencyPrice } = useCurrency();
  const { addToCart } = useCartContext();

  const filtered = (products || []).filter(p => p.id !== currentProductId).slice(0, 4);

  if (filtered.length === 0) return null;

  return (
    <section className="mt-14 pt-10 border-t border-white/10">
      <div className="mb-6">
        <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856]">Recomendados</span>
        <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">También puede interesarte</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.map(p => (
          <ProductGridCard
            key={p.id}
            product={p}
            onAddToCart={() => addToCart(p)}
            formatPrice={(price) => formatCurrencyPrice(price)}
          />
        ))}
      </div>
    </section>
  );
}

export default function ProductDetail() {
  const navigate = useNavigate();
  const viewTrackedRef = useRef('');
  const { settings } = useSiteSettings();
  const { slug } = useParams<{ slug: string }>();
  const { product, redirectSlug, loading: productLoading } = useProduct(slug || '');

  useEffect(() => {
    if (redirectSlug && redirectSlug !== slug) {
      navigate(`/p/${redirectSlug}`, { replace: true });
    }
  }, [redirectSlug, slug, navigate]);
  const { getImageProps, handleDragStart } = useImageProtection({ isProduct: true });
  const groupBadge = getProductGroupBadge(product);
  const { buyBox } = useProductBuyBox(product?.id);
  const cart = useCartContext();
  const internationalCart = useInternationalCartContext();
  const { user } = useAuth();
  const { formatCurrencyPrice, selectedCurrency } = useCurrency();
  const { promotions } = usePromotions();
  const { toggleWishlist, isInWishlist } = useWishlistContext();

  const arShippingStatus = calculateArgentinaShippingStatus(product || {});
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [showCustomsDrawer, setShowCustomsDrawer] = useState(false);
  const [openMobileTab, setOpenMobileTab] = useState<'description' | 'specs' | null>('description');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  // Synchronize quantity with canonical inventory at top-level before early returns
  useEffect(() => {
    if (!product) return;
    const vars = product.variants && product.variants.length > 0 ? product.variants : [];
    const v = vars[selectedVariantIdx] || null;
    const resolution = resolveProductInventory(product, v);
    const isIntl = product.source_provider === 'zinc' || Boolean(product.is_international);
    const maxQty = resolution.availableQuantity !== null 
      ? resolution.availableQuantity 
      : (resolution.isAvailable && isIntl ? 1 : 0);

    if (!resolution.isAvailable || maxQty <= 0) {
      if (quantity !== 0) setQuantity(0);
    } else if (quantity === 0) {
      setQuantity(1);
    } else if (quantity > maxQty) {
      setQuantity(maxQty);
    }
  }, [product, selectedVariantIdx, quantity]);

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
      setSelectedImage(prev => (prev + 1) % images.length);
    }
    if (diff < -50) {
      setSelectedImage(prev => (prev - 1 + images.length) % images.length);
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  useEffect(() => {
    const handleScroll = () => {
      const mainBtn = document.getElementById('main-buy-now') || document.getElementById('main-add-to-cart');
      const footer = document.querySelector('footer');
      if (!mainBtn) return;

      const rect = mainBtn.getBoundingClientRect();
      const footerRect = footer ? footer.getBoundingClientRect() : null;

      // CTA is visible in the viewport
      const isCtaInViewport = rect.top < window.innerHeight && rect.bottom > 0;
      // Reached footer
      const isFooterReached = footerRect ? footerRect.top <= (window.innerHeight - 30) : false;

      // Show when user scrolled enough, CTA is out of view, and footer is not covered
      const shouldShow = window.scrollY > 350 && !isCtaInViewport && !isFooterReached;
      setShowStickyBar(shouldShow);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [product]);



  useEffect(() => {
    if (product && viewTrackedRef.current !== product.id) {
      viewTrackedRef.current = product.id;
      const basePrice = Number(product.base_price || 0);
      const metaEventId = generateMetaEventId('ViewContent', product.id);

      trackViewContent(metaEventId, {
        content_ids: [product.id],
        content_name: product.title,
        category: product.category?.name,
        brand: product.brand?.name,
        value: basePrice,
        currency: 'UYU'
      });

      trackGA4Event('view_item', {
        currency: 'UYU',
        value: basePrice,
        items: [{
          item_id: String(product.id),
          item_name: String(product.title),
          item_brand: product.brand?.name || undefined,
          item_category: product.category?.name || undefined,
          price: basePrice
        }]
      });
    }
  }, [product]);

  if (productLoading) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 flex justify-center items-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-[#f00856] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-[1500px] mx-auto px-6 py-20 text-center min-h-[50vh] flex flex-col justify-center items-center">
        <h2 className="text-3xl font-black text-white">Producto no encontrado</h2>
        <p className="text-slate-400 mt-2">El producto que buscas no existe o ha sido despublicado.</p>
        <Link to="/shop" className="btn-primary mt-6">Volver al catálogo</Link>
      </div>
    );
  }

  const variants = product.variants && product.variants.length > 0 ? product.variants : [];
  const selectedVariant = variants[selectedVariantIdx] || null;

  const currentVariantBuyBox = selectedVariant ? (buyBox as any)?.[selectedVariant.id] : null;
  const bbWinner = currentVariantBuyBox?.winner || (buyBox as any)?.winner || (buyBox ? Object.values(buyBox as any)[0] as any : null)?.winner;
  const winnerIsCollectibles = bbWinner 
    ? (bbWinner.vendor_id === 'platform' || !bbWinner.vendor_id)
    : (!product.vendor_id || product.vendor_id === 'platform');
  const winnerVendorName = winnerIsCollectibles 
    ? 'Collectibles.uy' 
    : (bbWinner?.vendor_store_name || bbWinner?.vendor_name || product.vendor_store?.store_name || product.vendor_store?.name || product.vendor?.company_name || product.vendor?.store_name || product.vendor?.name || 'Vendedor Oficial');
  const winnerVendorId = winnerIsCollectibles ? null : (bbWinner?.vendor_id || product.vendor_id);

  const rawBasePrice = Number(product.base_price || 0);
  const variantAdjustment = Number(selectedVariant?.price_adjustment || 0);
  const basePriceWithVariant = rawBasePrice + variantAdjustment;

  const applicablePromos = product ? getApplicablePromotions({
    product_id: product.id,
    category_id: product.category_id,
    brand_id: product.brand_id,
    vendor_id: winnerVendorId,
    tag_ids: Array.isArray(product.product_tags) ? product.product_tags.map((pt: any) => pt.tag_id) : []
  }, promotions || []) : [];
  const promoResult = evaluateItemDiscountDetailed({
    product_id: product.id,
    category_id: product.category_id,
    brand_id: product.brand_id,
    vendor_id: winnerVendorId,
    tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || [],
    price: basePriceWithVariant,
    quantity: 1
  }, applicablePromos);

  const finalPrice = basePriceWithVariant - promoResult.discount;
  const displayPrice = finalPrice;
  const displayOldPrice = basePriceWithVariant;
  const hasDiscount = promoResult.discount > 0;
  const discountPercent = hasDiscount ? Math.round((promoResult.discount / basePriceWithVariant) * 100) : 0;

  const images = Array.isArray(product.images) && product.images.length > 0
    ? [...product.images].sort((a: any, b: any) => (a.sort_order || a.position || 0) - (b.sort_order || b.position || 0))
    : Array.isArray(product.product_images) && product.product_images.length > 0
      ? [...product.product_images].sort((a: any, b: any) => (a.position || a.sort_order || 0) - (b.position || b.sort_order || 0))
      : [{ url: product.image_url || FALLBACK_IMAGE }];

  const currentImgObj = images[selectedImage] || images[0];
  const displayImage = resolveImage(currentImgObj?.url || product.image_url, 'detail');

  const inventoryResolution = resolveProductInventory(product, selectedVariant);
  const isIntl = product.source_provider === 'zinc' || Boolean(product.is_international);
  const isVendorActive = !product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined;
  const isAvailable = inventoryResolution.isAvailable;
  const isPurchasable = isAvailable && isVendorActive;
  const maxPurchasableStock = inventoryResolution.availableQuantity !== null
    ? inventoryResolution.availableQuantity
    : (isAvailable && isIntl ? 1 : 0);
  const stock = maxPurchasableStock;

  const getStockInfo = () => {
    if (!isVendorActive) {
      return { text: 'Vendedor no disponible', className: 'text-amber-400 border-amber-500/20 bg-amber-500/10' };
    }
    if (!isAvailable) {
      if (inventoryResolution.availableQuantity === 0) {
        return { text: 'Agotado', className: 'text-red-400 border-red-500/20 bg-red-500/10' };
      }
      return { text: 'Disponibilidad no confirmada', className: 'text-slate-400 border-slate-500/20 bg-slate-500/10' };
    }
    if (product.badge?.toLowerCase().includes('preventa') || product.title?.toLowerCase().includes('preventa')) {
      return { text: 'Preventa', className: 'text-amber-400 border-amber-500/20 bg-amber-500/10' };
    }
    if (inventoryResolution.availableQuantity === null) {
      return { text: 'Disponible bajo pedido', className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' };
    }
    if (maxPurchasableStock <= 3) {
      return { text: `¡Últimas ${maxPurchasableStock} unidades!`, className: 'text-amber-400 border-amber-500/20 bg-amber-500/10' };
    }
    return { text: 'Disponible en stock', className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' };
  };

  const stockInfo = getStockInfo();
  const addToCart = (customVariant?: any, directCheckout = false) => {
    if (!isPurchasable) return;
    const targetVariant = customVariant || selectedVariant;

    if (isIntl) {
      internationalCart.addItem({
        product_id: product.id,
        variant_id: targetVariant?.id || product.id,
        title: product.title,
        price_usd: Number(product.final_price_usd || product.price_usd || (finalPrice / 42)),
        image_url: displayImage || product.image_url || '',
        quantity,
        weight_kg: product.weight_kg || 0.5,
        international_data: product.international_products?.[0] || null
      });

      cart.addItem({
        id: product.id,
        product_id: product.id,
        title: product.title,
        price: finalPrice,
        base_price: product.base_price || finalPrice,
        image: displayImage,
        image_url: displayImage,
        quantity,
        variant_id: targetVariant?.id || product.id,
        variant_name: targetVariant?.name || '',
        vendor_id: undefined,
        vendor_name: undefined,
        is_international: true,
        weight_kg: product.weight_kg || 0.5,
        sku: targetVariant?.sku || product.sku
      } as any);

      if (directCheckout) {
        navigate('/checkout');
      } else {
        setAddedToCart(true);
        setTimeout(() => setAddedToCart(false), 2500);
      }
      return;
    }

    cart.addItem({
      id: product.id,
      product_id: product.id,
      title: product.title,
      price: finalPrice,
      base_price: product.base_price,
      image: displayImage,
      image_url: displayImage,
      quantity,
      variant_id: targetVariant?.id,
      variant_name: targetVariant?.name,
      vendor_id: winnerVendorId,
      vendor_name: winnerVendorName,
      sku: targetVariant?.sku || product.sku
    } as any);

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);

    if (directCheckout) {
      navigate('/checkout');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const reviews = product.reviews || [];

  const productCanonical = generateCanonical('producto', product.slug || product.id);
  const seoTitle = generateMetaTitle('producto', product.title);
  const seoDescription = generateMetaDescription('producto', product.description ? sanitizeProductDescription(product.description) : null, product.title);

  const productSchema = generateProductSchema(product, product.brand, product.category, displayImage ? [displayImage] : []);
  const breadcrumbSchema = generateBreadcrumbs('producto', product);

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-3 sm:py-6 md:py-10 pb-28 lg:pb-10">
      <SEO
        title={seoTitle}
        description={seoDescription}
        image={displayImage}
        url={productCanonical}
        type="product"
      />
      <AdminTechnicalPanel product={product} />

      {/* BREADCRUMB */}
      <nav className="flex items-center text-xs font-medium text-slate-400 mb-3 sm:mb-6 flex-wrap gap-2">
        <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
        <span className="text-slate-600">/</span>
        {product.category && (
          <>
            <Link to={`/categoria/${product.category.slug}`} className="hover:text-white transition-colors">{product.category.name}</Link>
            <span className="text-slate-600">/</span>
          </>
        )}
        <span className="text-slate-200 line-clamp-1">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6 lg:gap-14 items-start">
        {/* GALLERY SECTION */}
        <section className="flex flex-col gap-3 sm:gap-4 lg:sticky lg:top-28">
          <div
            className="w-full aspect-square max-h-[360px] sm:max-h-[500px] md:max-h-[660px] rounded-2xl sm:rounded-3xl bg-white flex items-center justify-center relative overflow-hidden group cursor-crosshair border border-white/10 shadow-2xl p-2.5 sm:p-6 transition-all duration-300 img-protected"
            data-protected-image="true"
            data-product-image="true"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {(() => {
              const groupBadges = getAllProductGroupBadges(product);
              if (groupBadges.length === 0) return null;
              return (
                <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20 flex flex-col gap-2 pointer-events-none drop-shadow-md select-none scale-90 sm:scale-100 origin-top-left">
                  {groupBadges.map((gb, idx) => (
                    <div key={`${gb.url}-${idx}`} className="w-12 h-12 sm:w-16 sm:h-16">
                      <img
                        src={gb.url}
                        alt={gb.alt}
                        draggable={false}
                        onDragStart={handleDragStart}
                        className="w-full h-full object-contain img-protected"
                      />
                    </div>
                  ))}
                </div>
              );
            })()}
            <img
              src={displayImage}
              alt={product.title}
              referrerPolicy="no-referrer"
              className={`max-w-full max-h-full object-contain transition-transform duration-200 pointer-events-none ${isHovering ? 'scale-150' : 'scale-100'}`}
              style={isHovering ? {
                transformOrigin: `${mousePos.x}% ${mousePos.y}%`
              } : undefined}
            />

            {isHovering && (
              <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1.5 pointer-events-none border border-white/10">
                <ZoomIn className="w-3 h-3 text-[#f00856]" />
                <span>Zoom activo</span>
              </div>
            )}
          </div>

          {/* THUMBNAILS ROW */}
          {images.length > 1 && (
            <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 no-scrollbar">
              {images.map((img: any, index: number) => {
                const src = resolveImage(img.url);
                const activeImage = selectedImage;
                return (
                  <button
                    key={img.id || index}
                    onClick={() => setSelectedImage(index)}
                    className={`w-14 h-14 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl overflow-hidden bg-white/5 p-1 transition-all duration-300 flex-shrink-0 cursor-pointer ${
                      activeImage === index
                        ? 'ring-2 ring-[#f00856] ring-offset-2 ring-offset-[#05070f] scale-[0.98] opacity-100 shadow-md'
                        : 'border border-white/10 opacity-60 hover:opacity-100 hover:border-white/30'
                    }`}
                  >
                    <img 
                      src={src} 
                      alt="" 
                      referrerPolicy="no-referrer" 
                      loading="lazy" 
                      {...getImageProps("w-full h-full object-contain p-1 sm:p-2 mix-blend-multiply")}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* INFO SECTION */}
        <section className="space-y-6">
          {/* TÍTULO */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856] bg-[#f00856]/10 px-3 py-1 rounded-full border border-[#f00856]/20">
                {settings['product_tag_label'] || 'Ficha de producto'}
              </span>

              {(product.is_international || product.source_provider === 'zinc' || product.shipping_type === 'international_courier_direct') && (
                <span className="text-[10px] uppercase font-black tracking-widest text-sky-400 bg-sky-950/80 px-3 py-1 rounded-full border border-sky-500/30 flex items-center gap-1">
                  <span>🌎</span> Producto internacional
                </span>
              )}

              {applicablePromos.map(promo => promo.badge_text && (
                <span 
                  key={promo.id}
                  className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full text-white shadow-sm"
                  style={{ 
                    backgroundColor: promo.badge_bg || '#f00856', 
                    color: promo.badge_color || '#ffffff' 
                  }}
                >
                  {promo.badge_text}
                </span>
              ))}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-[1.2] tracking-tight text-white mt-2">
              {product.title}
            </h1>
          </div>

          {/* 1. BLOQUE DE PRECIO (PRIORIDAD MÁXIMA - Requirement 1 & 13) */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-[11px] uppercase text-slate-400 font-bold tracking-wider">Precio actual</div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className={`text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight ${isIntl ? 'text-sky-400' : 'text-white'}`}>
                {isIntl ? formatUSD(product.final_price_usd || product.base_price || displayPrice) : formatCurrencyPrice(displayPrice)}
              </span>
              {hasDiscount && (
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl text-slate-500 line-through font-semibold">
                    {isIntl ? formatUSD(product.amazon_list_price_usd || displayOldPrice) : formatCurrencyPrice(displayOldPrice)}
                  </span>
                  <span className="bg-[#f00856]/15 text-[#f00856] text-xs font-bold px-2.5 py-0.5 rounded-md uppercase border border-[#f00856]/30">
                    {discountPercent}% OFF
                  </span>
                </div>
              )}
            </div>

            {/* BADGES DE CONFIANZA Y ATRIBUTOS REALES (Requirement 13) */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className={`text-xs font-semibold px-3 py-1 rounded-full border bg-white/[0.03] flex items-center gap-2 ${stockInfo.className}`}>
                <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
                {stockInfo.text}
              </div>

              {isIntl && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full border border-sky-500/40 bg-sky-950/60 text-sky-300 flex items-center gap-1.5 shadow-sm">
                  <span>🌎</span> Producto Internacional
                </span>
              )}

              {isIntl && (
                <InternationalCuposBadge 
                  productCostUsd={product.base_price_usd || (finalPrice / 42)}
                  onOpenWaitlist={() => setShowWaitlistModal(true)}
                />
              )}
              {product.brand?.name && (
                <span className="text-xs font-medium px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300">
                  Original · {product.brand.name}
                </span>
              )}
              {product.condition && (
                <span className="text-xs font-medium px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300">
                  🏷️ {getConditionLabel(product.condition)}
                </span>
              )}

              {/* ESTIMACIÓN COSTO PUESTO EN URUGUAY (MI FRANQUICIA) */}
              <button
                type="button"
                onClick={() => setShowCustomsDrawer(true)}
                className="text-xs font-bold px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>🇺🇾</span>
                <span>Ver costo estimado puesto en Uruguay ›</span>
              </button>

              {selectedCurrency === 'ARS' && (
                arShippingStatus.reasonCode === 'VENDOR_ARGENTINA_DISABLED' ? (
                  <span className="text-xs font-medium px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-slate-400 flex items-center gap-1.5" title="Este vendedor no realiza envíos a Argentina">
                    Este vendedor no realiza envíos a Argentina
                  </span>
                ) : arShippingStatus.isEligible ? (
                  <span className="text-xs font-medium px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 flex items-center gap-1.5">
                    🇦🇷 Envío a Argentina disponible
                  </span>
                ) : (
                  <span className="text-xs font-medium px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-center gap-1.5" title={arShippingStatus.reason}>
                    🇦🇷 Consultar envío a Argentina
                  </span>
                )
              )}
            </div>
          </div>

          {/* VARIANT SELECTOR */}
          {variants.length > 1 && (
            <div className="pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Variante</div>
              <div className="flex flex-wrap gap-2">
                {variants.map((v: any, idx: number) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVariantIdx(idx);
                      const nextResolution = resolveProductInventory(product, v);
                      const nextMax = nextResolution.availableQuantity !== null 
                        ? nextResolution.availableQuantity 
                        : (nextResolution.isAvailable && isIntl ? 1 : 0);
                      setQuantity(nextMax > 0 ? 1 : 0);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      selectedVariantIdx === idx
                        ? 'border-[#f00856] bg-[#f00856]/10 text-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white bg-white/[0.02]'
                    }`}
                  >
                    {v.name}
                    {v.price_adjustment > 0 && <span className="ml-1 text-[10px] opacity-70">(+${v.price_adjustment})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. BOTONES DE COMPRA (Requirement 2) */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            {!isVendorActive && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs font-medium flex items-center gap-2">
                <span>⚠️ Este vendedor se encuentra temporalmente inactivo o suspendido. Los productos no están disponibles para la compra.</span>
              </div>
            )}

            {/* QUANTITY SELECTOR */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cantidad</span>
              <div className="flex items-center justify-between border border-white/10 bg-white/[0.03] rounded-store-md h-11 w-36">
                <button
                  id="qty-minus"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  disabled={quantity <= 1 || !isPurchasable}
                  aria-label="Disminuir cantidad"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span id="qty-display" className="font-bold text-base text-white">{quantity}</span>
                <button
                  id="qty-plus"
                  onClick={() => setQuantity(Math.min(maxPurchasableStock, quantity + 1))}
                  className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  disabled={quantity >= maxPurchasableStock || !isPurchasable}
                  aria-label="Aumentar cantidad"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* BOTÓN COMPRAR AHORA (CTA PRINCIPAL) */}
            <button
              id="main-buy-now"
              onClick={() => addToCart(undefined, true)}
              disabled={!isPurchasable}
              className={`w-full py-3.5 sm:py-4 rounded-store-lg flex items-center justify-center gap-2.5 text-sm sm:text-base uppercase tracking-wider font-bold transition-all bg-[#f00856] text-white shadow-lg shadow-[#f00856]/25 hover:bg-[#ff2c68] hover:shadow-[#f00856]/40 hover:-translate-y-0.5 cursor-pointer min-h-[48px] ${
                !isPurchasable ? 'opacity-50 cursor-not-allowed bg-slate-800 shadow-none' : ''
              }`}
            >
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
              {!isVendorActive 
                ? 'Vendedor inactivo' 
                : !isAvailable 
                  ? (inventoryResolution.availableQuantity === 0 ? 'Agotado' : 'No disponible') 
                  : 'Comprar ahora'}
            </button>

            {/* BOTÓN AGREGAR AL CARRITO (CTA SECUNDARIO) */}
            <button
              id="main-add-to-cart"
              onClick={() => addToCart()}
              disabled={!isPurchasable}
              className={`w-full py-3 rounded-store-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider font-bold transition-all border border-white/15 text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/30 cursor-pointer min-h-[44px] ${
                !isPurchasable ? 'opacity-50 cursor-not-allowed border-white/5 text-slate-500' : ''
              } ${addedToCart ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : ''}`}
            >
              <ShoppingCart className="w-4 h-4" />
              {!isPurchasable 
                ? (inventoryResolution.availableQuantity === 0 ? 'Sin stock' : 'No disponible')
                : addedToCart 
                  ? '✓ Agregado al carrito' 
                  : 'Agregar al carrito'}
            </button>

            {/* FAVORITOS, COMPARADOR Y VAULT */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                onClick={() => toggleWishlist(product)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <Heart className={`w-4 h-4 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-slate-400'}`} />
                <span>{isInWishlist(product.id) ? 'En Favoritos' : 'Favoritos'}</span>
              </button>

              <span className="text-white/20">|</span>

              <AddToCompareButton productId={product.id} variant="button" />

              <span className="text-white/20">|</span>

              <Link
                to={`/vault/item/new?product_id=${product.id}&title=${encodeURIComponent(product.title)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 transition"
                title="Agregar a mi colección personal en Collector Vault"
              >
                <Archive size={14} />
                <span>Mi Vault</span>
              </Link>
            </div>
          </div>

          {/* 3. BLOQUE DEL VENDEDOR (Requirement 3) */}
          <SoldByCard 
            vendorId={winnerIsCollectibles ? undefined : (winnerVendorId || product.vendor_id || undefined)} 
            vendorName={winnerVendorName} 
            vendorLogo={winnerIsCollectibles ? undefined : (bbWinner?.vendor_store_logo || product.vendor_store?.logo_url || product.vendor?.logo_url)}
            vendorSlug={winnerIsCollectibles ? undefined : (bbWinner?.vendor_store_slug || product.vendor_store?.slug || product.vendor?.slug)}
            badges={winnerIsCollectibles ? [] : (bbWinner?.vendor_store_badges || (product.vendor_store?.vendor_store_badge_assignments?.filter((x: any) => x.status === 'active' && x.approved_by && x.approved_at).map((x: any) => x.vendor_store_badges).filter(Boolean) || []))}
          />

          {/* 4. REDISEÑO BLOQUE ENVÍOS (Requirement 4) */}
          <ProductShippingBlock
            product={product}
            vendorId={winnerIsCollectibles ? null : (winnerVendorId || product.vendor_id || null)}
            vendorName={winnerVendorName}
            vendorShippingSettings={winnerIsCollectibles ? null : (product?.vendor?.shipping_settings || null)}
            isCollectibles={winnerIsCollectibles}
          />

          {/* 5. BLOQUE "¿POR QUÉ COMPRAR EN COLLECTIBLES?" (Requirement 5) */}
          <div className="grid grid-cols-3 gap-2 py-3.5 border-t border-white/10 text-center">
            <div className="text-xs font-bold text-slate-300">
              <span className="text-emerald-400 font-black mr-1">✓</span> Productos originales
            </div>
            <div className="text-xs font-bold text-slate-300">
              <span className="text-emerald-400 font-black mr-1">✓</span> Compra segura
            </div>
            <div className="text-xs font-bold text-slate-300">
              <span className="text-emerald-400 font-black mr-1">✓</span> Atención especializada
            </div>
          </div>
        </section>
      </div>

      {/* 6 & 7. DESCRIPCIÓN Y ESPECIFICACIONES (Requirement 6 & 7) */}
      <section className="hidden lg:grid grid-cols-[1.25fr_1fr] gap-14 mt-14 pt-10 border-t border-white/10">
        <div>
          <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856]">Detalles</span>
          <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">{settings['product_history_title'] || 'Descripción del producto'}</h2>
          <div className="mt-4 text-slate-300 leading-relaxed text-base md:text-lg whitespace-pre-line space-y-4">
             {product.description ? (
               <p>{sanitizeProductDescription(product.description)}</p>
             ) : (
               <p>{settings['product_history_default_text'] || 'Cada detalle ha sido verificado para garantizar su autenticidad y estado. Contexto del personaje, rareza, franquicia y valor para coleccionistas.'}</p>
             )}
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856]">Ficha Técnica</span>
          <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">{settings['product_specs_title'] || 'Especificaciones'}</h2>
          <div className="space-y-2 mt-4">
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Categoría</span>
              <b className="text-white font-semibold">{product.category?.name || 'N/A'}</b>
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Marca / Fabricante</span>
              <b className="text-white font-semibold">{product.brand?.name || 'N/A'}</b>
            </div>
            {(() => {
              const activeLicense = product.license || product.product_licenses?.[0]?.license;
              if (!activeLicense?.name) return null;
              return (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Licencia / Franquicia</span>
                  <b className="text-white font-semibold">{activeLicense.name}</b>
                </div>
              );
            })()}
            {selectedVariant?.sku && isValidInternalSku(selectedVariant.sku) && (
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">SKU</span>
                <b className="text-white font-mono">{selectedVariant.sku}</b>
              </div>
            )}
            {product.condition && (
              <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex justify-between items-center text-xs">
                <span className="text-purple-300 font-bold uppercase tracking-wider">Estado (Condition)</span>
                <b className="text-purple-200 font-bold">{getConditionLabel(product.condition)}</b>
              </div>
            )}
            {product.condition_notes && (
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1 text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Notas de Condición</span>
                <p className="text-slate-300 italic">{product.condition_notes}</p>
              </div>
            )}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Disponibilidad</span>
              <b className={stockInfo.className}>{stockInfo.text}</b>
            </div>

            {/* 🃏 CARD DETAILS (PDP SPECIFICATIONS) */}
            {(() => {
              const cd = (product as any)?.metadata?.card_details;
              if (!cd || typeof cd !== 'object') return null;
              const hasVals = Object.values(cd).some(val => val !== '' && val !== false && val !== null && val !== undefined);
              if (!hasVals) return null;

              return (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🃏</span> Ficha Técnica de la Carta
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cd.is_rookie && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                          ROOKIE
                        </span>
                      )}
                      {cd.is_autograph && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
                          AUTO
                        </span>
                      )}
                      {cd.is_graded && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2.5 py-0.5 rounded">
                          GRADED {cd.grading_company || ''} {cd.grade || ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {cd.sport && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Deporte</span>
                        <span className="text-white font-semibold">{cd.sport}</span>
                      </div>
                    )}
                    {cd.game && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Juego / TCG</span>
                        <span className="text-white font-semibold">{cd.game}</span>
                      </div>
                    )}
                    {cd.player_character && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Jugador / Personaje</span>
                        <span className="text-white font-semibold">{cd.player_character}</span>
                      </div>
                    )}
                    {cd.team && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Equipo / Selección</span>
                        <span className="text-white font-semibold">{cd.team}</span>
                      </div>
                    )}
                    {cd.set_collection && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Set / Colección</span>
                        <span className="text-white font-semibold">{cd.set_collection}</span>
                      </div>
                    )}
                    {cd.year_season && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Año / Temporada</span>
                        <span className="text-white font-semibold">{cd.year_season}</span>
                      </div>
                    )}
                    {cd.card_number && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Número de Carta</span>
                        <span className="text-emerald-300 font-mono font-bold">{cd.card_number}</span>
                      </div>
                    )}
                    {cd.format && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Formato</span>
                        <span className="text-white font-semibold">{cd.format}</span>
                      </div>
                    )}
                    {cd.rarity && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Rareza</span>
                        <span className="text-amber-300 font-semibold">{cd.rarity}</span>
                      </div>
                    )}
                    {cd.language && (
                      <div className="p-2 rounded-lg bg-white/[0.03]">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Idioma</span>
                        <span className="text-white font-semibold">{cd.language}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* MOBILE ACCORDIONS */}
      <section className="lg:hidden mt-10 space-y-3">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setOpenMobileTab(openMobileTab === 'description' ? null : 'description')}
            className="w-full p-5 flex justify-between items-center text-left"
          >
            <div>
              <span className="text-[10px] uppercase font-bold text-[#f00856]">Detalles</span>
              <h3 className="text-base font-black text-white uppercase tracking-tight">Descripción del producto</h3>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openMobileTab === 'description' ? 'rotate-180 text-[#f00856]' : ''}`} />
          </button>
          {openMobileTab === 'description' && (
            <div className="px-5 pb-5 pt-1 text-slate-300 text-sm leading-relaxed border-t border-white/5 whitespace-pre-line">
              {product.description ? (
                <p>{sanitizeProductDescription(product.description)}</p>
              ) : (
                <p>Cada detalle ha sido verificado para garantizar su autenticidad y estado.</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setOpenMobileTab(openMobileTab === 'specs' ? null : 'specs')}
            className="w-full p-5 flex justify-between items-center text-left"
          >
            <div>
              <span className="text-[10px] uppercase font-bold text-[#f00856]">Ficha Técnica</span>
              <h3 className="text-base font-black text-white uppercase tracking-tight">Especificaciones</h3>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openMobileTab === 'specs' ? 'rotate-180 text-[#f00856]' : ''}`} />
          </button>
          {openMobileTab === 'specs' && (
            <div className="px-5 pb-5 pt-2 space-y-2 border-t border-white/5">
              <div className="p-3 rounded-xl bg-white/[0.02] flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Categoría</span>
                <b className="text-white">{product.category?.name || 'N/A'}</b>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Marca / Fabricante</span>
                <b className="text-white">{product.brand?.name || 'N/A'}</b>
              </div>
              {product.product_licenses?.[0]?.license?.name && (
                <div className="p-3 rounded-xl bg-white/[0.02] flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Licencia / Franquicia</span>
                  <b className="text-amber-400">{product.product_licenses[0].license.name}</b>
                </div>
              )}
              {selectedVariant?.sku && isValidInternalSku(selectedVariant.sku) && (
                <div className="p-3 rounded-xl bg-white/[0.02] flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">SKU</span>
                  <b className="text-white font-mono">{selectedVariant.sku}</b>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white/[0.02] flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Disponibilidad</span>
                <b className={stockInfo.className}>{stockInfo.text}</b>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 8. PRODUCTOS RELACIONADOS (Requirement 8) */}
      <RelatedProductsSection
        currentProductId={product.id}
        categorySlug={product.category?.slug}
      />

      {/* 9. RESEÑAS / REVIEWS (Requirement 9) */}
      <section className="mt-14 border-t border-white/10 pt-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856]">Opiniones</span>
            <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">Lo que dicen los compradores</h2>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="py-5 px-6 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 text-yellow-400">
                <Star className="w-4 h-4 fill-yellow-400" />
                <Star className="w-4 h-4 fill-yellow-400" />
                <Star className="w-4 h-4 fill-yellow-400" />
                <Star className="w-4 h-4 fill-yellow-400" />
                <Star className="w-4 h-4 fill-yellow-400" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-300">
                Todavía no hay opiniones para este producto.
              </span>
            </div>
            <span className="text-xs font-bold text-[#f00856]">
              Sé el primero en escribir una
            </span>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((r: any) => (
              <div key={r.id} className="rounded-2xl p-5 bg-white/[0.02] border border-white/5 hover:border-[#f00856]/30 transition-all group">
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                  ))}
                </div>
                <p className="text-white font-black text-sm mb-1 group-hover:text-[#f00856] transition-colors">{r.title || 'Reseña de coleccionista'}</p>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{r.body}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-500 font-bold">
                  <span>{r.user_name || 'Anónimo'}</span>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MOBILE STICKY BUY BAR */}
      {showStickyBar && isPurchasable && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#05070f]/95 backdrop-blur-lg border-t border-white/10 px-4 py-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] animate-slide-up lg:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1">
              <img
                src={displayImage}
                alt={product.title}
                referrerPolicy="no-referrer"
                {...getImageProps("w-10 h-10 rounded-lg object-contain bg-white p-1 flex-shrink-0")}
              />
              <div className="overflow-hidden min-w-0">
                <p className="text-white font-bold text-xs truncate">{product.title}</p>
                <p className={`font-extrabold text-sm leading-tight ${isIntl ? 'text-sky-400' : 'text-[#f00856]'}`}>
                  {isIntl ? formatUSD(product.final_price_usd || product.base_price || finalPrice) : formatCurrencyPrice(finalPrice)}
                </p>
              </div>
            </div>
            <button
              id="sticky-buy-btn"
              onClick={() => addToCart(undefined, true)}
              disabled={!isPurchasable}
              className="btn-primary rounded-xl px-5 py-2.5 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wide font-bold transition-all shadow-md shadow-[#f00856]/20 cursor-pointer shrink-0 min-h-[44px]"
            >
              <Zap className="w-4 h-4" />
              Comprar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE LISTA DE ESPERA / CUPOS INTERNACIONALES */}
      <InternationalWaitlistModal
        isOpen={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        productId={product.id}
        productTitle={product.title}
        internationalProductId={product.international_products?.[0]?.id}
        estimatedCostUsd={product.base_price_usd}
      />

      {/* MODAL ESTIMACIÓN PUESTO EN URUGUAY (MI FRANQUICIA) */}
      <ProductUruguayCostDrawer
        isOpen={showCustomsDrawer}
        onClose={() => setShowCustomsDrawer(false)}
        productPriceUsd={product.base_price_usd || (finalPrice / 42.5)}
        categoryName={product.category?.name || product.category_name}
        knownWeightKg={product.weight_kg || product.weight}
        productTitle={product.title}
      />
    </div>
  );
}
