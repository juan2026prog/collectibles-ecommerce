import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../hooks/useData';
import { supabase } from '../lib/supabase';

export default function Wishlist() {
  const { user } = useAuth();
  const { wishlist, toggleWishlist } = useWishlist(user?.id);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        .select('id, title, slug, price, images:product_images(url, is_primary)')
        .in('id', wishlist)
        .eq('status', 'published');

      setProducts(data || []);
      setLoading(false);
    }

    loadWishlistProducts();
  }, [wishlist]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-16 text-center text-slate-400">Cargando wishlist...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-6 h-6 text-rose-500" />
        <div>
          <h1 className="text-3xl font-black text-white">Wishlist</h1>
          <p className="text-sm text-slate-400">Tus favoritos guardados para volver a comprarlos despues.</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="glass  p-10 text-center">
          <ShoppingBag className="w-10 h-10 text-slate-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Todavia no guardaste productos</h2>
          <p className="text-slate-400 mb-6">Explora la tienda y agrega tus coleccionables favoritos.</p>
          <Link to="/shop" className="btn-primary">Ir a la tienda</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => {
            const primaryImage = product.images?.find((image: any) => image.is_primary)?.url || product.images?.[0]?.url;
            return (
              <article key={product.id} className="glass  overflow-hidden shadow-sm">
                <Link to={`/p/${product.slug}`} className="block bg-white/5 aspect-square">
                  {primaryImage ? (
                    <img src={primaryImage} alt={product.title} className="w-full h-full object-contain p-4" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">Sin imagen</div>
                  )}
                </Link>
                <div className="p-5">
                  <Link to={`/p/${product.slug}`} className="font-bold text-white hover:text-primary-600 line-clamp-2">
                    {product.title}
                  </Link>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-lg font-black text-primary-600">${Number(product.price || 0).toLocaleString()}</span>
                    <button type="button" onClick={() => toggleWishlist(product.id)} className="px-3 py-2  border border-white/10 text-sm font-bold text-slate-400 hover:border-rose-300 hover:text-rose-500">
                      Quitar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
