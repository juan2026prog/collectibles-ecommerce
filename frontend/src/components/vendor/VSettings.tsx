import { useState, useEffect } from 'react';
import { Store, CreditCard, Truck, Link2, Settings, Globe, Save, Camera, Image, Loader2 } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function VSettings() {
  const [activeSection, setActiveSection] = useState('profile');
  const { language, currency, setLanguage, setCurrency } = useLocale();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    store_name: '',
    description: '',
    logo_url: '',
    banner_url: '',
    contact_email: '',
    contact_phone: '',
    social_links: { facebook: '', instagram: '', twitter: '' } as Record<string, string>,
    pickup_address: { street: '', city: '', department: '' } as Record<string, string>,
    shipping_settings: {} as Record<string, any>
  });

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data, error } = await supabase.from('vendors').select('*').eq('id', user!.id).single();
      if (data) {
        setFormData({
          store_name: data.store_name || '',
          description: data.description || '',
          logo_url: data.logo_url || '',
          banner_url: data.banner_url || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          social_links: data.social_links || { facebook: '', instagram: '', twitter: '' },
          pickup_address: data.pickup_address || { street: '', city: '', department: '' },
          shipping_settings: data.shipping_settings || {}
        });
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('vendors').update({
      store_name: formData.store_name,
      description: formData.description,
      logo_url: formData.logo_url,
      banner_url: formData.banner_url,
      contact_email: formData.contact_email,
      contact_phone: formData.contact_phone,
      social_links: formData.social_links,
      pickup_address: formData.pickup_address,
      shipping_settings: formData.shipping_settings
    }).eq('id', user.id);
    setSaving(false);
    if (!error) {
      alert('Perfil guardado exitosamente');
    } else {
      alert('Error guardando perfil: ' + error.message);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateNested = (parent: 'social_links' | 'pickup_address', field: string, value: string) => {
    setFormData(prev => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));
  };

  const sections = [
    { id: 'profile', label: 'Store Identity', icon: Store },
    { id: 'payments', label: 'Payout Hub', icon: CreditCard },
    { id: 'shipping', label: 'Logistics', icon: Truck },
    { id: 'integrations', label: 'Ecosystem', icon: Link2 },
    { id: 'preferences', label: 'Operational', icon: Settings },
    { id: 'international', label: 'Global', icon: Globe, disabled: true },
  ];

  return (
    <div className="max-w-7xl space-y-10 animation-fade-in pb-20">
      <div className="px-4">
         <div className="text-[12px] text-primary-600 font-black uppercase tracking-[0.5em] mb-4">Platform Governance</div>
         <h2 className="text-5xl font-black text-gray-900 tracking-tighter">Configuración del Sistema</h2>
         <p className="text-sm text-gray-500 font-bold mt-4 uppercase tracking-[0.2em]">Ajustes globales de identidad, finanzas y operaciones</p>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-4">
        {sections.map(s => (
          <button key={s.id} onClick={() => !s.disabled && setActiveSection(s.id)}
            className={`px-10 py-6 text-[11px] font-black uppercase tracking-widest flex items-center gap-4 transition-all border whitespace-nowrap rounded-[2rem] shadow-sm ${activeSection === s.id ? 'bg-white text-black border-white scale-105' : s.disabled ? 'bg-gray-50 text-gray-500 border-gray-100 cursor-not-allowed opacity-50' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-white/20'}`}>
            <s.icon className={`w-5 h-5 ${activeSection === s.id ? 'text-primary-600' : ''}`} /> {s.label} {s.disabled && <span className="text-[8px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-2">SOON</span>}
          </button>
        ))}
      </div>

      <div className="px-4">
        {activeSection === 'profile' && (
          <div className="bg-white rounded-[3rem] border border-gray-200 p-12 md:p-16 space-y-16 shadow-sm relative overflow-hidden">
            {loading ? (
               <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-primary-600" /></div>
            ) : (
            <>
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none">
               <Settings className="w-64 h-64 text-gray-900 rotate-12" />
            </div>

            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-primary-600"></div> Información de Entidad
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 <Field label="Nombre Comercial" value={formData.store_name} onChange={(v) => updateField('store_name', v)} />
                 <Field label="Contact Email" value={formData.contact_email} onChange={(v) => updateField('contact_email', v)} />
                 <Field label="Phone Contact" value={formData.contact_phone} onChange={(v) => updateField('contact_phone', v)} />
                 <Field label="Pickup Street" value={formData.pickup_address.street} onChange={(v) => updateNested('pickup_address', 'street', v)} />
                 <Field label="Pickup City" value={formData.pickup_address.city} onChange={(v) => updateNested('pickup_address', 'city', v)} />
                 <Field label="Pickup Department" value={formData.pickup_address.department} onChange={(v) => updateNested('pickup_address', 'department', v)} />
                 <Field label="Instagram URL" value={formData.social_links.instagram} onChange={(v) => updateNested('social_links', 'instagram', v)} />
                 <Field label="Facebook URL" value={formData.social_links.facebook} onChange={(v) => updateNested('social_links', 'facebook', v)} />
                 <Field label="Twitter URL" value={formData.social_links.twitter} onChange={(v) => updateNested('social_links', 'twitter', v)} />
               </div>
            </div>

            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-primary-600"></div> Brand Assets (URLs)
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <Field label="Logo URL" value={formData.logo_url} onChange={(v) => updateField('logo_url', v)} />
                 <Field label="Banner URL" value={formData.banner_url} onChange={(v) => updateField('banner_url', v)} />
               </div>
            </div>

            <div className="relative z-10">
              <label className="block text-[12px] font-black text-gray-400 uppercase tracking-[0.4em] mb-6">Editorial Bio / About</label>
              <textarea rows={4} value={formData.description} onChange={(e) => updateField('description', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 p-8 rounded-[2rem] text-sm font-black text-gray-900 uppercase tracking-widest outline-none focus:border-primary-600 focus:bg-white/[0.08] transition-all resize-none placeholder:text-slate-800 shadow-inner" />
            </div>

            <div className="pt-16 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-10 relative z-10">
               <div className="flex items-center gap-6">
                  <span className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-sm border-2 border-black"></span>
                  <div>
                     <p className="text-[16px] font-black text-emerald-500 uppercase tracking-widest">Estado: Operativo</p>
                     <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-1">Sincronización de catálogo activa</p>
                  </div>
               </div>
               <button onClick={handleSave} disabled={saving} className="bg-primary-600 text-gray-900 text-[12px] font-black uppercase tracking-[0.3em] px-14 py-6 rounded-full hover:bg-[#ff2c68] transition-all flex items-center gap-4 shadow-sm active:scale-95 border border-gray-200 disabled:opacity-50">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Store Profile
               </button>
            </div>
            </>
            )}
          </div>
        )}

        {activeSection === 'payments' && (
          <div className="bg-white rounded-[3rem] border border-gray-200 p-12 md:p-16 space-y-12 animation-fade-in shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none text-gray-900">
               <CreditCard className="w-64 h-64 -rotate-12" />
            </div>
            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-primary-600"></div> Settlement Destination
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Field label="Beneficiary Institution" value="BROU" />
                 <Field label="Account Identification" value="**** **** **** 4521" />
                 <Field label="Legal Entity Name" value="Tienda Demo SRL" />
                 <Field label="Payment Cycle Frequency" value="Semanal (Viernes)" />
               </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-10 rounded-[2.5rem] flex items-center gap-8 shadow-sm relative z-10">
               <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center text-gray-500 shadow-inner">
                  <CreditCard className="w-8 h-8" />
               </div>
               <div>
                  <p className="text-[12px] font-black text-gray-700 uppercase tracking-widest leading-loose">
                     Los cambios en la cuenta de destino requieren verificación manual por seguridad.
                  </p>
                  <p className="text-[10px] text-primary-600 font-black uppercase tracking-widest mt-2">Lead time de verificación: 24h hábiles.</p>
               </div>
            </div>
          </div>
        )}

        {activeSection === 'integrations' && (
          <div className="bg-white rounded-[3rem] border border-gray-200 overflow-hidden animation-fade-in shadow-sm">
            <div className="p-12 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-8">
               <div>
                  <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-2">Ecosystem Nodes</h3>
                  <h4 className="text-3xl font-black text-gray-900 uppercase tracking-widest">Third-Party Connectivity</h4>
               </div>
               <button className="bg-white text-black px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary-600 hover:text-gray-900 transition-all shadow-sm">Scan Network</button>
            </div>
            <div className="divide-y divide-gray-100">
              {[
                { name: 'Mercado Libre', status: 'connected', desc: 'Sync Catálogo & Stock' },
                { name: 'Soy Delivery', status: 'connected', desc: 'Logística Last-Mile MVD' },
                { name: 'DAC', status: 'connected', desc: 'Nacional Shipping Engine' },
                { name: 'Meta Pixel', status: 'pending', desc: 'Conversion Tracking ID' },
                { name: 'Google Analytics', status: 'disconnected', desc: 'Data Analytics Hub' },
              ].map(i => (
                <div key={i.name} className="flex flex-col sm:flex-row items-center justify-between p-10 hover:bg-gray-50 transition-all group">
                  <div className="mb-6 sm:mb-0">
                    <p className="font-black text-gray-900 text-[18px] group-hover:text-primary-600 transition-colors uppercase tracking-tight">{i.name}</p>
                    <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-2 bg-gray-50 px-2 py-0.5 rounded inline-block">{i.desc}</p>
                  </div>
                  <div className="flex items-center gap-10">
                     <div className="flex items-center gap-4">
                       <span className={`w-3 h-3 rounded-full border-2 border-black ${i.status === 'connected' ? 'bg-emerald-500 shadow-sm' : i.status === 'pending' ? 'bg-yellow-500 shadow-sm' : 'bg-slate-800'}`}></span>
                       <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{i.status === 'connected' ? 'Connected' : i.status === 'pending' ? 'Auth Required' : 'Offline'}</span>
                     </div>
                     <button className="text-[10px] font-black text-gray-900 uppercase tracking-widest border border-gray-200 px-8 py-3 rounded-full hover:bg-white hover:text-black transition-all shadow-lg">Configure</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'preferences' && (
          <div className="bg-white rounded-[3rem] border border-gray-200 p-12 md:p-16 space-y-16 animation-fade-in shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none">
               <Globe className="w-64 h-64 text-gray-900 -rotate-12" />
            </div>
            <div className="relative z-10">
              <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                 <div className="w-8 h-[2px] bg-primary-600"></div> System Environment
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-10 rounded-[2rem] bg-gray-50 border border-gray-100 shadow-inner">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6 block">Regional Language</label>
                    <div className="relative">
                       <select
                          className="w-full bg-black border border-gray-200 p-6 rounded-2xl text-sm font-black text-gray-900 uppercase tracking-widest outline-none focus:border-primary-600 transition-all appearance-none cursor-pointer shadow-sm"
                          value={language}
                          onChange={e => setLanguage(e.target.value as any)}
                       >
                          <option value="es">Castellano (ES)</option>
                          <option value="en">English (US)</option>
                       </select>
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                          <Settings className="w-4 h-4" />
                       </div>
                    </div>
                 </div>
                 <div className="p-10 rounded-[2rem] bg-gray-50 border border-gray-100 shadow-inner">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6 block">Financial Currency</label>
                    <div className="relative">
                       <select
                          className="w-full bg-black border border-gray-200 p-6 rounded-2xl text-sm font-black text-gray-900 uppercase tracking-widest outline-none focus:border-primary-600 transition-all appearance-none cursor-pointer shadow-sm"
                          value={currency}
                          onChange={e => setCurrency(e.target.value as any)}
                       >
                          <option value="UYU">Pesos Uruguayos (UYU)</option>
                          <option value="USD">Dólares Estadounidenses (USD)</option>
                          <option value="ARS">Pesos Argentinos (ARS)</option>
                       </select>
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                          <Settings className="w-4 h-4" />
                       </div>
                    </div>
                 </div>
              </div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mt-8 text-center bg-black/20 p-4 rounded-full border border-gray-100 shadow-inner">Nota: Estos cambios alteran la visualización de reportes y dashboards para todos los operadores.</p>
            </div>
            
            <div className="relative z-10">
              <h3 className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 pt-16 border-t border-gray-100 flex items-center gap-4">
                 <div className="w-8 h-[2px] bg-primary-600"></div> Signal Transmission
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'E-mail Broadcasts', checked: true },
                  { label: 'Push Notifications', checked: true },
                  { label: 'Daily Ops Report', checked: false },
                  { label: 'Critical Stock Alerts', checked: true },
                  { label: 'SLA Breach Alarms', checked: true },
                  { label: 'Marketing Hub Data', checked: false },
                ].map(p => (
                  <label key={p.label} className="flex items-center justify-between p-8 bg-gray-50 border border-gray-100 rounded-3xl hover:bg-gray-50 cursor-pointer transition-all group shadow-lg hover:border-primary-600/20">
                     <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-900 transition-colors">{p.label}</span>
                     <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked={p.checked} className="sr-only peer" />
                        <div className="w-12 h-7 bg-black/40 border border-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-700 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:bg-white peer-checked:bg-primary-600 shadow-inner"></div>
                     </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange?: (val: string) => void }) {
  return (
    <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100 group hover:bg-gray-50 transition-all shadow-inner hover:border-primary-600/20">
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 group-hover:text-primary-600 transition-colors">{label}</label>
      <input value={value || ''} onChange={e => onChange?.(e.target.value)} className="w-full bg-transparent text-[16px] font-black text-gray-900 tracking-widest outline-none placeholder:text-slate-800" />
    </div>
  );
}
