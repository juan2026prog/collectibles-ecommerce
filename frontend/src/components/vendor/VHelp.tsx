import { HelpCircle, BookOpen, Mail, ChevronDown, Video, Shield, Package, ArrowRight } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  { q: '¿Cómo cargo un producto?', a: 'Andá a Productos → Crear Producto. Completá nombre, SKU, precio, stock e imágenes. Guardá como borrador o publicá directo.' },
  { q: '¿Cómo importo productos por CSV?', a: 'En Importaciones, subí tu CSV. Mapeá las columnas, validá y confirmá. Podés descargar una plantilla de ejemplo.' },
  { q: '¿Cómo sincronizo con Mercado Libre?', a: 'En la sección Mercado Libre, conectá tu cuenta ML. Luego importá publicaciones o vinculá productos existentes. La sync de stock y precio es automática.' },
  { q: '¿Cómo funcionan las zonas de envío?', a: 'Hay 3 franjas: Cercana ($169), Media ($200) y Lejana ($290). Cada una incluye barrios de Montevideo y área metropolitana. Interior va por DAC.' },
  { q: '¿Qué es la hora de corte?', a: 'Es la hora límite para que un pedido sea elegible para envío en el día. Por defecto 13:00. Configurable por zona y operador.' },
  { q: '¿Cuándo se libera mi pago?', a: 'Los pagos se liquidan semanalmente. Podés ver el detalle en Finanzas → Liquidaciones. El estado pasa de Retenido → Liquidable → Pagado.' },
  { q: '¿Cómo creo reglas automáticas?', a: 'En Automatizaciones podés crear reglas tipo SI/ENTONCES. Ejemplo: SI zona=5,6,7 → costo $169, operador Soy Delivery.' },
  { q: '¿Cómo gestiono múltiples depósitos?', a: 'En Depósitos configurás cada ubicación. Podés transferir stock entre depósitos y asignar reglas automáticas de despacho por zona.' },
  { q: '¿Qué es el SLA logístico?', a: 'Mide el cumplimiento en cada etapa: aceptación, preparación, despacho, entrega. Te alerta cuando un pedido está en riesgo.' },
  { q: '¿Cómo agrego miembros al equipo?', a: 'En Equipo → Invitar Miembro. Asigná un rol (Manager, Logística, Catálogo, etc.) con permisos específicos.' },
];

export default function VHelp() {
  return (
    <div className="max-w-7xl space-y-12 animation-fade-in pb-20 px-4 sm:px-6">
      <div className="space-y-4">
         <div className="text-[12px] text-primary-600 font-black uppercase tracking-[0.5em]">Knowledge Base</div>
         <h2 className="text-5xl font-black text-gray-900 tracking-tighter">Centro de Ayuda</h2>
         <p className="text-sm text-gray-500 font-bold uppercase tracking-widest max-w-2xl leading-relaxed">Documentación técnica, flujos operativos y protocolos de soporte para el ecosistema FigusUY</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { icon: Package, title: 'Guía de Productos', desc: 'Cómo cargar, editar y publicar' },
          { icon: Video, title: 'Tutorial de Envíos', desc: 'Zonas, operadores y SLA' },
          { icon: Shield, title: 'Seguridad & Roles', desc: 'Permisos y auditoría' },
        ].map(g => (
          <div key={g.title} className="bg-white rounded-[2rem] border border-gray-200 p-10 group hover:bg-gray-50 transition-all cursor-pointer relative overflow-hidden shadow-sm active:scale-[0.98]">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <g.icon className="w-24 h-24 text-gray-900" />
            </div>
            <div className="w-14 h-14 rounded-2xl bg-primary-100 border border-primary-600/20 flex items-center justify-center mb-8 group-hover:bg-primary-600 group-hover:text-gray-900 transition-all shadow-lg group-hover:shadow-sm/30">
               <g.icon className="w-7 h-7" />
            </div>
            <p className="text-xl font-black text-gray-900 uppercase tracking-widest group-hover:text-primary-600 transition-colors mb-2">{g.title}</p>
            <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest leading-relaxed">{g.desc}</p>
            <div className="mt-8 flex items-center gap-2 text-primary-600 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
              Read Protocol <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* FAQs */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-10 border-b border-gray-100 bg-gray-50 flex items-center gap-5">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.5em]">Preguntas Frecuentes (FAQ)</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {faqs.map((f, i) => <FAQ key={i} q={f.q} a={f.a} />)}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-[2.5rem] border border-primary-600/30 bg-primary-50 p-12 text-center group hover:bg-primary-100 transition-all h-fit sticky top-32 shadow-sm">
          <div className="w-24 h-24 bg-primary-600 text-gray-900 flex items-center justify-center mx-auto mb-10 rounded-[2rem] shadow-sm border border-white/20 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
             <Mail className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest mb-6">Contactar Soporte</h3>
          <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.2em] leading-relaxed mb-12 px-4">
             ¿No encontrás la respuesta? <br/> Nuestro equipo de operaciones está listo para ayudarte en tiempo real.
          </p>
          <button className="w-full bg-white text-black text-[12px] font-black uppercase tracking-[0.2em] py-6 rounded-full hover:bg-primary-600 hover:text-gray-900 transition-all shadow-sm hover:shadow-sm/30 active:scale-95 border border-gray-200">
             Abrir Ticket de Soporte
          </button>
          <div className="mt-12 space-y-2">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
               soporte@marketplace.com.uy
            </p>
            <p className="text-[9px] text-primary-600 font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2">
               <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-sm"></span> Respuesta estimada: &lt; 4h
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-10 cursor-pointer hover:bg-gray-50 transition-all group relative overflow-hidden" onClick={() => setOpen(!open)}>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-primary-600 transition-colors"></div>
      <div className="flex justify-between items-center gap-8">
        <p className="text-[15px] font-black text-gray-900 uppercase tracking-widest group-hover:text-primary-600 transition-colors leading-relaxed">{q}</p>
        <div className={`w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center transition-all ${open ? 'bg-primary-200' : ''}`}>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-500 ${open ? 'rotate-180 text-primary-600' : ''}`} />
        </div>
      </div>
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${open ? 'max-h-[200px] opacity-100 mt-10' : 'max-h-0 opacity-0'}`}>
        <div className="pt-8 border-t border-gray-100">
           <p className="text-sm text-gray-500 font-bold leading-relaxed uppercase tracking-widest bg-gray-50 p-6 rounded-2xl border border-gray-100">{a}</p>
        </div>
      </div>
    </div>
  );
}
