import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { Truck, Store, Package, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

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
    dac: { status: 'disconnected', account_name: '', username: '', password: '', clientId: '', agencyCode: '', address: '', department: '', city: '', phone: '', cutoff: '', last_tested_at: null },
    soydelivery: { status: 'disconnected', account_name: '', apiKey: '', clientId: '', secret: '', address: '', zone: '', phone: '', cutoff: '', days_active: ['Mon','Tue','Wed','Thu','Fri'], last_tested_at: null }
  });

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        // Cargar settings básicos
        const { data: vendorData, error: vErr } = await supabase.from('vendors').select('shipping_settings').eq('id', user!.id).single();
        if (vErr) throw vErr;
        
        if (vendorData?.shipping_settings) {
          setShippingData(prev => ({ ...prev, ...vendorData.shipping_settings }));
        }

        // Cargar conexiones seguras
        const { data: connData, error: cErr } = await supabase.from('vendor_shipping_connections').select('*').eq('vendor_id', user!.id);
        if (cErr) throw cErr;

        if (connData) {
          const newConns = { ...connections };
          connData.forEach(c => {
            if (newConns[c.provider]) {
              newConns[c.provider].status = c.connection_status;
              newConns[c.provider].account_name = c.account_name;
              newConns[c.provider].last_tested_at = c.last_tested_at;
              // settings publicos (los secretos NO se bajan)
              if (c.settings) {
                Object.assign(newConns[c.provider], c.settings);
              }
              if (c.pickup_address) {
                Object.assign(newConns[c.provider], c.pickup_address);
              }
            }
          });
          setConnections(newConns);
        }

      } catch (err: any) {
        toast.error('Error al cargar envíos: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const saveBasicSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('vendors').update({ shipping_settings: shippingData }).eq('id', user.id);
      if (error) throw error;
      toast.success('Configuración básica guardada');
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
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

  const toggleDay = (day: string) => {
    const days = connections.soydelivery.days_active || [];
    const newDays = days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day];
    updateConnection('soydelivery', 'days_active', newDays);
  };

  // EDGE FUNCTION CALLS
  const testConnection = async (provider: string) => {
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      let credentials = {};
      if (provider === 'dac') {
        credentials = { username: connections.dac.username, password: connections.dac.password };
      } else if (provider === 'soydelivery') {
        credentials = { apiKey: connections.soydelivery.apiKey, clientId: connections.soydelivery.clientId, secret: connections.soydelivery.secret };
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-shipping-test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ provider, credentials })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error de conexión");
      
      toast.success(data.message);
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
      const token = session.data.session?.access_token;
      
      let payload = {};
      if (provider === 'dac') {
        payload = {
          provider: 'dac',
          account_name: connections.dac.account_name,
          credentials: { username: connections.dac.username, password: connections.dac.password },
          settings: { clientId: connections.dac.clientId, agencyCode: connections.dac.agencyCode, cutoff: connections.dac.cutoff },
          pickup_address: { address: connections.dac.address, department: connections.dac.department, city: connections.dac.city, phone: connections.dac.phone }
        };
      } else if (provider === 'soydelivery') {
        payload = {
          provider: 'soydelivery',
          account_name: connections.soydelivery.account_name,
          credentials: { apiKey: connections.soydelivery.apiKey, clientId: connections.soydelivery.clientId, secret: connections.soydelivery.secret },
          settings: { cutoff: connections.soydelivery.cutoff, days_active: connections.soydelivery.days_active, zone: connections.soydelivery.zone },
          pickup_address: { address: connections.soydelivery.address, phone: connections.soydelivery.phone }
        };
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendor-shipping-save-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Limpiar contraseñas visuales y actualizar estado
      updateConnection(provider, 'username', '');
      updateConnection(provider, 'password', '');
      updateConnection(provider, 'apiKey', '');
      updateConnection(provider, 'secret', '');
      updateConnection(provider, 'status', data.connection.connection_status);
      updateConnection(provider, 'last_tested_at', data.connection.last_tested_at);

      toast.success(`${provider.toUpperCase()} conectado correctamente`);
    } catch (err: any) {
      toast.error("Error al guardar conexión: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnectProvider = async (provider: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('vendor_shipping_connections').delete().match({ vendor_id: user?.id, provider });
      if (error) throw error;
      updateConnection(provider, 'status', 'disconnected');
      updateConnection(provider, 'last_tested_at', null);
      toast.success(`${provider} desconectado`);
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="p-8 text-center text-gray-500">Cargando configuración de envíos...</div>;

  return (
    <div className="max-w-5xl space-y-8 pb-20 animation-fade-in">
      <div className="flex justify-between items-end border-b border-gray-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de envíos</h2>
          <p className="text-sm text-gray-500 mt-2">Conectá tus propias cuentas logísticas y configurá los métodos manuales.</p>
        </div>
        <button onClick={saveBasicSettings} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm">
          Guardar Básicos (Pickup/Manual)
        </button>
      </div>

      <div className="space-y-6">
        
        {/* RETIRO / PICKUP (Igual) */}
        <div className={`border rounded-xl p-6 transition-colors ${shippingData.pickup.active ? 'border-black bg-white' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${shippingData.pickup.active ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>
                <Store className="w-5 h-5" />
              </div>
              <div><h3 className="text-lg font-bold text-gray-900">Retiro / Pickup</h3><p className="text-sm text-gray-500">Básico</p></div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={shippingData.pickup.active} onChange={(e) => updateSection('pickup', 'active', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>
        </div>

        {/* ENVÍO MANUAL (Igual) */}
        <div className={`border rounded-xl p-6 transition-colors ${shippingData.manual.active ? 'border-black bg-white' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${shippingData.manual.active ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>
                <Package className="w-5 h-5" />
              </div>
              <div><h3 className="text-lg font-bold text-gray-900">Envío manual coordinado</h3><p className="text-sm text-gray-500">Básico</p></div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={shippingData.manual.active} onChange={(e) => updateSection('manual', 'active', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>
        </div>

        <h3 className="text-xl font-bold text-gray-900 mt-12 mb-4 border-b pb-2 border-gray-200">Integraciones Logísticas</h3>

        {/* DAC INTEGRATION */}
        <div className={`border rounded-xl p-6 transition-colors ${connections.dac.status === 'connected' ? 'border-[#00388B] bg-white' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${connections.dac.status === 'connected' ? 'bg-[#00388B] text-white' : 'bg-gray-200 text-gray-500'}`}>
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">DAC (Agencia Central)</h3>
                <p className="text-sm text-gray-500 max-w-lg mt-1">Para conectar DAC, solicitale a tu ejecutivo comercial tus credenciales de integración API para cotizar envíos y generar etiquetas desde tu cuenta.</p>
              </div>
            </div>
            {connections.dac.status === 'connected' && (
              <div className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1 text-sm font-bold text-green-600"><CheckCircle className="w-4 h-4"/> Conectado</span>
                <span className="text-xs text-gray-500">Última prueba: {new Date(connections.dac.last_tested_at).toLocaleDateString()}</span>
                <button onClick={() => disconnectProvider('dac')} className="text-xs text-red-600 font-medium mt-2 hover:underline">Desconectar</button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de cuenta (interno)</label><input type="text" value={connections.dac.account_name} onChange={(e) => updateConnection('dac', 'account_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              
              {connections.dac.status !== 'connected' && (
                <>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Usuario API</label><input type="text" value={connections.dac.username} onChange={(e) => updateConnection('dac', 'username', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Contraseña API</label><input type="password" value={connections.dac.password} onChange={(e) => updateConnection('dac', 'password', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
                </>
              )}
              
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Código de cliente</label><input type="text" value={connections.dac.clientId} onChange={(e) => updateConnection('dac', 'clientId', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Código de agencia/origen</label><input type="text" value={connections.dac.agencyCode} onChange={(e) => updateConnection('dac', 'agencyCode', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Dirección de retiro</label><input type="text" value={connections.dac.address} onChange={(e) => updateConnection('dac', 'address', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label><input type="text" value={connections.dac.department} onChange={(e) => updateConnection('dac', 'department', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label><input type="text" value={connections.dac.city} onChange={(e) => updateConnection('dac', 'city', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label><input type="text" value={connections.dac.phone} onChange={(e) => updateConnection('dac', 'phone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Horario de corte</label><input type="time" value={connections.dac.cutoff} onChange={(e) => updateConnection('dac', 'cutoff', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
            </div>
            
            <div className="mt-6 flex gap-3">
              <button onClick={() => testConnection('dac')} disabled={saving} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 text-sm disabled:opacity-50">Probar conexión</button>
              <button onClick={() => saveConnection('dac')} disabled={saving} className="bg-[#00388B] text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 text-sm disabled:opacity-50">Guardar conexión</button>
            </div>
          </div>
        </div>

        {/* SOYDELIVERY INTEGRATION */}
        <div className={`border rounded-xl p-6 transition-colors ${connections.soydelivery.status === 'connected' ? 'border-[#FF4500] bg-white' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${connections.soydelivery.status === 'connected' ? 'bg-[#FF4500] text-white' : 'bg-gray-200 text-gray-500'}`}>
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">SoyDelivery</h3>
                <p className="text-sm text-gray-500 max-w-lg mt-1">Solicitá a SoyDelivery las credenciales API de tu cuenta para gestionar entregas de última milla.</p>
              </div>
            </div>
            {connections.soydelivery.status === 'connected' && (
              <div className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1 text-sm font-bold text-green-600"><CheckCircle className="w-4 h-4"/> Conectado</span>
                <span className="text-xs text-gray-500">Última prueba: {new Date(connections.soydelivery.last_tested_at).toLocaleDateString()}</span>
                <button onClick={() => disconnectProvider('soydelivery')} className="text-xs text-red-600 font-medium mt-2 hover:underline">Desconectar</button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre de cuenta</label><input type="text" value={connections.soydelivery.account_name} onChange={(e) => updateConnection('soydelivery', 'account_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              
              {connections.soydelivery.status !== 'connected' && (
                <>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">API Key / Token</label><input type="password" value={connections.soydelivery.apiKey} onChange={(e) => updateConnection('soydelivery', 'apiKey', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Client ID (si aplica)</label><input type="text" value={connections.soydelivery.clientId} onChange={(e) => updateConnection('soydelivery', 'clientId', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Secret (si aplica)</label><input type="password" value={connections.soydelivery.secret} onChange={(e) => updateConnection('soydelivery', 'secret', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
                </>
              )}

              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Dirección de retiro</label><input type="text" value={connections.soydelivery.address} onChange={(e) => updateConnection('soydelivery', 'address', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Barrio / zona habilitada</label><input type="text" value={connections.soydelivery.zone} onChange={(e) => updateConnection('soydelivery', 'zone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label><input type="text" value={connections.soydelivery.phone} onChange={(e) => updateConnection('soydelivery', 'phone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Horario de corte</label><input type="time" value={connections.soydelivery.cutoff} onChange={(e) => updateConnection('soydelivery', 'cutoff', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black" /></div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Días habilitados</label>
                <div className="flex flex-wrap gap-2">
                  {[{ id: 'Mon', label: 'Lunes' }, { id: 'Tue', label: 'Martes' }, { id: 'Wed', label: 'Miércoles' }, { id: 'Thu', label: 'Jueves' }, { id: 'Fri', label: 'Viernes' }, { id: 'Sat', label: 'Sábado' }, { id: 'Sun', label: 'Domingo' }].map(day => (
                    <button key={day.id} onClick={() => toggleDay(day.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${connections.soydelivery.days_active.includes(day.id) ? 'bg-[#FF4500] text-white border-[#FF4500]' : 'bg-white text-gray-600 border-gray-200'}`}>{day.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => testConnection('soydelivery')} disabled={saving} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 text-sm disabled:opacity-50">Probar conexión</button>
              <button onClick={() => saveConnection('soydelivery')} disabled={saving} className="bg-[#FF4500] text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 text-sm disabled:opacity-50">Guardar conexión</button>
            </div>
          </div>
        </div>

        {/* PRÓXIMAMENTE */}
        <div>
           <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 mt-12">Próximamente</h3>
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['UES', 'Mirtrans', 'PedidosYa'].map(provider => (
                 <div key={provider} className="border border-gray-200 bg-gray-50 p-4 rounded-xl flex items-center justify-between opacity-60 grayscale cursor-not-allowed">
                    <div className="flex items-center gap-3">
                       <Truck className="w-5 h-5 text-gray-400" />
                       <span className="font-bold text-gray-600">{provider}</span>
                    </div>
                    <span className="text-[10px] bg-gray-200 text-gray-600 font-bold px-2 py-1 rounded uppercase tracking-wider">No habilitado</span>
                 </div>
              ))}
           </div>
        </div>

      </div>
    </div>
  );
}
