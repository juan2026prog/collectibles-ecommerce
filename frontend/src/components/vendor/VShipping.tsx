import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { 
  Truck, Store, Package, AlertTriangle, CheckCircle, XCircle, 
  MapPin, Plus, Trash2, Shield, Settings, Info, Check, RefreshCw, Sparkles, Eye 
} from 'lucide-react';
import VendorLabelPreviewModal from './VendorLabelPreviewModal';

interface DispatchAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  department: string;
  postal_code: string | null;
  phone: string | null;
  is_default: boolean;
}

export default function VShipping() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 1. Settings Generales (Pickup, Manual) en vendors.shipping_settings
  const [shippingData, setShippingData] = useState({
    pickup: { active: false, address: '', department: '', city: '', phone: '', hours: '', instructions: '' },
    manual: { active: false, method_name: '', fixed_cost: '', instructions: '', estimated_time: '' }
  });

  // 2. Conexiones Logísticas en vendor_shipping_connections
  const [connections, setConnections] = useState<Record<string, any>>({
    dac: { 
      status: 'disconnected', 
      account_name: '', 
      username: '', 
      password: '', 
      token: '', 
      apiKey: '', 
      clientId: '', 
      agencyCode: '', 
      address: '', 
      department: '', 
      city: '', 
      phone: '', 
      cutoff: '', 
      last_tested_at: null 
    },
    soydelivery: { 
      status: 'disconnected', 
      account_name: '', 
      apiKey: '', 
      secret: '', 
      token: '', 
      clientId: '', 
      address: '', 
      zone: '', 
      phone: '', 
      cutoff: '', 
      days_active: ['Mon','Tue','Wed','Thu','Fri'], 
      last_tested_at: null 
    },
    ues: { 
      status: 'disconnected', 
      account_name: '', 
      username: '', 
      password: '', 
      apiKey: '', 
      token: '', 
      address: '', 
      department: '', 
      city: '', 
      phone: '', 
      cutoff: '', 
      last_tested_at: null 
    }
  });

  // 3. Direcciones de Despacho
  const [dispatchAddresses, setDispatchAddresses] = useState<DispatchAddress[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    name: '',
    address: '',
    city: '',
    department: 'Montevideo',
    postal_code: '',
    phone: '',
    is_default: false
  });

  // 4. ML Logistics Assistant Wizard
  const [mlAccountConnected, setMlAccountConnected] = useState(false);
  const [mlSellerId, setMlSellerId] = useState<string | null>(null);
  const [showMlWizard, setShowMlWizard] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardResult, setWizardResult] = useState<any>(null);

  // 5. Vendor settings preview states
  const [vendorObj, setVendorObj] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const departments = [
    'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 
    'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 
    'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 
    'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'
  ];

  const loadData = async () => {
    if (!user) return;
    try {
      // Run queries in parallel
      const [vendorRes, connRes, addrRes, mlRes] = await Promise.all([
        supabase
          .from('vendors')
          .select('store_name, logo_url, slug, contact_phone, pickup_address, shipping_settings')
          .eq('id', user.id)
          .single()
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('vendor_shipping_connections')
          .select('*')
          .eq('vendor_id', user.id)
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('vendor_dispatch_addresses')
          .select('*')
          .eq('vendor_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('ml_seller_accounts')
          .select('id, nickname, seller_id')
          .eq('vendor_id', user.id)
          .maybeSingle()
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err }))
      ]);

      // Process vendor result
      if (vendorRes.success && vendorRes.data) {
        setVendorObj(vendorRes.data);
        if (vendorRes.data.shipping_settings) {
          setShippingData(prev => ({ ...prev, ...vendorRes.data.shipping_settings }));
        }
      } else if (vendorRes.error) {
        console.error("Error loading vendor profile:", vendorRes.error);
        try {
          toast.error("Error al cargar perfil de vendedor");
        } catch (e) {
          console.error("Toast error:", e);
        }
      }

      // Process connections result
      if (connRes.success && connRes.data) {
        const connData = connRes.data;
        const newConns = { ...connections };
        connData.forEach(c => {
          if (newConns[c.provider]) {
            newConns[c.provider].status = c.connection_status;
            newConns[c.provider].account_name = c.account_name;
            newConns[c.provider].last_tested_at = c.last_tested_at;
            if (c.settings) {
              Object.assign(newConns[c.provider], c.settings);
            }
            if (c.pickup_address) {
              Object.assign(newConns[c.provider], c.pickup_address);
            }
          }
        });
        setConnections(newConns);
      } else if (connRes.error) {
        console.error("Error loading shipping connections:", connRes.error);
      }

      // Process dispatch addresses result
      if (addrRes.success && addrRes.data) {
        setDispatchAddresses(addrRes.data);
      } else if (addrRes.error) {
        console.error("Error loading dispatch addresses:", addrRes.error);
      }

      // Process ML account result
      if (mlRes.success && mlRes.data) {
        setMlAccountConnected(true);
        setMlSellerId(mlRes.data.seller_id || null);
      } else if (mlRes.error) {
        console.error("Error loading ML accounts:", mlRes.error);
        setMlAccountConnected(false);
        setMlSellerId(null);
      } else {
        setMlAccountConnected(false);
        setMlSellerId(null);
      }

    } catch (err: any) {
      console.error("Critical error in loadData:", err);
      try {
        toast.error('Error al cargar datos logísticos: ' + err.message);
      } catch (e) {
        console.error("Toast error:", e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const saveBasicSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ shipping_settings: shippingData })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Configuración básica guardada');
    } catch (err: any) {
      toast.error('Error al guardar básicos: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (section: keyof typeof shippingData, field: string, value: any) => {
    setShippingData(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const updateConnection = (provider: string, field: string, value: any) => {
    setConnections(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }));
  };

  // EDGE FUNCTION CALLS
  const testConnection = async (provider: string) => {
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const authToken = session.data.session?.access_token;
      
      let credentials = {};
      const connObj = connections[provider];
      if (provider === 'dac') {
        credentials = { 
          username: connObj.username, 
          password: connObj.password,
          token: connObj.token,
          apiKey: connObj.apiKey 
        };
      } else if (provider === 'soydelivery') {
        credentials = { 
          apiKey: connObj.apiKey, 
          secret: connObj.secret,
          token: connObj.token 
        };
      } else if (provider === 'ues') {
        credentials = { 
          username: connObj.username, 
          password: connObj.password,
          apiKey: connObj.apiKey,
          token: connObj.token 
        };
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-shipping-test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ provider, credentials })
      });
      const responseData = await res.json();
      if (!responseData.success) throw new Error(responseData.error || "Error de conexión");
      
      toast.success(responseData.message);
    } catch (err: any) {
      toast.error("Error en test: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveConnection = async (provider: string) => {
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const authToken = session.data.session?.access_token;
      
      let payload = {};
      const connObj = connections[provider];
      
      if (provider === 'dac') {
        payload = {
          provider: 'dac',
          account_name: connObj.account_name,
          credentials: { 
            username: connObj.username, 
            password: connObj.password,
            token: connObj.token,
            apiKey: connObj.apiKey 
          },
          settings: { clientId: connObj.clientId, agencyCode: connObj.agencyCode, cutoff: connObj.cutoff },
          pickup_address: { address: connObj.address, department: connObj.department, city: connObj.city, phone: connObj.phone }
        };
      } else if (provider === 'soydelivery') {
        payload = {
          provider: 'soydelivery',
          account_name: connObj.account_name,
          credentials: { 
            apiKey: connObj.apiKey, 
            secret: connObj.secret,
            token: connObj.token 
          },
          settings: { cutoff: connObj.cutoff, days_active: connObj.days_active, zone: connObj.zone },
          pickup_address: { address: connObj.address, phone: connObj.phone }
        };
      } else if (provider === 'ues') {
        payload = {
          provider: 'ues',
          account_name: connObj.account_name,
          credentials: { 
            username: connObj.username, 
            password: connObj.password,
            apiKey: connObj.apiKey,
            token: connObj.token 
          },
          settings: { cutoff: connObj.cutoff },
          pickup_address: { address: connObj.address, department: connObj.department, city: connObj.city, phone: connObj.phone }
        };
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-shipping-save-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      const responseData = await res.json();
      if (!responseData.success) throw new Error(responseData.error);

      // Limpiar contraseñas/secretos del state local por seguridad
      updateConnection(provider, 'username', '');
      updateConnection(provider, 'password', '');
      updateConnection(provider, 'apiKey', '');
      updateConnection(provider, 'secret', '');
      updateConnection(provider, 'token', '');
      
      updateConnection(provider, 'status', responseData.connection.connection_status);
      updateConnection(provider, 'last_tested_at', responseData.connection.last_tested_at);

      toast.success(`${provider.toUpperCase()} guardado y conectado correctamente`);
    } catch (err: any) {
      toast.error("Error al guardar conexión: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnectProvider = async (provider: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendor_shipping_connections')
        .delete()
        .match({ vendor_id: user?.id, provider });
      if (error) throw error;
      updateConnection(provider, 'status', 'disconnected');
      updateConnection(provider, 'last_tested_at', null);
      toast.success(`${provider.toUpperCase()} desconectado.`);
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // CRUD Direcciones de Despacho
  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingAddress(true);
    try {
      const { data, error } = await supabase
        .from('vendor_dispatch_addresses')
        .insert({
          vendor_id: user.id,
          name: newAddress.name,
          address: newAddress.address,
          city: newAddress.city,
          department: newAddress.department,
          postal_code: newAddress.postal_code || null,
          phone: newAddress.phone || null,
          is_default: newAddress.is_default
        })
        .select()
        .single();
      if (error) throw error;
      
      toast.success('Dirección de despacho agregada');
      setShowAddressForm(false);
      setNewAddress({
        name: '',
        address: '',
        city: '',
        department: 'Montevideo',
        postal_code: '',
        phone: '',
        is_default: false
      });
      loadData();
    } catch (err: any) {
      toast.error('Error al agregar dirección: ' + err.message);
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta dirección de despacho?')) return;
    try {
      const { error } = await supabase
        .from('vendor_dispatch_addresses')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Dirección de despacho eliminada');
      loadData();
    } catch (err: any) {
      toast.error('Error al eliminar dirección: ' + err.message);
    }
  };

  const handleSetDefaultAddress = async (id: string) => {
    try {
      const { error } = await supabase
        .from('vendor_dispatch_addresses')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
      toast.success('Dirección predeterminada actualizada');
      loadData();
    } catch (err: any) {
      toast.error('Error al actualizar: ' + err.message);
    }
  };

  // ML Wizard (Based on Connected Accounts)
  const runMlWizard = async () => {
    setWizardLoading(true);
    setShowMlWizard(true);
    setWizardResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token || '';

      const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          action: 'get_shipping_onboarding', 
          seller_id: mlSellerId 
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al obtener datos de onboarding');
      }

      setWizardResult({
        pickup: data.pickup,
        shippingMode: data.shippingMode,
        logisticType: data.logisticType,
        location: data.location || 'No detectado',
        shippingTags: data.shippingTags || [],
        address: data.address || null
      });
    } catch (err: any) {
      toast.error('Error al detectar logística: ' + err.message);
      setWizardResult({
        pickup: false,
        shippingMode: null,
        logisticType: null,
        location: 'No detectado',
        shippingTags: [],
        address: null
      });
    } finally {
      setWizardLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    const days = connections.soydelivery.days_active || [];
    const newDays = days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day];
    updateConnection('soydelivery', 'days_active', newDays);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando configuración de envíos...</div>;

  return (
    <div className="max-w-5xl space-y-8 pb-20 animate-fade-in">
      <div className="flex justify-between items-end border-b border-gray-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Configuración de Logística (BYOC)</h2>
          <p className="text-sm text-gray-500 mt-2">Conectá tus propias cuentas logísticas para facturación, etiquetas y envíos directos.</p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm shadow-sm"
          >
            <Eye className="w-4 h-4 text-gray-500" /> Ver preview de etiqueta
          </button>
          <button 
            onClick={saveBasicSettings} 
            disabled={saving} 
            className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm shadow-sm"
          >
            Guardar Básicos
          </button>
        </div>
      </div>

      {/* SEGURIDAD INFO */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-sm text-slate-700">
        <Shield className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Privacidad y Seguridad de BYOC</span>
          <p className="mt-1 text-slate-600">
            Tus credenciales y claves API se encriptan de forma segura usando AES-GCM (en base a tu clave de encriptación única). Ningún administrador ni personal externo tiene acceso para leer tus claves en texto plano.
          </p>
        </div>
      </div>

      <div className="space-y-8">

        {/* SECCIÓN DIRECCIONES DE DESPACHO */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-600" />
                Direcciones de Despacho (Remitente)
              </h3>
              <p className="text-sm text-gray-500 mt-1">Configurá las direcciones que se utilizarán como origen en tus etiquetas logísticas.</p>
            </div>
            <button 
              onClick={() => setShowAddressForm(!showAddressForm)}
              className="flex items-center gap-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg transition-colors border border-gray-200"
            >
              <Plus className="w-4 h-4" />
              Nueva Dirección
            </button>
          </div>

          {showAddressForm && (
            <form onSubmit={handleAddAddress} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50/50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nombre Descriptivo (ej: Depósito Principal)</label>
                  <input required type="text" value={newAddress.name} onChange={(e) => setNewAddress(p => ({ ...p, name: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Dirección de Despacho (Calle y Nro)</label>
                  <input required type="text" value={newAddress.address} onChange={(e) => setNewAddress(p => ({ ...p, address: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Ciudad</label>
                  <input required type="text" value={newAddress.city} onChange={(e) => setNewAddress(p => ({ ...p, city: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Departamento</label>
                  <select value={newAddress.department} onChange={(e) => setNewAddress(p => ({ ...p, department: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg bg-white">
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Código Postal</label>
                  <input type="text" value={newAddress.postal_code} onChange={(e) => setNewAddress(p => ({ ...p, postal_code: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono de Contacto</label>
                  <input type="text" value={newAddress.phone} onChange={(e) => setNewAddress(p => ({ ...p, phone: e.target.value }))} className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_default" checked={newAddress.is_default} onChange={(e) => setNewAddress(p => ({ ...p, is_default: e.target.checked }))} className="rounded text-black focus:ring-black" />
                <label htmlFor="is_default" className="text-xs font-medium text-gray-700 cursor-pointer select-none">Establecer como dirección predeterminada</label>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowAddressForm(false)} className="text-xs px-4 py-2 bg-white border rounded-lg">Cancelar</button>
                <button type="submit" disabled={savingAddress} className="text-xs px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50">
                  {savingAddress ? 'Guardando...' : 'Guardar Dirección'}
                </button>
              </div>
            </form>
          )}

          {dispatchAddresses.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 border border-dashed rounded-lg">
              No tenés direcciones de despacho configuradas. Agregá una para usar como origen.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dispatchAddresses.map(addr => (
                <div key={addr.id} className={`p-4 border rounded-xl relative ${addr.is_default ? 'border-black bg-gray-50/30' : 'border-gray-200'}`}>
                  {addr.is_default && (
                    <span className="absolute top-3 right-3 bg-black text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded tracking-wide">
                      Predeterminado
                    </span>
                  )}
                  <div className="font-bold text-gray-800 text-sm">{addr.name}</div>
                  <div className="text-xs text-gray-600 mt-2 space-y-0.5">
                    <div>{addr.address}</div>
                    <div>{addr.city}, {addr.department} {addr.postal_code ? `(${addr.postal_code})` : ''}</div>
                    {addr.phone && <div>Teléfono: {addr.phone}</div>}
                  </div>
                  <div className="flex gap-3 mt-4 border-t pt-3 border-gray-100">
                    {!addr.is_default && (
                      <button 
                        onClick={() => handleSetDefaultAddress(addr.id)}
                        className="text-[10px] font-bold text-black hover:underline flex items-center gap-0.5"
                      >
                        <Check className="w-3.5 h-3.5" /> Predeterminado
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-0.5 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MERCADO LIBRE LOGISTICS ASSISTANT */}
        {mlAccountConnected && (
          <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Asistente de Configuración desde Mercado Libre
                </h3>
                <p className="text-sm text-indigo-700 mt-1">
                  Detectá automáticamente tus zonas de cobertura y métodos activos de Mercado Libre para onboarding rápido.
                </p>
              </div>
              <button 
                onClick={runMlWizard}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 transition-colors shadow-sm self-start md:self-center flex items-center gap-1.5"
              >
                Detectar Logística
              </button>
            </div>

            {showMlWizard && (
              <div className="mt-6 border-t border-indigo-100 pt-6">
                {wizardLoading ? (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analizando local_pick_up, shipping.mode, logistic_type y seller address...
                  </div>
                ) : wizardResult && (
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg border border-indigo-100 space-y-2 text-xs">
                      <div className="font-bold text-indigo-900 border-b border-indigo-50 pb-2 mb-2">Datos Detectados en Mercado Libre:</div>
                      <div className="grid grid-cols-2 gap-2 text-gray-700">
                        <div><span className="font-semibold">Retiro Local:</span> {wizardResult.pickup ? '✓ Habilitado (local_pick_up)' : '✗ Deshabilitado'}</div>
                        <div><span className="font-semibold">Modo Envío:</span> {wizardResult.shippingMode || 'No detectado'}</div>
                        <div><span className="font-semibold">Logística:</span> {wizardResult.logisticType || 'No detectado'}</div>
                        <div><span className="font-semibold">Zona Vendedor:</span> {wizardResult.location}</div>
                        <div>
                          <span className="font-semibold">Dirección Comercial:</span>{' '}
                          {wizardResult.address ? (
                            wizardResult.address
                          ) : (
                            <span className="text-red-500 font-bold block mt-1">
                              ⚠️ No pudimos detectar dirección de despacho desde Mercado Libre. Configurá una dirección manualmente.
                            </span>
                          )}
                        </div>
                        <div><span className="font-semibold">Tags Especiales:</span> {wizardResult.shippingTags?.join(', ') || 'Ninguno'}</div>
                      </div>
                    </div>
                    
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-800">
                      <div className="font-bold mb-1">Recomendamos Conectar:</div>
                      <p className="mb-3">En base a tu ubicación en {wizardResult.location} y tu logística activa, te sugerimos activar los siguientes couriers en tu panel:</p>
                      {(() => {
                        const suggestions = [];
                        const tags = wizardResult.shippingTags || [];
                        const mode = wizardResult.shippingMode;
                        const hasFlex = tags.includes('flex') || tags.includes('envios_rapidos');
                        const pickup = wizardResult.pickup;

                        if (mode === 'me2') {
                          suggestions.push({ name: 'DAC (Recomendado)', href: '#dac-form' });
                          suggestions.push({ name: 'UES (Estándar)', href: '#ues-form' });
                        }
                        if (hasFlex) {
                          suggestions.push({ name: 'SoyDelivery (Flex)', href: '#soydelivery-form' });
                        }
                        if (pickup) {
                          suggestions.push({ name: 'Retiro en Local', href: '#pickup-section' });
                        }

                        if (suggestions.length === 0) {
                          return <div className="text-amber-700 font-bold">⚠️ Sugerencia pendiente de confirmar. Por favor revisa manualmente.</div>;
                        }

                        return (
                          <div className="flex flex-wrap gap-2">
                            {suggestions.map((s, idx) => (
                              <a key={idx} href={s.href} className="bg-emerald-600 text-white font-bold px-3 py-1.5 rounded hover:bg-emerald-700">
                                Conectar {s.name}
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* BASIC SETTINGS PICKUP / MANUAL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* RETIRO / PICKUP */}
          <div className={`border rounded-xl p-6 transition-all bg-white shadow-sm ${shippingData.pickup.active ? 'border-black' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${shippingData.pickup.active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Retiro / Pickup en Tienda</h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Permite retirar directo en tu local físico.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={shippingData.pickup.active} onChange={(e) => updateSection('pickup', 'active', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>

            {shippingData.pickup.active && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Dirección Física de Retiro</label>
                  <input type="text" value={shippingData.pickup.address} onChange={(e) => updateSection('pickup', 'address', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Av Italia 1234" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Ciudad</label>
                    <input type="text" value={shippingData.pickup.city} onChange={(e) => updateSection('pickup', 'city', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Departamento</label>
                    <select value={shippingData.pickup.department} onChange={(e) => updateSection('pickup', 'department', e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Teléfono Comercial</label>
                    <input type="text" value={shippingData.pickup.phone} onChange={(e) => updateSection('pickup', 'phone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Horarios de Retiro</label>
                    <input type="text" value={shippingData.pickup.hours} onChange={(e) => updateSection('pickup', 'hours', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Lun a Vie 10 a 18" />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Instrucciones Adicionales</label>
                  <textarea rows={2} value={shippingData.pickup.instructions} onChange={(e) => updateSection('pickup', 'instructions', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Tocar timbre azul, etc." />
                </div>
              </div>
            )}
          </div>

          {/* ENVÍO MANUAL / COORDINADO */}
          <div className={`border rounded-xl p-6 transition-all bg-white shadow-sm ${shippingData.manual.active ? 'border-black' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${shippingData.manual.active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Envío Manual / Cadetería</h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Cadetería propia o envíos a coordinar.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={shippingData.manual.active} onChange={(e) => updateSection('manual', 'active', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
              </label>
            </div>

            {shippingData.manual.active && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nombre del Método (ej: Envíos en Ciudad de la Costa)</label>
                  <input type="text" value={shippingData.manual.method_name} onChange={(e) => updateSection('manual', 'method_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Costo Fijo (UYU)</label>
                    <input type="number" value={shippingData.manual.fixed_cost} onChange={(e) => updateSection('manual', 'fixed_cost', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Tiempo Estimado (ej: 24 - 48 hs)</label>
                    <input type="text" value={shippingData.manual.estimated_time} onChange={(e) => updateSection('manual', 'estimated_time', e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Instrucciones de Despacho</label>
                  <textarea rows={3} value={shippingData.manual.instructions} onChange={(e) => updateSection('manual', 'instructions', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Coordinación telefónica post-venta." />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COURIER INTEGRATIONS TITLE */}
        <h3 className="text-xl font-bold text-gray-900 mt-12 mb-4 border-b pb-2 border-gray-200">
          Integraciones Logísticas de Cuentas Propias (BYOC)
        </h3>

        {/* DAC INTEGRATION */}
        <div id="dac-form" className={`border rounded-xl p-6 transition-all bg-white shadow-sm ${connections.dac.status === 'connected' ? 'border-[#00388B]' : 'border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${connections.dac.status === 'connected' ? 'bg-[#00388B] text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">DAC (Agencia Central)</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-lg">Envíos nacionales con tracking y pegotes nativos desde tu propia cuenta comercial de DAC.</p>
              </div>
            </div>
            {connections.dac.status === 'connected' ? (
              <div className="flex flex-col items-end gap-1 text-xs">
                <span className="flex items-center gap-1 font-bold text-green-600"><CheckCircle className="w-4 h-4"/> Conectado</span>
                <span className="text-[10px] text-gray-500">Prueba: {new Date(connections.dac.last_tested_at).toLocaleDateString()}</span>
                <button onClick={() => disconnectProvider('dac')} className="text-[10px] text-red-600 font-bold mt-1 hover:underline">Desconectar</button>
              </div>
            ) : (
              (wizardResult?.shippingMode === 'me2') ? (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded uppercase tracking-wider self-start">
                  DAC recomendado / pendiente conexión
                </span>
              ) : (
                <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase self-start">Desconectado</span>
              )
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block font-bold text-gray-700 mb-1">Nombre de cuenta (interno)</label><input type="text" value={connections.dac.account_name} onChange={(e) => updateConnection('dac', 'account_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="DAC Tienda Principal" /></div>
              
              {connections.dac.status !== 'connected' && (
                <>
                  <div><label className="block font-bold text-gray-700 mb-1">Usuario DAC API (wsLogin)</label><input type="text" value={connections.dac.username} onChange={(e) => updateConnection('dac', 'username', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Contraseña DAC API</label><input type="password" value={connections.dac.password} onChange={(e) => updateConnection('dac', 'password', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Token DAC</label><input type="text" value={connections.dac.token} onChange={(e) => updateConnection('dac', 'token', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">API Key DAC</label><input type="password" value={connections.dac.apiKey} onChange={(e) => updateConnection('dac', 'apiKey', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </>
              )}
              
              <div><label className="block font-bold text-gray-700 mb-1">Código de Cliente (KCliente)</label><input type="text" value={connections.dac.clientId} onChange={(e) => updateConnection('dac', 'clientId', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
              <div><label className="block font-bold text-gray-700 mb-1">Código de Oficina/Agencia Origen</label><input type="text" value={connections.dac.agencyCode} onChange={(e) => updateConnection('dac', 'agencyCode', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
              
              <div className="md:col-span-2 border-t pt-4 mt-2">
                <span className="block font-bold text-gray-900 mb-3 text-sm">Dirección de Retiro / Oficina DAC</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block font-semibold text-gray-700 mb-1">Calle y Nro</label><input type="text" value={connections.dac.address} onChange={(e) => updateConnection('dac', 'address', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Departamento</label><input type="text" value={connections.dac.department} onChange={(e) => updateConnection('dac', 'department', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Ciudad</label><input type="text" value={connections.dac.city} onChange={(e) => updateConnection('dac', 'city', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Teléfono</label><input type="text" value={connections.dac.phone} onChange={(e) => updateConnection('dac', 'phone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Horario de Corte</label><input type="time" value={connections.dac.cutoff} onChange={(e) => updateConnection('dac', 'cutoff', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex gap-3 border-t pt-4">
              <button type="button" onClick={() => testConnection('dac')} disabled={saving} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold disabled:opacity-50">Probar Conexión</button>
              <button type="button" onClick={() => saveConnection('dac')} disabled={saving} className="bg-[#00388B] text-white px-4 py-2 rounded-lg font-bold hover:opacity-90 disabled:opacity-50">
                {connections.dac.status === 'connected' ? 'Guardar Conexión' : 'Conectar DAC'}
              </button>
            </div>
          </div>
        </div>

        {/* UES INTEGRATION */}
        <div id="ues-form" className={`border rounded-xl p-6 transition-all bg-white shadow-sm ${connections.ues.status === 'connected' ? 'border-[#008080]' : 'border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${connections.ues.status === 'connected' ? 'bg-[#008080] text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">UES</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-lg">Configurá las credenciales API de UES para despachar mediante la red de pick centers y entregas a domicilio.</p>
              </div>
            </div>
            {connections.ues.status === 'connected' ? (
              <div className="flex flex-col items-end gap-1 text-xs">
                <span className="flex items-center gap-1 font-bold text-green-600"><CheckCircle className="w-4 h-4"/> Conectado</span>
                <span className="text-[10px] text-gray-500">Prueba: {new Date(connections.ues.last_tested_at).toLocaleDateString()}</span>
                <button onClick={() => disconnectProvider('ues')} className="text-[10px] text-red-600 font-bold mt-1 hover:underline">Desconectar</button>
              </div>
            ) : (
              <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase self-start">Desconectado</span>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block font-bold text-gray-700 mb-1">Nombre de cuenta (interno)</label><input type="text" value={connections.ues.account_name} onChange={(e) => updateConnection('ues', 'account_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="UES Cuenta Principal" /></div>
              
              {connections.ues.status !== 'connected' && (
                <>
                  <div><label className="block font-bold text-gray-700 mb-1">Usuario UES</label><input type="text" value={connections.ues.username} onChange={(e) => updateConnection('ues', 'username', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Password UES</label><input type="password" value={connections.ues.password} onChange={(e) => updateConnection('ues', 'password', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">API Key UES</label><input type="password" value={connections.ues.apiKey} onChange={(e) => updateConnection('ues', 'apiKey', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Token UES</label><input type="text" value={connections.ues.token} onChange={(e) => updateConnection('ues', 'token', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </>
              )}

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <span className="block font-bold text-gray-900 mb-3 text-sm">Dirección de Retiro UES</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block font-semibold text-gray-700 mb-1">Calle y Nro</label><input type="text" value={connections.ues.address} onChange={(e) => updateConnection('ues', 'address', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Departamento</label><input type="text" value={connections.ues.department} onChange={(e) => updateConnection('ues', 'department', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Ciudad</label><input type="text" value={connections.ues.city} onChange={(e) => updateConnection('ues', 'city', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Teléfono</label><input type="text" value={connections.ues.phone} onChange={(e) => updateConnection('ues', 'phone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Horario de Corte</label><input type="time" value={connections.ues.cutoff} onChange={(e) => updateConnection('ues', 'cutoff', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 border-t pt-4">
              <button type="button" onClick={() => testConnection('ues')} disabled={saving} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold disabled:opacity-50">Probar Conexión</button>
              <button type="button" onClick={() => saveConnection('ues')} disabled={saving} className="bg-[#008080] text-white px-4 py-2 rounded-lg font-bold hover:opacity-90 disabled:opacity-50">Guardar Conexión</button>
            </div>
          </div>
        </div>

        {/* SOYDELIVERY INTEGRATION */}
        <div id="soydelivery-form" className={`border rounded-xl p-6 transition-all bg-white shadow-sm ${connections.soydelivery.status === 'connected' ? 'border-[#FF4500]' : 'border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${connections.soydelivery.status === 'connected' ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-500'}`}>
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">SoyDelivery</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-lg">Envíos express e inmediatos en el día (Flex) integrando tus credenciales de negocio.</p>
              </div>
            </div>
            {connections.soydelivery.status === 'connected' ? (
              <div className="flex flex-col items-end gap-1 text-xs">
                <span className="flex items-center gap-1 font-bold text-green-600"><CheckCircle className="w-4 h-4"/> Conectado</span>
                <span className="text-[10px] text-gray-500">Prueba: {new Date(connections.soydelivery.last_tested_at).toLocaleDateString()}</span>
                <button onClick={() => disconnectProvider('soydelivery')} className="text-[10px] text-red-600 font-bold mt-1 hover:underline">Desconectar</button>
              </div>
            ) : (
              <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase self-start">Desconectado</span>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block font-bold text-gray-700 mb-1">Nombre de cuenta (interno)</label><input type="text" value={connections.soydelivery.account_name} onChange={(e) => updateConnection('soydelivery', 'account_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="SoyDelivery Express" /></div>
              
              {connections.soydelivery.status !== 'connected' && (
                <>
                  <div><label className="block font-bold text-gray-700 mb-1">API Key</label><input type="password" value={connections.soydelivery.apiKey} onChange={(e) => updateConnection('soydelivery', 'apiKey', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Negocio ID / Client ID (si aplica)</label><input type="text" value={connections.soydelivery.clientId} onChange={(e) => updateConnection('soydelivery', 'clientId', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Secret / Negocio Clave</label><input type="password" value={connections.soydelivery.secret} onChange={(e) => updateConnection('soydelivery', 'secret', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-bold text-gray-700 mb-1">Token adicional</label><input type="text" value={connections.soydelivery.token} onChange={(e) => updateConnection('soydelivery', 'token', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                </>
              )}

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <span className="block font-bold text-gray-900 mb-3 text-sm">Dirección de Retiro y Zonas</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className="block font-semibold text-gray-700 mb-1">Dirección de retiro</label><input type="text" value={connections.soydelivery.address} onChange={(e) => updateConnection('soydelivery', 'address', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Barrio / zona habilitada</label><input type="text" value={connections.soydelivery.zone} onChange={(e) => updateConnection('soydelivery', 'zone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Teléfono</label><input type="text" value={connections.soydelivery.phone} onChange={(e) => updateConnection('soydelivery', 'phone', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block font-semibold text-gray-700 mb-1">Horario de corte</label><input type="time" value={connections.soydelivery.cutoff} onChange={(e) => updateConnection('soydelivery', 'cutoff', e.target.value)} className="w-full px-3 py-2 border rounded-lg" /></div>
                  
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-gray-700 mb-2">Días habilitados</label>
                    <div className="flex flex-wrap gap-2">
                      {[{ id: 'Mon', label: 'Lunes' }, { id: 'Tue', label: 'Martes' }, { id: 'Wed', label: 'Miércoles' }, { id: 'Thu', label: 'Jueves' }, { id: 'Fri', label: 'Viernes' }, { id: 'Sat', label: 'Sábado' }, { id: 'Sun', label: 'Domingo' }].map(day => (
                        <button 
                          type="button" 
                          key={day.id} 
                          onClick={() => toggleDay(day.id)} 
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${connections.soydelivery.days_active.includes(day.id) ? 'bg-[#FF4500] text-white border-[#FF4500]' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 border-t pt-4">
              <button type="button" onClick={() => setShowPreviewModal(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold">Vista previa etiqueta</button>
              <button type="button" onClick={() => testConnection('soydelivery')} disabled={saving} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold disabled:opacity-50">Probar Conexión</button>
              <button type="button" onClick={() => saveConnection('soydelivery')} disabled={saving} className="bg-[#FF4500] text-white px-4 py-2 rounded-lg font-bold hover:opacity-90 disabled:opacity-50">Guardar Conexión</button>
            </div>
          </div>
        </div>

      </div>

      {showPreviewModal && vendorObj && (
        <VendorLabelPreviewModal
          vendor={vendorObj}
          defaultAddress={dispatchAddresses.find(a => a.is_default) || null}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
}
