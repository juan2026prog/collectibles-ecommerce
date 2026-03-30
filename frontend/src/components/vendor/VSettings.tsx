import { useState } from 'react';
import { Store, CreditCard, Truck, Link2, Settings, Globe, Save, Camera, Image } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';

export default function VSettings() {
  const [activeSection, setActiveSection] = useState('profile');
  const { language, currency, setLanguage, setCurrency } = useLocale();

  const sections = [
    { id: 'profile', label: 'Perfil de Tienda', icon: Store },
    { id: 'payments', label: 'Cobros', icon: CreditCard },
    { id: 'shipping', label: 'Envíos', icon: Truck },
    { id: 'integrations', label: 'Integraciones', icon: Link2 },
    { id: 'preferences', label: 'Preferencias', icon: Settings },
    { id: 'international', label: 'Internacional', icon: Globe, disabled: true },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <h2 className="text-2xl font-black text-gray-900">Configuración</h2>
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => (
          <button key={s.id} onClick={() => !s.disabled && setActiveSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-all ${activeSection === s.id ? 'bg-gray-900 text-white' : s.disabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            <s.icon className="w-4 h-4" /> {s.label} {s.disabled && <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded ml-1">Próx.</span>}
          </button>
        ))}
      </div>

      {activeSection === 'profile' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Datos del Negocio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre Comercial" value="Tienda Demo" />
            <Field label="Razón Social" value="Tienda Demo SRL" />
            <Field label="RUT" value="21-234567-0001" />
            <Field label="País" value="Uruguay" />
            <Field label="Departamento" value="Montevideo" />
            <Field label="Ciudad" value="Montevideo" />
            <div className="md:col-span-2"><Field label="Dirección Operativa" value="Av. Italia 3200" /></div>
            <Field label="Teléfono" value="+598 99 123 456" />
            <Field label="Email" value="admin@tiendademo.com.uy" />
          </div>
          <div className="flex gap-4 mt-4">
            <div className="w-24 h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
              <Camera className="w-5 h-5 text-gray-400 mb-1" /><span className="text-[10px] text-gray-400 font-bold">Logo</span>
            </div>
            <div className="flex-1 h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
              <Image className="w-5 h-5 text-gray-400 mb-1" /><span className="text-[10px] text-gray-400 font-bold">Banner</span>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Descripción de la Tienda</label>
            <textarea rows={3} defaultValue="Tienda de moda urbana con envíos en el día para Montevideo." className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm outline-none focus:border-blue-500 resize-none" />
          </div>

          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest pt-4 border-t border-gray-100">Configuración Comercial</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Moneda Principal" value="UYU ($)" />
            <Field label="Tiempo de Despacho" value="24-48 horas" />
            <div className="md:col-span-2"><Field label="Políticas de Devolución" value="7 días desde la entrega" /></div>
            <Field label="Horarios Operativos" value="L-V 9:00-18:00, Sáb 9:00-13:00" />
            <Field label="Métodos de Cobro" value="Transferencia BROU" />
          </div>

          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest pt-4 border-t border-gray-100">Estado de Cuenta</h3>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
            <span className="text-sm font-bold text-green-700">Activo</span>
          </div>
          <p className="text-xs text-gray-500">Estados posibles: Activo · Pendiente de Validación · Pausado · Suspendido</p>

          <button className="bg-gray-900 text-white font-bold px-8 py-3 rounded-lg hover:bg-gray-800 flex items-center gap-2 mt-4"><Save className="w-4 h-4" /> Guardar Cambios</button>
        </div>
      )}

      {activeSection === 'payments' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-gray-900">Configuración de Cobros</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Banco" value="BROU" />
            <Field label="Cuenta" value="**** **** **** 4521" />
            <Field label="Titular" value="Tienda Demo SRL" />
            <Field label="Frecuencia de Liquidación" value="Semanal (Viernes)" />
          </div>
        </div>
      )}

      {activeSection === 'integrations' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-gray-900">Integraciones</h3>
          {[
            { name: 'Mercado Libre', status: 'connected', desc: 'Sincronización de catálogo y stock' },
            { name: 'Soy Delivery', status: 'connected', desc: 'Envíos en el día MVD' },
            { name: 'DAC', status: 'connected', desc: 'Envíos al interior' },
            { name: 'Meta Pixel', status: 'pending', desc: 'Tracking de conversiones' },
            { name: 'Google Analytics', status: 'disconnected', desc: 'Analytics web' },
          ].map(i => (
            <div key={i.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-bold text-gray-900 text-sm">{i.name}</p>
                <p className="text-xs text-gray-500">{i.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${i.status === 'connected' ? 'bg-green-400' : i.status === 'pending' ? 'bg-yellow-400' : 'bg-gray-300'}`}></span>
                <span className="text-xs font-bold text-gray-600 capitalize">{i.status === 'connected' ? 'Conectado' : i.status === 'pending' ? 'Pendiente' : 'Desconectado'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'shipping' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-black text-gray-900 mb-3">Configuración de Envíos</h3>
          <p className="text-sm text-gray-500">Usá la sección <span className="font-bold">Envíos</span> del menú lateral para configurar operadores, zonas y horarios de corte.</p>
        </div>
      )}

      {activeSection === 'preferences' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-8">
          <div>
            <h3 className="text-sm font-black text-gray-900 mb-4">Idioma y Moneda (Global)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-gray-50 rounded-xl border border-gray-200/50">
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Idioma del Panel</label>
                  <select
                     className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                     value={language}
                     onChange={e => setLanguage(e.target.value as any)}
                  >
                     <option value="es">Español</option>
                     <option value="en">English (US)</option>
                  </select>
               </div>
               <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Moneda de Visualización</label>
                  <select
                     className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500"
                     value={currency}
                     onChange={e => setCurrency(e.target.value as any)}
                  >
                     <option value="UYU">Pesos Uruguayos (UYU)</option>
                     <option value="USD">Dólares Estadounidenses (USD)</option>
                     <option value="ARS">Pesos Argentinos (ARS)</option>
                  </select>
               </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 ml-1">Nota: Esta configuración afecta cómo visualizas toda la plataforma.</p>
          </div>
          
          <div>
            <h3 className="text-sm font-black text-gray-900 mb-4 border-t border-gray-100 pt-6">Notificaciones</h3>
            <div className="space-y-3">
              {[
                { label: 'Notificaciones por email', checked: true },
                { label: 'Notificaciones push en navegador', checked: true },
                { label: 'Resumen diario de ventas', checked: false },
                { label: 'Alertas críticas de stock bajo', checked: true },
                { label: 'Alertas de vencimiento de SLA', checked: true },
              ].map(p => (
                <label key={p.label} className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl cursor-pointer border border-transparent transition-colors">
                  <input type="checkbox" defaultChecked={p.checked} className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <span className="text-sm font-semibold text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</label>
      <input defaultValue={value} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-500" />
    </div>
  );
}
