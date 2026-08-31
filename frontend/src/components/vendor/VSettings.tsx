import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import VMercadoLibre from './VMercadoLibre';
import VShipping from './VShipping';
import VKyc from './VKyc';
import VTermsSettings from './VTermsSettings';
import { User, CreditCard, Truck, Link2, FileText, Save, UploadCloud, Bell, AlertCircle, CheckCircle2, RefreshCw, ToggleLeft, ToggleRight, ShieldCheck, Smartphone, Mail, MessageSquare, BellRing, Settings } from 'lucide-react';
import { EmailRecipientsModal, type EmailRecipient } from '../common/EmailRecipientsModal';
import { MobilePushSetup } from '../common/MobilePushSetup';
import {
  requestAndRegisterPush,
  unregisterCurrentDevice,
  getPushStatus,
  getUserDevices,
  getMobilePlatform,
  type PushStatusInfo,
  type DeviceSubscriptionRecord
} from '../../lib/pushNotifications';

import { normalizeSettingsTab } from '../../config/vendorNavigation';
import { getStoreTypeLabel, type StoreType } from '../../config/conditionConfig';

export default function VSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [storeType, setStoreType] = useState<StoreType>('standard');
  
  const rawSub = searchParams.get('sub') || searchParams.get('section') || searchParams.get('settingsTab');
  const activeTab = normalizeSettingsTab(rawSub);

  const setActiveTab = (tab: string) => {
    const canonical = normalizeSettingsTab(tab);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'settings');
      next.set('sub', canonical);
      return next;
    }, { replace: false });
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

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    id: '',
    whatsapp_numbers: [] as { label: string; number: string; enabled: boolean }[],
    email_recipients: [] as EmailRecipient[],
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
  const [userDevices, setUserDevices] = useState<DeviceSubscriptionRecord[]>([]);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatusInfo>({
    state: 'default',
    isIOSNonStandalone: false,
    subscriptionId: null,
    optedIn: false,
    appIdConfigured: true,
  });

  const loadDevices = async () => {
    if (!user) return;
    const devs = await getUserDevices(user.id);
    setUserDevices(devs);
    const status = await getPushStatus();
    setPushStatus(status);
  };

  const handleRegisterDevice = async () => {
    if (!user) return;
    setRegisteringPush(true);
    try {
      const res = await requestAndRegisterPush(user.id, user.id);
      if (res.success) {
        toast.success('¡Notificaciones Push activadas correctamente en este dispositivo!');
      } else {
        toast.error(res.error || 'No se pudieron activar las notificaciones Push');
      }
      await loadDevices();
    } catch (err: any) {
      toast.error(err.message || 'Error al solicitar permiso Push');
    } finally {
      setRegisteringPush(false);
    }
  };

  const handleUnregisterDevice = async () => {
    if (!user) return;
    try {
      await unregisterCurrentDevice(user.id);
      toast.success('Notificaciones desactivadas únicamente en este dispositivo');
      await loadDevices();
    } catch (err: any) {
      toast.error('Error al desactivar este dispositivo');
    }
  };

  const handleSendTestNotification = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          event_type: 'test_notification',
          vendor_id: user.id,
          user_ids: [user.id]
        }
      });
      if (error) throw error;
      toast.success('Notificación de prueba enviada');
      try {
        await loadLogs();
      } catch (logErr) {
        console.warn('Could not refresh vendor notification logs:', logErr);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la notificación de prueba');
    } finally {
      setSendingTest(false);
    }
  };

  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const saveVendorNotifications = async (showToast = true, customState?: typeof notificationSettings) => {
    if (!user) return;
    const targetState = customState || notificationSettings;
    const numbers = targetState.whatsapp_numbers || [];
    
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

    // Email Recipients Validation (Max 3, format check if active)
    const emails = targetState.email_recipients || [];
    if (emails.length > 3) {
      throw new Error('Solo se permiten hasta 3 destinatarios de Email.');
    }
    for (const r of emails) {
      if (r.active && (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()))) {
        throw new Error(`El destinatario "${r.name || 'Email'}" está activo pero no tiene un correo electrónico válido.`);
      }
    }

    const payload = {
      vendor_id: user.id,
      whatsapp_numbers: numbers,
      email_recipients: emails,
      notify_new_sale: targetState.notify_new_sale,
      notify_payment_received: targetState.notify_payment_received,
      notify_order_shipped: targetState.notify_order_shipped,
      notify_low_stock: targetState.notify_low_stock,
      notify_payout_paid: targetState.notify_payout_paid,
      notify_test: targetState.notify_test,
      is_active: targetState.is_active,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('vendor_notification_settings')
      .upsert(payload, { onConflict: 'vendor_id' });
    if (error) throw error;
    if (showToast) toast.success('Configuración de notificaciones guardada');
  };

  const handleSendTestEmail = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    setSendingTestEmail(true);
    try {
      // Auto-save vendor notification settings silently first
      await saveVendorNotifications(false);

      const activeEmails = (notificationSettings.email_recipients || [])
        .filter(r => r.active && r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()))
        .map(r => r.email.trim());

      if (activeEmails.length === 0) {
        toast.error('No hay destinatarios Email activos configurados.');
        setSendingTestEmail(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          event_type: 'test_notification',
          channel: 'email',
          vendor_id: user.id
        }
      });

      if (error) {
        const status = (error as any)?.status;
        const msg = error.message || '';

        if (status === 422 && (msg.includes('No hay destinatarios Email') || msg.includes('no_active_recipients'))) {
          toast.error('No hay destinatarios Email configurados.');
        } else if (status === 503 || msg.includes('provider_unavailable') || msg.includes('503')) {
          toast.error('El servicio de Email no está disponible');
        } else if (status === 422 || msg.includes('authenticated email') || msg.includes('422')) {
          toast.error('No hay destinatarios Email configurados.');
        } else if (status === 401 || msg.includes('Unauthorized') || msg.includes('401')) {
          toast.error('Sesión no autenticada');
        } else {
          toast.error(msg || 'No se pudo enviar el Email de prueba');
        }
        return;
      }

      if (data?.status === 'no_active_recipients') {
        toast.error('No hay destinatarios Email configurados.');
        return;
      }

      if (data?.status === 'provider_unavailable') {
        toast.error('El servicio de Email no está disponible');
        return;
      }

      toast.success(`Correo enviado a: ${activeEmails.join(', ')}`);
      try {
        await loadLogs();
      } catch (logErr) {
        console.warn('Could not refresh vendor notification logs:', logErr);
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo enviar el Email de prueba');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const loadNotificationSettings = async () => {
    if (!user) return;
    loadDevices();
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
          email_recipients: data.email_recipients || [],
          notify_new_sale: !!data.notify_new_sale,
          notify_payment_received: !!data.notify_payment_received,
          notify_order_shipped: !!data.notify_order_shipped,
          notify_low_stock: !!data.notify_low_stock,
          notify_payout_paid: !!data.notify_payout_paid,
          notify_test: !!data.notify_test,
          is_active: !!data.is_active
        });
      } else {
        const defaultPhone = formData.contact_phone || '';
        const isDefaultPhoneValid = defaultPhone.startsWith('+598') && defaultPhone.length >= 11;
        const defaultEmail = formData.contact_email || user.email || '';
        setNotificationSettings({
          id: '',
          whatsapp_numbers: [
            { label: 'Dueño', number: defaultPhone, enabled: isDefaultPhoneValid },
            { label: 'Depósito', number: '', enabled: false },
            { label: 'Administración', number: '', enabled: false }
          ],
          email_recipients: [
            { id: 'v-def-1', name: 'Dueño', email: defaultEmail, active: !!defaultEmail }
          ],
          notify_new_sale: true,
          notify_payment_received: true,
          notify_order_shipped: true,
          notify_low_stock: true,
          notify_payout_paid: true,
          notify_test: false,
          is_active: true
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
          setStoreType((data.store_type || 'standard') as StoreType);
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

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      if (activeTab === 'notifications') {
        await saveVendorNotifications(true);
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
          vendor_payment_settings: formData.vendor_payment_settings
        };

        const { error: vendorError } = await supabase.from('vendors').update(payload).eq('id', user.id);
        if (vendorError) throw vendorError;

        // Sync store name and branding attributes to public vendor_stores with explicit error handling
        const { error: storeError } = await supabase
          .from('vendor_stores')
          .update({
            store_name: formData.store_name,
            slug: formData.slug,
            description: formData.description,
            logo_url: formData.logo_url,
            banner_url: formData.banner_url,
            contact_email: formData.contact_email,
            contact_phone: formData.contact_phone,
            social_links: formData.social_links,
            updated_at: new Date().toISOString()
          })
          .eq('vendor_id', user.id);

        if (storeError) throw storeError;

        toast.success('Configuración guardada exitosamente');
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      toast.error(err.message || 'Error al guardar');
      setTimeout(() => setSaveStatus('idle'), 4000);
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
    { id: 'profile', label: 'Perfil', fullLabel: 'Perfil', icon: User },
    { id: 'billing', label: 'Cobros', fullLabel: 'Cobros', icon: CreditCard },
    { id: 'shipping', label: 'Envíos', fullLabel: 'Envíos', icon: Truck },
    { id: 'notifications', label: 'Notificaciones', fullLabel: 'Notificaciones', icon: Bell },
    { id: 'mercadolibre', label: 'Mercado Libre', fullLabel: 'Mercado Libre', icon: Link2 },
    { id: 'documents', label: 'Documentación', fullLabel: 'Documentación', icon: FileText },
    { id: 'terms', label: 'Términos', fullLabel: 'Términos y Condiciones', icon: ShieldCheck },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    setTimeout(() => {
      const el = document.getElementById(`tab-${nextTab.id}`);
      if (el) el.focus();
    }, 0);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Cargando configuración...</div>;
  }

  // Define if the current tab has a "Save" button in the parent component.
  // VShipping, VMercadoLibre, and VKyc usually handle their own saving inside.
  const showSaveButton = activeTab === 'profile' || activeTab === 'billing' || activeTab === 'notifications';

  return (
    <div className="max-w-6xl w-full space-y-6 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 pb-6 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Configuración</h2>
          <p className="text-sm text-gray-500 mt-1">Gestioná los datos de tu tienda, cobros, envíos e integraciones.</p>
        </div>
        {showSaveButton && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={handleSave}
              disabled={saving}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-sm shrink-0 ${
                saveStatus === 'saved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : saveStatus === 'error'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-black hover:bg-gray-800 text-white'
              }`}
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>¡Cambios guardados!</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle className="w-4 h-4 text-white" />
                  <span>Error al guardar</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar cambios</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Navigation: Mobile Select (< md) & Desktop/Tablet Tabs (>= md) */}
      <div>
        {/* Mobile Dropdown */}
        <div className="md:hidden">
          <label htmlFor="vendor-settings-tab-select" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Sección de configuración
          </label>
          <select
            id="vendor-settings-tab-select"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm focus:ring-2 focus:ring-black focus:border-black transition-all cursor-pointer"
          >
            {tabs.map(tab => (
              <option key={tab.id} value={tab.id}>
                {tab.fullLabel || tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop/Tablet Horizontal Tablist */}
        <div
          role="tablist"
          aria-label="Secciones de configuración"
          className="hidden md:flex items-center gap-1.5 border-b border-gray-200 overflow-x-auto pb-0.5 scrollbar-thin scroll-smooth focus:outline-none"
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs lg:text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 rounded-t-lg ${
                  isActive 
                    ? 'border-black text-black bg-gray-100/80 font-bold shadow-sm' 
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <tab.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="pt-2">
        {/* TAB PERFIL */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tienda (Store Type)</label>
                <div className="w-full px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 flex items-center justify-between">
                  <span>{getStoreTypeLabel(storeType)}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-200 text-gray-600">Solo lectura</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-tight">El tipo de tienda es configurado por Collectibles.</p>
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
          <div className="space-y-6 max-w-3xl">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5 shadow-xs">
              <div>
                <h3 className="font-bold text-lg text-gray-950">Centro de Notificaciones</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Gestioná los avisos del marketplace.</p>
              </div>

              {/* Row 1: Avisos internos [ON] */}
              <div className="flex items-center justify-between py-1 min-h-[44px]">
                <div>
                  <span className="text-sm font-bold text-gray-900 block">Avisos internos</span>
                  <span className="text-xs text-gray-500 font-medium">Notificaciones operativas para la tienda</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setNotificationSettings(p => ({ ...p, is_active: !p.is_active }))}
                  className="focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-end cursor-pointer"
                >
                  {notificationSettings.is_active ? (
                    <ToggleRight className="w-9 h-9 text-[#f00856] transition-colors" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-gray-300 transition-colors" />
                  )}
                </button>
              </div>

              <hr className="border-gray-200 dark:border-slate-800" />

              {/* Row 2: Notificaciones en este celular */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="text-sm font-bold text-gray-900">Notificaciones en este celular</h4>
                  {pushStatus.state === 'granted' ? (
                    <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                      ✓ Activo en este dispositivo
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 font-bold">
                      No activo en este dispositivo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    disabled={sendingTest || pushStatus.state !== 'granted'}
                    className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white font-bold text-xs rounded-xl min-h-[44px] hover:bg-gray-200 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {sendingTest ? 'Enviando...' : 'Enviar prueba'}
                  </button>

                  {pushStatus.state === 'granted' ? (
                    <button
                      type="button"
                      onClick={handleUnregisterDevice}
                      className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs rounded-xl min-h-[44px] hover:bg-rose-100 transition-all cursor-pointer"
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRegisterDevice}
                      disabled={registeringPush}
                      className="px-4 py-2 bg-[#f00856] text-white font-bold text-xs rounded-xl min-h-[44px] hover:bg-[#ff2c68] transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {registeringPush ? 'Activando...' : 'Activar'}
                    </button>
                  )}
                </div>
              </div>

              <hr className="border-gray-200 dark:border-slate-800" />

              {/* Row 3: Canales (Push, Email, WhatsApp, SMS) */}
              <div className="space-y-4 pt-1">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Canales de envío</h4>

                {/* Push */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">Push Notifications</span>
                    <span className="text-xs text-gray-500 font-medium">Proveedor configurado</span>
                  </div>
                </div>

                {/* Email */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">Email</span>
                    <span className="text-xs text-gray-500 font-medium">Proveedor configurado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={sendingTestEmail}
                      className="px-3.5 py-2 bg-gray-100 text-gray-900 font-bold text-xs rounded-xl min-h-[44px] hover:bg-gray-200 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {sendingTestEmail ? 'Enviando...' : 'Probar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEmailModalOpen(true)}
                      className="px-3.5 py-2 bg-gray-100 text-gray-900 font-bold text-xs rounded-xl min-h-[44px] hover:bg-gray-200 transition-all cursor-pointer"
                    >
                      Destinatarios
                    </button>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">WhatsApp</span>
                    <span className="text-xs text-amber-600 font-bold">No conectado</span>
                  </div>
                </div>

                {/* SMS */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">SMS</span>
                    <span className="text-xs text-gray-400 font-bold">No configurado</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Email Recipients Modal */}
            <EmailRecipientsModal
              isOpen={isEmailModalOpen}
              onClose={() => setIsEmailModalOpen(false)}
              recipients={notificationSettings.email_recipients || []}
              scope="vendor"
              onSave={async (updatedRecipients) => {
                setNotificationSettings(p => ({ ...p, email_recipients: updatedRecipients }));
              }}
            />
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

        {/* TAB TÉRMINOS Y CONDICIONES */}
        {activeTab === 'terms' && (
          <div className="bg-white rounded-xl">
             <VTermsSettings />
          </div>
        )}

      </div>
    </div>
  );
}
