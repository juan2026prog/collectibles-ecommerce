import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ShoppingCart, Minus, Plus, Truck, ShieldCheck, Star } from 'lucide-react';
import { useProduct } from '../hooks/useData';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { ProductBadge } from '../components/ProductBadge';
import { getProductImage, resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { analytics } from '../lib/analytics';
import SEO from '../components/SEO';

export default function ProductDetail() {
  const { slug } = useParams();
  const { product, loading } = useProduct(slug);
  const cart = useCartContext();
  const { user } = useAuth();
  const { formatPrice } = useLocale();
  
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

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
        <div className="animate-pulse bg-white/10  aspect-square" />
        <div className="space-y-4">
          <div className="animate-pulse bg-white/10 h-8 w-3/4 rounded" />
          <div className="animate-pulse bg-white/10 h-6 w-1/4 rounded" />
          <div className="animate-pulse bg-white/10 h-20 rounded" />
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-500">Producto no encontrado</h1>
      <Link to="/shop" className="btn-primary mt-4">Volver a la tienda</Link>
    </div>
  );

  const productImage = getProductImage(product);
  const { images = [], variants = [], reviews = [] } = product || {};
  const selectedVariant = variants[selectedVariantIdx] || variants[0];
  const stock = selectedVariant?.inventory_count || 0;
  const finalPrice = product.base_price + (selectedVariant?.price_adjustment || 0);
  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
  const currentImage = images[selectedImage]?.url;
  const displayImage = currentImage ? resolveImage(currentImage) : productImage;

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

  function addToCart() {
    if (!selectedVariant) return;
    if (stock <= 0) return;
    if (quantity > stock) return;

    cart.addItem({
      product_id: product.id,
      variant_id: selectedVariant.id,
      quantity,
      title: product.title,
      price: finalPrice,
      image: productImage,
      variant_name: selectedVariant.name,
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);

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
    "sku": selectedVariant?.sku,
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
    <div className="max-w-7xl mx-auto px-4 py-10">
      <SEO
        title={seoTitle}
        description={seoDescription}
        image={displayImage}
        type="product"
        schema={productSchema}
      />

      <nav className="flex items-center text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex-wrap gap-2">
        <Link to="/" className="hover:text-primary-500 transition-colors">Inicio</Link>
        <span className="opacity-30">/</span>
        {product.category && (
          <>
            <Link to={`/shop?category=${product.category.slug}`} className="hover:text-primary-500 transition-colors">{product.category.name}</Link>
            <span className="opacity-30">/</span>
          </>
        )}
        <span className="text-white line-clamp-1">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-8">
        {/* GALLERY SECTION */}
        <section className="glass rounded-[2.5rem] p-4 flex flex-col gap-4">
          <div
            className="aspect-square rounded-[2rem] bg-black/30 grid place-items-center relative overflow-hidden group cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <img
              src={displayImage}
              alt={product.title}
              className={`w-full h-full object-contain p-8 transition-all duration-500 ${isHovering ? 'opacity-20 scale-110' : 'opacity-100 scale-100'}`}
            />
            
            {/* Magnifier Lens */}
            {isHovering && (
              <div
                className="absolute pointer-events-none border-2 border-white/20 shadow-2xl bg-no-repeat z-20 rounded-full"
                style={{
                  left: `${mousePos.x}%`,
                  top: `${mousePos.y}%`,
                  width: '200px',
                  height: '200px',
                  transform: 'translate(-50%, -50%)',
                  backgroundImage: `url(${displayImage})`,
                  backgroundSize: '800%',
                  backgroundPosition: `${mousePos.x}% ${mousePos.y}%`,
                }}
              />
            )}

            <span className="absolute top-5 left-5 bg-[#f00856] rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider shadow-lg shadow-[#f00856]/30">
              Seleccionado por Collectibles
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {images.slice(0, 4).map((img: any, i: number) => {
              const src = resolveImage(img.url);
              return (
                <button
                  key={img.id || i}
                  onClick={() => setSelectedImage(i)}
                  onMouseEnter={() => setSelectedImage(i)}
                  className={`soft rounded-2xl aspect-square overflow-hidden transition-all border-2 ${i === selectedImage ? 'border-[#f00856] scale-95' : 'border-white/5 hover:border-white/20'}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        </section>

        {/* INFO SECTION */}
        <section>
          <div className="label-tag">Ficha de producto</div>
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

          <div className="glass rounded-[2rem] p-7 mt-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em] mb-1">Precio actual</div>
                <div className="text-5xl font-black text-white">${formatPrice(finalPrice)}</div>
                <div className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                   <Truck className="w-4 h-4 text-[#f00856]" /> Envío calculado al finalizar
                </div>
                <div className={`text-sm font-bold mt-2 ${stockInfo.className}`}>
                  {stockInfo.text}
                </div>
              </div>

              {/* QUANTITY SELECTOR + ADD TO CART */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center border border-white/10 rounded-full overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-12 h-12 flex items-center justify-center hover:bg-white/5 transition-colors"
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-black text-lg">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(stock, quantity + 1))}
                    className="w-12 h-12 flex items-center justify-center hover:bg-white/5 transition-colors"
                    disabled={quantity >= stock}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={addToCart}
                  disabled={stock <= 0}
                  className={`btn-primary rounded-full px-10 py-5 text-base transition-all ${
                    stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''
                  } ${addedToCart ? 'bg-green-500 border-green-500' : ''}`}
                >
                  {addedToCart ? '✓ Agregado' : stock <= 0 ? 'Agotado' : 'Agregar al carrito'}
                </button>
              </div>
            </div>
          </div>

          {/* SELLER INFO — real data, no Math.random */}
          {product.brand?.name && (
            <div className="glass rounded-[2rem] p-6 mt-4">
              <div className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em]">Vendido por</div>
              <div className="flex items-center justify-between gap-4 mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#f00856] flex items-center justify-center font-black text-xl shadow-lg shadow-[#f00856]/20">
                    {product.brand.name[0]}
                  </div>
                  <div>
                    <div className="font-black text-xl text-white">{product.brand.name}</div>
                  </div>
                </div>
                <span className="badge hidden sm:inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-green-400" /> Distribuidor oficial
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">⚡ Entrega</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">24-48 horas</p>
            </div>
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">✅ Estado</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">Nuevo / Sellado</p>
            </div>
            <div className="soft rounded-2xl p-4 transition-colors hover:bg-white/5">
              <b className="text-white block text-sm">🔄 Devolución</b>
              <p className="text-[11px] text-slate-500 mt-1 uppercase font-black">14 días gratis</p>
            </div>
          </div>
        </section>
      </div>

      <section className="grid lg:grid-cols-[1fr_.8fr] gap-6 mt-10">
        <div className="glass rounded-[2.5rem] p-8 md:p-12">
          <div className="label-tag">Historia del producto</div>
          <h2 className="text-3xl md:text-4xl font-black mt-3 text-white tracking-tight">¿Por qué importa?</h2>
          <div className="prose prose-invert mt-6 max-w-none text-slate-300 leading-relaxed text-lg">
             {product.description ? (
               <p>{product.description}</p>
             ) : (
               <p>Cada detalle ha sido verificado para garantizar su autenticidad y estado. Contexto del personaje, rareza, franquicia y valor para coleccionistas.</p>
             )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-[2.5rem] p-8 h-full">
            <div className="label-tag">Especificaciones</div>
            <h2 className="text-3xl font-black mt-3 text-white tracking-tight">Detalles técnicos</h2>
            <div className="space-y-3 mt-6">
              <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Categoría</span>
                <b className="text-white">{product.category?.name || 'N/A'}</b>
              </div>
              <div className="soft rounded-2xl p-5 flex justify-between items-center group hover:bg-white/5 transition-colors">
                <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Marca</span>
                <b className="text-white">{product.brand?.name || 'N/A'}</b>
              </div>
              {selectedVariant?.sku && (
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

      {/* REVIEWS SECTION */}
      <section className="mt-16 border-t border-white/10 pt-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <div className="label-tag">Opiniones de compradores</div>
            <h2 className="text-4xl font-black mt-2 text-white">Lo que dicen los coleccionistas</h2>
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
    </div>
  );
}
