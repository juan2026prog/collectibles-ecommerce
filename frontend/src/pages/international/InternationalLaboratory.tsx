import React, { useState, useEffect } from 'react';
import { Package, ShoppingCart, CreditCard, Box, Calculator, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../hooks/useData';
import { formatUSD, formatUYU, formatPercent, formatDate } from '../../lib/formatters';

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
  const [adminMode, setAdminMode] = useState(false);
  
  const { products: dbProducts, loading } = useProducts({ isInternational: true, includeDrafts: true, limit: 12 });
  const { items: cartItems, addItem: addToCart } = useInternationalCartContext();
  const navigate = useNavigate();

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
          <div className="flex items-center justify-between mb-4">
            <div className="inline-block px-3 py-1 bg-[#f00856]/20 text-[#f00856] text-xs font-bold tracking-widest uppercase rounded-full">
              Vista Preview Admin
            </div>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={adminMode} onChange={() => setAdminMode(!adminMode)} />
                <div className={`block w-14 h-8 rounded-full ${adminMode ? 'bg-[#f00856]' : 'bg-slate-700'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform ${adminMode ? 'translate-x-6' : ''}`}></div>
              </div>
              <div className="ml-3 text-sm font-bold uppercase tracking-widest">
                Modo Admin {adminMode ? 'ON' : 'OFF'}
              </div>
            </label>
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {displayProducts.map((p: any) => {
                  const raw = p.raw_international_data || p;
                  const finalPrice = raw.final_price_usd || p.base_price;
                  const listPrice = raw.amazon_list_price_usd;
                  const discount = raw.amazon_discount_percent;
                  const isDraft = raw.status === 'draft';
                  const weightKg = raw.weight_kg || 0.5;
                  const uruboxEstimate = weightKg * 22; // $22/kg
                  
                  return (
                    <div key={p.id} className="glass p-5 rounded-2xl border border-white/10 flex flex-col relative group transition-all hover:border-[#f00856]/50">
                      {isDraft && (
                        <div className="absolute -top-3 left-4 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full z-10 shadow-lg">
                          Borrador
                        </div>
                      )}
                      <div className="bg-white rounded-xl p-4 mb-4 h-48 flex items-center justify-center relative overflow-hidden">
                        <img src={p.images?.[0]?.url || p.image_url} alt={p.title} className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 flex gap-1 flex-col">
                          <span className="bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm flex items-center gap-1">
                            🌎 Internacional
                          </span>
                        </div>
                        {discount > 0 && (
                          <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase shadow-sm">
                            -{discount}%
                          </div>
                        )}
                      </div>
                      
                      {adminMode && raw && (
                        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-3 mb-4 text-[10px] font-mono shadow-inner">
                          <div className="flex justify-between text-slate-400 mb-1"><span>Costo Real:</span><span className="text-white">{formatUSD(raw.real_cost_usd)}</span></div>
                          <div className="flex justify-between text-slate-400 mb-1"><span>Ganancia:</span><span className="text-green-400">{formatUSD(raw.expected_profit_usd)}</span></div>
                          <div className="flex justify-between text-slate-400 mb-1"><span>Fee Collectibles:</span><span className="text-white">{formatUSD(raw.collectibles_fee_usd)}</span></div>
                          <div className="flex justify-between text-slate-400"><span>Último sync:</span><span className="text-white">{formatDate(raw.last_synced_at)}</span></div>
                        </div>
                      )}

                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{p.brand?.name || p.brand || 'Collectibles'}</span>
                        </div>
                        <h3 className="font-bold text-sm leading-tight mb-4 line-clamp-2 text-slate-200 group-hover:text-white transition-colors">{p.title}</h3>
                        
                        <div className="mt-auto space-y-1 bg-black/40 p-3 rounded-xl border border-white/5">
                          {listPrice > finalPrice && (
                            <div className="text-[11px] text-slate-500 line-through">
                              {formatUSD(listPrice)}
                            </div>
                          )}
                          <div className="font-black text-[#f00856] text-lg">
                            {formatUSD(finalPrice)}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-white/10 space-y-1">
                            <div className="flex justify-between"><span>Urubox estimado:</span><span>{formatUSD(uruboxEstimate)}</span></div>
                            <div className="flex justify-between font-bold text-white"><span>Total estimado:</span><span>{formatUSD(finalPrice + uruboxEstimate)}</span></div>
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
                            price_usd: finalPrice,
                            image_url: p.images?.[0]?.url || p.image_url,
                            quantity: 1,
                            brand_name: p.brand?.name || p.brand,
                            is_international: true,
                            weight_kg: weightKg,
                            amazon_price: raw.amazon_current_price_usd || (finalPrice * 0.7)
                          });
                          setActiveTab('carrito');
                        }}
                        className="btn-primary py-3 text-xs w-full"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                )})}
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
                        <div className="flex justify-between gap-6">
                          <div className="flex gap-4 items-center flex-1">
                            <img src={item.image_url} alt={item.title} className="w-16 h-16 object-cover bg-white rounded" />
                            <div>
                              <h3 className="font-bold text-white line-clamp-1">{item.title}</h3>
                              <p className="text-sm text-slate-400">Cant: {item.quantity}</p>
                            </div>
                          </div>
                          
                          <div className="text-right flex flex-col justify-center min-w-[200px]">
                            <div className="text-slate-400 text-xs mb-1">Producto: {formatUSD(subtotal)}</div>
                            <div className="text-slate-400 text-xs mb-1">Urubox est: {formatUSD(uruboxEstimate)}</div>
                            <div className="font-bold text-[#f00856] text-xl pt-2 border-t border-white/10 mt-1">
                              Total: {formatUSD(subtotal + uruboxEstimate)}
                            </div>
                          </div>
                        </div>
                        
                        {adminMode && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-6 pt-6 border-t border-white/10">
                            <div className="bg-black/50 p-3 rounded-lg border border-slate-800">
                              <p className="text-slate-500 uppercase font-bold mb-2">Costos Externos</p>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Amazon:</span><span className="font-mono">{formatUSD(amazonCost)}</span></div>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Envío USA:</span><span className="font-mono">{formatUSD(usaShipping)}</span></div>
                              <div className="flex justify-between pt-1 mt-1 border-t border-white/10"><span className="text-slate-300">Base Cost:</span><span className="font-mono font-bold">{formatUSD(amazonCost + usaShipping)}</span></div>
                            </div>
                            <div className="bg-black/50 p-3 rounded-lg border border-slate-800">
                              <p className="text-slate-500 uppercase font-bold mb-2">Fees & Transacción</p>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Zinc API:</span><span className="font-mono">{formatUSD(zincFee)}</span></div>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Prex Tarjeta:</span><span className="font-mono">{formatUSD(prexFee)}</span></div>
                              <div className="flex justify-between pt-1 mt-1 border-t border-white/10"><span className="text-slate-300">Total Fees:</span><span className="font-mono font-bold">{formatUSD(zincFee + prexFee)}</span></div>
                            </div>
                            <div className="bg-black/50 p-3 rounded-lg border border-green-500/30">
                              <p className="text-green-500 uppercase font-bold mb-2">Rentabilidad</p>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Total Costos:</span><span className="font-mono">{formatUSD(totalCost)}</span></div>
                              <div className="flex justify-between mb-1"><span className="text-slate-400">Final Collectibles:</span><span className="font-mono text-white">{formatUSD(subtotal)}</span></div>
                              <div className="flex justify-between pt-1 mt-1 border-t border-white/10"><span className="text-green-400 font-bold">Margen:</span><span className="font-mono text-green-400 font-bold">{formatUSD(margin)} ({formatPercent((margin/subtotal)*100)})</span></div>
                            </div>
                          </div>
                        )}
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
