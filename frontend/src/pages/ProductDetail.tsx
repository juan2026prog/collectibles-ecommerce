import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Minus, Plus, Star, ChevronDown, Heart, Zap } from 'lucide-react';
import { useProduct, useProductBuyBox, useProducts, getProductGroupBadge, getAllProductGroupBadges } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useInternationalCartContext } from '../contexts/InternationalCartContext';
import { useAuth } from '../contexts/AuthContext';
import { useWishlistContext } from '../contexts/WishlistContext';
import { usePromotions, getApplicablePromotions, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useCurrency } from '../contexts/CurrencyContext';
import { useLocale } from '../contexts/LocaleContext';
import { resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { analytics } from '../lib/analytics';
import { trackGA4Event } from '../lib/analyticsTracker';
import { trackViewContent, generateMetaEventId } from '../lib/meta/metaPixel';
import SEO from '../components/SEO';
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
import { useImageProtection } from '../hooks/useImageProtection';
import { getConditionLabel } from '../config/conditionConfig';

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
  const { product, loading: productLoading } = useProduct(slug || '');
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

  const bbWinner = buyBox?.winner;
  const winnerIsCollectibles = !bbWinner || bbWinner.vendor_id === 'platform' || !bbWinner.vendor_id;
  const winnerVendorName = winnerIsCollectibles ? 'Collectibles.uy' : (bbWinner?.vendor_store_name || product.vendor_store?.name || product.vendor?.name || 'Vendedor Oficial');
  const winnerVendorId = bbWinner?.vendor_id || product.vendor_id;

  const variants = product.variants && product.variants.length > 0 ? product.variants : [];
  const selectedVariant = variants[selectedVariantIdx] || null;

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

  const stock = selectedVariant ? (selectedVariant.stock ?? product.stock) : product.stock;

  const getStockInfo = () => {
    if (stock <= 0) return { text: 'Agotado', className: 'text-red-400 border-red-500/20 bg-red-500/10' };
    if (product.badge?.toLowerCase().includes('preventa') || product.title?.toLowerCase().includes('preventa')) {
      return { text: 'Preventa', className: 'text-amber-400 border-amber-500/20 bg-amber-500/10' };
    }
    if (stock <= 3) return { text: `¡Últimas ${stock} unidades!`, className: 'text-amber-400 border-amber-500/20 bg-amber-500/10' };
    return { text: 'Disponible en stock', className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' };
  };

  const stockInfo = getStockInfo();

  const addToCart = (customVariant?: any, directCheckout = false) => {
    if (stock <= 0) return;
    const targetVariant = customVariant || selectedVariant;

    if (product.source_provider === 'zinc') {
      internationalCart.addItem({
        product,
        quantity,
        variant_id: targetVariant?.id,
        variant_name: targetVariant?.name
      });
      if (directCheckout) {
        navigate('/cart');
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
      image_url: displayImage,
      quantity,
      variant_id: targetVariant?.id,
      variant_name: targetVariant?.name,
      vendor_id: winnerVendorId,
      vendor_name: winnerVendorName,
      sku: targetVariant?.sku || product.sku
    });

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

  const seoTitle = `${product.title} | Collectibles.uy`;
  const seoDescription = product.description
    ? sanitizeProductDescription(product.description).slice(0, 155)
    : `Comprar ${product.title} en Collectibles.uy. Envío a todo Uruguay.`;

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6 md:py-10">
      <SEO
        title={seoTitle}
        description={seoDescription}
        image={displayImage}
        type="product"
      />
      <AdminTechnicalPanel product={product} />

      {/* BREADCRUMB (Requirement 12) */}
      <nav className="flex items-center text-xs font-bold uppercase tracking-wider text-slate-400 mb-8 flex-wrap gap-2.5">
        <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
        <span className="text-slate-600">/</span>
        {product.category && (
          <>
            <Link to={`/categoria/${product.category.slug}`} className="hover:text-white transition-colors">{product.category.name}</Link>
            <span className="text-slate-600">/</span>
          </>
        )}
        <span className="text-white line-clamp-1">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-8 lg:gap-14 items-start">
        {/* GALLERY SECTION (Requirement 10 & 11) */}
        <section className="flex flex-col gap-4 lg:sticky lg:top-28">
          <div
            className="w-full aspect-square max-h-[660px] rounded-3xl bg-white flex items-center justify-center relative overflow-hidden group cursor-crosshair border border-white/10 shadow-2xl p-3 sm:p-6 transition-all duration-300 img-protected"
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
                <div className="absolute top-5 left-5 z-20 flex flex-col gap-2 pointer-events-none drop-shadow-md select-none">
                  {groupBadges.map((gb, idx) => (
                    <div key={`${gb.url}-${idx}`} className="w-16 h-16">
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
              fetchPriority="high"
              loading="eager"
              {...getImageProps(`w-full h-full max-h-[580px] object-contain mix-blend-multiply transition-all duration-500 ease-out ${isHovering ? 'scale-105' : 'scale-100'}`)}
            />
            
            {/* Magnifier Lens */}
            {isHovering && (
              <div
                className="absolute pointer-events-none border border-slate-200 shadow-2xl bg-no-repeat z-20 rounded-full bg-white hidden lg:block"
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

          {/* GALLERY THUMBNAILS (Requirement 11) */}
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-3 mt-1">
              {images.map((img: any, i: number) => {
                const src = resolveImage(img.url);
                return (
                  <button
                    key={img.id || i}
                    onClick={() => setSelectedImage(i)}
                    onMouseEnter={() => setSelectedImage(i)}
                    data-protected-image="true"
                    data-product-image="true"
                    className={`relative rounded-2xl aspect-square overflow-hidden transition-all duration-200 bg-white cursor-pointer hover:scale-105 img-protected ${
                      i === selectedImage
                        ? 'ring-2 ring-[#f00856] ring-offset-2 ring-offset-[#05070f] scale-[0.98] opacity-100 shadow-md'
                        : 'border border-white/10 opacity-60 hover:opacity-100 hover:border-white/30'
                    }`}
                  >
                    <img 
                      src={src} 
                      alt="" 
                      referrerPolicy="no-referrer" 
                      loading="lazy" 
                      {...getImageProps("w-full h-full object-contain p-2 mix-blend-multiply")}
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

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.15] tracking-tight text-white mt-2">
              {product.title}
            </h1>
          </div>

          {/* 1. BLOQUE DE PRECIO (PRIORIDAD MÁXIMA - Requirement 1 & 13) */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-[10px] uppercase text-slate-400 font-black tracking-widest">Precio actual</div>
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight">
                {formatCurrencyPrice(displayPrice)}
              </span>
              {hasDiscount && (
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl text-slate-500 line-through font-bold">
                    {formatCurrencyPrice(displayOldPrice)}
                  </span>
                  <span className="bg-[#f00856]/15 text-[#f00856] text-xs font-black px-2.5 py-1 rounded-md uppercase border border-[#f00856]/30">
                    {discountPercent}% OFF
                  </span>
                </div>
              )}
            </div>

            {/* BADGES DE CONFIANZA Y ATRIBUTOS REALES (Requirement 13) */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className={`text-xs font-bold px-3 py-1 rounded-full border bg-white/[0.03] flex items-center gap-2 ${stockInfo.className}`}>
                <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
                {stockInfo.text}
              </div>

              {product.source_provider === 'zinc' && (
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  ✈ Importado USA
                </span>
              )}
              {product.brand?.name && (
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300">
                  Original · {product.brand.name}
                </span>
              )}
              {product.condition && (
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300">
                  🏷️ {getConditionLabel(product.condition)}
                </span>
              )}

              {selectedCurrency === 'ARS' && (
                arShippingStatus.reasonCode === 'VENDOR_ARGENTINA_DISABLED' ? (
                  <span className="text-xs font-bold px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-slate-400 flex items-center gap-1.5" title="Este vendedor no realiza envíos a Argentina">
                    Este vendedor no realiza envíos a Argentina
                  </span>
                ) : arShippingStatus.isEligible ? (
                  <span className="text-xs font-bold px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 flex items-center gap-1.5">
                    🇦🇷 Envío a Argentina disponible
                  </span>
                ) : (
                  <span className="text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-center gap-1.5" title={arShippingStatus.reason}>
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
                    onClick={() => { setSelectedVariantIdx(idx); setQuantity(1); }}
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
            {(() => {
              const isVendorActive = !product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined;
              if (!isVendorActive) {
                return (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 text-xs font-bold flex items-center gap-2">
                    <span>⚠️ Este vendedor se encuentra temporalmente inactivo o suspendido. Los productos no están disponibles para la compra.</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* QUANTITY SELECTOR */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cantidad</span>
              <div className="flex items-center justify-between border border-white/10 bg-white/[0.03] rounded-xl h-11 w-36">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
                  disabled={quantity <= 1 || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true)}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-black text-base text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(stock, quantity + 1))}
                  className="w-11 h-full flex items-center justify-center hover:bg-white/10 transition-colors text-slate-300 hover:text-white"
                  disabled={quantity >= stock || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true)}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* BOTÓN COMPRAR AHORA (CTA PRINCIPAL) */}
            <button
              id="main-buy-now"
              onClick={() => addToCart(undefined, true)}
              disabled={stock <= 0 || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true)}
              className={`w-full py-4 sm:py-4.5 rounded-2xl flex items-center justify-center gap-2.5 text-base uppercase tracking-widest font-black transition-all bg-[#f00856] text-white shadow-xl shadow-[#f00856]/30 hover:bg-[#d00749] hover:shadow-[#f00856]/50 hover:-translate-y-0.5 cursor-pointer ${
                stock <= 0 || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true) ? 'opacity-50 cursor-not-allowed bg-slate-800 shadow-none' : ''
              }`}
            >
              <Zap className="w-5 h-5" />
              {(!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? true : false) === false ? 'Vendedor inactivo' : stock <= 0 ? 'Sin Stock' : 'Comprar ahora'}
            </button>

            {/* BOTÓN AGREGAR AL CARRITO (CTA SECUNDARIO) */}
            <button
              id="main-add-to-cart"
              onClick={() => addToCart()}
              disabled={stock <= 0 || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true)}
              className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold transition-all border border-white/20 text-white bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/40 cursor-pointer ${
                stock <= 0 || (!product?.vendor_id || product?.vendor_id === 'platform' || product?.vendor?.status === 'active' || product?.vendor?.status === undefined ? false : true) ? 'opacity-50 cursor-not-allowed border-white/5' : ''
              } ${addedToCart ? 'bg-green-500/20 border-green-500 text-green-400' : ''}`}
            >
              <ShoppingCart className="w-4 h-4" />
              {addedToCart ? '✓ Agregado al carrito' : 'Agregar al carrito'}
            </button>

            {/* FAVORITOS */}
            <div className="flex justify-center pt-1">
              <button
                onClick={() => toggleWishlist(product)}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <Heart className={`w-4 h-4 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-slate-400'}`} />
                <span>{isInWishlist(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}</span>
              </button>
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
            {product.product_licenses?.[0]?.license?.name && (
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Licencia / Franquicia</span>
                <b className="text-amber-400 font-semibold">{product.product_licenses[0].license.name}</b>
              </div>
            )}
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
      {showStickyBar && stock > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#05070f]/95 backdrop-blur-md border-t border-white/10 p-4 animate-slide-up lg:hidden">
          <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src={displayImage}
                alt={product.title}
                referrerPolicy="no-referrer"
                {...getImageProps("w-12 h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0")}
              />
              <div className="overflow-hidden">
                <p className="text-white font-black text-sm truncate uppercase tracking-tight">{product.title}</p>
                <p className="text-[#f00856] font-black text-sm">{formatCurrencyPrice(finalPrice)}</p>
              </div>
            </div>
            <button
              onClick={() => addToCart(undefined, true)}
              className="btn-primary rounded-full px-6 py-3 flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-black transition-all shadow-lg shadow-[#f00856]/20 hover:shadow-[#f00856]/40 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              Comprar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
