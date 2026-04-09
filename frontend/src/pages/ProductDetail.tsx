import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, Heart, ShoppingCart, Minus, Plus, Truck, ShieldCheck, RotateCcw, Star, Eye } from 'lucide-react';
import { useProduct } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { ProductBadge } from '../components/ProductBadge';
import { analytics } from '../lib/analytics';
import SEO from '../components/SEO';

export default function ProductDetail() {
  const { slug } = useParams();
  const { product, loading } = useProduct(slug);
  const cart = useCartContext();
  const { user } = useAuth();
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

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
  const { images = [], variants = [], reviews = [] } = product || {};
  const mainVariant = variants[0];
  const stock = mainVariant?.inventory_count || 0;
  const finalPrice = product.base_price + (mainVariant?.price_adjustment || 0);
  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 4;
  const currentImage = images[selectedImage]?.url;
  const displayImage = currentImage && !currentImage.match(/^[a-f0-9-]{36}$/) ? currentImage : 'https://via.placeholder.com/600';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.pageX - left - window.scrollX) / width) * 100;
    const y = ((e.pageY - top - window.scrollY) / height) * 100;
    setMousePos({ x, y });
  };

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

  const seoTitle = product.seo_title || `${product.title} - Comprar Online`;
  const seoDescription = product.seo_description || product.short_description || product.title;
  const productSchema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": seoTitle,
    "image": [
      displayImage
     ],
    "description": seoDescription,
    "sku": mainVariant?.sku,
    "brand": {
      "@type": "Brand",
      "name": product.brand?.name || "Generic"
    },
    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "UYU",
      "price": finalPrice,
      "availability": stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition"
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <SEO 
        title={seoTitle}
        description={seoDescription}
        image={displayImage}
        type="product"
        schema={productSchema}
      />

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
        <div className="flex flex-col-reverse md:flex-row gap-4 lg:gap-6 min-h-[500px]">
          {/* Vertical Thumbnails */}
          <div className="flex md:flex-col gap-3 w-full md:w-24 overflow-x-auto md:overflow-y-auto no-scrollbar pb-2 md:pb-0">
            {images.map((img: any, i: number) => {
              const thumbnailSrc = img.url && !img.url.match(/^[a-f0-9-]{36}$/) ? img.url : 'https://via.placeholder.com/80';
              return (
                <button 
                  key={img.id || i} 
                  onMouseEnter={() => setSelectedImage(i)}
                  onClick={() => setSelectedImage(i)}
                  className={`relative flex-shrink-0 w-20 md:w-full aspect-square rounded-xl overflow-hidden border-2 transition-all duration-300 ${i === selectedImage ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-100 hover:border-gray-200 shadow-sm'}`}
                >
                  <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                  {i === selectedImage && <div className="absolute inset-0 bg-primary-500/5" />}
                </button>
              );
            })}
          </div>

          {/* Main Stage with High-Performance Zoom */}
          <div 
            className="flex-1 relative aspect-square bg-white border border-gray-100 rounded-[2rem] overflow-hidden shadow-sm cursor-none select-none"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <img 
              src={displayImage} 
              alt={product.title} 
              className={`w-full h-full object-contain p-8 mix-blend-multiply transition-opacity duration-300 ${isHovering ? 'opacity-30' : 'opacity-100'}`}
            />

            {/* Magnifier Lens */}
            {isHovering && (
              <>
                 <div 
                   className="absolute pointer-events-none border-2 border-white shadow-[0_0_0_1000px_rgba(0,0,0,0.4)] bg-no-repeat overflow-hidden rounded-2xl z-20"
                   style={{
                     left: `${mousePos.x}%`,
                     top: `${mousePos.y}%`,
                     width: '180px',
                     height: '180px',
                     transform: 'translate(-50%, -50%)',
                     backgroundImage: `url(${displayImage})`,
                     backgroundSize: '1200%',
                     backgroundPosition: `${mousePos.x}% ${mousePos.y}%`,
                     boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5), 0 0 0 1000px rgba(255,255,255,0.05)'
                   }}
                 />
                 {/* Visual Guide (Classic ML style lens) */}
                 <div 
                   className="absolute pointer-events-none bg-gray-900/20 mix-blend-multiply border border-white/50 z-10"
                   style={{
                     left: `${mousePos.x}%`,
                     top: `${mousePos.y}%`,
                     width: '180px',
                     height: '180px',
                     transform: 'translate(-50%, -50%)',
                   }}
                 />
              </>
            )}

            {/* Badge Overlay */}
            <ProductBadge 
              badgeId={product.badge} 
              compareAtPrice={product.compare_at_price} 
              basePrice={product.base_price} 
              className="absolute top-8 left-8 text-[10px] uppercase tracking-widest z-30" 
            />
          </div>
        </div>

        {/* ═══ INFO ═══ */}
        <div>
          {product.brand && <p className="text-sm font-black text-primary-500 mb-1 uppercase tracking-widest">{product.brand.name}</p>}
          <h1 className="text-2xl md:text-3xl font-black text-dark-900 leading-tight">{product.title}</h1>

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
            <div className="space-y-0 border rounded-xl overflow-hidden">
              {product.brand && <div className="flex justify-between p-4 border-b bg-gray-50/50"><span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Marca</span><span className="text-sm font-black text-primary-600">{product.brand.name}</span></div>}
              {product.category && <div className="flex justify-between p-4 border-b"><span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Categoría</span><span className="text-sm font-bold">{product.category.name}</span></div>}
              {mainVariant?.sku && <div className="flex justify-between p-4 border-b bg-gray-50/50"><span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">SKU</span><span className="text-sm font-mono font-bold">{mainVariant.sku}</span></div>}
              <div className="flex justify-between p-4 border-b"><span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">Stock</span><span className="text-sm font-bold">{stock} unidades</span></div>
              
              {/* Characteristics from Metadata */}
              {(product.metadata?.attributes || []).map((attr: any, idx: number) => (
                <div key={idx} className={`flex justify-between p-4 border-b ${idx % 2 === 0 ? 'bg-gray-50/30' : ''}`}>
                  <span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">{attr.name}</span>
                  <span className="text-sm font-medium text-dark-800 text-right">{attr.value_name || 'N/A'}</span>
                </div>
              ))}
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
