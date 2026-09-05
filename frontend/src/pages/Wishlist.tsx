import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, ShoppingCart, Sparkles, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWishlistContext } from '../contexts/WishlistContext';
import { supabase } from '../lib/supabase';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCurrency } from '../contexts/CurrencyContext';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';
import { resolveCartItemPrice } from '../lib/priceResolver';

export default function Wishlist() {
  const { user } = useAuth();
  const { wishlist } = useWishlistContext();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAllState, setAddAllState] = useState<'idle' | 'adding' | 'added'>('idle');
  const { formatCurrencyPrice } = useCurrency();
  const cart = useCartContext();

  useEffect(() => {
    async function loadWishlistProducts() {
      if (!wishlist.length) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select(`
          *,
          brand:brands!products_brand_id_fkey(*),
          category:categories(*),
          product_images(*),
          variants:product_variants(*),
          reviews:product_reviews(*),
          vendor:vendors(id, store_name, slug, logo_url, promotions_opt_in),
          vendor_store:vendor_stores(id, store_name, slug, logo_url)
        `)
        .in('id', wishlist)
        .eq('status', 'published')
        .eq('is_active', true);

      setProducts(data || []);
      setLoading(false);
    }

    loadWishlistProducts();
  }, [wishlist]);

  function handleAddToCart(p: any) {
    const variant = p.variants?.[0] || { id: p.id, name: 'Standard', price: p.price || p.base_price || 0 };
    const resolvedPrice = resolveCartItemPrice(p, variant);
    cart.addItem({ 
      product_id: p.id, 
      variant_id: variant.id, 
      quantity: 1, 
      title: p.title, 
      price: resolvedPrice, 
      image: getProductImage(p), 
      variant_name: variant.name,
      category_id: p.category_id,
      brand_id: p.brand_id,
      vendor_id: p.vendor_id,
      vendor_store_id: p.vendor_store_id || null,
      vendor_name: p.vendor_store?.store_name || p.vendor?.store_name || 'Collectibles',
      vendor_store_name: p.vendor_store?.store_name || p.vendor?.store_name || 'Collectibles',
      vendor_slug: p.vendor_store?.slug || p.vendor?.slug,
      vendor_store_slug: p.vendor_store?.slug || p.vendor?.slug,
      vendor_logo: p.vendor_store?.logo_url || p.vendor?.logo_url,
      sku: variant.sku || null,
      unit_price: resolvedPrice,
      image_url: getProductImage(p),
      promotions_opt_in: p.vendor?.promotions_opt_in || false,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || []
    });
  }

  const handleAddAllToCart = () => {
    if (products.length === 0 || addAllState !== 'idle') return;
    setAddAllState('adding');
    try {
      products.forEach(p => handleAddToCart(p));
      setAddAllState('added');
      setTimeout(() => setAddAllState('idle'), 2500);
    } catch {
      setAddAllState('idle');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#f00856] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#f00856]/10 flex items-center justify-center">
            <Heart className="w-6 h-6 text-[#f00856]" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Mi Wishlist</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#f00856]/20 text-[#f00856] text-xs font-black border border-[#f00856]/30">
                {products.length} {products.length === 1 ? 'figura' : 'figuras'}
              </span>
            </div>
            <p className="text-slate-400 font-medium text-sm mt-0.5">Tus tesoros guardados para después.</p>
          </div>
        </div>

        {products.length > 0 && (
          <button
            type="button"
            onClick={handleAddAllToCart}
            disabled={addAllState !== 'idle'}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#f00856] to-pink-600 hover:from-[#d00749] hover:to-pink-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-[#f00856]/20 cursor-pointer disabled:opacity-75"
          >
            {addAllState === 'adding' ? (
              <span>Agregando...</span>
            ) : addAllState === 'added' ? (
              <>
                <Check size={16} />
                <span>¡Agregados al carrito!</span>
              </>
            ) : (
              <>
                <ShoppingCart size={16} />
                <span>Mover todo al carrito</span>
              </>
            )}
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="glass rounded-[3rem] p-12 sm:p-20 text-center flex flex-col items-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-black text-white">Tu wishlist está vacía</h2>
          <p className="text-slate-400 font-medium max-w-md text-sm">
            Explorá el catálogo o usa nuestro Asistente Inteligente para encontrar tus figuras favoritas y guardarlas aquí.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link to="/shop" className="btn-primary rounded-full px-8 py-3.5 font-black uppercase text-xs tracking-widest">
              Ir al Catálogo
            </Link>
            <Link 
              to="/search/ai" 
              className="px-6 py-3.5 rounded-full bg-fuchsia-600/20 hover:bg-fuchsia-600/30 border border-fuchsia-500/40 text-fuchsia-300 font-bold text-xs flex items-center gap-2 transition"
            >
              <Sparkles size={16} />
              <span>Buscador con Asistente AI</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-7 gap-y-12">
            {products.map((product) => (
              <ProductGridCard 
                key={product.id} 
                product={product} 
                onAddToCart={handleAddToCart} 
                formatPrice={formatCurrencyPrice} 
              />
            ))}
          </div>

          {/* AI Helper Banner */}
          <div className="bg-gradient-to-r from-zinc-900 via-fuchsia-950/30 to-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">¿Buscando una figura especial para tu vitrina?</h3>
                <p className="text-xs text-zinc-400">Pregunta por escalas, marcas o sube una foto en nuestro Asistente Inteligente.</p>
              </div>
            </div>
            <Link
              to="/search/ai"
              className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-fuchsia-600/20"
            >
              <span>Consultar al Asistente AI</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
