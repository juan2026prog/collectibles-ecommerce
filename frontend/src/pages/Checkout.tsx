import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ChevronRight, Truck, Store, Tag, Sparkles, X, Home, Ticket, Share2 } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { createCheckoutOrder, startCheckoutPayment } from '../lib/payments';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS, calculateShipping } from '../utils/uruguayLocations';

const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  OCA: { bg: '#E31937', text: '#fff' },
  'OCA Blue': { bg: '#1A73E8', text: '#fff' },
  'Mi Dinero': { bg: '#00B140', text: '#fff' },
  Visa: { bg: '#1A1F71', text: '#fff' },
  Mastercard: { bg: '#EB001B', text: '#fff' },
  'American Express': { bg: '#006FCF', text: '#fff' },
  Santander: { bg: '#EC0000', text: '#fff' },
  BBVA: { bg: '#004481', text: '#fff' },
  Itau: { bg: '#FF6600', text: '#fff' },
  BROU: { bg: '#003366', text: '#fff' },
  Scotiabank: { bg: '#D92231', text: '#fff' },
  Prex: { bg: '#6C2DC7', text: '#fff' },
  Anda: { bg: '#FF8C00', text: '#fff' },
  Cabal: { bg: '#004D40', text: '#fff' },
  Creditel: { bg: '#8B0000', text: '#fff' },
  PassCard: { bg: '#2E7D32', text: '#fff' },
  Lider: { bg: '#F4511E', text: '#fff' },
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
  const { items, total } = useCartContext();
  const { formatCurrencyPrice, selectedCurrency } = useCurrency();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'dlocalgo' | 'paypal'>('mercadopago');
  const [shippingMethod, setShippingMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [bankPromos, setBankPromos] = useState<BankPromo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<BankPromo | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [affiliateCode, setAffiliateCode] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<number>(-1);
  const [form, setForm] = useState({
    email: user?.email || '',
    first_name: '',
    last_name: '',
    phone: '',
    street: '',
    apartment: '',
    city: '',
    department: '',
    postal_code: '',
    country: 'Uruguay',
  });

  const shipping = shippingMethod === 'pickup' ? 0 : calculateShipping(form.city, form.department, total);
  const subtotalWithShipping = total + shipping;

  let bankDiscount = 0;
  if (selectedPromo && subtotalWithShipping >= (selectedPromo.min_purchase || 0)) {
    bankDiscount = Math.round(subtotalWithShipping * selectedPromo.discount_value / 100);
    if (selectedPromo.max_discount > 0) {
      bankDiscount = Math.min(bankDiscount, selectedPromo.max_discount);
    }
  }
  const grandTotal = Math.max(subtotalWithShipping - bankDiscount, 0);

  useEffect(() => {
    setAffiliateCode(localStorage.getItem('affiliate_code') || '');
  }, []);

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, saved_addresses, shipping_address')
        .eq('id', user.id)
        .single();

      if (!data) return;
      const addresses = data.saved_addresses || [];
      setSavedAddresses(addresses);
      const address = addresses.length > 0 ? addresses[0] : (data.shipping_address || {});
      if (addresses.length > 0) setSelectedAddress(0);

      setForm((current) => ({
        ...current,
        email: user.email || current.email,
        first_name: data.first_name || current.first_name,
        last_name: data.last_name || current.last_name,
        phone: data.phone || current.phone,
        street: address.street || current.street,
        apartment: address.apartment || current.apartment,
        city: address.city || current.city,
        department: address.department || current.department,
        postal_code: address.postal_code || current.postal_code,
        country: address.country || current.country,
      }));
    }

    loadProfile();
  }, [user]);

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
    if (!items.length) return;
    analytics.track({
      eventName: 'InitiateCheckout',
      eventData: {
        num_items: items.length,
        value: total,
        currency: 'UYU',
        content_ids: items.map((item) => item.product_id),
      },
      user: { email: user?.email || undefined },
    });
  }, [items, total, user?.email]);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const order = await createCheckoutOrder({
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price: item.price,
          title: item.title,
        })),
        coupon_code: couponCode.trim() || undefined,
        affiliate_code: affiliateCode.trim() || undefined,
        payment_method: paymentMethod,
        currency: 'UYU',
        shipping_method: shippingMethod,
        shipping_address: {
          first_name: form.first_name,
          last_name: form.last_name,
          street: shippingMethod === 'pickup' ? 'Retiro en local' : form.street,
          apartment: form.apartment || undefined,
          city: shippingMethod === 'pickup' ? 'Montevideo' : form.city,
          department: shippingMethod === 'pickup' ? 'Montevideo' : form.department,
          postal_code: form.postal_code || undefined,
          country: form.country,
        },
        customer_email: form.email,
        customer_phone: form.phone || undefined,
        bank_promo: selectedPromo ? { promo_id: selectedPromo.id } : undefined,
      });

      analytics.track({
        eventName: 'InitiateCheckout',
        eventData: {
          content_ids: items.map((item) => item.product_id),
          value: order.total_amount || grandTotal,
          currency: 'UYU',
        },
        user: { email: form.email || undefined, phone: form.phone || undefined },
      });

      const providerMap: Record<typeof paymentMethod, 'dlocal' | 'paypal' | 'mercadopago'> = {
        dlocalgo: 'dlocal',
        paypal: 'paypal',
        mercadopago: 'mercadopago',
      };

      await startCheckoutPayment({
        provider: providerMap[paymentMethod],
        order_id: order.id,
        customer_email: form.email,
      });
    } catch (err: any) {
      setCheckoutError(`Error procesando el pedido: ${err.message}`);
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-500">No hay productos para pagar</h1>
        <Link to="/shop" className="btn-primary mt-4">Seguir comprando</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <nav className="flex items-center text-sm text-slate-400 mb-6">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-primary-600 font-medium">Checkout</span>
      </nav>

      <div className="flex items-center justify-center gap-4 mb-10 text-sm">
        <Link to="/cart" className="text-slate-500 font-medium">CARRITO</Link>
        <div className="w-12 h-px bg-white/20" />
        <span className="font-bold text-white">PAGO</span>
        <div className="w-12 h-px bg-gray-200" />
        <span className="text-slate-500">CONFIRMACIÓN</span>
      </div>

      {checkoutError && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 text-sm text-red-400 rounded-xl flex items-center justify-between">
          <span>{checkoutError}</span>
          <button onClick={() => setCheckoutError('')} className="text-red-400 hover:text-red-300 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handlePlaceOrder}>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass p-6">
              <h2 className="font-bold text-lg mb-4">Método de envío</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className={`flex items-start gap-4 p-4  border-2 cursor-pointer transition-all ${shippingMethod === 'delivery' ? 'border-primary-500 bg-primary-500/100/10' : 'border-white/10 hover:border-white/10 bg-white/5'}`}>
                  <input type="radio" checked={shippingMethod === 'delivery'} onChange={() => setShippingMethod('delivery')} className="sr-only" />
                  <div className={`p-2  ${shippingMethod === 'delivery' ? 'bg-primary-500/100 text-white' : 'glass text-slate-400 shadow-sm'}`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-white">Envío a domicilio</div>
                    <div className="text-sm text-slate-400 mt-1">Recibilo en tu puerta</div>
                  </div>
                </label>
                <label className={`flex items-start gap-4 p-4  border-2 cursor-pointer transition-all ${shippingMethod === 'pickup' ? 'border-primary-500 bg-primary-500/100/10' : 'border-white/10 hover:border-white/10 bg-white/5'}`}>
                  <input type="radio" checked={shippingMethod === 'pickup'} onChange={() => setShippingMethod('pickup')} className="sr-only" />
                  <div className={`p-2  ${shippingMethod === 'pickup' ? 'bg-primary-500/100 text-white' : 'glass text-slate-400 shadow-sm'}`}>
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-white">Retiro en local</div>
                    <div className="text-sm text-green-600 font-medium mt-1">GRATIS</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="glass p-6">
              <h2 className="font-bold text-lg mb-4">Datos de facturación {shippingMethod === 'delivery' ? 'y envío' : ''}</h2>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Correo electrónico *</label>
                  <input type="email" required className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Nombre *</label><input required className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                  <div><label className="form-label">Apellido *</label><input required className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                </div>
                <div><label className="form-label">Teléfono</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>

                {shippingMethod === 'delivery' && (
                  <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                    <h3 className="font-semibold text-sm text-slate-400 mb-2">Dirección de entrega</h3>

                    {savedAddresses.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <label className="form-label text-xs">Elegir dirección guardada</label>
                        <div className="grid gap-2">
                          {savedAddresses.map((address: any, index: number) => (
                            <label key={index} className={`flex items-center gap-3 p-3  border-2 cursor-pointer transition-all ${selectedAddress === index ? 'border-primary-500 bg-primary-500/100/10' : 'border-white/10 hover:border-white/10'}`}>
                              <input
                                type="radio"
                                name="savedAddr"
                                className="sr-only"
                                checked={selectedAddress === index}
                                onChange={() => {
                                  setSelectedAddress(index);
                                  setForm((current) => ({
                                    ...current,
                                    street: address.street || '',
                                    apartment: address.apartment || '',
                                    city: address.city || '',
                                    department: address.department || '',
                                    postal_code: address.postal_code || '',
                                    country: address.country || 'Uruguay',
                                  }));
                                }}
                              />
                              <div className={`p-1.5  ${selectedAddress === index ? 'bg-primary-500/100 text-white' : 'bg-white/10 text-slate-500'}`}>
                                <Home className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-sm block">{address.label || `Direccion ${index + 1}`}</span>
                            <span className="text-xs text-slate-400 block truncate">{address.street}{address.apartment ? `, ${address.apartment}` : ''} - {address.city}, {address.department}</span>
                              </div>
                            </label>
                          ))}
                          <label className={`flex items-center gap-3 p-3  border-2 cursor-pointer transition-all ${selectedAddress === -2 ? 'border-primary-500 bg-primary-500/100/10' : 'border-white/10 border-dashed hover:border-white/10'}`}>
                            <input
                              type="radio"
                              name="savedAddr"
                              className="sr-only"
                              checked={selectedAddress === -2}
                              onChange={() => {
                                setSelectedAddress(-2);
                                setForm((current) => ({ ...current, street: '', apartment: '', city: '', department: '', postal_code: '' }));
                              }}
                            />
                            <div className={`p-1.5  ${selectedAddress === -2 ? 'bg-primary-500/100 text-white' : 'bg-white/10 text-slate-500'}`}>
                              <Home className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-sm text-slate-400">Usar otra dirección</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {(savedAddresses.length === 0 || selectedAddress === -2) && (
                      <>
                        <div>
                          <label className="form-label">Dirección (calle y número) *</label>
                          <AddressAutocomplete
                            value={form.street}
                            onChange={value => setForm({ ...form, street: value })}
                            onSelect={(details) => setForm((current) => ({
                              ...current,
                              street: details.street || current.street,
                              city: details.city || current.city,
                              department: details.department ? (DEPARTAMENTOS.find(dep => dep.toLowerCase() === details.department.toLowerCase()) || details.department) : current.department,
                              postal_code: details.postal_code || current.postal_code,
                              country: details.country || current.country,
                            }))}
                          />
                        </div>
                        <div><label className="form-label">Apartamento / Timbre</label><input className="form-input" value={form.apartment} onChange={e => setForm({ ...form, apartment: e.target.value })} /></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Departamento *</label>
                            <select required={shippingMethod === 'delivery'} className="form-input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value, city: '' })}>
                              <option value="">Selecciona un departamento...</option>
                              {DEPARTAMENTOS.map((department) => (
                                <option key={department} value={department}>{department}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Localidad / Barrio *</label>
                            <select required={shippingMethod === 'delivery'} className="form-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} disabled={!form.department}>
                              <option value="">Selecciona una localidad...</option>
                              {form.department && URUGUAY_LOCATIONS[form.department]?.map((location) => (
                                <option key={location} value={location}>{location}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="form-label">Código postal</label><input className="form-input" value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} /></div>
                          <div>
                            <label className="form-label">País</label>
                            <select className="form-input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}>
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

            <div className="glass p-6">
              <h2 className="font-bold text-lg mb-4">Cupones y referidos</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label flex items-center gap-2"><Ticket className="w-4 h-4" /> Cupón</label>
                  <input className="form-input" placeholder="Ej: LANZAMIENTO10" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="form-label flex items-center gap-2"><Share2 className="w-4 h-4" /> Código de referido</label>
                  <input className="form-input" placeholder="Se completa automáticamente si llegaste desde un afiliado" value={affiliateCode} onChange={e => setAffiliateCode(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="glass p-6">
              <h2 className="font-bold text-lg mb-4">Método de pago</h2>
              <div className="space-y-3">
                <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'mercadopago' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                  <input type="radio" name="payment" value="mercadopago" checked={paymentMethod === 'mercadopago'} onChange={() => setPaymentMethod('mercadopago')} className="text-primary-600 shrink-0" />
                  <img src="/logos/Mercado_Pago.png" alt="Mercado Pago" className="h-6 object-contain" />
                </label>
                <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'dlocalgo' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                  <input type="radio" name="payment" value="dlocalgo" checked={paymentMethod === 'dlocalgo'} onChange={() => setPaymentMethod('dlocalgo')} className="text-primary-600 shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <img src="/logos/visa-mastercard.jpg" alt="Visa / Mastercard" className="h-6 object-contain rounded" />
                    <img src="/logos/OCA_LOGO.png" alt="OCA" className="h-6 object-contain" />
                    <img src="/logos/DINERS.png" alt="Diners Club" className="h-6 object-contain" />
                    <img src="/logos/lider.png" alt="Lider" className="h-6 object-contain" />
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <img src="/logos/Red_Pagos_Logos.png" alt="RedPagos" className="h-6 object-contain" />
                  </div>
                </label>
                <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'paypal' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                  <input type="radio" name="payment" value="paypal" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} className="text-primary-600 shrink-0" />
                  <img src="/logos/paypal.png" alt="PayPal" className="h-6 object-contain" />
                </label>
              </div>
            </div>

            {(paymentMethod === 'dlocalgo' || paymentMethod === 'mercadopago') && bankPromos.length > 0 && (
              <div className="glass p-6">
                <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Promociones bancarias
                </h2>
                <p className="text-xs text-slate-400 mb-4">Seleccioná tu tarjeta para aplicar el descuento automáticamente.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {bankPromos.map((promo) => {
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
                        className={`relative text-left p-4  border-2 transition-all duration-200 ${isSelected ? 'border-green-500 bg-green-50/50 shadow-lg shadow-green-100 ring-2 ring-green-200' : !meetsMinimum ? 'border-white/10 bg-white/5/30 opacity-50 cursor-not-allowed' : 'border-white/10 hover:border-white/10 hover:shadow-sm cursor-pointer'}`}
                      >
                        {isSelected && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md z-10">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11  flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm" style={{ backgroundColor: colors.bg, color: colors.text }}>
                            {promo.bank_name.substring(0, 3).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-white text-sm">{promo.bank_name}</span>
                              <span className="text-[10px] font-black px-1.5 py-0.5 " style={{ backgroundColor: `${colors.bg}15`, color: colors.bg }}>
                                {promo.discount_value}% OFF
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-snug">{promo.promo_label || `${promo.discount_value}% OFF pagando con ${promo.bank_name}`}</p>
                            {meetsMinimum ? (
                              <p className="text-xs font-bold text-green-600 mt-1.5">Ahorras {formatCurrencyPrice(promoDiscount)}</p>
                            ) : (
                              <p className="text-[10px] text-slate-500 mt-1.5">Mínimo {formatCurrencyPrice(promo.min_purchase)} para aplicar</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedPromo && (
                  <div className="mt-4 flex items-center justify-between bg-green-50 border border-green-200  px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-bold text-green-700">Promo {selectedPromo.bank_name} aplicada: -{selectedPromo.discount_value}% {bankDiscount > 0 && <span className="ml-1 text-green-600">(-{formatCurrencyPrice(bankDiscount)})</span>}</span>
                    </div>
                    <button type="button" onClick={() => setSelectedPromo(null)} className="p-1 hover:bg-green-100 rounded-full transition-colors">
                      <X className="w-4 h-4 text-green-500" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="glass p-6 sticky top-24">
              <h2 className="font-bold text-lg mb-4">Resumen de orden</h2>
              <div className="space-y-3 mb-4">
                {items.map((item) => (
                  <div key={item.variant_id} className="flex items-center gap-3">
                    <div className="relative">
                      <img src={item.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23f3f4f6" width="48" height="48" rx="8"/></svg>'} alt="" className="w-12 h-12  object-contain bg-white/5 p-0.5" />
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-500/100 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{item.quantity}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white line-clamp-1">{item.title}</p>
                    </div>
                    <span className="text-sm font-bold">{formatCurrencyPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="font-bold">{formatCurrencyPrice(total)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Envío</span><span className="font-bold">{shipping === 0 ? 'GRATIS' : formatCurrencyPrice(shipping)}</span></div>
                {bankDiscount > 0 && selectedPromo && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 flex items-center gap-1"><Tag className="w-3 h-3" />Promo {selectedPromo.bank_name}</span>
                    <span className="font-bold text-green-600">-{formatCurrencyPrice(bankDiscount)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <div className="text-right">
                    {bankDiscount > 0 && <span className="text-sm text-slate-500 line-through mr-2">{formatCurrencyPrice(subtotalWithShipping)}</span>}
                    <span className="text-2xl font-black text-[#f00856]">{formatCurrencyPrice(grandTotal)}</span>
                    {selectedCurrency !== 'UYU' && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Conversión estimada. El cobro final se realiza en pesos uruguayos.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-6 py-3.5 text-base">
                {loading ? 'Procesando...' : 'Finalizar compra'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
