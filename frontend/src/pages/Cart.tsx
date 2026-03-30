import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight, ChevronRight, Tag } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useState } from 'react';

export default function Cart() {
  const { items, updateQuantity, removeItem, total, count } = useCartContext();
  const [coupon, setCoupon] = useState('');
  const shipping = total >= 4000 ? 0 : 350;
  const grandTotal = total + shipping;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <ShoppingCart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-400">Your cart is empty</h1>
        <p className="text-gray-400 mt-2">Add some products to get started!</p>
        <Link to="/shop" className="btn-primary mt-6 inline-flex gap-2">Continue Shopping <ArrowRight className="w-4 h-4" /></Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <nav className="flex items-center text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-primary-600 font-medium">Shopping Cart</span>
      </nav>

      <h1 className="text-2xl font-black text-dark-900 mb-8">SHOPPING CART</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => (
            <div key={item.variant_id} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4">
              <img src={item.image || 'https://via.placeholder.com/80'} alt="" className="w-20 h-20 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-dark-900 text-sm line-clamp-2">{item.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{item.variant_name}</p>
                  </div>
                  <button onClick={() => removeItem(item.variant_id)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-gray-200 rounded-lg">
                    <button onClick={() => updateQuantity(item.variant_id, item.quantity - 1)} className="p-2 hover:bg-gray-50"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="px-3 text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.variant_id, item.quantity + 1)} className="p-2 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="text-lg font-extrabold text-dark-900">${(item.price * item.quantity).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
            <h2 className="font-bold text-lg mb-4">Cart Totals</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-bold">${total.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Shipping</span><span className="font-bold">{shipping === 0 ? 'FREE' : `$${shipping}`}</span></div>
              {shipping > 0 && <p className="text-xs text-gray-400">Free shipping on orders over $4,000</p>}
            </div>

            <div className="border-t my-4" />

            {/* Coupon */}
            <div className="mb-4">
              <div className="flex items-center gap-1 text-sm font-bold text-gray-700 mb-2"><Tag className="w-4 h-4" /> COUPON CODE</div>
              <div className="flex gap-2">
                <input type="text" value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Enter code" className="form-input flex-1" />
                <button className="btn-secondary px-4">Apply</button>
              </div>
            </div>

            <div className="border-t my-4" />

            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">TOTAL</span>
              <span className="text-2xl font-black text-primary-600">${grandTotal.toLocaleString()}</span>
            </div>

            <Link to="/checkout" className="btn-primary w-full mt-6 py-3.5 text-base gap-2">
              PROCEED TO CHECKOUT <ArrowRight className="w-5 h-5" />
            </Link>

            <Link to="/shop" className="block text-center text-sm text-gray-500 hover:text-primary-600 mt-3">← Continue Shopping</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
