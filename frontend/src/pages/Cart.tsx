import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight, ChevronRight, Tag } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { resolveImage } from '../lib/imageUtils';
import { useState } from 'react';

export default function Cart() {
  const { items, updateQuantity, removeItem, total, count } = useCartContext();
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState('');
  const shipping = total >= 4000 ? 0 : 350;
  const grandTotal = total + shipping;

  function handleApplyCoupon() {
    if (!coupon.trim()) return;
    // Cupón no conectado a backend todavía
    setCouponError('El sistema de cupones estará disponible próximamente.');
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <ShoppingCart className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-500">Tu carrito está vacío</h1>
        <p className="text-slate-500 mt-2">Agregá productos para comenzar.</p>
        <Link to="/shop" className="btn-primary mt-6 inline-flex gap-2">Seguir comprando <ArrowRight className="w-4 h-4" /></Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <nav className="flex items-center text-sm text-slate-400 mb-6">
        <Link to="/" className="hover:text-primary-600">Inicio</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-primary-600 font-medium">Carrito</span>
      </nav>

      <h1 className="text-2xl font-black text-white mb-8">CARRITO DE COMPRAS</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => (
            <div key={item.variant_id} className="glass p-4 flex gap-4">
              <img src={resolveImage(item.image) || undefined} alt="" className="w-20 h-20 object-cover rounded-xl bg-white/5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-sm line-clamp-2">{item.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{item.variant_name}</p>
                  </div>
                  <button onClick={() => removeItem(item.variant_id)} className="p-1.5 text-slate-500 hover:text-red-500" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-white/10 rounded-lg">
                    <button onClick={() => updateQuantity(item.variant_id, item.quantity - 1)} className="p-2 hover:bg-white/5"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="px-3 text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.variant_id, item.quantity + 1)} className="p-2 hover:bg-white/5"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="text-lg font-extrabold text-white">${(item.price * item.quantity).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="glass p-6 sticky top-24 rounded-2xl">
            <h2 className="font-bold text-lg mb-4 text-white">Resumen del pedido</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="font-bold">${total.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Envío</span><span className="font-bold">{shipping === 0 ? 'GRATIS' : `$${shipping}`}</span></div>
              {shipping > 0 && <p className="text-xs text-slate-500">Envío gratis en compras mayores a $4.000</p>}
            </div>

            <div className="border-t border-white/10 my-4" />

            {/* Cupón */}
            <div className="mb-4">
              <div className="flex items-center gap-1 text-sm font-bold text-slate-400 mb-2"><Tag className="w-4 h-4" /> Cupón de descuento</div>
              <div className="flex gap-2">
                <input type="text" value={coupon} onChange={e => { setCoupon(e.target.value); setCouponError(''); }} placeholder="Ingresá tu código" className="form-input flex-1" />
                <button onClick={handleApplyCoupon} className="btn-secondary px-4">Aplicar</button>
              </div>
              {couponError && <p className="text-xs text-amber-400 mt-2">{couponError}</p>}
            </div>

            <div className="border-t border-white/10 my-4" />

            <div className="flex justify-between items-center">
              <span className="font-bold text-lg text-white">TOTAL</span>
              <span className="text-2xl font-black text-primary-600">${grandTotal.toLocaleString()}</span>
            </div>

            <Link to="/checkout" className="btn-primary w-full mt-6 py-3.5 text-base gap-2">
              IR AL PAGO <ArrowRight className="w-5 h-5" />
            </Link>

            <Link to="/shop" className="block text-center text-sm text-slate-400 hover:text-primary-600 mt-3">← Seguir comprando</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
