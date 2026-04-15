import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronRight, Truck, Store, Tag, Sparkles, X, MapPin, Home } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { createCheckoutSession } from '../lib/payments';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS, calculateShipping } from '../utils/uruguayLocations';

// ═══ Card metadata for visual display ═══
const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  'OCA': { bg: '#E31937', text: '#fff' },
  'OCA Blue': { bg: '#1A73E8', text: '#fff' },
  'Mi Dinero': { bg: '#00B140', text: '#fff' },
  'Visa': { bg: '#1A1F71', text: '#fff' },
  'Mastercard': { bg: '#EB001B', text: '#fff' },
  'American Express': { bg: '#006FCF', text: '#fff' },
  'Santander': { bg: '#EC0000', text: '#fff' },
  'BBVA': { bg: '#004481', text: '#fff' },
  'Itaú': { bg: '#FF6600', text: '#fff' },
  'BROU': { bg: '#003366', text: '#fff' },
  'Scotiabank': { bg: '#D92231', text: '#fff' },
  'Prex': { bg: '#6C2DC7', text: '#fff' },
  'Anda': { bg: '#FF8C00', text: '#fff' },
  'Cabal': { bg: '#004D40', text: '#fff' },
  'Creditel': { bg: '#8B0000', text: '#fff' },
  'PassCard': { bg: '#2E7D32', text: '#fff' },
  'Líder': { bg: '#F4511E', text: '#fff' },
};

interface BankPromo {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number;
  bank_name: string;
  min_purchase: number;
  max_discount: number;
  promo_label: string;
  starts_at: string | null;
  ends_at: string | null;
}

