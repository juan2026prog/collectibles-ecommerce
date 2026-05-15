import { useState } from 'react';
import { Store, CreditCard, Truck, Link2, Settings, Globe, Save, Camera, Image } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';

export default function VSettings() {
  const [activeSection, setActiveSection] = useState('profile');
  const { language, currency, setLanguage, setCurrency } = useLocale();

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
         <div className="text-[12px] text-[#f00856] font-black uppercase tracking-[0.5em] mb-4">Platform Governance</div>
         <h2 className="text-5xl font-black text-white tracking-tighter">Configuración del Sistema</h2>
         <p className="text-sm text-slate-500 font-bold mt-4 uppercase tracking-[0.2em]">Ajustes globales de identidad, finanzas y operaciones</p>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-4">
        {sections.map(s => (
          <button key={s.id} onClick={() => !s.disabled && setActiveSection(s.id)}
            className={`px-10 py-6 text-[11px] font-black uppercase tracking-widest flex items-center gap-4 transition-all border whitespace-nowrap rounded-[2rem] shadow-xl ${activeSection === s.id ? 'bg-white text-black border-white scale-105' : s.disabled ? 'bg-white/5 text-slate-700 border-white/5 cursor-not-allowed opacity-50' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
            <s.icon className={`w-5 h-5 ${activeSection === s.id ? 'text-[#f00856]' : ''}`} /> {s.label} {s.disabled && <span className="text-[8px] bg-white/10 text-slate-500 px-2 py-0.5 rounded-full ml-2">SOON</span>}
          </button>
        ))}
      </div>

      <div className="px-4">
        {activeSection === 'profile' && (
          <div className="glass rounded-[3rem] border border-white/10 p-12 md:p-16 space-y-16 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none">
               <Settings className="w-64 h-64 text-white rotate-12" />
            </div>

            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-[#f00856]"></div> Información de Entidad
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 <Field label="Nombre Comercial" value="Tienda Demo" />
                 <Field label="Razón Social" value="Tienda Demo SRL" />
                 <Field label="Tax ID / RUT" value="21-234567-0001" />
                 <Field label="Ubicación Sede" value="Uruguay" />
                 <Field label="Región / Depto" value="Montevideo" />
                 <Field label="City Hub" value="Montevideo" />
                 <div className="md:col-span-2 lg:col-span-3"><Field label="Physical Address" value="Av. Italia 3200" /></div>
                 <Field label="Phone Contact" value="+598 99 123 456" />
                 <Field label="Operations Email" value="admin@tiendademo.com.uy" />
               </div>
            </div>

            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-[#f00856]"></div> Brand Assets
               </h3>
               <div className="flex flex-col sm:flex-row gap-6">
                 <div className="w-48 h-48 rounded-[2.5rem] bg-white/5 border-2 border-white/10 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:border-[#f00856]/50 transition-all group shadow-inner">
                   <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-[#f00856]/10 transition-all">
                      <Camera className="w-7 h-7 text-slate-700 group-hover:text-[#f00856] transition-colors" />
                   </div>
                   <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-4 group-hover:text-white transition-colors">Upload Logo</span>
                 </div>
                 <div className="flex-1 h-48 rounded-[2.5rem] bg-white/5 border-2 border-white/10 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.08] hover:border-[#f00856]/50 transition-all group shadow-inner relative overflow-hidden">
                   <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-[#f00856]/10 transition-all">
                      <Image className="w-7 h-7 text-slate-700 group-hover:text-[#f00856] transition-colors" />
                   </div>
                   <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-4 group-hover:text-white transition-colors">Upload Hero Banner</span>
                 </div>
               </div>
            </div>

            <div className="relative z-10">
              <label className="block text-[12px] font-black text-slate-600 uppercase tracking-[0.4em] mb-6">Editorial Bio / About</label>
              <textarea rows={4} defaultValue="Tienda de moda urbana con envíos en el día para Montevideo." 
                className="w-full bg-white/5 border border-white/10 p-8 rounded-[2rem] text-sm font-black text-white uppercase tracking-widest outline-none focus:border-[#f00856] focus:bg-white/[0.08] transition-all resize-none placeholder:text-slate-800 shadow-inner" />
            </div>

            <div className="pt-16 border-t border-white/5 relative z-10">
               <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-[#f00856]"></div> Operational Parameters
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <Field label="Primary Currency" value="UYU ($)" />
                 <Field label="SLA / Handling Time" value="24-48 horas" />
                 <div className="md:col-span-2"><Field label="Refund Policy Terms" value="7 días desde la entrega" /></div>
                 <Field label="Active Hours" value="L-V 9:00-18:00, Sáb 9:00-13:00" />
                 <Field label="Default Settlement" value="Transferencia BROU" />
               </div>
            </div>

            <div className="pt-16 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-10 relative z-10">
               <div className="flex items-center gap-6">
                  <span className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.6)] border-2 border-black"></span>
                  <div>
                     <p className="text-[16px] font-black text-emerald-500 uppercase tracking-widest">Estado: Operativo</p>
                     <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-1">Sincronización de catálogo activa</p>
                  </div>
               </div>
               <button className="bg-[#f00856] text-white text-[12px] font-black uppercase tracking-[0.3em] px-14 py-6 rounded-full hover:bg-[#ff2c68] transition-all flex items-center gap-4 shadow-[0_0_50px_rgba(240,8,86,0.4)] active:scale-95 border border-white/10">
                  <Save className="w-5 h-5" /> Save Store Profile
               </button>
            </div>
          </div>
        )}

        {activeSection === 'payments' && (
          <div className="glass rounded-[3rem] border border-white/10 p-12 md:p-16 space-y-12 animation-fade-in shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none text-white">
               <CreditCard className="w-64 h-64 -rotate-12" />
            </div>
            <div className="relative z-10">
               <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                  <div className="w-8 h-[2px] bg-[#f00856]"></div> Settlement Destination
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Field label="Beneficiary Institution" value="BROU" />
                 <Field label="Account Identification" value="**** **** **** 4521" />
                 <Field label="Legal Entity Name" value="Tienda Demo SRL" />
                 <Field label="Payment Cycle Frequency" value="Semanal (Viernes)" />
               </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 p-10 rounded-[2.5rem] flex items-center gap-8 shadow-xl relative z-10">
               <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-500 shadow-inner">
                  <CreditCard className="w-8 h-8" />
               </div>
               <div>
                  <p className="text-[12px] font-black text-slate-300 uppercase tracking-widest leading-loose">
                     Los cambios en la cuenta de destino requieren verificación manual por seguridad.
                  </p>
                  <p className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mt-2">Lead time de verificación: 24h hábiles.</p>
               </div>
            </div>
          </div>
        )}

        {activeSection === 'integrations' && (
          <div className="glass rounded-[3rem] border border-white/10 overflow-hidden animation-fade-in shadow-2xl">
            <div className="p-12 border-b border-white/5 bg-white/[0.04] flex flex-col md:flex-row md:items-center justify-between gap-8">
               <div>
                  <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-2">Ecosystem Nodes</h3>
                  <h4 className="text-3xl font-black text-white uppercase tracking-widest">Third-Party Connectivity</h4>
               </div>
               <button className="bg-white text-black px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-[#f00856] hover:text-white transition-all shadow-xl">Scan Network</button>
            </div>
            <div className="divide-y divide-white/5">
              {[
                { name: 'Mercado Libre', status: 'connected', desc: 'Sync Catálogo & Stock' },
                { name: 'Soy Delivery', status: 'connected', desc: 'Logística Last-Mile MVD' },
                { name: 'DAC', status: 'connected', desc: 'Nacional Shipping Engine' },
                { name: 'Meta Pixel', status: 'pending', desc: 'Conversion Tracking ID' },
                { name: 'Google Analytics', status: 'disconnected', desc: 'Data Analytics Hub' },
              ].map(i => (
                <div key={i.name} className="flex flex-col sm:flex-row items-center justify-between p-10 hover:bg-white/[0.02] transition-all group">
                  <div className="mb-6 sm:mb-0">
                    <p className="font-black text-white text-[18px] group-hover:text-[#f00856] transition-colors uppercase tracking-tight">{i.name}</p>
                    <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2 bg-white/5 px-2 py-0.5 rounded inline-block">{i.desc}</p>
                  </div>
                  <div className="flex items-center gap-10">
                     <div className="flex items-center gap-4">
                       <span className={`w-3 h-3 rounded-full border-2 border-black ${i.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : i.status === 'pending' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-slate-800'}`}></span>
                       <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{i.status === 'connected' ? 'Connected' : i.status === 'pending' ? 'Auth Required' : 'Offline'}</span>
                     </div>
                     <button className="text-[10px] font-black text-white uppercase tracking-widest border border-white/10 px-8 py-3 rounded-full hover:bg-white hover:text-black transition-all shadow-lg">Configure</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'preferences' && (
          <div className="glass rounded-[3rem] border border-white/10 p-12 md:p-16 space-y-16 animation-fade-in shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none">
               <Globe className="w-64 h-64 text-white -rotate-12" />
            </div>
            <div className="relative z-10">
              <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                 <div className="w-8 h-[2px] bg-[#f00856]"></div> System Environment
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-10 rounded-[2rem] bg-white/[0.03] border border-white/5 shadow-inner">
                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 block">Regional Language</label>
                    <div className="relative">
                       <select
                          className="w-full bg-black border border-white/10 p-6 rounded-2xl text-sm font-black text-white uppercase tracking-widest outline-none focus:border-[#f00856] transition-all appearance-none cursor-pointer shadow-xl"
                          value={language}
                          onChange={e => setLanguage(e.target.value as any)}
                       >
                          <option value="es">Castellano (ES)</option>
                          <option value="en">English (US)</option>
                       </select>
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                          <Settings className="w-4 h-4" />
                       </div>
                    </div>
                 </div>
                 <div className="p-10 rounded-[2rem] bg-white/[0.03] border border-white/5 shadow-inner">
                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.3em] mb-6 block">Financial Currency</label>
                    <div className="relative">
                       <select
                          className="w-full bg-black border border-white/10 p-6 rounded-2xl text-sm font-black text-white uppercase tracking-widest outline-none focus:border-[#f00856] transition-all appearance-none cursor-pointer shadow-xl"
                          value={currency}
                          onChange={e => setCurrency(e.target.value as any)}
                       >
                          <option value="UYU">Pesos Uruguayos (UYU)</option>
                          <option value="USD">Dólares Estadounidenses (USD)</option>
                          <option value="ARS">Pesos Argentinos (ARS)</option>
                       </select>
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                          <Settings className="w-4 h-4" />
                       </div>
                    </div>
                 </div>
              </div>
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] mt-8 text-center bg-black/20 p-4 rounded-full border border-white/5 shadow-inner">Nota: Estos cambios alteran la visualización de reportes y dashboards para todos los operadores.</p>
            </div>
            
            <div className="relative z-10">
              <h3 className="text-[12px] font-black text-[#f00856] uppercase tracking-[0.5em] mb-10 pt-16 border-t border-white/5 flex items-center gap-4">
                 <div className="w-8 h-[2px] bg-[#f00856]"></div> Signal Transmission
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
                  <label key={p.label} className="flex items-center justify-between p-8 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.06] cursor-pointer transition-all group shadow-lg hover:border-[#f00856]/20">
                     <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">{p.label}</span>
                     <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked={p.checked} className="sr-only peer" />
                        <div className="w-12 h-7 bg-black/40 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-slate-700 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:bg-white peer-checked:bg-[#f00856] shadow-inner"></div>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 group hover:bg-white/[0.06] transition-all shadow-inner hover:border-[#f00856]/20">
      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 group-hover:text-[#f00856] transition-colors">{label}</label>
      <input defaultValue={value} className="w-full bg-transparent text-[16px] font-black text-white uppercase tracking-widest outline-none placeholder:text-slate-800" />
    </div>
  );
}
