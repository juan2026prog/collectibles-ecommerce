import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, CreditCard, Building, QrCode, Truck, Store } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { createCheckoutSession } from '../lib/payments';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS, calculateShipping } from '../utils/uruguayLocations';

export default function Checkout() {
  const { items, total, clearCart } = useCartContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('dlocalgo');
  const [shippingMethod, setShippingMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [form, setForm] = useState({
    email: user?.email || '', first_name: '', last_name: '', phone: '',
    street: '', apartment: '', city: '', department: '', postal_code: '', country: 'Uruguay',
  });

  const shipping = shippingMethod === 'pickup' ? 0 : calculateShipping(form.city, form.department, total);
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
      // Branch out by Payment Method
      if (paymentMethod === 'dlocalgo' || paymentMethod === 'paypal') {
        const provider = paymentMethod === 'dlocalgo' ? 'dlocal' : 'paypal';
        
        // Track the purchase initiation
        analytics.track({
          eventName: 'InitiateCheckout',
          eventData: { content_ids: items.map(i => i.product_id), value: grandTotal, currency: 'UYU' },
        });

        await createCheckoutSession({
          provider,
          amount: grandTotal,
          currency: 'UYU',
          customer: { 
             name: `${form.first_name} ${form.last_name}`, 
             email: form.email,
             address: shippingMethod === 'pickup' ? 'Retiro en local' : `${form.street}, ${form.apartment} - ${form.city}, ${form.department}`,
             phone: form.phone
          },
          items: items.map(i => ({ id: i.product_id, quantity: i.quantity, price: i.price, title: i.title }))
        });
        return; 
      }

      // If Transfer...
      alert('Las transferencias estan temporalmente deshabilitadas. Por favor usa dLocal Go.');
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
            {/* Shipping Method */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">MÉTODO DE ENVÍO</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  shippingMethod === 'delivery' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                }`}>
                  <input type="radio" checked={shippingMethod === 'delivery'} onChange={() => setShippingMethod('delivery')} className="sr-only" />
                  <div className={`p-2 rounded-lg ${shippingMethod === 'delivery' ? 'bg-primary-500 text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Envío a Domicilio</div>
                    <div className="text-sm text-gray-500 mt-1">Recibilo en tu puerta</div>
                  </div>
                </label>
                <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  shippingMethod === 'pickup' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                }`}>
                  <input type="radio" checked={shippingMethod === 'pickup'} onChange={() => setShippingMethod('pickup')} className="sr-only" />
                  <div className={`p-2 rounded-lg ${shippingMethod === 'pickup' ? 'bg-primary-500 text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Retiro en Local</div>
                    <div className="text-sm text-green-600 font-medium mt-1">GRATIS</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">DATOS DE FACTURACIÓN {shippingMethod === 'delivery' && '& ENVÍO'}</h2>
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
                
                {shippingMethod === 'delivery' && (
                  <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                    <h3 className="font-semibold text-sm text-gray-600 mb-2">Dirección de Entrega</h3>
                    <div>
                      <label className="form-label">Dirección (Calle, Número) *</label>
                      <AddressAutocomplete 
                        value={form.street} 
                        onChange={val => setForm({...form, street: val})}
                        onSelect={(details) => setForm(f => ({
                           ...f,
                           street: details.street || f.street,
                           postal_code: details.postal_code || f.postal_code,
                           country: details.country || f.country
                        }))}
                      />
                    </div>
                    <div><label className="form-label">Apartamento / Timbre (opcional)</label><input className="form-input" value={form.apartment} onChange={e => setForm({...form, apartment: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Departamento *</label>
                        <select 
                          required={shippingMethod === 'delivery'} 
                          className="form-input" 
                          value={form.department} 
                          onChange={e => setForm({...form, department: e.target.value, city: ''})}
                        >
                          <option value="">Selecciona un departamento...</option>
                          {DEPARTAMENTOS.map(dep => (
                            <option key={dep} value={dep}>{dep}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Localidad / Barrio *</label>
                        <select 
                          required={shippingMethod === 'delivery'} 
                          className="form-input" 
                          value={form.city} 
                          onChange={e => setForm({...form, city: e.target.value})}
                          disabled={!form.department}
                        >
                          <option value="">Selecciona una localidad...</option>
                          {form.department && URUGUAY_LOCATIONS[form.department]?.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="form-label">Código Postal</label><input className="form-input" value={form.postal_code} onChange={e => setForm({...form, postal_code: e.target.value})} /></div>
                      <div>
                        <label className="form-label">País</label>
                        <select className="form-input" value={form.country} onChange={e => setForm({...form, country: e.target.value})}>
                          <option value="Uruguay">Uruguay</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">MÉTODO DE PAGO</h2>
              <div className="space-y-3">
                {[
                  { id: 'dlocalgo', icon: CreditCard, label: 'Tarjeta de Crédito / Débito (dLocal Go)' },
                  { id: 'paypal', icon: QrCode, label: 'PayPal (Global / USD)' },
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
