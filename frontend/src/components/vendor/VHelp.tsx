import { HelpCircle, BookOpen, Mail, ChevronDown, Video, Shield, Package } from 'lucide-react';
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
    <div className="space-y-5 max-w-4xl">
      <h2 className="text-2xl font-black text-gray-900">Centro de Ayuda</h2>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Package, title: 'Guía de Productos', desc: 'Cómo cargar, editar y publicar' },
          { icon: Video, title: 'Tutorial de Envíos', desc: 'Zonas, operadores y SLA' },
          { icon: Shield, title: 'Seguridad & Roles', desc: 'Permisos y auditoría' },
        ].map(g => (
          <div key={g.title} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <g.icon className="w-6 h-6 text-blue-500 mb-2" />
            <p className="text-sm font-black text-gray-900">{g.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{g.desc}</p>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-black text-gray-900">Preguntas Frecuentes</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {faqs.map((f, i) => <FAQ key={i} q={f.q} a={f.a} />)}
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /> Contactar Soporte</h3>
        <p className="text-sm text-gray-600 mb-4">¿No encontrás la respuesta? Envianos un ticket.</p>
        <button className="bg-gray-900 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 transition-colors">Enviar Ticket</button>
        <p className="text-xs text-gray-400 mt-2">soporte@marketplace.com.uy · Respuesta en &lt;24h</p>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setOpen(!open)}>
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-gray-900 pr-4">{q}</p>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <p className="text-sm text-gray-600 mt-3 leading-relaxed">{a}</p>}
    </div>
  );
}
