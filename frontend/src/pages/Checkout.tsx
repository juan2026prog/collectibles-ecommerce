import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, CreditCard, Building, QrCode } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';

export default function Checkout() {
  const { items, total, clearCart } = useCartContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('dlocalgo');
  const [form, setForm] = useState({
    email: user?.email || '', first_name: '', last_name: '', phone: '',
    street: '', apartment: '', city: '', department: '', postal_code: '', country: 'Uruguay',
  });

  const shipping = total >= 4000 ? 0 : 350;
  const grandTotal = total + shipping;

  useEffect(() => {
    if (items.length > 0) {
      analytics.track({
        eventName: 'InitiateCheckout',
        eventData: {
          num_items: items.length,
          value: total,
          currency: 'UYU',
          content_ids: items.map(i => i.product_id)
        },
        user: { email: user?.email || undefined }
      });
    }
  }, []);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Resolve Affiliate ID if exists
      let affiliateId = null;
      const refCode = localStorage.getItem('affiliate_code');
      if (refCode) {
        const { data: affData } = await supabase.from('affiliates').select('id').eq('code', refCode).single();
        if (affData) affiliateId = affData.id;
      }

      // 2. Create order in Supabase
      const { data: order, error } = await supabase.from('orders').insert({
        customer_id: user?.id || null,
        affiliate_id: affiliateId,
        total_amount: grandTotal,
        currency: 'UYU',
        status: 'pending',
        payment_method: paymentMethod,
        customer_email: form.email,
        customer_phone: form.phone,
        shipping_address: {
          first_name: form.first_name, last_name: form.last_name,
          street: form.street, apartment: form.apartment,
          city: form.city, department: form.department,
          postal_code: form.postal_code, country: form.country,
        },
      }).select().single();

      if (error) throw error;

      // Create order items matching new schema
      if (order) {
        const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity
        }));
        await supabase.from('order_items').insert(orderItems);
      }

      // Branch out by Payment Method
      if (paymentMethod === 'dlocalgo') {
        // Call the Edge Function to generate the checkout session
        const { data, error: fnError } = await supabase.functions.invoke('dlocalgo-checkout', {
          body: { orderId: order.id }
        });
        
        if (fnError || !data?.redirect_url) {
           console.error("Function Error dLocal", fnError || data);
           if (fnError?.message.includes('fetch')) {
               alert(`Fallback Dev Mode: Simulando dLocal Link... Order ${order.id}`);
               clearCart(); navigate('/'); return;
           }
           throw new Error('Error de dLocal Go: No se pudo generar el checkout');
        }
        window.location.href = data.redirect_url;
        return; 
      }

      if (paymentMethod === 'mercadopago') {
        const { data, error: fnError } = await supabase.functions.invoke('mercadopago-checkout', {
          body: { orderId: order.id }
        });
        
        if (fnError || !data?.redirect_url) {
           console.error("Function Error MP", fnError || data);
           if (fnError?.message.includes('fetch') || data?.is_mock) {
               console.warn("Dev Mode MercadoPago Fallback Triggered");
           } else {
               throw new Error('Error de Mercado Pago: No se pudo generar la preferencia de pago');
           }
        }
        
        // Track the purchase initiation in analytics before redirection
        analytics.track({
          eventName: 'InitiateCheckout',
          eventData: { content_ids: items.map(i => i.product_id), value: grandTotal, currency: 'UYU' },
        });

        window.location.href = data.redirect_url;
        return; 
      }

      // If Transfer...
      clearCart();
      analytics.track({
        eventName: 'Purchase',
        eventData: {
          content_ids: items.map(i => i.product_id),
          content_type: 'product',
          value: grandTotal,
          currency: 'UYU',
          num_items: items.reduce((s, i) => s + i.quantity, 0)
        },
        user: { email: form.email, phone: form.phone }
      });
      alert(`Orden creada (Transferencia). Número de cuenta para transferir: ITAU 123456. Orden #${order?.id.slice(0, 8).toUpperCase()}`);
      navigate('/checkout/success?order_id=' + order?.id);
    } catch (err: any) {
      alert('Error procesando el pedido: ' + err.message);
    }
    setLoading(false);
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-400">Nothing to checkout</h1>
        <Link to="/shop" className="btn-primary mt-4">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <nav className="flex items-center text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-primary-600 font-medium">Caja</span>
      </nav>

      {/* Progress */}
      <div className="flex items-center justify-center gap-4 mb-10 text-sm">
        <Link to="/cart" className="text-gray-400 font-medium">CARRITO</Link>
        <div className="w-12 h-px bg-dark-900" />
        <span className="font-bold text-dark-900">PAGO</span>
        <div className="w-12 h-px bg-gray-200" />
        <span className="text-gray-300">CONFIRMACIÓN</span>
      </div>

      <form onSubmit={handlePlaceOrder}>
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Billing Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">DATOS DE FACTURACIÓN</h2>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Correo Electrónico *</label>
                  <input type="email" required className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Nombre *</label><input required className="form-input" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} /></div>
                  <div><label className="form-label">Apellido *</label><input required className="form-input" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} /></div>
                </div>
                <div><label className="form-label">Teléfono</label><input className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div>
                  <label className="form-label">Dirección (Calle, Número) *</label>
                  <AddressAutocomplete 
                    value={form.street} 
                    onChange={val => setForm({...form, street: val})}
                    onSelect={(details) => setForm(f => ({
                       ...f,
                       street: details.street || f.street,
                       city: details.city || f.city,
                       department: details.department || f.department,
                       postal_code: details.postal_code || f.postal_code,
                       country: details.country || f.country
                    }))}
                  />
                </div>
                <div><label className="form-label">Apartamento / Timbre (opcional)</label><input className="form-input" value={form.apartment} onChange={e => setForm({...form, apartment: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Ciudad *</label><input required className="form-input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
                  <div><label className="form-label">Departamento / Estado</label><input className="form-input" value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Código Postal</label><input className="form-input" value={form.postal_code} onChange={e => setForm({...form, postal_code: e.target.value})} /></div>
                  <div><label className="form-label">País</label><input className="form-input" value={form.country} onChange={e => setForm({...form, country: e.target.value})} /></div>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">MÉTODO DE PAGO</h2>
              <div className="space-y-3">
                {[
                  { id: 'dlocalgo', icon: CreditCard, label: 'Tarjeta de Crédito / Débito (dLocal Go)' },
                  { id: 'mercadopago', icon: QrCode, label: 'MercadoPago (Billetera)' },
                  { id: 'transfer', icon: Building, label: 'Transferencia Bancaria' },
                ].map(m => (
                  <label key={m.id} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    paymentMethod === m.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="payment" value={m.id} checked={paymentMethod === m.id} onChange={() => setPaymentMethod(m.id)} className="text-primary-600" />
                    <m.icon className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-semibold">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
              <h2 className="font-bold text-lg mb-4">RESUMEN DE ORDEN</h2>
              <div className="space-y-3 mb-4">
                {items.map(item => (
                  <div key={item.variant_id} className="flex items-center gap-3">
                    <div className="relative">
                      <img src={item.image || 'https://via.placeholder.com/48'} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{item.quantity}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dark-900 line-clamp-1">{item.title}</p>
                    </div>
                    <span className="text-sm font-bold">${(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-bold">${total.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Envío</span><span className="font-bold">{shipping === 0 ? 'GRATIS' : `$${shipping}`}</span></div>
                <div className="border-t pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <span className="text-2xl font-black text-primary-600">${grandTotal.toLocaleString()}</span>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-6 py-3.5 text-base">
                {loading ? 'Procesando...' : 'FINALIZAR COMPRA'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
