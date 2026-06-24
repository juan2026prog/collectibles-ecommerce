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

  // 1. Settings en vendors.shipping_settings (Centralized Collectibles Envíos + Pickup/Manual)
  const [shippingData, setShippingData] = useState({
    dac: { active: false },
    ues: { active: false },
    soydelivery: { active: false },
    correo_uruguayo: { active: false },
    pickup: { active: false, address: '', department: 'Montevideo', city: '', phone: '', hours: '', instructions: '' },
    manual: { active: false, method_name: '', fixed_cost: '', instructions: '', estimated_time: '' }
  });

  // 2. Direcciones de Despacho (Remitente)
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

  // 3. ML Logistics Assistant Wizard
  const [mlAccountConnected, setMlAccountConnected] = useState(false);
  const [mlSellerId, setMlSellerId] = useState<string | null>(null);
  const [showMlWizard, setShowMlWizard] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardResult, setWizardResult] = useState<any>(null);

  // 4. Vendor settings preview states
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
      const [vendorRes, addrRes, mlRes] = await Promise.all([
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
          .catch(err => ({ success: false, data: null, error: err }))
      ]);

      // Process vendor result
      if (vendorRes.success && vendorRes.data) {
        setVendorObj(vendorRes.data);
        if (vendorRes.data.shipping_settings) {
          const s = vendorRes.data.shipping_settings as any;
          setShippingData({
            dac: { active: s.dac?.active || false },
            ues: { active: s.ues?.active || false },
            soydelivery: { active: s.soydelivery?.active || false },
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
            }
          });
        }
      } else if (vendorRes.error) {
        console.error("Error loading vendor profile:", vendorRes.error);
        toast.error("Error al cargar perfil de vendedor");
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
      const { error } = await supabase
        .from('vendors')
        .update({ shipping_settings: shippingData })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Configuración de Collectibles Envíos guardada correctamente');
    } catch (err: any) {
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMethod = (method: 'dac' | 'ues' | 'soydelivery' | 'correo_uruguayo' | 'pickup' | 'manual') => {
    setShippingData(prev => ({
      ...prev,
      [method]: { ...prev[method], active: !prev[method].active }
    }));
  };

  const updateSection = (section: 'pickup' | 'manual', field: string, value: any) => {
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
    const hasFlex = tags.includes('flex') || tags.includes('envios_rapidos');
    const hasPickup = wizardResult.pickup;

    setShippingData(prev => ({
      ...prev,
      dac: { active: mode === 'me2' ? true : prev.dac.active },
      ues: { active: mode === 'me2' ? true : prev.ues.active },
      soydelivery: { active: hasFlex ? true : prev.soydelivery.active },
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

      {/* CENTRALIZED SHIPMENTS EXPLANATION CARD */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex gap-4 text-sm text-slate-700">
        <Shield className="w-6 h-6 text-slate-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-base text-slate-900 block">Modelo Centralizado Sin Credenciales</span>
          <p className="mt-1.5 text-slate-600 leading-relaxed">
            Ya no necesitás ingresar claves API, usuarios ni contraseñas. Collectibles centraliza las integraciones logísticas, tarifas y generación de etiquetas. El cliente abona el envío durante el checkout según las tarifas globales de la plataforma y este importe se sumará de forma íntegra a tu liquidación.
          </p>
        </div>
      </div>

      {/* METODOS DISPONIBLES CHECKLIST */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            Métodos de Envío Disponibles
          </h3>
          <p className="text-xs text-gray-500 mt-1">Habilitá los métodos que estarán activos para tus publicaciones.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* DAC */}
          <div 
            onClick={() => toggleMethod('dac')}
            className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.dac.active ? 'border-blue-500 bg-blue-50/20' : 'border-gray-200 bg-white'}`}
          >
            <input 
              type="checkbox" 
              checked={shippingData.dac.active} 
              onChange={() => {}} 
              className="mt-1 rounded text-blue-600 focus:ring-blue-500 pointer-events-none" 
            />
            <div>
              <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                DAC
                <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  Collectibles Envíos
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Despacho nacional interdepartamental. Las tarifas se cotizan de forma automática.</p>
            </div>
          </div>

          {/* UES */}
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

          {/* SOYDELIVERY */}
          <div 
            onClick={() => toggleMethod('soydelivery')}
            className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 hover:bg-slate-50 ${shippingData.soydelivery.active ? 'border-orange-500 bg-orange-50/20' : 'border-gray-200 bg-white'}`}
          >
            <input 
              type="checkbox" 
              checked={shippingData.soydelivery.active} 
              onChange={() => {}} 
              className="mt-1 rounded text-orange-600 focus:ring-orange-500 pointer-events-none" 
            />
            <div>
              <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                SoyDelivery
                <span className="bg-orange-100 text-orange-800 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  Collectibles Envíos
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Envíos express en el día (Flex) para Montevideo y zonas metropolitanas.</p>
            </div>
          </div>

          {/* CORREO URUGUAYO */}
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

          {/* RETIRO EN LOCAL */}
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

          {/* ENVIO PROPIO */}
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

        </div>
      </div>

      {/* CONFIGURACIÓN ADICIONAL DE RETIRO / ENVÍO PROPIO */}
      {(shippingData.pickup.active || shippingData.manual.active) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
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
                  
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-800">
                    <div className="font-bold mb-1">Recomendamos Activar:</div>
                    <p className="mb-3">En base a tu ubicación en {wizardResult.location} y tu logística activa, te sugerimos habilitar los siguientes métodos:</p>
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
    </div>
  );
}
