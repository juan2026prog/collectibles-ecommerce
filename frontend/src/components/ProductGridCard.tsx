import { Star, ShoppingCart, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductBadge } from './ProductBadge';
import { getProductImage } from '../lib/imageUtils';
import { evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { useWishlistContext } from '../contexts/WishlistContext';
import { useAdminMode } from '../contexts/AdminModeContext';

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
  const img = getProductImage(product);
  const finalPrice = product.base_price + (product.variants?.[0]?.price_adjustment || 0);
  
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

  return (
    <article className="grid-card group relative">
      {/* 1. IMAGEN */}
      <div className="relative">
        <Link to={`/p/${product.slug}`} className="flex bg-white w-full aspect-square rounded-sm overflow-hidden p-6 items-center justify-center border border-white/5 group-hover:border-[#f00856]/20 transition-colors">
          <img
            src={img}
            alt={product.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product);
          }}
          className="absolute top-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-[#05070f]/50 backdrop-blur-md border border-white/10 hover:bg-[#05070f]/80 transition-all z-30 group"
          title={isInWishlist(product.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
        >
          <Heart className={`w-4 h-4 transition-colors ${isInWishlist(product.id) ? 'fill-[#f00856] text-[#f00856]' : 'text-white/70 group-hover:text-white'}`} />
        </button>

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

        {/* CTA COMPACTO */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddToCart(product);
          }}
          className="absolute bottom-3 right-3 w-9 h-9 md:w-11 md:h-11 bg-[#f00856] text-white flex items-center justify-center rounded-full shadow-lg z-30 
                     opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all transform md:translate-y-2 md:group-hover:translate-y-0 active:scale-90"
          title="Agregar al carrito"
        >
          <ShoppingCart className="w-5 h-5" />
        </button>

        {/* Admin Mode Badge */}
        {isAdminMode && product.source_provider === 'zinc' && product.international_products?.[0] && (
          <div className="absolute bottom-2 right-2 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-20">
            Costo: ${Number(product.international_products[0].base_price_usd) + Number(product.international_products[0].usa_domestic_shipping_usd)}
          </div>
        )}
      </div>

      {/* 2. INFORMACIÓN */}
      <div className="pt-3">
        <div className="flex items-center gap-1 text-[11px] text-yellow-400 mb-1">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
               <Star key={i} className={`w-3 h-3 ${i < Math.round(product.rating || 5) ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-slate-600'}`} />
            ))}
          </div>
          <span className="text-slate-500">({reviewsCount})</span>
        </div>
        
        {product.source_provider === 'zinc' && (
          <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">Vendido en Amazon</div>
        )}

        <div className="text-[10px] text-[#f00856] font-black uppercase tracking-wider mb-1">
          Vendido por: {product.vendor_store?.store_name || product.vendor?.store_name || 'Collectibles'}
        </div>
        
        <Link to={`/p/${product.slug}`}>
          <h3 className="text-xs md:text-sm font-bold leading-tight line-clamp-2 min-h-[34px] text-white hover:text-[#f00856] transition-colors">
            {product.title}
          </h3>
        </Link>
        
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-[#f00856] font-black text-base md:text-lg leading-none">
            {formatPrice(displayPrice)}
          </span>
          {hasDiscount && (
            <span className="text-[10px] text-slate-500 line-through leading-none">
              {formatPrice(displayOldPrice)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
