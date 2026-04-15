import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCartContext } from '../contexts/CartContext';
import { Package, User, Settings, Save, Check, ShoppingCart, RotateCcw, MapPin, Phone, Plus, Trash2, Lock, Eye, EyeOff, Edit3 } from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS } from '../utils/uruguayLocations';
import AddressAutocomplete from '../components/AddressAutocomplete';

function getOrderItemImage(item: any): string {
  const img = item.products?.images?.[0];
  if (!img?.url) return 'https://via.placeholder.com/80';
  if (img.url.match(/^[a-f0-9-]{36}$/)) return 'https://via.placeholder.com/80';
  return img.url;
}

interface SavedAddress {
  label: string;
  street: string;
  apartment: string;
  city: string;
  department: string;
  postal_code: string;
  country: string;
}

const EMPTY_ADDRESS: SavedAddress = {
  label: '', street: '', apartment: '', city: '', department: '', postal_code: '', country: 'Uruguay'
};

export default function CustomerPortal() {
  const { user } = useAuth();
  const { language, currency, setLanguage, setCurrency, formatPrice } = useLocale();
  const cart = useCartContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'security'>('orders');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Addresses (up to 3)
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [editingAddr, setEditingAddr] = useState<number | null>(null);

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      const orderSelect = `
        id, total_amount, currency, status, created_at, payment_method, customer_email,
        order_items (quantity, unit_price, total_price, product_id, variant_id, products (title, slug, images:product_images(url)))
      `;

      const { data: ordersData } = await supabase
        .from('orders').select(orderSelect).eq('customer_id', user!.id).order('created_at', { ascending: false });
      let finalOrders = ordersData || [];
      if (finalOrders.length === 0 && user!.email) {
        const { data: emailOrders } = await supabase
          .from('orders').select(orderSelect).eq('customer_email', user!.email).order('created_at', { ascending: false });
        finalOrders = emailOrders || [];
      }
      setOrders(finalOrders);

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles').select('first_name, last_name, phone, saved_addresses').eq('id', user!.id).single();
      if (profileData) {
        setFirstName(profileData.first_name || '');
        setLastName(profileData.last_name || '');
        setPhone(profileData.phone || '');
        setAddresses(profileData.saved_addresses || []);
      }
      setLoading(false);
    }
    loadData();
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    setProfileSaved(false);

    await supabase.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      phone,
      saved_addresses: addresses,
      // Keep shipping_address as the first address for backward compatibility
      shipping_address: addresses.length > 0 ? addresses[0] : {},
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    setSavingProfile(false);
    setProfileSaved(true);
    setEditingAddr(null);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  function addAddress() {
    if (addresses.length >= 3) return;
    const labels = ['Casa', 'Trabajo', 'Otra'];
    const usedLabels = addresses.map(a => a.label);
    const nextLabel = labels.find(l => !usedLabels.includes(l)) || `Dirección ${addresses.length + 1}`;
    setAddresses([...addresses, { ...EMPTY_ADDRESS, label: nextLabel }]);
    setEditingAddr(addresses.length);
  }

  function removeAddress(idx: number) {
    setAddresses(addresses.filter((_, i) => i !== idx));
    setEditingAddr(null);
  }

  function updateAddress(idx: number, field: keyof SavedAddress, value: string) {
    setAddresses(addresses.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }

  async function handleChangePassword() {
    if (!newPw || newPw.length < 6) {
      setPwMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    setPwLoading(true);
    setPwMessage(null);

    const { error } = await supabase.auth.updateUser({ password: newPw });
    
    if (error) {
      setPwMessage({ type: 'error', text: error.message });
    } else {
      setPwMessage({ type: 'success', text: '✓ Contraseña actualizada correctamente.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    }
    setPwLoading(false);
  }

  function handleBuyAgain(order: any) {
    for (const item of order.order_items) {
      if (item.products) {
        cart.addItem({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          title: item.products.title,
          price: item.unit_price,
          image: getOrderItemImage(item),
          variant_name: '',
        });
      }
    }
  }

  if (loading) return <div className="p-12 text-center text-gray-500">Cargando perfil...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border p-8 mb-8 flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
            <User size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Mi Cuenta</h1>
            <p className="text-gray-500">{user?.email}</p>
            {firstName && <p className="text-sm text-gray-700 font-medium mt-1">{firstName} {lastName}</p>}
          </div>
        </div>
        <div className="bg-gray-50 border rounded-xl p-6 w-full md:w-auto">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-gray-700"><Settings className="w-4 h-4" /> Preferencias</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Idioma</label>
              <select className="bg-white border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500" value={language} onChange={e => setLanguage(e.target.value as any)}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Moneda</label>
              <select className="bg-white border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500" value={currency} onChange={e => setCurrency(e.target.value as any)}>
                <option value="UYU">UYU</option>
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b overflow-x-auto">
        {([
          { key: 'orders', icon: Package, label: 'Mis Pedidos', count: orders.length },
          { key: 'profile', icon: User, label: 'Mis Datos' },
          { key: 'security', icon: Lock, label: 'Seguridad' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
            {'count' in tab && tab.count! > 0 && (
              <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Mis Pedidos ═══ */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {orders.length === 0 ? (
            <div className="bg-gray-50 p-12 rounded-xl text-center border border-dashed">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Aún no has realizado ninguna compra.</p>
              <Link to="/shop" className="btn-primary px-6 py-2 inline-flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Ir a la Tienda</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map(order => (
                <div key={order.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b">
                    <div>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">PEDIDO</p>
                      <p className="font-medium">{new Date(order.created_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">N° DE ORDEN</p>
                      <p className="font-mono font-medium text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider text-right">TOTAL</p>
                      <p className="font-bold text-lg text-primary-600">{formatPrice(order.total_amount)}</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                      ['paid', 'delivered'].includes(order.status) ? 'bg-green-100 text-green-700' :
                      order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'cancelada' || order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {order.status === 'pending' && 'Pendiente'}
                      {order.status === 'paid' && 'Pagado'}
                      {order.status === 'processing' && 'En Preparación'}
                      {order.status === 'shipped' && 'En Tránsito'}
                      {order.status === 'delivered' && 'Entregado'}
                      {(order.status === 'cancelled' || order.status === 'cancelada') && 'Cancelado'}
                    </span>
                  </div>
                  <div className="p-6">
                    {order.order_items.map((item: any, i: number) => (
                      <div key={i} className="flex gap-4 py-3 border-b last:border-0 last:pb-0 items-center">
                        <Link to={item.products?.slug ? `/p/${item.products.slug}` : '#'}>
                          <img src={getOrderItemImage(item)} className="w-16 h-16 object-contain rounded-lg border bg-gray-50 p-1 hover:border-primary-300 transition-colors" />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={item.products?.slug ? `/p/${item.products.slug}` : '#'} className="font-bold text-gray-900 hover:text-primary-600 transition-colors line-clamp-1">{item.products?.title}</Link>
                          <p className="text-sm text-gray-500">Cant: {item.quantity} · {formatPrice(item.unit_price)} c/u</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-6 pb-5 flex gap-3">
                    <button onClick={() => handleBuyAgain(order)} className="flex items-center gap-2 px-5 py-2 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-xl font-bold text-sm transition-colors border border-primary-200">
                      <RotateCcw className="w-4 h-4" /> Volver a Comprar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Mis Datos ═══ */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Personal Info */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b bg-gray-50">
              <h2 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-primary-500" /> Datos Personales</h2>
            </div>
            <div className="p-8 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" />
                </div>
                <div>
                  <label className="form-label">Apellido *</label>
                  <input className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Pérez" />
                </div>
              </div>
              <div>
                <label className="form-label flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Teléfono</label>
                <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="099 123 456" />
              </div>
            </div>
          </div>

          {/* Saved Addresses */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-500" /> Mis Direcciones</h2>
                <p className="text-xs text-gray-500 mt-1">Guardá hasta 3 direcciones para usar en el checkout.</p>
              </div>
              {addresses.length < 3 && (
                <button onClick={addAddress} className="flex items-center gap-1.5 px-4 py-2 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-xl font-bold text-sm border border-primary-200 transition-colors">
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              )}
            </div>
            <div className="p-8">
              {addresses.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MapPin className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No tenés direcciones guardadas.</p>
                  <button onClick={addAddress} className="text-primary-600 font-bold text-sm mt-2 hover:underline">+ Agregar dirección</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {addresses.map((addr, idx) => (
                    <div key={idx} className={`border rounded-xl overflow-hidden transition-all ${editingAddr === idx ? 'border-primary-300 shadow-md' : 'border-gray-200'}`}>
                      {/* Address header */}
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
                        <div className="flex items-center gap-3">
                          <MapPin className={`w-4 h-4 ${editingAddr === idx ? 'text-primary-500' : 'text-gray-400'}`} />
                          {editingAddr === idx ? (
                            <input className="font-bold text-sm bg-white border rounded px-2 py-1 w-32" value={addr.label} onChange={e => updateAddress(idx, 'label', e.target.value)} placeholder="Nombre..." />
                          ) : (
                            <span className="font-bold text-sm text-gray-800">{addr.label || `Dirección ${idx + 1}`}</span>
                          )}
                          {idx === 0 && <span className="text-[10px] font-bold uppercase bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full">Principal</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingAddr(editingAddr === idx ? null : idx)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeAddress(idx)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {editingAddr === idx ? (
                        /* Editing mode */
                        <div className="p-5 space-y-4">
                          <div>
                            <label className="form-label">Dirección (Calle, Número)</label>
                            <AddressAutocomplete
                              value={addr.street}
                              onChange={val => updateAddress(idx, 'street', val)}
                              onSelect={(details) => {
                                const updated = [...addresses];
                                updated[idx] = {
                                  ...updated[idx],
                                  street: details.street || updated[idx].street,
                                  city: details.city || updated[idx].city,
                                  department: details.department ? (DEPARTAMENTOS.find((d: string) => d.toLowerCase() === details.department.toLowerCase()) || details.department) : updated[idx].department,
                                  postal_code: details.postal_code || updated[idx].postal_code,
                                };
                                setAddresses(updated);
                              }}
                            />
                          </div>
                          <div>
                            <label className="form-label">Apartamento / Timbre (opcional)</label>
                            <input className="form-input" value={addr.apartment} onChange={e => updateAddress(idx, 'apartment', e.target.value)} placeholder="Apto 101" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="form-label">Departamento</label>
                              <select className="form-input" value={addr.department} onChange={e => { updateAddress(idx, 'department', e.target.value); updateAddress(idx, 'city', ''); }}>
                                <option value="">Seleccionar...</option>
                                {DEPARTAMENTOS.map((dep: string) => <option key={dep} value={dep}>{dep}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="form-label">Localidad / Barrio</label>
                              <select className="form-input" value={addr.city} onChange={e => updateAddress(idx, 'city', e.target.value)} disabled={!addr.department}>
                                <option value="">Seleccionar...</option>
                                {addr.department && URUGUAY_LOCATIONS[addr.department]?.map((loc: string) => <option key={loc} value={loc}>{loc}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="w-1/2">
                            <label className="form-label">Código Postal</label>
                            <input className="form-input" value={addr.postal_code} onChange={e => updateAddress(idx, 'postal_code', e.target.value)} placeholder="11100" />
                          </div>
                        </div>
                      ) : (
                        /* Display mode */
                        <div className="px-5 py-3 text-sm text-gray-600">
                          {addr.street ? (
                            <>
                              <p>{addr.street}{addr.apartment ? `, ${addr.apartment}` : ''}</p>
                              <p className="text-gray-400">{[addr.city, addr.department, addr.postal_code].filter(Boolean).join(', ')}</p>
                            </>
                          ) : (
                            <p className="text-gray-400 italic">Dirección incompleta — hacé clic en el lápiz para editar.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button onClick={saveProfile} disabled={savingProfile} className="btn-primary px-8 py-3 flex items-center gap-2">
              {savingProfile ? <>Guardando...</> : profileSaved ? <><Check className="w-4 h-4" /> Guardado</> : <><Save className="w-4 h-4" /> Guardar Todo</>}
            </button>
            {profileSaved && <span className="text-sm text-green-600 font-medium">✓ Datos y direcciones guardados correctamente.</span>}
          </div>
        </div>
      )}

      {/* ═══ TAB: Seguridad ═══ */}
      {activeTab === 'security' && (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden max-w-lg">
          <div className="px-8 py-5 border-b bg-gray-50">
            <h2 className="text-lg font-bold flex items-center gap-2"><Lock className="w-5 h-5 text-primary-500" /> Cambiar Contraseña</h2>
            <p className="text-xs text-gray-500 mt-1">Actualizá tu contraseña de acceso a la plataforma.</p>
          </div>
          <div className="p-8 space-y-5">
            <div>
              <label className="form-label">Nueva Contraseña</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="form-input pr-10" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">Confirmar Nueva Contraseña</label>
              <input type={showPw ? 'text' : 'password'} className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repetir contraseña" />
            </div>

            {pwMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium ${pwMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {pwMessage.text}
              </div>
            )}

            <button onClick={handleChangePassword} disabled={pwLoading || !newPw || !confirmPw} className="btn-primary px-8 py-3 flex items-center gap-2 disabled:opacity-50">
              {pwLoading ? 'Actualizando...' : <><Lock className="w-4 h-4" /> Actualizar Contraseña</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
