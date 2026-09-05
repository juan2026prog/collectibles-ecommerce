import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCartContext } from '../contexts/CartContext';
import { Package, User, Settings, Save, Check, ShoppingCart, RotateCcw, MapPin, Phone, Plus, Trash2, Lock, Eye, EyeOff, Edit3, Store, Truck, AlertCircle, FileText, Globe, CreditCard, Clock, ShieldCheck } from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS } from '../utils/uruguayLocations';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useImageProtection } from '../hooks/useImageProtection';
import { BackofficePageHeader, BackofficeTabs, BackofficeStatusBadge, BackofficeCompactRow, BackofficePrimaryAction } from '../components/backoffice';
import { FranchiseStatusCard } from '../components/customs/FranchiseStatusCard';

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
  const { getImageProps } = useImageProtection({ isProduct: true });
  const { user } = useAuth();
  const { language, currency, setLanguage, setCurrency } = useLocale();
  const { formatCurrencyPrice } = useCurrency();
  const cart = useCartContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'couriers' | 'franchise' | 'security'>('orders');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isVendor, setIsVendor] = useState(false);

  // International addresses
  const [intlAddresses, setIntlAddresses] = useState<any[]>([]);
  const [loadingIntl, setLoadingIntl] = useState(false);
  const [editingIntlId, setEditingIntlId] = useState<string | 'new' | null>(null);
  const [intlForm, setIntlForm] = useState({
    label: '',
    courier_name: '',
    recipient_name: '',
    customer_code: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'United States',
    phone: '',
    instructions: ''
  });

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

  const getTrackingMilestoneStep = (status: string) => {
    switch (status) {
      case 'pending_purchase':
        return 1;
      case 'zinc_order_created':
      case 'zinc_processing':
      case 'purchased':
        return 2;
      case 'shipped':
      case 'shipped_to_courier':
        return 3;
      case 'delivered':
      case 'delivered_to_courier':
        return 4;
      default:
        return 1;
    }
  };

  const downloadCleanInvoice = (order: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const orderDate = new Date(order.created_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' });
    const orderNumber = order.id.slice(0, 8).toUpperCase();
    const hasIntl = order.order_items.some((item: any) => item.international_order_items && item.international_order_items.length > 0);
    const courier = order.shipping_address?.international_courier_name || order.shipping_address?.international_courier || 'N/A';
    const suite = order.shipping_address?.international_customer_code || order.shipping_address?.international_suite || '';

    let itemsHtml = '';
    order.order_items.forEach((item: any) => {
      const isItemIntl = item.international_order_items && item.international_order_items.length > 0;
      itemsHtml += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <div style="font-weight: bold; color: #1e293b;">${item.products?.title || 'Producto'}</div>
            ${isItemIntl ? `<div style="font-size: 10px; color: #0284c7; font-weight: bold; margin-top: 2px;">PRODUCTO INTERNACIONAL</div>` : ''}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrencyPrice(item.unit_price)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrencyPrice(item.total_price || (item.unit_price * item.quantity))}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <html>
        <head>
          <title>Factura - ${orderNumber}</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; color: #334155; margin: 0; padding: 40px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 900; color: #f00856; text-transform: uppercase; }
            .invoice-title { font-size: 20px; font-weight: 800; text-align: right; }
            .details { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 13px; }
            .details-col { width: 48%; }
            .details-title { font-weight: bold; text-transform: uppercase; color: #64748b; font-size: 10px; letter-spacing: 1px; margin-bottom: 8px; }
            .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .table th { background: #f8fafc; padding: 12px; text-align: left; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
            .totals { display: flex; flex-direction: column; align-items: flex-end; font-size: 14px; margin-top: 20px; }
            .total-row { display: flex; justify-content: space-between; width: 300px; padding: 6px 0; }
            .total-row.grand { font-size: 18px; font-weight: bold; color: #f00856; border-top: 2px solid #f1f5f9; padding-top: 12px; margin-top: 6px; }
            .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">Collectibles.uy</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Collectibles Uruguay S.R.L.</div>
            </div>
            <div class="invoice-title">
              <div>COMPROBANTE DE COMPRA</div>
              <div style="font-size: 14px; font-weight: normal; color: #64748b; margin-top: 4px;">Orden #${orderNumber}</div>
            </div>
          </div>
          
          <div class="details">
            <div class="details-col">
              <div class="details-title">DATOS DE COMPRA</div>
              <div><b>Fecha:</b> ${orderDate}</div>
              <div><b>Método de Pago:</b> ${order.payment_method?.toUpperCase()}</div>
              <div><b>Email:</b> ${order.customer_email}</div>
            </div>
            <div class="details-col" style="text-align: right;">
              <div class="details-title">INFORMACIÓN DE ENTREGA</div>
              <div><b>Cliente:</b> ${order.shipping_address?.first_name || ''} ${order.shipping_address?.last_name || ''}</div>
              ${hasIntl ? `
                <div><b>Modalidad:</b> Entrega en courier de Miami</div>
                <div><b>Courier:</b> ${courier.toUpperCase()}</div>
                <div><b>Casilla / Suite:</b> ${suite || 'N/A'}</div>
              ` : `
                <div><b>Dirección:</b> ${order.shipping_address?.street || ''} ${order.shipping_address?.apartment || ''}</div>
                <div><b>Localidad:</b> ${order.shipping_address?.city || ''}, ${order.shipping_address?.department || ''}</div>
              `}
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th style="text-align: center; width: 80px;">Cant</th>
                <th style="text-align: right; width: 120px;">Precio Unit.</th>
                <th style="text-align: right; width: 120px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span style="color: #64748b;">Subtotal Productos:</span>
              <span>${formatCurrencyPrice(order.total_amount - (order.total_shipping || 0))}</span>
            </div>
            <div class="total-row">
              <span style="color: #64748b;">Envío Local (Uruguay):</span>
              <span>${formatCurrencyPrice(order.total_shipping || 0)}</span>
            </div>
            <div class="total-row grand">
              <span>Total Abonado:</span>
              <span>${formatCurrencyPrice(order.total_amount)}</span>
            </div>
          </div>

          <div class="footer">
            <p>Este documento es un comprobante oficial de compra emitido por Collectibles.uy.</p>
            <p>Vázquez 1418, Montevideo, Uruguay · R.U.T. 219988220011</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      const orderSelect = `
        id, total_amount, currency, status, created_at, payment_method, customer_email, shipping_address, total_shipping,
        payments(id, status, payment_url),
        order_items (
          quantity, unit_price, total_price, product_id, variant_id, vendor_id, vendor_store_id, sku,
          vendor:vendors(store_name, slug, logo_url, promotions_opt_in, company_name),
          vendor_store:vendor_stores(store_name, slug, logo_url),
          products (title, slug, images:product_images(url)),
          international_order_items (id, purchase_status, zinc_order_id, tracking_number, carrier, tracking_url, final_price_usd, expected_delivery_date)
        ),
        order_suborders (
          id, suborder_number, status, shipping_method, shipping_provider, shipping_cost, tracking_number, tracking_url, exchange_rate_value,
          shipments(id, tracking_code, external_guide, shipping_status, package_number, total_packages),
          vendor:vendors(store_name, slug, logo_url),
          vendor_store:vendor_stores(store_name, slug, logo_url)
        ),
        international_shipment_tracking (
          tracking_number, tracking_url, courier_company, picked_up_at, estimated_delivery, contact_phone, contact_email, observations
        )
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
        .from('profiles').select('first_name, last_name, phone, saved_addresses, is_vendor').eq('id', user!.id).single();
      if (profileData) {
        setFirstName(profileData.first_name || '');
        setLastName(profileData.last_name || '');
        setPhone(profileData.phone || '');
        setAddresses(Array.isArray(profileData.saved_addresses) ? profileData.saved_addresses : []);
        setIsVendor(!!profileData.is_vendor);
      }

      // Load international addresses
      try {
        const { data: intlData } = await supabase
          .from('customer_international_addresses')
          .select('*')
          .order('is_default', { ascending: false });
        if (intlData) {
          setIntlAddresses(intlData);
        }
      } catch (err) {
        console.error("Error loading international addresses in loadData:", err);
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

  async function loadIntlAddresses() {
    if (!user) return;
    setLoadingIntl(true);
    try {
      const { data, error } = await supabase
        .from('customer_international_addresses')
        .select('*')
        .order('is_default', { ascending: false });
      if (error) throw error;
      setIntlAddresses(data || []);
    } catch (err) {
      console.error("Error loading international addresses:", err);
    } finally {
      setLoadingIntl(false);
    }
  }

  async function saveIntlAddress() {
    if (!user) return;
    try {
      if (!intlForm.label.trim()) throw new Error("Ingresá la etiqueta (ej: Urubox Miami).");
      if (!intlForm.courier_name.trim()) throw new Error("Ingresá el nombre del courier.");
      if (!intlForm.recipient_name.trim()) throw new Error("Ingresá el nombre del destinatario.");
      if (!intlForm.address_line_1.trim()) throw new Error("Ingresá la dirección.");
      if (!intlForm.city.trim()) throw new Error("Ingresá la ciudad.");
      if (!intlForm.state.trim()) throw new Error("Ingresá el estado.");
      if (!intlForm.postal_code.trim()) throw new Error("Ingresá el ZIP Code.");
      if (!intlForm.phone.trim()) throw new Error("Ingresá el teléfono.");

      if (editingIntlId === 'new') {
        const { error } = await supabase
          .from('customer_international_addresses')
          .insert({
            user_id: user.id,
            label: intlForm.label.trim(),
            courier_name: intlForm.courier_name.trim(),
            recipient_name: intlForm.recipient_name.trim(),
            customer_code: intlForm.customer_code.trim() || null,
            address_line_1: intlForm.address_line_1.trim(),
            address_line_2: intlForm.address_line_2.trim() || null,
            city: intlForm.city.trim(),
            state: intlForm.state.trim(),
            postal_code: intlForm.postal_code.trim(),
            country: 'United States',
            phone: intlForm.phone.trim(),
            instructions: intlForm.instructions.trim() || null,
            is_default: intlAddresses.length === 0
          });
        if (error) throw error;
      } else if (editingIntlId) {
        const { error } = await supabase
          .from('customer_international_addresses')
          .update({
            label: intlForm.label.trim(),
            courier_name: intlForm.courier_name.trim(),
            recipient_name: intlForm.recipient_name.trim(),
            customer_code: intlForm.customer_code.trim() || null,
            address_line_1: intlForm.address_line_1.trim(),
            address_line_2: intlForm.address_line_2.trim() || null,
            city: intlForm.city.trim(),
            state: intlForm.state.trim(),
            postal_code: intlForm.postal_code.trim(),
            phone: intlForm.phone.trim(),
            instructions: intlForm.instructions.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingIntlId);
        if (error) throw error;
      }
      setEditingIntlId(null);
      await loadIntlAddresses();
    } catch (err: any) {
      alert(err.message || "Error al guardar dirección.");
    }
  }

  async function deleteIntlAddress(id: string) {
    if (!confirm("¿Seguro que querés eliminar esta dirección?")) return;
    try {
      const { error } = await supabase
        .from('customer_international_addresses')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadIntlAddresses();
    } catch (err: any) {
      alert(err.message || "Error al eliminar dirección.");
    }
  }

  async function setAsDefaultIntlAddress(id: string) {
    try {
      await supabase
        .from('customer_international_addresses')
        .update({ is_default: false })
        .eq('user_id', user!.id);
      
      await supabase
        .from('customer_international_addresses')
        .update({ is_default: true })
        .eq('id', id);
      
      await loadIntlAddresses();
    } catch (err: any) {
      alert(err.message || "Error al establecer como predeterminada.");
    }
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
          vendor_id: item.vendor_id,
          vendor_store_id: item.vendor_store_id,
          vendor_name: item.vendor_store?.store_name || item.vendor?.store_name || 'Collectibles',
          vendor_store_name: item.vendor_store?.store_name || item.vendor?.store_name || 'Collectibles',
          vendor_slug: item.vendor_store?.slug || item.vendor?.slug,
          vendor_store_slug: item.vendor_store?.slug || item.vendor?.slug,
          vendor_logo: item.vendor_store?.logo_url || item.vendor?.logo_url,
          sku: item.sku || null,
          unit_price: item.unit_price,
          image_url: getOrderItemImage(item),
          promotions_opt_in: item.vendor?.promotions_opt_in || false,
        });
      }
    }
  }

  if (loading) return <div className="p-12 text-center text-slate-400">Cargando perfil...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="glass  shadow-sm border p-8 mb-8 flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-primary-500/15 rounded-full flex items-center justify-center text-primary-600">
            <User size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Mi Cuenta</h1>
            <p className="text-slate-400">{user?.email}</p>
            {firstName && <p className="text-sm text-slate-300 font-medium mt-1">{firstName} {lastName}</p>}
            {isVendor && (
              <Link to="/vendor" className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-bold hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/20">
                <Store className="w-4 h-4" /> Ir a mi Panel de Ventas
              </Link>
            )}
          </div>
        </div>
        <div className="bg-white/5 border  p-6 w-full md:w-auto">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-300"><Settings className="w-4 h-4" /> Preferencias</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs uppercase font-bold text-slate-400 block mb-1">Idioma</label>
              <select className="glass border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500" value={language} onChange={e => setLanguage(e.target.value as any)}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-slate-400 block mb-1">Moneda</label>
              <select className="glass border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500" value={currency} onChange={e => setCurrency(e.target.value as any)}>
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
          { key: 'couriers', icon: Globe, label: 'Direcciones Courier USA' },
          { key: 'franchise', icon: ShieldCheck, label: 'Mi Franquicia UY' },
          { key: 'security', icon: Lock, label: 'Seguridad' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-400'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
            {'count' in tab && tab.count! > 0 && (
              <span className="bg-primary-500/15 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Mis Pedidos ═══ */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {orders.length === 0 ? (
            <div className="bg-white/5 p-12  text-center border border-dashed">
              <Package className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">Aún no has realizado ninguna compra.</p>
              <Link to="/shop" className="btn-primary px-6 py-2 inline-flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Ir a la Tienda</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map(order => (
                <div key={order.id} className="glass border  overflow-hidden shadow-sm">
                  <div className="bg-white/5 px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b">
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">PEDIDO</p>
                      <p className="font-medium">{new Date(order.created_at).toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">N° DE ORDEN</p>
                      <p className="font-mono font-medium text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider text-right">TOTAL</p>
                      <p className="font-bold text-lg text-primary-600">{formatCurrencyPrice(order.total_amount)}</p>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                          ['paid', 'delivered', 'confirmed'].includes(order.status) ? 'bg-green-100 text-green-700' :
                          order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                          ['pending', 'awaiting_payment'].includes(order.status) ? 'bg-yellow-100 text-yellow-800' :
                          ['cancelled', 'cancelada', 'expired'].includes(order.status) ? 'bg-red-100 text-red-700' :
                          'bg-white/10 text-slate-300'
                        }`}>
                          {(order.status === 'pending' || order.status === 'awaiting_payment') && 'Esperando Pago'}
                          {(order.status === 'paid' || order.status === 'confirmed') && 'Confirmado'}
                          {order.status === 'processing' && 'En Preparación'}
                          {order.status === 'shipped' && 'En Tránsito'}
                          {order.status === 'delivered' && 'Entregado'}
                          {(order.status === 'cancelled' || order.status === 'cancelada') && 'Cancelado'}
                          {order.status === 'expired' && 'Expirado'}
                        </span>
                        
                        {order.order_suborders && order.order_suborders.length > 0 ? (
                          <div className="mt-4 space-y-2 text-right flex flex-col items-end w-full max-w-[200px]">
                            {order.order_suborders.map((sub: any) => {
                              const isPickup = ['pickup', 'local'].includes((sub.shipping_method || '').toLowerCase());
                              const isManual = (sub.shipping_method || '').toLowerCase().includes('manual');
                              
                              // Sanitize and filter out internal/fake tracking codes (COL-, SHIP-, UUIDs, etc.)
                              const cleanTrack = (sub.tracking_number || '').trim().toUpperCase();
                              const isFake = cleanTrack.startsWith('COL-') || 
                                             cleanTrack.startsWith('SHIP-') || 
                                             cleanTrack.startsWith('ORDER-') || 
                                             cleanTrack.startsWith('TRACK-') ||
                                             /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(cleanTrack);
                              const realTracking = isFake ? null : sub.tracking_number;
                              const carrier = sub.shipping_provider || 'Logística';
                              const storeName = sub.vendor_store?.store_name || sub.vendor?.store_name || 'Vendedor';
                              const shipmentsList = sub.shipments || [];

                              return (
                                <div key={sub.id} className="text-right text-[11px] border-b border-white/5 pb-2 last:border-0 last:pb-0 w-full">
                                  <div className="text-[10px] text-slate-400 font-bold">Paquete: {storeName}</div>
                                  {isPickup ? (
                                    <span className="inline-block text-[9px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 uppercase mt-1">Listo para retiro</span>
                                  ) : isManual ? (
                                    <span className="inline-block text-[9px] text-slate-400 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10 uppercase mt-1">A coordinar</span>
                                  ) : shipmentsList.length > 1 ? (
                                    <div className="space-y-1.5 mt-1">
                                      {shipmentsList.map((s: any, idx: number) => {
                                        const cleanSTrack = (s.tracking_code || '').trim().toUpperCase();
                                        const isSFake = cleanSTrack.startsWith('COL-') || 
                                                       cleanSTrack.startsWith('SHIP-') || 
                                                       cleanSTrack.startsWith('ORDER-') || 
                                                       cleanSTrack.startsWith('TRACK-') ||
                                                       /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(cleanSTrack);
                                        const sTracking = isSFake ? null : s.tracking_code;

                                        let trackUrl = sub.tracking_url;
                                        if (carrier.toLowerCase() === 'dac' && sTracking) {
                                          trackUrl = `https://www.dac.com.uy/seguimiento-de-envio?guia=${sTracking}`;
                                        } else if (carrier.toLowerCase() === 'soydelivery' && sTracking) {
                                          trackUrl = `https://soydelivery.com.uy/tracking/${sTracking}`;
                                        }
                                        return (
                                          <div key={s.id} className="flex flex-col items-end border-t border-white/5 pt-1 first:border-t-0 first:pt-0">
                                            <span className="text-[8px] text-slate-400 uppercase font-black">Bulto {idx + 1} ({s.shipping_status || 'En cola'})</span>
                                            {sTracking ? (
                                              <>
                                                <div className="text-[9px] text-blue-400 font-mono font-bold bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/10 mt-0.5">
                                                  {carrier.toUpperCase()}: {sTracking}
                                                </div>
                                                {trackUrl && (
                                                  <a href={trackUrl} target="_blank" rel="noreferrer" className="text-[9px] text-primary-500 hover:underline mt-0.5">Rastrear bulto</a>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-[8px] text-amber-500 font-bold uppercase mt-0.5">Procesando guía...</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : realTracking ? (
                                    <div className="flex flex-col items-end mt-1">
                                      <div className="flex items-center gap-1 text-[10px] text-blue-400 font-bold bg-blue-500/10 px-2 py-1 rounded w-fit border border-blue-500/20 font-mono">
                                        <Truck className="w-3 h-3 text-blue-400" />
                                        {carrier.toUpperCase()}: {realTracking}
                                      </div>
                                      {sub.tracking_url && (
                                        <a href={sub.tracking_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary-500 hover:underline mt-1">Rastrear envío</a>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="inline-block text-[9px] text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase mt-1">
                                      {['dac', 'soydelivery'].includes(carrier.toLowerCase()) ? `Pendiente emisión ${carrier.toUpperCase()}` : 'Preparando envío'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          order.tracking_number && (
                            <div className="text-right">
                              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{order.carrier || 'Logística'}</div>
                              <div className="text-xs font-mono font-bold text-blue-400">{order.tracking_number}</div>
                              {order.tracking_url && (
                                <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary-500 hover:underline">Rastrear envío</a>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    {/* ARGENTINA SHIPPING TRACKING MODULE */}
                    {(() => {
                      const isArgentina = ['argentina', 'ar'].includes((order.shipping_address?.country || '').toLowerCase().trim());
                      if (!isArgentina) return null;

                      const tracking = order.international_shipment_tracking;
                      return (
                        <div className="mb-6 bg-white/5 border border-white/10 p-5 rounded-xl space-y-4 text-xs font-medium">
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <Truck className="w-4 h-4 text-primary-500" /> Envío Internacional (Argentina)
                          </h3>

                          {tracking ? (
                            <div className="space-y-4">
                              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                                <div className="p-1 bg-emerald-500 text-white rounded shrink-0">
                                  <Truck className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">¡Paquete en Camino!</h4>
                                  <p className="text-xs text-slate-300 mt-1 leading-normal">
                                    Tu envío internacional ha sido despachado a través de <b>{tracking.courier_company}</b>. Puedes realizar el seguimiento del envío utilizando el número de tracking provisto.
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-white/5 p-4 rounded-xl border border-white/5 font-medium">
                                <div>
                                  <span className="text-slate-400 block mb-0.5">Número de Seguimiento (Tracking)</span>
                                  <span className="font-mono text-sm font-bold text-white select-all">{tracking.tracking_number}</span>
                                  {tracking.tracking_url && (
                                    <a
                                      href={tracking.tracking_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary-400 hover:underline block mt-1 font-bold"
                                    >
                                      Rastrear Envío →
                                    </a>
                                  )}
                                </div>

                                <div>
                                  <span className="text-slate-400 block mb-0.5">Empresa Courier</span>
                                  <span className="text-sm font-bold text-white uppercase">{tracking.courier_company}</span>
                                </div>

                                {tracking.picked_up_at && (
                                  <div>
                                    <span className="text-slate-400 block mb-0.5">Fecha de Retiro</span>
                                    <span className="font-bold text-white">{new Date(tracking.picked_up_at).toLocaleDateString()}</span>
                                  </div>
                                )}

                                {tracking.estimated_delivery && (
                                  <div>
                                    <span className="text-slate-400 block mb-0.5">Entrega Estimada</span>
                                    <span className="font-bold text-white">{tracking.estimated_delivery}</span>
                                  </div>
                                )}

                                {(tracking.contact_phone || tracking.contact_email) && (
                                  <div className="col-span-1 sm:col-span-2 border-t border-white/5 pt-3 mt-1 space-y-1">
                                    <span className="text-slate-400 block">Información de Contacto del Courier</span>
                                    <div className="flex flex-wrap gap-x-4 text-slate-300">
                                      {tracking.contact_phone && <span className="mr-3">📞 {tracking.contact_phone}</span>}
                                      {tracking.contact_email && <span>✉️ {tracking.contact_email}</span>}
                                    </div>
                                  </div>
                                )}

                                {tracking.observations && (
                                  <div className="col-span-1 sm:col-span-2 border-t border-white/5 pt-3 mt-1 text-slate-300">
                                    <span className="text-slate-400 block mb-0.5 font-bold">Detalles / Estado</span>
                                    <span className="italic">{tracking.observations}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl flex items-start gap-3">
                              <div className="p-1 bg-primary-500 text-white rounded shrink-0">
                                <Clock className="w-4 h-4 animate-pulse" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-primary-400 uppercase tracking-wider">Preparando Envío</h4>
                                <p className="text-xs text-slate-300 mt-1 leading-normal font-medium">
                                  Pago confirmado. Estamos preparando tu envío internacional. El seguimiento estará disponible una vez que el courier retire el paquete.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* MÓDULO INTERNACIONAL: SEGUIMIENTO "MIS IMPORTACIONES" */}
                    {(() => {
                      const isArgentina = ['argentina', 'ar'].includes((order.shipping_address?.country || '').toLowerCase().trim());
                      if (isArgentina) return null;

                      const intlItems = order.order_items.filter((item: any) => item.international_order_items && item.international_order_items.length > 0);
                      if (intlItems.length === 0) return null;

                      // Use the status of the first international item as representative
                      const representativeTracker = intlItems[0].international_order_items[0];
                      const purchaseStatus = representativeTracker?.purchase_status || 'pending_purchase';
                      const zincOrderId = representativeTracker?.zinc_order_id;
                      const trackingNumber = representativeTracker?.tracking_number;
                      const trackingUrl = representativeTracker?.tracking_url;
                      const carrier = representativeTracker?.carrier;

                      const currentStep = getTrackingMilestoneStep(purchaseStatus);

                      const steps = [
                        { label: 'Pago Confirmado', desc: 'Confirmado en Collectibles' },
                        { label: 'Procesando', desc: 'Enviado a despacho en EE.UU.' },
                        { label: 'En Camino', desc: 'Hacia tu casilla en Miami' },
                        { label: 'En tu Courier', desc: 'Recibido en tu casilla' },
                      ];

                      return (
                        <div className="mb-6 bg-white/5 border border-white/10 p-5 rounded-xl">
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-[#f00856]" /> Seguimiento de Compra Internacional
                          </h3>

                          {/* Timeline visualization */}
                          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-2 mb-6">
                            {/* Connecting Line (for MD screens and above) */}
                            <div className="absolute top-3.5 left-3.5 right-3.5 h-[2px] bg-white/10 -z-10 hidden md:block" />
                            
                            {steps.map((st, index) => {
                              const stepNum = index + 1;
                              const isCompleted = stepNum < currentStep;
                              const isActive = stepNum === currentStep;

                              return (
                                <div key={index} className="flex md:flex-col items-center gap-3 md:gap-1.5 flex-1 w-full md:text-center z-10">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                                    isCompleted ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' :
                                    isActive ? 'bg-[#f00856] text-white animate-pulse shadow-lg shadow-[#f00856]/20' :
                                    'bg-slate-700 text-slate-400'
                                  }`}>
                                    {isCompleted ? '✓' : stepNum}
                                  </div>
                                  <div className="text-left md:text-center">
                                    <div className={`text-xs font-bold ${isActive ? 'text-[#f00856]' : isCompleted ? 'text-green-400' : 'text-slate-400'}`}>{st.label}</div>
                                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5 md:max-w-[90px] mx-auto">{st.desc}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Tracking metadata */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-4 text-xs">
                            <div>
                              <span className="text-slate-400 font-medium">Estado actual:</span>
                              <span className="font-bold text-white ml-1.5 uppercase">
                                {purchaseStatus === 'pending_purchase' && 'Preparando compra internacional'}
                                {(purchaseStatus === 'zinc_order_created' || purchaseStatus === 'zinc_processing') && 'Procesando en proveedor internacional'}
                                {purchaseStatus === 'purchased' && 'Comprado · Preparando despacho a Miami'}
                                {purchaseStatus === 'warehouse_received' && 'Recibido en depósito Miami'}
                                {(purchaseStatus === 'shipped' || purchaseStatus === 'shipped_to_courier') && 'En camino a tu casilla en Miami'}
                                {(purchaseStatus === 'delivered' || purchaseStatus === 'delivered_to_courier') && 'Entregado a tu courier en EE.UU.'}
                                {purchaseStatus === 'cancelled' && 'Orden Cancelada'}
                                {purchaseStatus === 'cancellation_requires_review' && 'Cancelación Pendiente de Revisión'}
                                {purchaseStatus === 'manual_review' && 'En Revisión Administrativa'}
                              </span>
                            </div>

                            {trackingNumber && (
                              <div className="sm:text-right">
                                <span className="text-slate-400 font-medium">Código de rastreo en EE.UU.:</span>
                                <span className="font-mono font-bold text-blue-400 ml-1.5">{trackingNumber} ({carrier || 'Envío terrestre'})</span>
                                {trackingUrl && (
                                  <a href={trackingUrl} target="_blank" rel="noreferrer" className="text-primary-500 hover:underline block mt-1 font-bold">Rastrear envío en EE.UU.</a>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Franchise Warning */}
                          <div className="mt-4 bg-[#f00856]/5 border border-[#f00856]/20 p-4 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-[#f00856] shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Control de Franquicia Aduanera (Uruguay)</h4>
                              <p className="text-xs text-slate-300 mt-1 leading-normal">
                                Esta compra consume 1 de tus 3 franquicias anuales. El valor aduanero CIF es de 
                                <span className="font-bold text-white mx-1">
                                  USD {intlItems.reduce((sum: number, it: any) => sum + (it.international_order_items?.[0]?.final_price_usd || (it.unit_price / (order.exchange_rate_value || 40)) * it.quantity), 0).toFixed(2)}
                                </span>.
                                Recuerda que para no pagar impuestos aduaneros, el valor de la importación no debe superar los <b>USD 200.00</b>.
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {order.order_items.map((item: any, i: number) => (
                      <div key={i} className="flex gap-4 py-3 border-b last:border-0 last:pb-0 items-center">
                        <Link to={item.products?.slug ? `/producto/${item.products.slug}` : '#'}>
                          <img 
                            src={getOrderItemImage(item)} 
                            alt=""
                            {...getImageProps("w-16 h-16 object-contain border bg-white/5 p-1 hover:border-primary-300 transition-colors")}
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={item.products?.slug ? `/producto/${item.products.slug}` : '#'} className="font-bold text-white hover:text-primary-600 transition-colors line-clamp-1">{item.products?.title}</Link>
                          <p className="text-[10px] font-black text-[#f00856] uppercase tracking-widest mt-0.5">
                            Vendido por: {item.vendor_id ? (item.vendor_store?.display_name || item.vendor_store?.store_name || item.vendor_store?.name || item.vendor?.company_name || item.vendor?.store_name || 'Vendedor') : 'Collectibles.uy'}
                          </p>
                          <p className="text-sm text-slate-400">Cant: {item.quantity} · {formatCurrencyPrice(item.unit_price)} c/u</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-6 pb-5 flex flex-wrap gap-3">
                    {['awaiting_payment', 'pending'].includes(order.status) && order.payments && order.payments.length > 0 && order.payments[0].payment_url && (
                      <a 
                        href={order.payments[0].payment_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-colors border border-amber-500"
                      >
                        <CreditCard className="w-4 h-4" /> Retomar Pago
                      </a>
                    )}
                    <button onClick={() => handleBuyAgain(order)} className="flex items-center gap-2 px-5 py-2 bg-primary-500/10 text-primary-700 hover:bg-primary-500/15  font-bold text-sm transition-colors border border-primary-200">
                      <RotateCcw className="w-4 h-4" /> Volver a Comprar
                    </button>
                    <button onClick={() => downloadCleanInvoice(order)} className="flex items-center gap-2 px-5 py-2 bg-white/5 text-white hover:bg-white/10 font-bold text-sm transition-colors border border-white/10">
                      <FileText className="w-4 h-4 text-slate-400" /> Descargar Factura
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
          <div className="glass border  shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b bg-white/5">
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
          <div className="glass border  shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b bg-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-500" /> Mis Direcciones</h2>
                <p className="text-xs text-slate-400 mt-1">Guardá hasta 3 direcciones para usar en el checkout.</p>
              </div>
              {addresses.length < 3 && (
                <button onClick={addAddress} className="flex items-center gap-1.5 px-4 py-2 bg-primary-500/10 text-primary-700 hover:bg-primary-500/15  font-bold text-sm border border-primary-200 transition-colors">
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              )}
            </div>
            <div className="p-8">
              {addresses.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <MapPin className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No tenés direcciones guardadas.</p>
                  <button onClick={addAddress} className="text-primary-600 font-bold text-sm mt-2 hover:underline">+ Agregar dirección</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {addresses.map((addr, idx) => (
                    <div key={idx} className={`border  overflow-hidden transition-all ${editingAddr === idx ? 'border-primary-300 shadow-md' : 'border-white/10'}`}>
                      {/* Address header */}
                      <div className="flex items-center justify-between px-5 py-3 bg-white/5 border-b">
                        <div className="flex items-center gap-3">
                          <MapPin className={`w-4 h-4 ${editingAddr === idx ? 'text-primary-500' : 'text-slate-500'}`} />
                          {editingAddr === idx ? (
                            <input className="font-bold text-sm glass border rounded px-2 py-1 w-32" value={addr.label} onChange={e => updateAddress(idx, 'label', e.target.value)} placeholder="Nombre..." />
                          ) : (
                            <span className="font-bold text-sm text-slate-200">{addr.label || `Dirección ${idx + 1}`}</span>
                          )}
                          {idx === 0 && <span className="text-[10px] font-bold uppercase bg-primary-500/15 text-primary-600 px-2 py-0.5 rounded-full">Principal</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingAddr(editingAddr === idx ? null : idx)} className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-500/10  transition-colors">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeAddress(idx)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50  transition-colors">
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
                        <div className="px-5 py-3 text-sm text-slate-400">
                          {addr.street ? (
                            <>
                              <p>{addr.street}{addr.apartment ? `, ${addr.apartment}` : ''}</p>
                              <p className="text-slate-500">{[addr.city, addr.department, addr.postal_code].filter(Boolean).join(', ')}</p>
                            </>
                          ) : (
                            <p className="text-slate-500 italic">Dirección incompleta — hacé clic en el lápiz para editar.</p>
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

      {/* ═══ TAB: Direcciones Courier USA ═══ */}
      {activeTab === 'couriers' && (
        <div className="space-y-6">
          <div className="glass border shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b bg-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary-500" /> Direcciones de Courier (USA)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Administrá las casillas y direcciones en Estados Unidos provistas por tu courier para recibir compras de importación.
                </p>
              </div>
              {editingIntlId === null && (
                <button 
                  onClick={() => {
                    setEditingIntlId('new');
                    setIntlForm({
                      label: '',
                      courier_name: '',
                      recipient_name: `${firstName} ${lastName}`.trim(),
                      customer_code: '',
                      address_line_1: '',
                      address_line_2: '',
                      city: '',
                      state: '',
                      postal_code: '',
                      country: 'United States',
                      phone: '',
                      instructions: ''
                    });
                  }} 
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-500/10 text-primary-700 hover:bg-primary-500/15 font-bold text-sm border border-primary-200 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              )}
            </div>

            <div className="p-8">
              {editingIntlId !== null ? (
                /* Add / Edit Form */
                <div className="space-y-4 max-w-2xl bg-black/10 p-6 rounded-xl border border-white/5">
                  <h3 className="font-bold text-sm text-white mb-2">
                    {editingIntlId === 'new' ? 'Nueva Dirección Internacional' : 'Editar Dirección Internacional'}
                  </h3>

                  {/* Suggestions template helper */}
                  <div className="mb-4">
                    <span className="text-xs text-slate-400 block mb-2 font-medium">Usar plantilla de autocompletado:</span>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        type="button" 
                        className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                        onClick={() => {
                          setIntlForm(prev => ({
                            ...prev,
                            label: 'Mi casilla Urubox',
                            courier_name: 'Urubox',
                            address_line_1: '2030 NW 95th Ave',
                            address_line_2: 'Suite UY',
                            city: 'Doral',
                            state: 'FL',
                            postal_code: '33172',
                            phone: '7863140977'
                          }));
                        }}
                      >
                        Urubox Miami
                      </button>
                      <button 
                        type="button" 
                        className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                        onClick={() => {
                          setIntlForm(prev => ({
                            ...prev,
                            label: 'Mi casilla USX Cargo',
                            courier_name: 'USX Cargo',
                            address_line_1: '8400 NW 25th St',
                            address_line_2: 'Suite UY',
                            city: 'Doral',
                            state: 'FL',
                            postal_code: '33122',
                            phone: '3055928880'
                          }));
                        }}
                      >
                        USX Cargo Miami
                      </button>
                      <button 
                        type="button" 
                        className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                        onClick={() => {
                          setIntlForm(prev => ({
                            ...prev,
                            label: 'Mi casilla PuntoMio',
                            courier_name: 'PuntoMio',
                            address_line_1: '2200 NW 129th Ave',
                            address_line_2: 'Suite UY',
                            city: 'Miami',
                            state: 'FL',
                            postal_code: '33182',
                            phone: '3054772020'
                          }));
                        }}
                      >
                        PuntoMio Miami
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Etiqueta Identificadora *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: Urubox Miami" 
                        value={intlForm.label}
                        onChange={e => setIntlForm({...intlForm, label: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Nombre del Courier *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: Urubox" 
                        value={intlForm.courier_name}
                        onChange={e => setIntlForm({...intlForm, courier_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Destinatario completo *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: Juan Pérez / UY12345" 
                        value={intlForm.recipient_name}
                        onChange={e => setIntlForm({...intlForm, recipient_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Número de Casilla / Suite *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: UY12345" 
                        value={intlForm.customer_code}
                        onChange={e => setIntlForm({...intlForm, customer_code: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Address Line 1 *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: 2030 NW 95th Ave" 
                        value={intlForm.address_line_1}
                        onChange={e => setIntlForm({...intlForm, address_line_1: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Address Line 2 (Opcional)</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: Suite UY" 
                        value={intlForm.address_line_2}
                        onChange={e => setIntlForm({...intlForm, address_line_2: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Ciudad *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: Doral" 
                        value={intlForm.city}
                        onChange={e => setIntlForm({...intlForm, city: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Estado / Región *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: FL o Florida" 
                        value={intlForm.state}
                        onChange={e => setIntlForm({...intlForm, state: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">ZIP Code / Código Postal *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: 33172" 
                        value={intlForm.postal_code}
                        onChange={e => setIntlForm({...intlForm, postal_code: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="form-label">Teléfono de Recepción *</label>
                      <input 
                        className="form-input" 
                        placeholder="Ej: 7863140977" 
                        value={intlForm.phone}
                        onChange={e => setIntlForm({...intlForm, phone: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Instrucciones Adicionales (Opcional)</label>
                    <textarea 
                      className="form-input" 
                      rows={2}
                      placeholder="Ej: Entregar solo de lunes a viernes de 9 a 17 hs." 
                      value={intlForm.instructions}
                      onChange={e => setIntlForm({...intlForm, instructions: e.target.value})}
                    />
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={saveIntlAddress} className="btn-primary px-6 py-2 flex items-center gap-1.5">
                      <Save className="w-4 h-4" /> Guardar Dirección
                    </button>
                    <button onClick={() => setEditingIntlId(null)} className="px-6 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-sm transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Listing saved addresses */
                <>
                  {loadingIntl ? (
                    <div className="text-center py-6 text-slate-400">Cargando direcciones...</div>
                  ) : intlAddresses.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                      <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No tenés direcciones de courier guardadas.</p>
                      <p className="text-xs text-slate-600 mt-1">Agregá una casilla para que esté disponible en tu checkout.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {intlAddresses.map((addr) => (
                        <div key={addr.id} className="border border-white/10 rounded-xl bg-white/5 p-5 flex flex-col justify-between hover:border-white/20 transition-all">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                                {addr.label}
                                {addr.is_default && (
                                  <span className="bg-primary-500/10 text-primary-600 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Principal</span>
                                )}
                              </h4>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => {
                                    setEditingIntlId(addr.id);
                                    setIntlForm({
                                      label: addr.label || '',
                                      courier_name: addr.courier_name || '',
                                      recipient_name: addr.recipient_name || '',
                                      customer_code: addr.customer_code || '',
                                      address_line_1: addr.address_line_1 || '',
                                      address_line_2: addr.address_line_2 || '',
                                      city: addr.city || '',
                                      state: addr.state || '',
                                      postal_code: addr.postal_code || '',
                                      country: addr.country || 'United States',
                                      phone: addr.phone || '',
                                      instructions: addr.instructions || ''
                                    });
                                  }} 
                                  className="p-1 text-slate-400 hover:text-primary-500 hover:bg-white/5 rounded transition"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => deleteIntlAddress(addr.id)} 
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-white/5 rounded transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-400 leading-relaxed">
                              <p><span className="text-slate-500">Courier:</span> <strong className="text-slate-300">{addr.courier_name}</strong></p>
                              <p><span className="text-slate-500">Destinatario:</span> <strong className="text-slate-300">{addr.recipient_name}</strong></p>
                              {addr.customer_code && <p><span className="text-slate-500">Casilla/Suite:</span> <strong className="text-slate-300">{addr.customer_code}</strong></p>}
                              <p><span className="text-slate-500">Address Line 1:</span> <span className="text-slate-300">{addr.address_line_1}</span></p>
                              {addr.address_line_2 && <p><span className="text-slate-500">Address Line 2:</span> <span className="text-slate-300">{addr.address_line_2}</span></p>}
                              <p><span className="text-slate-500">Ubicación:</span> <span className="text-slate-300">{addr.city}, {addr.state} {addr.postal_code}</span></p>
                              <p><span className="text-slate-500">Teléfono:</span> <span className="text-slate-300">{addr.phone}</span></p>
                              {addr.instructions && <p className="mt-2 text-[11px] italic text-slate-500">Instrucciones: {addr.instructions}</p>}
                            </div>
                          </div>

                          {!addr.is_default && (
                            <button 
                              onClick={() => setAsDefaultIntlAddress(addr.id)} 
                              className="w-full mt-4 py-1.5 border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-300 font-bold transition rounded-lg"
                            >
                              Establecer como predeterminada
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Mi Franquicia UY ═══ */}
      {activeTab === 'franchise' && (
        <div className="space-y-6 max-w-4xl">
          <FranchiseStatusCard />
        </div>
      )}

      {/* ═══ TAB: Seguridad ═══ */}
      {activeTab === 'security' && (
        <div className="glass border  shadow-sm overflow-hidden max-w-lg">
          <div className="px-8 py-5 border-b bg-white/5">
            <h2 className="text-lg font-bold flex items-center gap-2"><Lock className="w-5 h-5 text-primary-500" /> Cambiar Contraseña</h2>
            <p className="text-xs text-slate-400 mt-1">Actualizá tu contraseña de acceso a la plataforma.</p>
          </div>
          <div className="p-8 space-y-5">
            <div>
              <label className="form-label">Nueva Contraseña</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="form-input pr-10" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">Confirmar Nueva Contraseña</label>
              <input type={showPw ? 'text' : 'password'} className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repetir contraseña" />
            </div>

            {pwMessage && (
              <div className={`p-3  text-sm font-medium ${pwMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
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
