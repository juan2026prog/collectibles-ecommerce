import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { ProductGridCard } from '../components/ProductGridCard';
import { useCurrency } from '../contexts/CurrencyContext';
import { useCartContext } from '../contexts/CartContext';
import { getProductImage } from '../lib/imageUtils';

export default function Wishlist() {
  const { user } = useAuth();
  const { wishlist } = useWishlist(user?.id);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
          brand:brands(*),
          category:categories(*),
          product_images(*),
          variants:product_variants(*),
          reviews:product_reviews(*)
        `)
        .in('id', wishlist)
        .eq('status', 'published');

      setProducts(data || []);
      setLoading(false);
    }

    loadWishlistProducts();
  }, [wishlist]);

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
      variant_name: variant.name 
    });
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#f00856] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-10">
        <div className="w-12 h-12 rounded-full bg-[#f00856]/10 flex items-center justify-center">
          <Heart className="w-6 h-6 text-[#f00856]" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Mi Wishlist</h1>
          <p className="text-slate-400 font-bold">Tus tesoros guardados para después.</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="glass rounded-[3rem] p-20 text-center flex flex-col items-center">
          <ShoppingBag className="w-16 h-16 text-slate-700 mb-6" />
          <h2 className="text-2xl font-black text-white mb-2">Tu wishlist está vacía</h2>
          <p className="text-slate-400 font-medium mb-10 max-w-sm">Explorá el marketplace y guardá los coleccionables que más te gusten.</p>
          <Link to="/shop" className="btn-primary rounded-full px-10 py-4 font-black uppercase tracking-widest">Ir al Catálogo</Link>
        </div>
      ) : (
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
      )}
    </div>
  );
}
