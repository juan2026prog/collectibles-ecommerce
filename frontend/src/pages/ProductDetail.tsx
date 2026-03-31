import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, Heart, ShoppingCart, Minus, Plus, Truck, ShieldCheck, RotateCcw, Star, Eye } from 'lucide-react';
import { useProduct } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';

export default function ProductDetail() {
  const { slug } = useParams();
  const { product, loading } = useProduct(slug);
  const cart = useCartContext();
  const { user } = useAuth();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');

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
    }
  }, [product, user]);

  if (loading) return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="grid md:grid-cols-2 gap-10">
        <div className="animate-pulse bg-gray-100 rounded-xl aspect-square" />
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-100 h-8 w-3/4 rounded" />
          <div className="animate-pulse bg-gray-100 h-6 w-1/4 rounded" />
          <div className="animate-pulse bg-gray-100 h-20 rounded" />
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-bold text-gray-400">Product not found</h1>
      <Link to="/shop" className="btn-primary mt-4">Back to Shop</Link>
    </div>
  );

  function getProductImage(product: any): string {
  const img = product.images?.[0];
  if (!img?.url) return 'https://via.placeholder.com/600';
  if (img.url.match(/^[a-f0-9-]{36}$/)) return 'https://via.placeholder.com/600';
  return img.url;
}

const productImage = getProductImage(product);
  const mainVariant = variants[0];
  const stock = mainVariant?.inventory_count || 0;
  const finalPrice = product.base_price + (mainVariant?.price_adjustment || 0);
  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 4;
  const currentImage = images[selectedImage]?.url;
  const displayImage = currentImage && !currentImage.match(/^[a-f0-9-]{36}$/) ? currentImage : 'https://via.placeholder.com/600';

  function addToCart() {
    if (!mainVariant) return;
    cart.addItem({
      product_id: product.id,
      variant_id: mainVariant.id,
      quantity,
      title: product.title,
      price: finalPrice,
      image: productImage,
      variant_name: mainVariant.name,
    });

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

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-gray-500 mb-6 flex-wrap">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        {product.category && (
          <>
            <Link to={`/shop?category=${product.category.slug}`} className="hover:text-primary-600">{product.category.name}</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
          </>
        )}
        <span className="text-primary-600 font-medium line-clamp-1">{product.title}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        {/* ═══ GALLERY ═══ */}
        <div className="flex gap-4">
          {images.length > 1 && (
            <div className="hidden md:flex flex-col gap-2 w-20">
              {images.map((img: any, i: number) => {
                  const thumbnailSrc = img.url && !img.url.match(/^[a-f0-9-]{36}$/) ? img.url : 'https://via.placeholder.com/80';
                  return (
                    <button key={img.id} onClick={() => setSelectedImage(i)}
                      className={`w-20 h-20 rounded-lg overflow-hidden border-2 ${i === selectedImage ? 'border-primary-500' : 'border-gray-200'}`}>
                      <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                    </button>
                  );
                })}
            </div>
          )}
          <div className="flex-1 aspect-square bg-gray-50 rounded-xl overflow-hidden">
            <img src={displayImage} alt={product.title} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* ═══ INFO ═══ */}
        <div>
          {product.brand && <p className="text-sm font-medium text-gray-400 mb-1">{product.brand.name}</p>}
          <h1 className="text-2xl md:text-3xl font-black text-dark-900">{product.title}</h1>

          {/* Rating */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />)}</div>
            <span className="text-sm text-gray-500">({reviews.length} reviews)</span>
          </div>

          {/* Price */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-3xl font-black text-primary-600">${finalPrice}</span>
            {product.compare_at_price && (
              <>
                <span className="text-lg text-gray-400 line-through">${product.compare_at_price}</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">{Math.round((1 - product.base_price / product.compare_at_price) * 100)}% OFF</span>
              </>
            )}
          </div>

          {/* Stock */}
          {stock <= 5 && stock > 0 && (
            <div className="mt-4 p-3 bg-primary-50 rounded-lg">
              <p className="text-sm font-bold text-primary-600">Only {stock} item(s) left in stock!</p>
              <div className="mt-1.5 h-1.5 bg-primary-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(stock / 10) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Live viewers */}
          <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
            <Eye className="w-4 h-4 text-primary-500" />
            <span><strong>{Math.floor(Math.random() * 5) + 2}</strong> people are viewing this right now</span>
          </div>

          {/* Quantity + Cart */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center border border-gray-200 rounded-lg">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-3 hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
              <span className="px-4 font-bold text-dark-900">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="p-3 hover:bg-gray-50"><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={addToCart} className="btn-primary flex-1 py-3.5 gap-2 text-base">
              <ShoppingCart className="w-5 h-5" /> ADD TO CART
            </button>
            <button className="p-3.5 border border-gray-200 rounded-lg hover:bg-primary-50 hover:border-primary-200">
              <Heart className="w-5 h-5 text-gray-400 hover:text-primary-500" />
            </button>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[{ icon: Truck, text: 'Free Shipping' }, { icon: ShieldCheck, text: 'Secure Payment' }, { icon: RotateCcw, text: 'Easy Returns' }].map((t, i) => (
              <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
                <t.icon className="w-5 h-5 text-primary-500 mx-auto" />
                <span className="text-xs font-medium text-gray-600 mt-1 block">{t.text}</span>
              </div>
            ))}
          </div>

          {product.short_description && (
            <p className="mt-6 text-sm text-gray-600 leading-relaxed">{product.short_description}</p>
          )}
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="mt-12 border-t pt-8">
        <div className="flex gap-6 border-b mb-6">
          {(['description', 'specs', 'reviews'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold uppercase tracking-wide border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>{tab === 'reviews' ? `Reviews (${reviews.length})` : tab}</button>
          ))}
        </div>
        <div className="max-w-3xl">
          {activeTab === 'description' && (
            <div className="prose prose-sm text-gray-600">
              <p>{product.description || 'No description available.'}</p>
            </div>
          )}
          {activeTab === 'specs' && (
            <div className="space-y-2">
              {product.brand && <div className="flex justify-between py-2 border-b"><span className="text-sm font-medium text-gray-500">Brand</span><span className="text-sm font-bold">{product.brand.name}</span></div>}
              {product.category && <div className="flex justify-between py-2 border-b"><span className="text-sm font-medium text-gray-500">Category</span><span className="text-sm font-bold">{product.category.name}</span></div>}
              {mainVariant?.sku && <div className="flex justify-between py-2 border-b"><span className="text-sm font-medium text-gray-500">SKU</span><span className="text-sm font-mono font-bold">{mainVariant.sku}</span></div>}
              <div className="flex justify-between py-2 border-b"><span className="text-sm font-medium text-gray-500">Stock</span><span className="text-sm font-bold">{stock} available</span></div>
            </div>
          )}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              {reviews.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No reviews yet. Be the first to review!</p>
              ) : reviews.map((r: any) => (
                <div key={r.id} className="border-b pb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />)}</div>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.title && <p className="text-sm font-bold mt-1">{r.title}</p>}
                  {r.body && <p className="text-sm text-gray-600 mt-1">{r.body}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
