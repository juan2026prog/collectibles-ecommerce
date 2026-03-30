import { HelpCircle, BookOpen, Shield, Mail, Video, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export default function S2FSupport() {
  const faqs = [
    { q: '¿Cómo grabo un buen video?', a: 'Usá buena iluminación frontal (luz de ventana o ring light), fondo limpio, audio claro. Hablá directo a cámara, mencioná el nombre del destinatario y la ocasión. Duración ideal: 30 segundos a 2 minutos.' },
    { q: '¿Qué pasa si no entrego a tiempo?', a: 'Si superás la fecha límite, el pedido se marca como "vencido". El fan puede solicitar reembolso automático. Te recomendamos configurar límites de pedidos diarios para no saturarte.' },
    { q: '¿Cuándo se libera mi pago?', a: 'El pago se libera cuando el fan reproduce el video, o automáticamente 72 horas después de la entrega. Podés solicitar retiro una vez que el saldo esté "Disponible".' },
    { q: '¿Puedo rechazar un pedido?', a: 'Sí. Podés rechazar cualquier pedido que vaya contra tus reglas de contenido. El fan recibe reembolso completo. Tu tasa de aceptación se registra en tu reputación.' },
    { q: '¿Puedo reemplazar un video ya entregado?', a: 'Sí, podés enviar una corrección/reemplazo siempre que el pedido no esté marcado como "Completado" por el fan.' },
    { q: '¿Qué formatos de video se aceptan?', a: 'MP4, MOV, WEBM y AVI. Máximo 500MB. Resolución recomendada: 1080x1920 (vertical 9:16). Audio AAC o MP3.' },
    { q: '¿Cómo funcionan los pedidos urgentes?', a: 'Los pedidos urgentes tienen un recargo extra y un plazo de entrega más corto (generalmente 24h). Podés activar o desactivar pedidos urgentes desde tu perfil.' },
    { q: '¿Cuánto cobra la plataforma?', a: 'Star2Fan cobra una comisión del 20% sobre el precio del saludo. El 80% restante es tu ganancia neta. Podés ver el detalle en la sección Billetera.' },
  ];

  const guidelines = [
    { title: 'Contenido Permitido', items: ['Saludos personales', 'Felicitaciones', 'Mensajes motivacionales', 'Saludos corporativos', 'Mensajes de ánimo'] },
    { title: 'Contenido Prohibido', items: ['Contenido sexual o explícito', 'Discurso de odio', 'Amenazas o violencia', 'Publicidad de terceros', 'Contenido ilegal', 'Información falsa sobre personas'] },
  ];

  const tips = [
    { icon: '💡', title: 'Iluminación', desc: 'Ubicá la luz frente a vos, nunca atrás. Luz natural de ventana funciona perfecto.' },
    { icon: '🎤', title: 'Audio', desc: 'Grabá en un ambiente silencioso. Si tenés micrófono externo, usalo.' },
    { icon: '📱', title: 'Encuadre', desc: 'Vertical (9:16). Centrate en el frame, dejá espacio arriba.' },
    { icon: '😊', title: 'Energía', desc: 'Sonreí, sé natural. Mencioná el nombre del destinatario al inicio.' },
    { icon: '⏱️', title: 'Duración', desc: '30 segundos a 2 minutos es lo ideal. No te apures pero sé conciso.' },
    { icon: '🔄', title: 'Revisá antes', desc: 'Mirá el video antes de entregarlo. Si no te convence, volvé a grabar.' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-1">Centro de Ayuda</h2>
        <p className="text-gray-500 font-medium">Todo lo que necesitás saber para ser un creador exitoso en Star2Fan.</p>
      </div>

      {/* Tips Grid */}
      <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-2xl p-6">
        <h3 className="text-base font-black text-gray-900 mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-rose-500" /> Tips para Grabar Mejores Videos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tips.map(t => (
            <div key={t.title} className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-rose-100">
              <p className="text-2xl mb-2">{t.icon}</p>
              <p className="text-sm font-black text-gray-900 mb-1">{t.title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-rose-500" />
          <h3 className="text-base font-black text-gray-900">Preguntas Frecuentes</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {faqs.map((faq, i) => <FAQItem key={i} q={faq.q} a={faq.a} />)}
        </div>
      </div>

      {/* Guidelines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {guidelines.map(g => (
          <div key={g.title} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-500" /> {g.title}
            </h3>
            <ul className="space-y-2">
              {g.items.map(item => (
                <li key={item} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${g.title.includes('Prohibido') ? 'bg-red-400' : 'bg-green-400'}`}></span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Refund Policy + Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-rose-500" /> Política de Reembolso
          </h3>
          <div className="text-sm text-gray-600 space-y-2 leading-relaxed">
            <p>• El fan puede solicitar reembolso si el pedido se venció.</p>
            <p>• Si rechazás un pedido, el reembolso es automático.</p>
            <p>• Una vez entregado y visto, no hay reembolso.</p>
            <p>• Disputas se resuelven caso por caso con soporte.</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-rose-500" /> Contactar Soporte
          </h3>
          <p className="text-sm text-gray-600 mb-4">¿Tenés un problema que no se resuelve con las FAQs?</p>
          <button className="bg-rose-600 text-white font-black py-3 px-6 rounded-xl hover:bg-rose-500 transition-colors w-full shadow-md">
            Enviar Ticket de Soporte
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">soporte@star2fan.app</p>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
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
