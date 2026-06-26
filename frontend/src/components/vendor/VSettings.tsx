import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import VMercadoLibre from './VMercadoLibre';
import VShipping from './VShipping';
import VKyc from './VKyc';
import { User, CreditCard, Truck, Link2, FileText, Save, UploadCloud, Bell, AlertCircle, CheckCircle2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';

export default function VSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('sub') || 'profile';
  const setActiveTab = (tab: string) => {
    setSearchParams(prev => {
      prev.set('sub', tab);
      return prev;
    });
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formularios para Perfil y Cobros
  const [formData, setFormData] = useState({
    store_name: '',
    slug: '',
    description: '',
    logo_url: '',
    banner_url: '',
    contact_email: '',
    contact_phone: '',
    social_links: { facebook: '', instagram: '', twitter: '' } as Record<string, string>,
    promotions_opt_in: false,
    
    // Cobros (vendor_payment_settings)
    vendor_payment_settings: {
      account_name: '',
      bank_name: '',
      account_number: '',
      currency: 'UYU',
      payment_notes: ''
    } as Record<string, any>,
    
    // Configuraciones Generales (vendor_settings)
    vendor_settings: {
      whatsapp: {
        number: '',
        notify_sales: false,
        notify_payment: false,
      }
    } as Record<string, any>,
  });

  const [notificationSettings, setNotificationSettings] = useState({
    id: '',
    whatsapp_numbers: [] as { label: string; number: string; enabled: boolean }[],
    notify_new_sale: false,
    notify_payment_received: false,
    notify_order_shipped: false,
    notify_low_stock: false,
    notify_payout_paid: false,
    notify_test: false,
    is_active: false
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestNotification = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    // Validate numbers first
    const numbers = notificationSettings.whatsapp_numbers || [];
    const activeNumbers = numbers.filter(n => n.number.trim() !== '' && n.enabled);
    if (activeNumbers.length === 0) {
      toast.error('Debes tener al menos un número de celular activo y guardado para enviar la prueba.');
      return;
    }

    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-notification', {
        body: {
          event_type: 'test_notification',
          vendor_id: user.id,
          whatsapp_numbers: activeNumbers
        }
      });
      if (error) throw error;
      toast.success('Notificación de prueba enviada');
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la notificación de prueba');
    } finally {
      setSendingTest(false);
    }
  };

  const loadNotificationSettings = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('vendor_notification_settings')
        .select('*')
        .eq('vendor_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        // Ensure always 3 slots loaded
        const dbNumbers = data.whatsapp_numbers || [];
        const paddedNumbers = [...dbNumbers];
        while (paddedNumbers.length < 3) {
          paddedNumbers.push({ label: `Número ${paddedNumbers.length + 1}`, number: '', enabled: false });
        }
        setNotificationSettings({
          id: data.id,
          whatsapp_numbers: paddedNumbers.slice(0, 3),
          notify_new_sale: !!data.notify_new_sale,
          notify_payment_received: !!data.notify_payment_received,
          notify_order_shipped: !!data.notify_order_shipped,
          notify_low_stock: !!data.notify_low_stock,
          notify_payout_paid: !!data.notify_payout_paid,
          notify_test: !!data.notify_test,
          is_active: !!data.is_active
        });
      } else {
        setNotificationSettings({
          id: '',
          whatsapp_numbers: [
            { label: 'Dueño', number: '', enabled: false },
            { label: 'Depósito', number: '', enabled: false },
            { label: 'Administración', number: '', enabled: false }
          ],
          notify_new_sale: false,
          notify_payment_received: false,
          notify_order_shipped: false,
          notify_low_stock: false,
          notify_payout_paid: false,
          notify_test: false,
          is_active: false
        });
      }
    } catch (err: any) {
      console.error("Error loading notifications:", err);
    }
  };

  const loadLogs = async () => {
    if (!user) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error("Error loading logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const { data, error } = await supabase.from('vendors').select('*').eq('id', user!.id).single();
        if (error) throw error;
        if (data) {
          setFormData({
            store_name: data.store_name || '',
            slug: data.slug || '',
            description: data.description || '',
            logo_url: data.logo_url || '',
            banner_url: data.banner_url || '',
            contact_email: data.contact_email || '',
            contact_phone: data.contact_phone || '',
            social_links: data.social_links || { facebook: '', instagram: '', twitter: '' },
            promotions_opt_in: data.promotions_opt_in || false,
            vendor_payment_settings: data.vendor_payment_settings || {
              account_name: '', bank_name: '', account_number: '', currency: 'UYU', payment_notes: ''
            },
            vendor_settings: data.vendor_settings || {
              whatsapp: { number: '', notify_sales: false, notify_payment: false }
            }
          });
        }
      } catch (err: any) {
        toast.error('Error al cargar configuración: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'notifications') {
      loadNotificationSettings();
      loadLogs();
    }
  }, [activeTab]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (activeTab === 'notifications') {
        const numbers = notificationSettings.whatsapp_numbers || [];
        
        // Validations
        for (const n of numbers) {
          const numClean = n.number.trim();
          if (n.enabled && numClean === '') {
            throw new Error(`La etiqueta "${n.label}" está activa pero no tiene un número configurado.`);
          }
          if (numClean !== '') {
            if (!numClean.startsWith('+598')) {
              throw new Error(`El número "${n.number}" debe comenzar con +598 (formato Uruguay).`);
            }
            if (numClean.length < 11) {
              throw new Error(`El número "${n.number}" es inválido (muy corto).`);
            }
          }
        }

        // Duplicate validation
        const nonValued = numbers.map(n => n.number.trim()).filter(n => n !== '');
        const duplicates = nonValued.filter((item, index) => nonValued.indexOf(item) !== index);
        if (duplicates.length > 0) {
          throw new Error(`No se permiten números duplicados: ${duplicates.join(', ')}`);
        }

        const payload = {
          vendor_id: user.id,
          whatsapp_numbers: numbers,
          notify_new_sale: notificationSettings.notify_new_sale,
          notify_payment_received: notificationSettings.notify_payment_received,
          notify_order_shipped: notificationSettings.notify_order_shipped,
          notify_low_stock: notificationSettings.notify_low_stock,
          notify_payout_paid: notificationSettings.notify_payout_paid,
          notify_test: notificationSettings.notify_test,
          is_active: notificationSettings.is_active,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('vendor_notification_settings')
          .upsert(payload, { onConflict: 'vendor_id' });
        if (error) throw error;
        toast.success('Configuración de notificaciones guardada');
      } else {
        const payload = {
          store_name: formData.store_name,
          slug: formData.slug,
          description: formData.description,
          logo_url: formData.logo_url,
          banner_url: formData.banner_url,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          social_links: formData.social_links,
          promotions_opt_in: formData.promotions_opt_in,
          vendor_payment_settings: formData.vendor_payment_settings,
          vendor_settings: formData.vendor_settings
        };

        const { error } = await supabase.from('vendors').update(payload).eq('id', user.id);
        if (error) throw error;
        toast.success('Configuración guardada exitosamente');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const getWhatsAppStateBadge = () => {
    const numbers = notificationSettings.whatsapp_numbers || [];
    const activeNumbers = numbers.filter(n => n.number.trim() !== '' && n.enabled);
    const hasNumbers = numbers.some(n => n.number.trim() !== '');

    if (notificationSettings.is_active && activeNumbers.length > 0) {
      return { label: 'Activo', className: 'bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded ml-2' };
    }
    if (hasNumbers) {
      return { label: 'Configurado', className: 'bg-amber-100 text-amber-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded ml-2' };
    }
    return { label: 'No configurado', className: 'bg-gray-100 text-gray-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded ml-2' };
  };

  const updateNumberAtIndex = (index: number, field: 'label' | 'number' | 'enabled', value: any) => {
    const list = [...(notificationSettings.whatsapp_numbers || [])];
    while (list.length < 3) {
      list.push({ label: `Número ${list.length + 1}`, number: '', enabled: false });
    }
    list[index] = { ...list[index], [field]: value };
    setNotificationSettings(prev => ({
      ...prev,
      whatsapp_numbers: list
    }));
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateNested = (parent: keyof typeof formData, field: string, value: any) => {
    setFormData(prev => ({ 
      ...prev, 
      [parent]: { ...(prev[parent] as Record<string, any>), [field]: value } 
    }));
  };

  const updateWhatsApp = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      vendor_settings: {
        ...prev.vendor_settings,
        whatsapp: {
          ...prev.vendor_settings?.whatsapp,
          [field]: value
        }
      }
    }));
  };

  const tabs = [
    { id: 'profile', label: 'Perfil', icon: User },
    { id: 'billing', label: 'Cobros', icon: CreditCard },
    { id: 'shipping', label: 'Envíos', icon: Truck },
    { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'mercadolibre', label: 'Mercado Libre', icon: Link2 },
    { id: 'documents', label: 'Documentación', icon: FileText },
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;
  }

  // Define if the current tab has a "Save" button in the parent component.
  // VShipping, VMercadoLibre, and VKyc usually handle their own saving inside.
  const showSaveButton = activeTab === 'profile' || activeTab === 'billing' || activeTab === 'notifications';

  return (
    <div className="max-w-5xl space-y-8 pb-20 animate-fade-in">
      <div className="flex justify-between items-end border-b border-gray-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración</h2>
          <p className="text-sm text-gray-500 mt-2">Gestioná los datos de tu tienda, cobros, envíos e integraciones.</p>
        </div>
        {showSaveButton && (
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-black text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-100 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-black text-black' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {/* TAB PERFIL */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Tienda</label>
                <input 
                  type="text" 
                  value={formData.store_name} 
                  onChange={(e) => updateField('store_name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug Público</label>
                <input 
                  type="text" 
                  value={formData.slug} 
                  onChange={(e) => updateField('slug', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black bg-gray-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la Tienda</label>
              <textarea 
                rows={3}
                value={formData.description} 
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                placeholder="Breve historia o propuesta de valor..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={formData.logo_url} 
                    onChange={(e) => updateField('logo_url', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                    placeholder="https://..."
                  />
                  <button className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200">
                    <UploadCloud className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banner URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={formData.banner_url} 
                    onChange={(e) => updateField('banner_url', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                    placeholder="https://..."
                  />
                  <button className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200">
                    <UploadCloud className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mt-8 mb-4 border-b border-gray-100 pb-2">Contacto Público</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Comercial</label>
                <input 
                  type="email" 
                  value={formData.contact_email} 
                  onChange={(e) => updateField('contact_email', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono Público</label>
                <input 
                  type="text" 
                  value={formData.contact_phone} 
                  onChange={(e) => updateField('contact_phone', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Facebook URL</label>
                  <input type="text" value={formData.social_links?.facebook || ''} onChange={(e) => updateNested('social_links', 'facebook', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black" />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instagram URL</label>
                  <input type="text" value={formData.social_links?.instagram || ''} onChange={(e) => updateNested('social_links', 'instagram', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black" />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Twitter URL</label>
                  <input type="text" value={formData.social_links?.twitter || ''} onChange={(e) => updateNested('social_links', 'twitter', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black" />
               </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mt-8 mb-4 border-b border-gray-100 pb-2">Promociones de Collectibles</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="promotions_opt_in"
                checked={formData.promotions_opt_in || false}
                onChange={(e) => updateField('promotions_opt_in', e.target.checked)}
                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <label htmlFor="promotions_opt_in" className="font-bold text-gray-800 cursor-pointer text-sm block">
                  Participar en promociones de Collectibles
                </label>
                <span className="text-xs text-gray-500 block mt-1">
                  Permitir que mis productos participen en promociones generales de Collectibles.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB COBROS */}
        {activeTab === 'billing' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
                <h3 className="text-lg font-bold text-gray-900">Datos Bancarios de Cobro</h3>
                <span className="bg-gray-100 text-gray-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded ml-2">Privado</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Esta es la cuenta donde Collectibles depositará tus fondos (liquidaciones de Marketplace).</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                  <input 
                    type="text" 
                    value={formData.vendor_payment_settings?.bank_name || ''} 
                    onChange={(e) => updateNested('vendor_payment_settings', 'bank_name', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                    placeholder="Ej: BROU, Itaú, Santander..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Titular</label>
                  <input 
                    type="text" 
                    value={formData.vendor_payment_settings?.account_name || ''} 
                    onChange={(e) => updateNested('vendor_payment_settings', 'account_name', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                  <input 
                    type="text" 
                    value={formData.vendor_payment_settings?.account_number || ''} 
                    onChange={(e) => updateNested('vendor_payment_settings', 'account_number', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                  <select 
                    value={formData.vendor_payment_settings?.currency || 'UYU'} 
                    onChange={(e) => updateNested('vendor_payment_settings', 'currency', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="UYU">Pesos Uruguayos (UYU)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB NOTIFICACIONES */}
        {activeTab === 'notifications' && (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
                <h3 className="text-lg font-bold text-gray-900">WhatsApp Comercial</h3>
                {(() => {
                  const badge = getWhatsAppStateBadge();
                  return <span className={badge.className}>{badge.label}</span>;
                })()}
              </div>
              <p className="text-sm text-gray-500 mb-6">Recibí avisos importantes de tu tienda directamente por WhatsApp.</p>

              {/* Toggle General */}
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200/50 mb-6 shadow-sm">
                <div>
                  <span className="text-sm font-bold text-gray-900">Activar servicio de notificaciones</span>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Habilita o deshabilita los envíos de WhatsApp globalmente.</p>
                </div>
                <button 
                  onClick={() => setNotificationSettings(p => ({ ...p, is_active: !p.is_active }))}
                  className="focus:outline-none"
                >
                  {notificationSettings.is_active ? (
                    <ToggleRight className="w-10 h-10 text-emerald-600 transition-colors" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-gray-300 transition-colors" />
                  )}
                </button>
              </div>

              {/* 3 WhatsApp Numbers Inputs */}
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Números de Destino (Máx 3)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {(() => {
                  const padded = [...(notificationSettings.whatsapp_numbers || [])];
                  while (padded.length < 3) {
                    padded.push({ label: `Número ${padded.length + 1}`, number: '', enabled: false });
                  }
                  return padded.slice(0, 3).map((n, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 relative shadow-sm hover:border-gray-300 transition-colors">
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <input 
                          type="text"
                          value={n.label}
                          onChange={(e) => updateNumberAtIndex(i, 'label', e.target.value)}
                          className="text-xs font-bold text-gray-800 uppercase tracking-wider bg-transparent border-none focus:outline-none w-2/3"
                          placeholder={`Destinatario ${i+1}`}
                        />
                        <label className="flex items-center cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={n.enabled}
                            onChange={(e) => updateNumberAtIndex(i, 'enabled', e.target.checked)}
                            className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black cursor-pointer"
                          />
                          <span className="text-[10px] text-gray-500 ml-1.5 font-medium select-none">Activo</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Número de Celular</label>
                        <input 
                          type="text"
                          value={n.number}
                          onChange={(e) => updateNumberAtIndex(i, 'number', e.target.value)}
                          className="w-full text-xs font-mono px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black"
                          placeholder="Ej: +59899123456"
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Notification Toggles */}
              <div className="bg-gray-50/50 p-6 rounded-xl border border-gray-200/50 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Avisos Disponibles</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'notify_new_sale', label: 'Nueva venta', desc: 'Aviso inmediato al recibir un pedido de tu tienda.' },
                    { key: 'notify_payment_received', label: 'Pago recibido', desc: 'Confirmación de cobro aprobado por el cliente.' },
                    { key: 'notify_order_shipped', label: 'Pedido enviado', desc: 'Aviso al generar la etiqueta de despacho o entrega.' },
                    { key: 'notify_low_stock', label: 'Stock bajo', desc: 'Alerta cuando un producto queda con 2 o menos unidades.' },
                    { key: 'notify_payout_paid', label: 'Liquidación pagada', desc: 'Notificación de fondos transferidos a tu cuenta.' },
                    { key: 'notify_test', label: 'Prueba', desc: 'Envío de un aviso de prueba para verificar el funcionamiento.' },
                  ].map(item => (
                    <label key={item.key} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors shadow-sm">
                      <input 
                        type="checkbox"
                        checked={!!(notificationSettings as any)[item.key]}
                        onChange={(e) => setNotificationSettings(p => ({ ...p, [item.key]: e.target.checked }))}
                        className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-bold text-gray-800">{item.label}</span>
                          {item.key === 'notify_test' && (
                            <button
                              type="button"
                              onClick={handleSendTestNotification}
                              disabled={sendingTest}
                              className="text-[10px] bg-black text-white hover:bg-gray-800 px-2.5 py-1 rounded font-bold transition-all disabled:opacity-50 select-none active:scale-95 ml-2"
                            >
                              {sendingTest ? 'Enviando...' : 'Enviar prueba'}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 font-medium leading-relaxed">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Logs Section */}
              <div className="mt-8 border-t border-gray-100 pt-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">Historial de Notificaciones</h4>
                    <p className="text-xs text-gray-500 mt-1">Registro de envíos realizados para tu tienda.</p>
                  </div>
                  <button 
                    onClick={loadLogs}
                    disabled={loadingLogs}
                    className="text-xs text-gray-500 hover:text-black flex items-center gap-1 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-all active:scale-95"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Recargar
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  {loadingLogs ? (
                    <div className="p-8 text-center text-xs text-gray-500 animate-pulse font-medium">Cargando logs...</div>
                  ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400 font-medium">Aún no se registraron notificaciones para tu tienda.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">
                            <th className="px-6 py-3">Fecha</th>
                            <th className="px-6 py-3">Evento</th>
                            <th className="px-6 py-3">Destinatario</th>
                            <th className="px-6 py-3">Estado</th>
                            <th className="px-6 py-3">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {logs.map((log) => {
                            const statusColors: Record<string, string> = {
                              'sent': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                              'queued': 'bg-blue-50 text-blue-700 border-blue-100',
                              'failed': 'bg-rose-50 text-rose-700 border-rose-100'
                            };
                            const eventLabels: Record<string, string> = {
                              'order_paid': 'Nueva venta / Pago recibido',
                              'payout_paid': 'Liquidación pagada',
                              'low_stock': 'Stock bajo',
                              'shipment_created': 'Pedido enviado',
                              'shipment_delivered': 'Pedido entregado'
                            };
                            return (
                              <tr key={log.id} className="hover:bg-gray-50/50">
                                <td className="px-6 py-3 text-gray-500 font-mono">
                                  {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-3 font-bold text-gray-800">
                                  {eventLabels[log.event_type] || log.event_type}
                                </td>
                                <td className="px-6 py-3 font-mono text-gray-600">
                                  {log.recipient_number_masked}
                                </td>
                                <td className="px-6 py-3">
                                  <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${statusColors[log.status] || 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                                    {log.status}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-gray-500 max-w-xs truncate" title={log.error_message || ''}>
                                  {log.error_message || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB ENVÍOS */}
        {activeTab === 'shipping' && (
          <div className="bg-white rounded-xl">
             <VShipping />
          </div>
        )}

        {/* TAB MERCADO LIBRE */}
        {activeTab === 'mercadolibre' && (
          <div className="bg-white rounded-xl">
             <VMercadoLibre />
          </div>
        )}

        {/* TAB DOCUMENTACIÓN */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-xl">
             <VKyc />
          </div>
        )}

      </div>
    </div>
  );
}