export default function Checkout() {
  const { items, total, clearCart } = useCartContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('mercadopago');
  const [shippingMethod, setShippingMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [bankPromos, setBankPromos] = useState<BankPromo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<BankPromo | null>(null);
  const [form, setForm] = useState({
    email: user?.email || '', first_name: '', last_name: '', phone: '',
    street: '', apartment: '', city: '', department: '', postal_code: '', country: 'Uruguay',
  });

  const shipping = shippingMethod === 'pickup' ? 0 : calculateShipping(form.city, form.department, total);
  const subtotalWithShipping = total + shipping;

  // ═══ Calculate bank discount ═══
  let bankDiscount = 0;
  if (selectedPromo && subtotalWithShipping >= (selectedPromo.min_purchase || 0)) {
    if (selectedPromo.discount_type === 'bank_discount' || selectedPromo.discount_type === 'percentage') {
      bankDiscount = Math.round(subtotalWithShipping * selectedPromo.discount_value / 100);
      if (selectedPromo.max_discount > 0) {
        bankDiscount = Math.min(bankDiscount, selectedPromo.max_discount);
      }
    }
  }
  const grandTotal = subtotalWithShipping - bankDiscount;

  // ═══ Saved addresses from profile ═══
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<number>(-1); // -1 = auto/first, -2 = new

  // ═══ Auto-fill from saved profile data ═══
  useEffect(() => {
    if (!user) return;
    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, saved_addresses, shipping_address')
        .eq('id', user!.id)
        .single();
      if (data) {
        const addrs = data.saved_addresses || [];
        setSavedAddresses(addrs);
        
        // Use first saved address, or fall back to shipping_address
        const addr = addrs.length > 0 ? addrs[0] : (data.shipping_address || {});
        if (addrs.length > 0) setSelectedAddress(0);
        
        setForm(f => ({
          ...f,
          email: user!.email || f.email,
          first_name: data.first_name || f.first_name,
          last_name: data.last_name || f.last_name,
          phone: data.phone || f.phone,
          street: addr.street || f.street,
          apartment: addr.apartment || f.apartment,
          city: addr.city || f.city,
          department: addr.department || f.department,
          postal_code: addr.postal_code || f.postal_code,
          country: addr.country || f.country,
        }));
      }
    }
    loadProfile();
  }, [user]);

  // ═══ Fetch active bank promotions ═══
  useEffect(() => {
    async function fetchBankPromos() {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('promotions')
        .select('*')
        .eq('discount_type', 'bank_discount')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`);
      setBankPromos(data || []);
    }
    fetchBankPromos();
  }, []);

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
      if (paymentMethod === 'dlocalgo' || paymentMethod === 'paypal' || paymentMethod === 'mercadopago') {
        const providerMap: Record<string, string> = { dlocalgo: 'dlocal', paypal: 'paypal', mercadopago: 'mercadopago' };
        const provider = providerMap[paymentMethod] as any;
        
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
          items: items.map(i => ({ id: i.product_id, variant_id: i.variant_id, quantity: i.quantity, price: i.price, title: i.title })),
          bank_promo: selectedPromo ? {
            promo_id: selectedPromo.id,
            bank_name: selectedPromo.bank_name,
            discount_value: selectedPromo.discount_value,
            discount_amount: bankDiscount,
          } : undefined,
        });
        return; 
      }

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
                    
                    {/* Saved address picker */}
                    {savedAddresses.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <label className="form-label text-xs">Elegir dirección guardada</label>
                        <div className="grid gap-2">
                          {savedAddresses.map((addr: any, idx: number) => (
                            <label
                              key={idx}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                selectedAddress === idx ? 'border-primary-500 bg-primary-50/50' : 'border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              <input
                                type="radio"
                                name="savedAddr"
                                className="sr-only"
                                checked={selectedAddress === idx}
                                onChange={() => {
                                  setSelectedAddress(idx);
                                  setForm(f => ({
                                    ...f,
                                    street: addr.street || '',
                                    apartment: addr.apartment || '',
                                    city: addr.city || '',
                                    department: addr.department || '',
                                    postal_code: addr.postal_code || '',
                                    country: addr.country || 'Uruguay',
                                  }));
                                }}
                              />
                              <div className={`p-1.5 rounded-lg ${selectedAddress === idx ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                <Home className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-sm block">{addr.label || `Dirección ${idx + 1}`}</span>
                                <span className="text-xs text-gray-500 block truncate">{addr.street}{addr.apartment ? `, ${addr.apartment}` : ''} — {addr.city}, {addr.department}</span>
                              </div>
                            </label>
                          ))}
                          <label
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                              selectedAddress === -2 ? 'border-primary-500 bg-primary-50/50' : 'border-gray-100 border-dashed hover:border-gray-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name="savedAddr"
                              className="sr-only"
                              checked={selectedAddress === -2}
                              onChange={() => {
                                setSelectedAddress(-2);
                                setForm(f => ({ ...f, street: '', apartment: '', city: '', department: '', postal_code: '' }));
                              }}
                            />
                            <div className={`p-1.5 rounded-lg ${selectedAddress === -2 ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                              <MapPin className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-sm text-gray-600">Usar otra dirección</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Only show full address form if no saved address selected, or "new" is chosen */}
                    {(savedAddresses.length === 0 || selectedAddress === -2) && (
                      <>
                    <div>
                      <label className="form-label">Dirección (Calle, Número) *</label>
                      <AddressAutocomplete 
                        value={form.street} 
                        onChange={val => setForm({...form, street: val})}
                        onSelect={(details) => setForm(f => ({
                           ...f,
                           street: details.street || f.street,
                           city: details.city || f.city,
                           department: details.department ? (DEPARTAMENTOS.find(d => d.toLowerCase() === details.department.toLowerCase()) || details.department) : f.department,
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
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-bold text-lg mb-4">MÉTODO DE PAGO</h2>
              <div className="space-y-3">
                {/* ═══ Mercado Pago ═══ */}
                <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  paymentMethod === 'mercadopago' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="payment" value="mercadopago" checked={paymentMethod === 'mercadopago'} onChange={() => setPaymentMethod('mercadopago')} className="text-primary-600 shrink-0" />
                  <img src="/logos/Mercado_Pago.png" alt="Mercado Pago" className="h-6 object-contain" />
                </label>

                {/* ═══ dLocal Go — tarjetas + redpagos ═══ */}
                <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  paymentMethod === 'dlocalgo' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="payment" value="dlocalgo" checked={paymentMethod === 'dlocalgo'} onChange={() => setPaymentMethod('dlocalgo')} className="text-primary-600 shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <img src="/logos/visa-mastercard.jpg" alt="Visa / Mastercard" className="h-6 object-contain rounded" />
                    <img src="/logos/OCA_LOGO.png" alt="OCA" className="h-6 object-contain" />
                    <img src="/logos/DINERS.png" alt="Diners Club" className="h-6 object-contain" />
                    <img src="/logos/lider.png" alt="Líder" className="h-6 object-contain" />
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <img src="/logos/Red_Pagos_Logos.png" alt="RedPagos" className="h-6 object-contain" />
                  </div>
                </label>

                {/* ═══ PayPal ═══ */}
                <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  paymentMethod === 'paypal' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="payment" value="paypal" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} className="text-primary-600 shrink-0" />
                  <img src="/logos/paypal.png" alt="PayPal" className="h-6 object-contain" />
                </label>
              </div>
              {paymentMethod === 'mercadopago' && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-700 font-medium">Serás redirigido a Mercado Pago para completar tu pago de forma segura. Aceptamos tarjetas de crédito/débito, transferencia bancaria, y QR.</p>
                </div>
              )}
            </div>

            {/* ═══ BANK PROMOTIONS ═══ */}
            {(paymentMethod === 'dlocalgo' || paymentMethod === 'mercadopago') && bankPromos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  PROMOCIONES BANCARIAS
                </h2>
                <p className="text-xs text-gray-500 mb-4">Seleccioná tu tarjeta para aplicar el descuento automáticamente</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {bankPromos.map(promo => {
                    const colors = CARD_COLORS[promo.bank_name] || { bg: '#6B7280', text: '#fff' };
                    const isSelected = selectedPromo?.id === promo.id;
                    const meetsMinimum = subtotalWithShipping >= (promo.min_purchase || 0);
                    let promoDiscount = 0;
                    if (meetsMinimum) {
                      promoDiscount = Math.round(subtotalWithShipping * promo.discount_value / 100);
                      if (promo.max_discount > 0) promoDiscount = Math.min(promoDiscount, promo.max_discount);
                    }

                    return (
                      <button
                        key={promo.id}
                        type="button"
                        onClick={() => setSelectedPromo(isSelected ? null : promo)}
                        disabled={!meetsMinimum}
                        className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                          isSelected
                            ? 'border-green-500 bg-green-50/50 shadow-lg shadow-green-100 ring-2 ring-green-200'
                            : !meetsMinimum
                              ? 'border-gray-100 bg-gray-50/30 opacity-50 cursor-not-allowed'
                              : 'border-gray-100 hover:border-gray-200 hover:shadow-sm cursor-pointer'
                        }`}
                      >
                        {/* Selected checkmark */}
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md z-10">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          {/* Card badge */}
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {promo.bank_name.substring(0, 3).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-gray-900 text-sm">{promo.bank_name}</span>
                              <span 
                                className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                                style={{ backgroundColor: `${colors.bg}15`, color: colors.bg }}
                              >
                                {promo.discount_value}% OFF
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 leading-snug">
                              {promo.promo_label || `${promo.discount_value}% OFF pagando con ${promo.bank_name}`}
                            </p>
                            {meetsMinimum ? (
                              <p className="text-xs font-bold text-green-600 mt-1.5">
                                Ahorrás ${promoDiscount.toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-[10px] text-gray-400 mt-1.5">
                                Mínimo ${promo.min_purchase.toLocaleString()} para aplicar
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPromo && (
                  <div className="mt-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-bold text-green-700">
                        Promo {selectedPromo.bank_name} aplicada: -{selectedPromo.discount_value}%
                        {bankDiscount > 0 && <span className="ml-1 text-green-600">(−${bankDiscount.toLocaleString()})</span>}
                      </span>
                    </div>
                    <button type="button" onClick={() => setSelectedPromo(null)} className="p-1 hover:bg-green-100 rounded-full transition-colors">
                      <X className="w-4 h-4 text-green-500" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div>
            <div className="bg-white rounded-xl border border-gray-100 p-6 sticky top-24">
              <h2 className="font-bold text-lg mb-4">RESUMEN DE ORDEN</h2>
              <div className="space-y-3 mb-4">
                {items.map(item => (
                  <div key={item.variant_id} className="flex items-center gap-3">
                    <div className="relative">
                      <img src={item.image || 'https://via.placeholder.com/48'} alt="" className="w-12 h-12 rounded-lg object-contain bg-gray-50 p-0.5" />
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
                
                {/* Bank discount line */}
                {bankDiscount > 0 && selectedPromo && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Promo {selectedPromo.bank_name} ({selectedPromo.discount_value}%)
                    </span>
                    <span className="font-bold text-green-600">−${bankDiscount.toLocaleString()}</span>
                  </div>
                )}

                <div className="border-t pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <div className="text-right">
                    {bankDiscount > 0 && (
                      <span className="text-sm text-gray-400 line-through mr-2">${subtotalWithShipping.toLocaleString()}</span>
                    )}
                    <span className="text-2xl font-black text-primary-600">${grandTotal.toLocaleString()}</span>
                  </div>
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
