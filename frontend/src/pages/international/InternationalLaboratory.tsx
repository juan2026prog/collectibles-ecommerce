import React, { useState, useEffect } from 'react';
import { Package, ShoppingCart, CreditCard, Box, Calculator, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';
import { useNavigate } from 'react-router-dom';

// Mocks por si la base de datos está vacía
const MOCK_PRODUCTS = [
  {
    id: 'mock-1',
    title: 'LEGO Technic NASA Apollo Lunar Roving Vehicle',
    image_url: 'https://m.media-amazon.com/images/I/81xU24dJ9+L._AC_SX679_.jpg',
    brand: 'LEGO',
    amazon_list_price_usd: 219.99,
    amazon_current_price_usd: 195.99,
    amazon_discount_percent: 11,
    final_price_usd: 235.50,
    is_prime: true,
    weight_kg: 3.5
  },
  {
    id: 'mock-2',
    title: 'Funko Pop! Marvel: Spider-Man No Way Home - Spider-Man',
    image_url: 'https://m.media-amazon.com/images/I/61kM2O1hGUL._AC_SX679_.jpg',
    brand: 'Funko',
    amazon_list_price_usd: 12.99,
    amazon_current_price_usd: 11.50,
    amazon_discount_percent: 11,
    final_price_usd: 14.99,
    is_prime: true,
    weight_kg: 0.4
  },
  {
    id: 'mock-3',
    title: 'NECA Scream - Ghost Face Ultimate 7" Action Figure',
    image_url: 'https://m.media-amazon.com/images/I/81t3QpP+9xL._AC_SX679_.jpg',
    brand: 'NECA',
    amazon_list_price_usd: 34.99,
    amazon_current_price_usd: 34.99,
    amazon_discount_percent: 0,
    final_price_usd: 42.00,
    is_prime: false,
    weight_kg: 0.8
  }
];

export default function InternationalLaboratory() {
  const [activeTab, setActiveTab] = useState<'productos'|'carrito'|'checkout'|'urubox'|'rentabilidad'>('productos');
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { items: cartItems, addItem: addToCart } = useInternationalCartContext();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase
        .from('international_products')
        .select('*')
        .eq('status', 'published')
        .limit(10);
      
      setDbProducts(data || []);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const displayProducts = dbProducts.length > 0 ? dbProducts : MOCK_PRODUCTS;

  return (
    <div className="min-h-screen bg-black text-white pt-24 pb-12">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Laboratorio Internacional | Collectibles</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-block px-3 py-1 bg-[#f00856]/20 text-[#f00856] text-xs font-bold tracking-widest uppercase rounded-full mb-4">
            Modo Privado / Admin
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-4">
            Laboratorio Collectibles Internacional
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl">
            Vista privada para validar producto, carrito, courier, Urubox y checkout internacional.
          </p>
        </div>

        {/* Tabs Nav */}
        <div className="flex overflow-x-auto gap-2 mb-8 pb-2 scrollbar-hide border-b border-white/10">
          {[
            { id: 'productos', label: '1. Productos', icon: Package },
            { id: 'carrito', label: '2. Carrito', icon: ShoppingCart },
            { id: 'checkout', label: '3. Checkout', icon: CreditCard },
            { id: 'urubox', label: '4. Urubox', icon: Box },
            { id: 'rentabilidad', label: '5. Rentabilidad', icon: Calculator }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 font-bold uppercase tracking-widest text-sm whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id 
                  ? 'border-[#f00856] text-[#f00856]' 
                  : 'border-transparent text-slate-500 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'carrito' && cartItems.length > 0 && (
                <span className="ml-2 bg-[#f00856] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">
                  {cartItems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === 'productos' && (
            <div className="space-y-6">
              {dbProducts.length === 0 && !loading && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 p-4 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold mb-1">Cargando Mocks Demo</h3>
                    <p className="text-sm opacity-80">
                      No se encontraron productos en international_products con status 'published'. 
                      Mostrando datos falsos para poder probar el flujo.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayProducts.map((p) => (
                  <div key={p.id} className="glass p-6 rounded-2xl border border-white/5 flex flex-col">
                    <div className="bg-white rounded-xl p-4 mb-4 h-48 flex items-center justify-center relative">
                      <img src={p.image_url} alt={p.title} className="max-w-full max-h-full object-contain" />
                      {p.amazon_discount_percent > 0 && (
                        <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
                          -{p.amazon_discount_percent}% OFF
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-400 bg-white/5 px-2 py-1 rounded">{p.brand}</span>
                        {p.is_prime && (
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded uppercase">Prime</span>
                        )}
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-2 py-1 rounded uppercase">
                          {p.weight_kg ? `${p.weight_kg}kg` : 'Peso est.'}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg leading-tight mb-4 line-clamp-2">{p.title}</h3>
                      
                      <div className="space-y-1 mb-6 text-sm">
                        <div className="flex justify-between text-slate-400">
                          <span>Precio Lista Amazon:</span>
                          <span className="line-through">USD {p.amazon_list_price_usd?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-white">
                          <span>Precio Actual Amazon:</span>
                          <span>USD {p.amazon_current_price_usd?.toFixed(2) || (p.final_price_usd * 0.7).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-black text-[#f00856] text-lg pt-2 border-t border-white/10 mt-2">
                          <span>Final Collectibles:</span>
                          <span>USD {p.final_price_usd?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      <button 
                        onClick={() => navigate(`/p/${p.id}`)}
                        className="btn-secondary py-3 text-xs"
                      >
                        Ver Detalle
                      </button>
                      <button 
                        onClick={() => {
                          addToCart({
                            variant_id: p.id,
                            product_id: p.id,
                            title: p.title,
                            price_usd: p.final_price_usd,
                            image_url: p.image_url,
                            quantity: 1,
                            brand_name: p.brand,
                            is_international: true,
                            weight_kg: p.weight_kg || 0.5,
                            amazon_price: p.amazon_current_price_usd || (p.final_price_usd * 0.7)
                          });
                          setActiveTab('carrito');
                        }}
                        className="btn-primary py-3 text-xs"
                      >
                        Al Carrito
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'carrito' && (
            <div className="glass p-8 rounded-3xl border border-white/5">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-6">Carrito Internacional</h2>
              {cartItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>El carrito está vacío</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {cartItems.map((item) => {
                    const amazonCost = item.amazon_price || 0;
                    const usaShipping = 0; // Podría venir del producto
                    const zincFee = 1;
                    const prexFee = ((amazonCost * 0.025) + 0.5) * 1.22;
                    const totalCost = amazonCost + usaShipping + zincFee + prexFee;
                    const subtotal = item.price_usd;
                    const margin = subtotal - totalCost;
                    const uruboxEstimate = (item.weight_kg || 0.5) * 22;

                    return (
                      <div key={item.variant_id} className="bg-black/40 p-6 rounded-2xl border border-white/5">
                        <div className="flex gap-4 items-center mb-6 border-b border-white/10 pb-6">
                          <img src={item.image_url} alt={item.title} className="w-16 h-16 object-cover bg-white rounded" />
                          <div>
                            <h3 className="font-bold text-white line-clamp-1">{item.title}</h3>
                            <p className="text-sm text-slate-400">Cant: {item.quantity}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-slate-500 uppercase font-bold mb-1">Costo Base</p>
                            <p className="font-mono">Amazon: ${amazonCost.toFixed(2)}</p>
                            <p className="font-mono">USA Ship: ${usaShipping.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase font-bold mb-1">Fees</p>
                            <p className="font-mono">Zinc: ${zincFee.toFixed(2)}</p>
                            <p className="font-mono">Prex: ${prexFee.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase font-bold mb-1">Rentabilidad</p>
                            <p className="font-mono">Subtotal: ${subtotal.toFixed(2)}</p>
                            <p className="font-mono text-green-400">Margen: ${margin.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 uppercase font-bold mb-1">Estimación Puesto UY</p>
                            <p className="font-mono">Urubox: ${uruboxEstimate.toFixed(2)}</p>
                            <p className="font-mono text-xl text-white font-bold mt-1">
                              ${(subtotal + uruboxEstimate).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="flex justify-end pt-6">
                    <button 
                      onClick={() => setActiveTab('checkout')}
                      className="btn-primary px-8 py-4 flex items-center gap-2"
                    >
                      Avanzar a Checkout <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checkout' && (
            <div className="glass p-8 rounded-3xl border border-white/5">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-6">Simulador Checkout</h2>
              <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-xl text-blue-300 mb-8">
                <p>Para probar el flujo real de checkout con sus componentes completos, usá el flujo normal desde el carrito presionando el botón abajo. Esto te llevará por las pantallas reales que ve el usuario (Courier, Review, Success).</p>
              </div>
              <button 
                onClick={() => navigate('/internacional/checkout/courier')}
                disabled={cartItems.length === 0}
                className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cartItems.length > 0 ? 'Iniciar Flujo Real de Checkout' : 'Agrega productos al carrito primero'}
              </button>
            </div>
          )}

          {activeTab === 'urubox' && (
            <div className="glass p-8 rounded-3xl border border-white/5">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-6">Calculadora Urubox Interna</h2>
              <p className="text-slate-400 mb-8">
                Esta es la matemática que usamos internamente para mostrar la estimación en el carrito.
              </p>
              
              <div className="max-w-md bg-black/40 p-6 rounded-2xl border border-white/5">
                <div className="space-y-4 text-sm font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Peso Ejemplo:</span>
                    <span>1.5 kg</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Flete Urubox ($22/kg):</span>
                    <span>USD 33.00</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Handling Urubox:</span>
                    <span>USD 5.00</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>URSEC (Si aplica):</span>
                    <span>10%</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Envío UY (MVD/Interior):</span>
                    <span>USD 5.00 + IVA</span>
                  </div>
                  <div className="border-t border-white/10 pt-4 flex justify-between font-bold text-white text-lg">
                    <span>Total Estimado:</span>
                    <span className="text-[#f00856]">USD 43.00</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rentabilidad' && (
            <div className="glass p-8 rounded-3xl border border-white/5">
              <h2 className="text-2xl font-black uppercase tracking-widest mb-6">Profit Protection Engine</h2>
              <p className="text-slate-400 mb-8">
                Reglas de validación que se ejecutan en la Edge Function antes de permitir una orden.
              </p>

              <div className="space-y-4 max-w-2xl">
                <div className="bg-black/40 p-6 rounded-xl border border-white/5 font-mono text-sm">
                  <p className="text-green-400 mb-2">// Reglas Duras</p>
                  <p>Margen Objetivo = 7%</p>
                  <p>Ganancia Mínima = USD 3.99</p>
                  <p>Ganancia Mínima Absoluta = USD 2.00</p>
                </div>

                <div className="bg-black/40 p-6 rounded-xl border border-white/5 font-mono text-sm">
                  <p className="text-blue-400 mb-2">// Cálculo de Costos Variables</p>
                  <p>Zinc Fee = USD 1.00</p>
                  <p>Prex Fee = ((AmazonCost * 2.5%) + 0.50) + IVA 22%</p>
                </div>

                <div className="bg-black/40 p-6 rounded-xl border border-white/5 font-mono text-sm">
                  <p className="text-[#f00856] mb-2">// Bloqueo</p>
                  <p>IF (Subtotal - TotalCost) &lt; Ganancia Mínima Absoluta THEN</p>
                  <p className="pl-4">BLOCK_ORDER()</p>
                  <p className="pl-4">ALERT_ADMIN()</p>
                  <p>END IF</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
