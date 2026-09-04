import { useState } from 'react';
import { Star, ShoppingCart, Heart, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductBadge } from './ProductBadge';
import { getProductImage } from '../lib/imageUtils';
import { evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useWishlistContext } from '../contexts/WishlistContext';
import { useAdminMode } from '../contexts/AdminModeContext';
import { useLocale } from '../contexts/LocaleContext';
import { trackGA4Event, trackClarityEvent } from '../lib/analyticsTracker';
import { getProductGroupBadge, getAllProductGroupBadges } from '../hooks/useData';
import { useImageProtection } from '../hooks/useImageProtection';
import { getConditionBadgeInfo } from '../config/conditionConfig';
import { formatUSD } from '../lib/formatters';

interface ProductGridCardProps {
  product: any;
  onAddToCart: (product: any) => void;
  formatPrice: (price: number) => string;
  applicablePromos?: any[];
}

/**
 * COMPONENTE ÚNICO DE PRODUCTO PARA TODO EL MARKETPLACE
 * Estilo Catálogo Premium: Imagen blanca + info limpia debajo.
 */
export function ProductGridCard({ product, onAddToCart, formatPrice, applicablePromos = [] }: ProductGridCardProps) {
  const { toggleWishlist, isInWishlist } = useWishlistContext();
  const { isAdminMode } = useAdminMode();
  const { language } = useLocale();
  const { getImageProps, handleDragStart } = useImageProtection({ isProduct: true });
  const [addState, setAddState] = useState<'idle' | 'loading' | 'added'>('idle');

  const img = getProductImage(product);
  const finalPrice = Number(product.base_price || 0) + Number(product.variants?.[0]?.price_adjustment || 0);
  const isInternational = Boolean(
    product.is_international || 
    product.source_provider === 'zinc' || 
    product.shipping_type === 'international_courier_direct'
  );

  const handleCardClick = () => {
    trackClarityEvent('product_card_click');
    trackGA4Event('select_item', {
      item_list_id: 'product_catalog_grid',
      item_list_name: 'Product Catalog Grid',
      items: [{
        item_id: String(product.id),
        item_name: String(product.title),
        item_brand: product.brand?.name || undefined,
        item_category: product.category?.name || undefined,
        price: Number(finalPrice - promoDiscount),
        quantity: 1
      }]
    });
  };

  const handleAddCartAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (addState !== 'idle') return;

    setAddState('loading');
    trackClarityEvent('add_to_cart_click');

    try {
      onAddToCart(product);
      trackClarityEvent('add_to_cart_success');
      setAddState('added');
      setTimeout(() => {
        setAddState('idle');
      }, 2000);
    } catch (err) {
      setAddState('idle');
    }
  };
  
  let promoDiscount = 0;
  if (applicablePromos && applicablePromos.length > 0) {
    const item = {
      product_id: product.id,
      category_id: product.category_id,
      brand_id: product.brand_id,
      vendor_id: product.vendor_id,
      tag_ids: product.product_tags?.map((pt: any) => pt.tag_id) || [],
      price: finalPrice,
      quantity: 1
    };
    const result = evaluateItemDiscountDetailed(item, applicablePromos);
    promoDiscount = result.discount;
  }

  const displayPrice = finalPrice - promoDiscount;
  const hasDiscount = product.compare_at_price > product.base_price || promoDiscount > 0;
  const displayOldPrice = promoDiscount > 0 ? finalPrice : product.compare_at_price;
  
  const reviewsCount = product.reviews?.length || 0;
  const isCollectibles = !product.vendor_id;

  return (
    <article className={`grid-card group relative p-2.5 sm:p-3 bg-[#0a0f1d]/40 rounded-[16px] transition-all duration-200 ${
      isInternational
        ? 'border border-sky-500/40 md:border-2 hover:border-sky-400 shadow-lg shadow-sky-950/20'
        : isCollectibles 
          ? 'border border-[#f00856]/35 md:border-2 md:border-[#f00856]/70 hover:border-[#f00856] shadow-sm shadow-[#f00856]/10' 
          : 'border border-white/5 hover:border-white/20'
    }`}>
      {/* 1. IMAGEN */}
      <div className="relative">
        <Link 
          to={`/producto/${product.slug}`} 
          onClick={handleCardClick}
          className={`flex bg-white w-full aspect-square overflow-hidden p-3 sm:p-5 items-center justify-center border rounded-xl transition-colors ${
            isInternational 
              ? 'border-sky-500/10 group-hover:border-sky-500/30' 
              : 'border-white/5 group-hover:border-[#f00856]/20'
          }`}
        >
          <img
            src={img}
            alt={product.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            {...getImageProps('max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105')}
          />
        </Link>

        {/* Wishlist Button (Min 44x44px touch hit area) */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product);
          }}
          className="absolute top-1 left-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-[#05070f]/60 backdrop-blur-md border border-white/10 hover:bg-[#05070f]/80 transition-all z-30 group cursor-pointer"
          title={isInWishlist(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-label={isInWishlist(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
        >
          <Heart className={`w-4 h-4 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-white/70 group-hover:text-white'}`} />
        </button>

        {/* Cocardas de Grupo/Colección Heredadas */}
        {(() => {
          const groupBadges = getAllProductGroupBadges(product);
          if (groupBadges.length === 0) return null;
          return (
            <div className="absolute top-11 left-1.5 z-20 flex flex-col gap-1 pointer-events-none drop-shadow-md select-none scale-90 md:scale-100 origin-top-left">
              {groupBadges.map((gb, idx) => (
                <div key={`${gb.url}-${idx}`} className="w-9 h-9 md:w-12 md:h-12">
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

        {/* Badge superior opcional */}
        <div className="absolute top-2 right-2 z-20 scale-75 md:scale-90 origin-top-right pointer-events-none">
           <ProductBadge
             badgeId={product.badge}
             compareAtPrice={product.compare_at_price}
             basePrice={product.base_price}
           />
           {applicablePromos.map(promo => promo.badge_text && (
             <div key={promo.id} className="mt-1 flex justify-end">
               <span 
                 className="px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded-md text-white shadow-lg shadow-black/20"
                 style={{ 
                   backgroundColor: promo.badge_bg || '#f00856', 
                   color: promo.badge_color || '#ffffff' 
                 }}
               >
                 {promo.badge_text}
               </span>
             </div>
           ))}
        </div>

        {/* 🏷️ Badge Discreto de Condición (LOOSE / USED / OPEN BOX) */}
        {(() => {
           const condBadge = getConditionBadgeInfo(product.condition);
           if (!condBadge) return null;
           return (
              <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
                 <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded shadow-md border ${condBadge.badgeClass}`}>
                    {condBadge.label}
                 </span>
              </div>
           );
        })()}

        {/* Admin Mode Badge */}
        {isAdminMode && product.source_provider === 'zinc' && product.international_products?.[0] && (
          <div className="absolute bottom-2 right-2 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-20">
            Costo: ${Number(product.international_products[0].base_price_usd) + Number(product.international_products[0].usa_domestic_shipping_usd)}
          </div>
        )}
      </div>

      {/* 2. INFORMACIÓN */}
      <div className="pt-2">
        {reviewsCount > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-yellow-400 mb-1">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                 <Star key={i} className={`w-3 h-3 ${i < Math.round(product.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-slate-600'}`} />
              ))}
            </div>
            <span className="text-slate-400">({reviewsCount})</span>
          </div>
        )}
        
        {isInternational && (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-950/60 border border-sky-500/40 text-[9px] text-sky-300 font-black tracking-wider uppercase mb-1.5 shadow-sm">
            <span>🌎</span> INTERNACIONAL
          </div>
        )}

        {/* COMPACT VENDOR LINE */}
        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1 flex items-center flex-wrap gap-1 leading-tight">
          <span>
            Vendido por{' '}
            {isCollectibles ? (
              <strong className="text-[#f00856]">Collectibles</strong>
            ) : (product.vendor_store?.slug || product.vendor?.slug) ? (
              <Link 
                to={`/store/${product.vendor_store?.slug || product.vendor?.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="text-white hover:text-[#f00856] underline font-bold transition-colors"
              >
                {product.vendor_store?.display_name || product.vendor_store?.store_name || product.vendor_store?.name || product.vendor?.company_name || product.vendor?.store_name || 'Vendedor'}
              </Link>
            ) : (
              <strong className="text-white">
                {product.vendor_store?.display_name || product.vendor_store?.store_name || product.vendor_store?.name || product.vendor?.company_name || product.vendor?.store_name || 'Vendedor'}
              </strong>
            )}
          </span>
          {!isCollectibles && product.vendor_store?.is_official && (
            <span className="text-[8px] px-1 font-semibold leading-none uppercase rounded bg-red-500 text-white border border-red-400">
              {language === 'en' ? 'Official Store' : 'TIENDA OFICIAL'}
            </span>
          )}
        </div>
        
        <Link to={`/producto/${product.slug}`} onClick={handleCardClick}>
          <h3 className="text-xs md:text-sm font-bold leading-snug line-clamp-2 min-h-[32px] text-white hover:text-[#f00856] transition-colors">
            {product.title}
          </h3>
        </Link>
        
        {/* PRECIO + BOTÓN CARRITO CIRCULAR (Fila inferior) */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className={`font-black text-base md:text-lg leading-none ${isInternational ? 'text-sky-400' : 'text-[#f00856]'}`}>
              {isInternational ? formatUSD(displayPrice) : formatPrice(displayPrice)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] text-slate-500 line-through leading-none">
                {isInternational ? formatUSD(displayOldPrice) : formatPrice(displayOldPrice)}
              </span>
            )}
          </div>

          <button
            onClick={handleAddCartAction}
            disabled={addState !== 'idle'}
            className={`w-11 h-11 min-w-[44px] min-h-[44px] bg-[#f00856] text-white flex items-center justify-center rounded-full shadow-md z-10 shrink-0 
                       transition-all transform active:scale-95 disabled:opacity-90 ${
                         addState === 'added' ? 'bg-emerald-600' : 'hover:bg-[#d00749]'
                       }`}
            title="Agregar al carrito"
            aria-label="Agregar al carrito"
          >
            {addState === 'idle' && (
              <ShoppingCart className="w-5 h-5" />
            )}
            {addState === 'loading' && (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            )}
            {addState === 'added' && (
              <Check className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
