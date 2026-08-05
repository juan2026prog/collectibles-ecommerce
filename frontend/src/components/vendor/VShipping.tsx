import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { 
  Truck, Store, Package, AlertTriangle, CheckCircle, XCircle, 
  MapPin, Plus, Trash2, Shield, Settings, Info, Check, RefreshCw, Sparkles, Eye, Sliders 
} from 'lucide-react';
import VendorLabelPreviewModal from './VendorLabelPreviewModal';
import VDistrilogicIntegration from './VDistrilogicIntegration';
import VDacIntegrationModal from './VDacIntegrationModal';
import VSoyDeliveryIntegrationModal from './VSoyDeliveryIntegrationModal';
import { isLocationInSoyDeliveryZone, isSoyDeliveryAvailableForVendor } from '../../utils/uruguayLocations';

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
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      const focus = searchParams.get('focus');
      if (focus === 'dispatch-address') {
        setTimeout(() => {
          const el = document.getElementById('dispatch-address-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else if (focus === 'shipping-methods') {
        setTimeout(() => {
          const el = document.getElementById('shipping-methods-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, [loading, searchParams]);

  // 1. Settings en vendors.shipping_settings (Centralized Collectibles Envíos + Pickup/Manual)
  const [shippingData, setShippingData] = useState({
    dac: {
      active: false,
      dispatch_address: '',
      city: '',
      department: 'Montevideo',
      phone: '',
      hours: '',
      preferred_agency: '',
      allow_pickup_agency: true,
      allow_home_delivery: true
    },
    ues: { active: false },
    soydelivery: { active: false },
    correo_uruguayo: { active: false },
    pickup: { active: false, address: '', department: 'Montevideo', city: '', phone: '', hours: '', instructions: '' },
    manual: { active: false, method_name: '', fixed_cost: '', instructions: '', estimated_time: '' },
    free_shipping: { active: false, min_amount: '' },
    cutoff_time: '14:00',
    dispatch_days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    preparation_days: 0
  });
  const [globalProviders, setGlobalProviders] = useState<any[]>([]);
  const [dacOffices, setDacOffices] = useState<any[]>([]);

  // 2. Direcciones de Despacho (Remitente)
  const [dispatchAddresses, setDispatchAddresses] = useState<DispatchAddress[]>([]);
  const defaultAddress = dispatchAddresses.find(a => a.is_default);
  const isSoyDeliveryAvailable = defaultAddress 
    ? isLocationInSoyDeliveryZone(defaultAddress.department, defaultAddress.city) 
    : false;
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

  // 3. ML Logistics Assistant Wizard
  const [mlAccountConnected, setMlAccountConnected] = useState(false);
  const [mlSellerId, setMlSellerId] = useState<string | null>(null);
  const [showMlWizard, setShowMlWizard] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardResult, setWizardResult] = useState<any>(null);
  const [mlNickname, setMlNickname] = useState('');

  // 4. Vendor settings preview states
  const [vendorObj, setVendorObj] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // 5. Distrilogic BYOC connection state
  const [distrilogicConn, setDistrilogicConn] = useState<any>(null);
  const [showDistrilogicModal, setShowDistrilogicModal] = useState(false);
  const [distrilogicModalTab, setDistrilogicModalTab] = useState<'credentials' | 'services'>('credentials');

  // 6. DAC Hybrid connection state
  const [dacConn, setDacConn] = useState<any>(null);
  const [showDacModal, setShowDacModal] = useState(false);

  // 7. SoyDelivery BYOC connection state
  const [soyDeliveryConn, setSoyDeliveryConn] = useState<any>(null);
  const [showSoyDeliveryModal, setShowSoyDeliveryModal] = useState(false);

  const departments = [
    'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 
    'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 
    'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 
    'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'
  ];

  const getSoyDeliveryBadge = () => {
    if (!soyDeliveryConn) {
      return { text: 'No configurado', class: 'bg-gray-100 text-gray-700 border border-gray-200' };
    }
    if (soyDeliveryConn.connection_status === 'connected' && soyDeliveryConn.enabled) {
      return { text: 'Conectado', class: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    }
    if (soyDeliveryConn.connection_status === 'error') {
      return { text: 'Error de conexión', class: 'bg-red-100 text-red-800 border border-red-200' };
    }
    if (!soyDeliveryConn.enabled) {
      return { text: 'Desactivado', class: 'bg-amber-100 text-amber-800 border border-amber-200' };
    }
    return { text: 'Configurado', class: 'bg-blue-100 text-blue-800 border border-blue-200' };
  };

  const loadData = async () => {
    if (!user) return;
    try {
      // Run queries in parallel
      const [vendorRes, addrRes, mlRes, provRes, distrilogicRes, dacRes, soyDeliveryRes] = await Promise.all([
        supabase
          .from('vendors')
          .select('store_name, logo_url, slug, contact_phone, pickup_address, shipping_settings')
          .eq('id', user.id)
          .single()
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
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('shipping_providers')
          .select('code, name, is_active, status')
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('vendor_shipping_connections')
          .select('*')
          .eq('vendor_id', user.id)
          .eq('provider', 'distrilogic')
          .maybeSingle()
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('vendor_shipping_connections')
          .select('*')
          .eq('vendor_id', user.id)
          .eq('provider', 'dac')
          .maybeSingle()
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err })),

        supabase
          .from('vendor_shipping_connections')
          .select('*')
          .eq('vendor_id', user.id)
          .eq('provider', 'soydelivery')
          .maybeSingle()
          .then(res => ({ success: true, data: res.data, error: res.error }))
          .catch(err => ({ success: false, data: null, error: err }))
      ]);

      if (distrilogicRes?.success) {
        setDistrilogicConn(distrilogicRes.data);
      } else {
        setDistrilogicConn(null);
      }

      if (dacRes?.success) {
        setDacConn(dacRes.data);
      } else {
        setDacConn(null);
      }

      if (soyDeliveryRes?.success) {
        setSoyDeliveryConn(soyDeliveryRes.data);
      } else {
        setSoyDeliveryConn(null);
      }

      // Process providers result
      if (provRes.success && provRes.data) {
        setGlobalProviders(provRes.data);
      }

      // Process dispatch addresses result first
      let loadedAddresses = [];
      if (addrRes.success && addrRes.data) {
        setDispatchAddresses(addrRes.data);
        loadedAddresses = addrRes.data;
      } else if (addrRes.error) {
        console.error("Error loading dispatch addresses:", addrRes.error);
      }

      // Process vendor result
      if (vendorRes.success && vendorRes.data) {
        setVendorObj(vendorRes.data);
        if (vendorRes.data.shipping_settings) {
          const s = vendorRes.data.shipping_settings as any;
          const defaultAddr = loadedAddresses.find((a: any) => a.is_default);
          const isSDAvail = defaultAddr ? isLocationInSoyDeliveryZone(defaultAddr.department, defaultAddr.city) : false;

          setShippingData({
            dac: {
              active: s.dac?.active || false,
              dispatch_address: s.dac?.dispatch_address || '',
              city: s.dac?.city || '',
              department: s.dac?.department || 'Montevideo',
              phone: s.dac?.phone || '',
              hours: s.dac?.hours || '',
              preferred_agency: s.dac?.preferred_agency || '',
              allow_pickup_agency: s.dac?.allow_pickup_agency !== undefined ? s.dac.allow_pickup_agency : true,
              allow_home_delivery: s.dac?.allow_home_delivery !== undefined ? s.dac.allow_home_delivery : true
            },
            ues: { active: s.ues?.active || false },
            soydelivery: { active: isSDAvail ? (s.soydelivery?.active || false) : false },
            correo_uruguayo: { active: s.correo_uruguayo?.active || false },
            pickup: {
              active: s.pickup?.active || false,
              address: s.pickup?.address || '',
              department: s.pickup?.department || 'Montevideo',
              city: s.pickup?.city || '',
              phone: s.pickup?.phone || '',
              hours: s.pickup?.hours || '',
              instructions: s.pickup?.instructions || ''
            },
            manual: {
              active: s.manual?.active || false,
              method_name: s.manual?.method_name || '',
              fixed_cost: s.manual?.fixed_cost || '',
              instructions: s.manual?.instructions || '',
              estimated_time: s.manual?.estimated_time || ''
            },
            free_shipping: {
              active: s.free_shipping?.active || false,
              min_amount: s.free_shipping?.min_amount !== undefined && s.free_shipping?.min_amount !== null ? String(s.free_shipping.min_amount) : ''
            },
            cutoff_time: s.cutoff_time || '14:00',
            dispatch_days: Array.isArray(s.dispatch_days) ? s.dispatch_days : ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
          });
        }
      } else if (vendorRes.error) {
        console.error("Error loading vendor profile:", vendorRes.error);
        toast.error("Error al cargar perfil de vendedor");
      }

      // Fetch active dac offices
      const { data: offices } = await supabase
        .from('dac_offices')
        .select('k_oficina, office_name, city, department')
        .eq('is_active', true)
        .order('office_name', { ascending: true });
      if (offices) {
        setDacOffices(offices);
      }

      // Process ML account result
      if (mlRes.success && mlRes.data) {
        setMlAccountConnected(true);
        setMlSellerId(mlRes.data.seller_id || null);
      } else {
        setMlAccountConnected(false);
        setMlSellerId(null);
      }

    } catch (err: any) {
      console.error("Critical error in loadData:", err);
      toast.error('Error al cargar datos logísticos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const saveShippingSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const finalShippingData = {
        ...shippingData,
        soydelivery: { active: isSoyDeliveryAvailable ? shippingData.soydelivery.active : false },
        free_shipping: {
          active: shippingData.free_shipping.active,
          min_amount: shippingData.free_shipping.min_amount !== '' ? Number(shippingData.free_shipping.min_amount) : 0
        }
      };

      const { error } = await supabase
        .from('vendors')
        .update({ shipping_settings: finalShippingData })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Configuración de Collectibles Envíos guardada correctamente');
    } catch (err: any) {
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isProviderActive = (code: string) => {
    return globalProviders.some(p => p.code === code && p.is_active && p.status === 'active');
  };

  const getDistrilogicBadge = () => {
    if (!distrilogicConn) return { text: 'No configurado', class: 'bg-gray-100 text-gray-700 border border-gray-200' };
    const status = distrilogicConn.connection_status;
    if (status === 'disabled') return { text: 'Desactivado', class: 'bg-slate-100 text-slate-700 border border-slate-200' };
    if (status === 'error') return { text: 'Error de conexión', class: 'bg-red-100 text-red-800 border border-red-200' };
    if (status === 'connected' && distrilogicConn.last_tested_at) return { text: 'Conectado', class: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    if (status === 'connected') return { text: 'Configurado', class: 'bg-blue-100 text-blue-800 border border-blue-200' };
    return { text: 'No configurado', class: 'bg-gray-100 text-gray-700 border border-gray-200' };
  };

  const toggleMethod = (method: 'dac' | 'ues' | 'soydelivery' | 'correo_uruguayo' | 'pickup' | 'manual') => {
    if (!isProviderActive(method)) {
      toast.error("Este transportista no está activo globalmente.");
      return;
    }
    if (method === 'soydelivery' && !isSoyDeliveryAvailable) {
      toast.error("SoyDelivery/Flex no está disponible fuera de la zona de cobertura.");
      return;
    }
    setShippingData(prev => ({
      ...prev,
      [method]: { ...prev[method], active: !prev[method].active }
    }));
  };

  const updateSection = (section: 'dac' | 'pickup' | 'manual' | 'free_shipping', field: string, value: any) => {
    setShippingData(prev => ({ 
      ...prev, 
      [section]: { ...prev[section], [field]: value } 
    }));
  };

  // CRUD Direcciones de Despacho
  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingAddress(true);
    try {
      const { error } = await supabase
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
        });
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

  const applyWizardSuggestions = () => {
    if (!wizardResult) return;
    const tags = wizardResult.shippingTags || [];
    const mode = wizardResult.shippingMode;
    const hasFlex = (tags.includes('flex') || tags.includes('envios_rapidos')) && isSoyDeliveryAvailable;
    const hasPickup = wizardResult.pickup;

    setShippingData(prev => ({
      ...prev,
      dac: { active: mode === 'me2' ? true : prev.dac.active },
      ues: { active: mode === 'me2' ? true : prev.ues.active },
      soydelivery: { active: hasFlex }, // Set explicitly to false if not available
      correo_uruguayo: { active: (!isSoyDeliveryAvailable && (tags.includes('flex') || tags.includes('envios_rapidos'))) ? true : prev.correo_uruguayo.active },
      pickup: { 
        ...prev.pickup, 
        active: hasPickup ? true : prev.pickup.active,
        address: wizardResult.address || prev.pickup.address 
      }
    }));
    toast.success("Sugerencias aplicadas. Recordá guardar los cambios.");
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando configuración de envíos...</div>;

  return (
    <div className="max-w-5xl space-y-8 pb-20 animate-fade-in">
      <div className="flex justify-between items-end border-b border-gray-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Truck className="w-8 h-8 text-black" /> Collectibles Envíos
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Centralizado estilo Mercado Envíos. Activá o desactivá los métodos que querés ofrecer.
          </p>
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
            onClick={saveShippingSettings} 
            disabled={saving} 
            className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm shadow-sm"
          >
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>

      {/* EXPLICACIÓN DE INTEGRACIONES Y LOGÍSTICA */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex gap-4 text-sm text-slate-700">
        <Shield className="w-6 h-6 text-slate-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-base text-slate-900 block">Integraciones logísticas por tienda</span>
          <p className="mt-1.5 text-slate-600 leading-relaxed">
            Podés utilizar los métodos centralizados de Collectibles o conectar tu propia cuenta de un proveedor logístico compatible. Cada integración configurada se aplica únicamente a los pedidos de tu tienda.
          </p>
        </div>
      </div>

      {/* METODOS DISPONIBLES CHECKLIST */}
      <div id="shipping-methods-section" className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            Métodos de Envío Disponibles
          </h3>
          <p className="text-xs text-gray-500 mt-1">Habilitá los métodos que estarán activos para tus publicaciones.</p>
        </div>

        {!defaultAddress && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex gap-3 text-sm font-semibold animate-fade-in">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <span>Configurá tu dirección de despacho para calcular envíos.</span>
          </div>
        )}

        {/* CATEGORÍA A: MÉTODOS ADMINISTRADOS POR COLLECTIBLES */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-slate-600" />
            A. Métodos administrados por Collectibles
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* DAC */}
            {isProviderActive('dac') && (
              <div 
                className={`p-4 border rounded-xl transition-all flex flex-col justify-between ${shippingData.dac.active ? 'border-blue-500 bg-blue-50/20' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={shippingData.dac.active} 
                    onChange={() => toggleMethod('dac')} 
                    className="mt-1 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" 
                  />
                  <div className="flex-1">
                    <div className="font-bold text-sm text-gray-900 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        DAC
                        {dacConn?.account_mode === 'byoc' ? (
                          <span className="bg-purple-100 text-purple-800 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded">
                            Cuenta propia
                          </span>
                        ) : (
                          <span className="bg-blue-100 text-blue-800 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded">
                            Tarifa integrada
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      Despachá directamente desde tu tienda. Podés usar las tarifas estándar disponibles en Collectibles o conectar tu propia cuenta de DAC.
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">
                    Modalidad: <strong className="text-gray-800">{dacConn?.account_mode === 'byoc' ? 'Cuenta Propia' : 'Tarifas Estándar'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDacModal(true);
                    }}
                    className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5 text-blue-600" />
                    Configurar DAC
                  </button>
                </div>
              </div>
            )}

            {/* UES */}
            {isProviderActive('ues') && (
              <div 
                onClick={() => toggleMethod('ues')}
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.ues.active ? 'border-teal-500 bg-teal-50/20' : 'border-gray-200 bg-white'}`}
              >
                <input 
                  type="checkbox" 
                  checked={shippingData.ues.active} 
                  onChange={() => {}} 
                  className="mt-1 rounded text-teal-600 focus:ring-teal-500 pointer-events-none" 
                />
                <div>
                  <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    UES
                    <span className="bg-teal-100 text-teal-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                      Collectibles Envíos
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Entregas a domicilio y red de pick centers nacionales.</p>
                </div>
              </div>
            )}

            {/* CORREO URUGUAYO */}
            {isProviderActive('correo_uruguayo') && (
              <div 
                onClick={() => toggleMethod('correo_uruguayo')}
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.correo_uruguayo.active ? 'border-yellow-600 bg-yellow-50/20' : 'border-gray-200 bg-white'}`}
              >
                <input 
                  type="checkbox" 
                  checked={shippingData.correo_uruguayo.active} 
                  onChange={() => {}} 
                  className="mt-1 rounded text-yellow-600 focus:ring-yellow-500 pointer-events-none" 
                />
                <div>
                  <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    Correo Uruguayo
                    <span className="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                      Collectibles Envíos
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Envíos nacionales con cobertura de oficinas postales públicas.</p>
                </div>
              </div>
            )}

            {/* RETIRO EN LOCAL */}
            {isProviderActive('pickup') && (
              <div 
                onClick={() => toggleMethod('pickup')}
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.pickup.active ? 'border-black bg-gray-50/20' : 'border-gray-200 bg-white'}`}
              >
                <input 
                  type="checkbox" 
                  checked={shippingData.pickup.active} 
                  onChange={() => {}} 
                  className="mt-1 rounded text-black focus:ring-black pointer-events-none" 
                />
                <div>
                  <div className="font-bold text-sm text-gray-900">Retiro en Local</div>
                  <p className="text-xs text-gray-500 mt-1">Habilitá a tus compradores a retirar el artículo directamente en tu tienda física.</p>
                </div>
              </div>
            )}

            {/* ENVIO PROPIO */}
            {isProviderActive('manual') && (
              <div 
                onClick={() => toggleMethod('manual')}
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.manual.active ? 'border-black bg-gray-50/20' : 'border-gray-200 bg-white'}`}
              >
                <input 
                  type="checkbox" 
                  checked={shippingData.manual.active} 
                  onChange={() => {}} 
                  className="mt-1 rounded text-black focus:ring-black pointer-events-none" 
                />
                <div>
                  <div className="font-bold text-sm text-gray-900">Envío Propio</div>
                  <p className="text-xs text-gray-500 mt-1">Configurá tarifas personalizadas, cadetería directa o métodos manuales a coordinar.</p>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* CATEGORÍA B: INTEGRACIONES CON CUENTA DEL VENDOR */}
        <div className="space-y-3 pt-5 border-t border-gray-100">
          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-800 pb-2 border-b border-purple-100 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-purple-700" />
            B. Integraciones con cuenta del vendor
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* SOYDELIVERY FLEX BYOC CARD */}
            <div className="p-4 border border-orange-200 bg-orange-50/30 rounded-xl space-y-3 transition-all hover:bg-orange-50/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-orange-600" />
                    SoyDelivery / Flex
                  </div>
                  <span className="bg-orange-100 text-orange-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Cuenta propia
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${getSoyDeliveryBadge().class}`}>
                  {getSoyDeliveryBadge().text}
                </span>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                Conectá tu cuenta de SoyDelivery para ofrecer entregas Flex desde tu tienda. Necesitás credenciales proporcionadas directamente por SoyDelivery. Vos preparás, despachás y abonás el servicio.
              </p>

              {!isSoyDeliveryAvailable && (
                <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  {dispatchAddresses.length === 0 
                    ? "Configurá una dirección de despacho para usar SoyDelivery."
                    : "Tu dirección de despacho está fuera de la zona cubierta de SoyDelivery."}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSoyDeliveryModal(true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition shadow-sm flex items-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {soyDeliveryConn ? 'Editar credenciales' : 'Configurar cuenta'}
                </button>

                {soyDeliveryConn && (
                  <button
                    type="button"
                    onClick={() => setShowSoyDeliveryModal(true)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-slate-50 transition flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Probar conexión
                  </button>
                )}
              </div>
            </div>

            {/* DISTRILOGIC CARD */}
            <div className="p-4 border border-purple-200 bg-purple-50/30 rounded-xl space-y-3 transition-all hover:bg-purple-50/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-purple-700" />
                    Distrilogic
                  </div>
                  <span className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Cuenta propia
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${getDistrilogicBadge().class}`}>
                  {getDistrilogicBadge().text}
                </span>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                Conectá tu cuenta de Distrilogic para cotizar, generar etiquetas y realizar seguimiento de tus envíos.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDistrilogicModalTab('credentials');
                    setShowDistrilogicModal(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-700 text-white hover:bg-purple-800 transition shadow-sm flex items-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {distrilogicConn ? 'Editar credenciales' : 'Configurar cuenta'}
                </button>

                {distrilogicConn && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDistrilogicModalTab('credentials');
                        setShowDistrilogicModal(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Probar conexión
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setDistrilogicModalTab('services');
                        setShowDistrilogicModal(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Administrar servicios
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* SECCIÓN ENVÍO GRATIS POR MONTO MÍNIMO */}
      <div className="border border-emerald-200 rounded-xl p-6 bg-emerald-50/20 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-gray-900">Envío Gratis por Monto Mínimo</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ofrecé envío gratis a los compradores que alcancen un monto mínimo en compras de tus productos.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={shippingData.free_shipping.active}
              onChange={(e) => updateSection('free_shipping', 'active', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-3 text-xs font-bold text-gray-700">
              {shippingData.free_shipping.active ? 'Activado' : 'Desactivado'}
            </span>
          </label>
        </div>

        {shippingData.free_shipping.active && (
          <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Monto mínimo de compra para Envío Gratis ($ UYU)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={shippingData.free_shipping.min_amount}
                  onChange={(e) => updateSection('free_shipping', 'min_amount', e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  placeholder="Ej: 2500"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5 leading-normal">
                Si la suma de tus productos en el carrito del cliente es igual o superior a este monto, el costo de envío de tus artículos será $0.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CONFIGURACIÓN ADICIONAL DE RETIRO / ENVÍO PROPIO */}
      {(shippingData.dac.active || shippingData.pickup.active || shippingData.manual.active) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* DAC CONFIGURATION FIELDS */}
          {shippingData.dac.active && (
            <div className="border border-blue-500 rounded-xl p-6 bg-white shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                <Truck className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-sm text-gray-900">Configuración de DAC (Collectibles Envíos)</h4>
              </div>
              <p className="text-xs text-slate-500 font-semibold">
                Activá DAC sin cuenta propia. Collectibles genera la guía oficial, vos imprimís la etiqueta y despachás el paquete.
              </p>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Dirección de Despacho (Remitente)</label>
                  <input
                    type="text"
                    value={shippingData.dac.dispatch_address}
                    onChange={(e) => updateSection('dac', 'dispatch_address', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500"
                    placeholder="Calle y Nro de donde retira el courier o desde donde despachás"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Ciudad</label>
                    <input
                      type="text"
                      value={shippingData.dac.city}
                      onChange={(e) => updateSection('dac', 'city', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Departamento</label>
                    <select
                      value={shippingData.dac.department}
                      onChange={(e) => updateSection('dac', 'department', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
                    >
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Teléfono de Despacho</label>
                    <input
                      type="text"
                      value={shippingData.dac.phone}
                      onChange={(e) => updateSection('dac', 'phone', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Horario de Despacho</label>
                    <input
                      type="text"
                      value={shippingData.dac.hours}
                      onChange={(e) => updateSection('dac', 'hours', e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500"
                      placeholder="Ej: Lun a Vie 10:00 a 18:00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Sucursal DAC de Origen Preferida (si aplica)</label>
                  <select
                    value={shippingData.dac.preferred_agency}
                    onChange={(e) => updateSection('dac', 'preferred_agency', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Seleccionar Agencia --</option>
                    {dacOffices.map(o => (
                      <option key={o.k_oficina} value={String(o.k_oficina)}>
                        {o.office_name} ({o.department} - {o.city})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-2 border-t flex flex-col gap-2">
                  <span className="block font-bold text-gray-700 mb-1">Modalidades de Envío Habilitadas</span>
                  <label className="flex items-center gap-2 font-semibold text-gray-750">
                    <input
                      type="checkbox"
                      checked={shippingData.dac.allow_home_delivery}
                      onChange={(e) => updateSection('dac', 'allow_home_delivery', e.target.checked)}
                      className="rounded text-blue-605 focus:ring-blue-500"
                    />
                    Entrega a Domicilio (DAC Domicilio)
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-gray-755">
                    <input
                      type="checkbox"
                      checked={shippingData.dac.allow_pickup_agency}
                      onChange={(e) => updateSection('dac', 'allow_pickup_agency', e.target.checked)}
                      className="rounded text-blue-605 focus:ring-blue-500"
                    />
                    Retiro en Agencia DAC (Agencia)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* RETIRO / PICKUP FIELDS */}
          {shippingData.pickup.active && (
            <div className="border border-black rounded-xl p-6 bg-white shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Store className="w-5 h-5 text-black" />
                <h4 className="font-bold text-sm text-gray-900">Configuración de Retiro en Local</h4>
              </div>
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
            </div>
          )}

          {/* MANUAL / ENVIO PROPIO FIELDS */}
          {shippingData.manual.active && (
            <div className="border border-black rounded-xl p-6 bg-white shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Package className="w-5 h-5 text-black" />
                <h4 className="font-bold text-sm text-gray-900">Configuración de Envío Propio</h4>
              </div>
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
            </div>
          )}

        </div>
      )}

      {/* SECCIÓN DIRECCIONES DE DESPACHO (REMITENTE) */}
      <div id="dispatch-address-section" className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
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

      {/* SECCIÓN CONFIGURACIÓN OPERATIVA (DESPACHO) */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm space-y-4 animate-fade-in">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            Configuración Operativa de Despacho
          </h3>
          <p className="text-xs text-gray-500 mt-1">Configurá tus horarios de procesamiento y los días que despachás mercadería.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div>
            <label className="block font-bold text-gray-700 mb-1.5">Horario de Corte de Pedidos</label>
            <input 
              type="text" 
              value={shippingData.cutoff_time || '14:00'} 
              onChange={(e) => setShippingData(prev => ({ ...prev, cutoff_time: e.target.value }))} 
              className="w-full px-3 py-2 border rounded-lg text-sm font-medium" 
              placeholder="Ej: 14:00" 
            />
            <p className="text-[10px] text-gray-400 mt-1">Pedidos recibidos después de esta hora se despachan al siguiente día de despacho.</p>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1.5">Días de Despacho Semanales</label>
            <input 
              type="text" 
              value={Array.isArray(shippingData.dispatch_days) ? shippingData.dispatch_days.join(', ') : (shippingData.dispatch_days || 'Lunes a Viernes')} 
              onChange={(e) => setShippingData(prev => ({ ...prev, dispatch_days: e.target.value.split(',').map(s => s.trim()) }))} 
              className="w-full px-3 py-2 border rounded-lg text-sm font-medium" 
              placeholder="Ej: Lunes, Martes, Miércoles, Jueves, Viernes" 
            />
            <p className="text-[10px] text-gray-400 mt-1">Separados por coma. Ejemplo: Lunes, Miércoles, Viernes</p>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1.5">Tiempo de Preparación (Días)</label>
            <input 
              type="number"
              min="0"
              max="30"
              value={shippingData.preparation_days ?? 0} 
              onChange={(e) => setShippingData(prev => ({ ...prev, preparation_days: parseInt(e.target.value, 10) || 0 }))} 
              className="w-full px-3 py-2 border rounded-lg text-sm font-medium" 
              placeholder="0" 
            />
            <p className="text-[10px] text-gray-400 mt-1">Días hábiles requeridos de preparación antes de enviar.</p>
          </div>
        </div>
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
                <div className="space-y-4 animate-fade-in">
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
                  
                  {wizardResult.shippingTags && (wizardResult.shippingTags.includes('flex') || wizardResult.shippingTags.includes('envios_rapidos')) && !isSoyDeliveryAvailable && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold mb-1">SoyDelivery no disponible</p>
                        <p>
                          Detectamos que usás Flex en Mercado Libre, pero tu dirección de despacho no está dentro de la zona cubierta por SoyDelivery en Collectibles. Te sugerimos activar <strong>DAC, UES o Correo Uruguayo</strong> como alternativa de envío.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-800">
                    <div className="font-bold mb-1">Recomendamos Activar:</div>
                    <p className="mb-3">
                      En base a tu ubicación en {wizardResult.location} y tu logística activa, te sugerimos habilitar:
                      <span className="block mt-1 font-semibold text-emerald-950">
                        {(!isSoyDeliveryAvailable && (wizardResult.shippingTags?.includes('flex') || wizardResult.shippingTags?.includes('envios_rapidos'))) 
                          ? "✓ DAC, UES, Correo Uruguayo (Alternativas por falta de cobertura SoyDelivery)" 
                          : "✓ DAC, UES, SoyDelivery/Flex (En zona cubierta)"}
                      </span>
                    </p>
                    <button 
                      onClick={applyWizardSuggestions} 
                      className="bg-emerald-600 text-white font-bold px-4 py-2 rounded hover:bg-emerald-700 transition-colors shadow-sm text-xs"
                    >
                      Aplicar Sugerencias Automáticamente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showPreviewModal && vendorObj && (
        <VendorLabelPreviewModal
          vendor={vendorObj}
          defaultAddress={dispatchAddresses.find(a => a.is_default) || null}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {/* MODAL DISTRILOGIC CONFIGURATION & SERVICES */}
      <VDistrilogicIntegration
        isOpen={showDistrilogicModal}
        onClose={() => setShowDistrilogicModal(false)}
        initialTab={distrilogicModalTab}
        onConnectionChange={loadData}
      />

      {/* MODAL DAC HYBRID CONFIGURATION */}
      <VDacIntegrationModal
        isOpen={showDacModal}
        onClose={() => setShowDacModal(false)}
        onSaved={loadData}
      />

      {/* MODAL SOYDELIVERY BYOC CONFIGURATION */}
      <VSoyDeliveryIntegrationModal
        isOpen={showSoyDeliveryModal}
        onClose={() => setShowSoyDeliveryModal(false)}
        onSaved={loadData}
      />
    </div>
  );
}
