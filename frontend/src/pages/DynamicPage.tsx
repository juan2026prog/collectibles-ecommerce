import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FileText, ArrowLeft, Shield, CheckCircle } from 'lucide-react';
import { sanitizeRichHtml } from '../lib/sanitize';

export default function DynamicPage({ forcedSlug }: { forcedSlug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = forcedSlug || routeSlug;
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchPage() {
      if (!slug) {
        setError(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single();

        if (error || !data) throw new Error('Not found');
        setPage(data);
      } catch {
        const s = slug.toLowerCase();
        if (s.includes('privacidad') || s.includes('privacy')) {
          setPage({
            title: 'Políticas de Privacidad',
            slug: 'pol-ticas-de-privacidad',
            updated_at: new Date().toISOString()
          });
        } else if (s.includes('terminos') || s.includes('términos')) {
          setPage({
            title: 'Términos y condiciones',
            slug: 'terminos',
            updated_at: new Date().toISOString()
          });
        } else if (s.includes('condiciones')) {
          setPage({
            title: 'Condiciones de compra',
            slug: 'condiciones-de-compra',
            updated_at: new Date().toISOString()
          });
        } else if (s.includes('envio') || s.includes('envío') || s.includes('devolucion')) {
          setPage({
            title: 'Envíos y devoluciones',
            slug: 'envios-devoluciones',
            updated_at: new Date().toISOString()
          });
        } else {
          setError(true);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [slug]);

  const safeContent = useMemo(() => {
    // Si la página viene de base de datos con contenido personalizado, lo priorizamos
    if (page?.content) {
      return sanitizeRichHtml(page.content);
    }

    const s = slug?.toLowerCase() || '';
    if (s.includes('privacidad') || s.includes('privacy')) {
      return `<div class="space-y-8 font-sans">
  <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-8">
    <p class="text-base md:text-lg text-slate-200 leading-relaxed font-semibold mb-0">
      En <strong class="text-white font-extrabold">Collectibles Uruguay</strong> respetamos la privacidad de nuestros clientes y usuarios. 
      Esta política explica de forma clara y transparente qué datos recopilamos, cómo los utilizamos y qué medidas aplicamos para garantizar su seguridad.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      1. Información que recopilamos
    </h2>
    <p class="text-slate-300 leading-relaxed">Recopilamos únicamente la información necesaria para procesar pedidos, responder consultas y mejorar la experiencia de compra en la tienda. Esto puede incluir:</p>
    <div class="grid md:grid-cols-2 gap-6 my-6">
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all duration-300">
        <h3 class="font-extrabold text-[#f00856] text-xs uppercase tracking-widest mb-3">Datos de Contacto y Envío</h3>
        <p class="text-sm text-slate-400 leading-relaxed mb-0">Nombre completo, correo electrónico, número de teléfono y dirección de entrega para coordinar los envíos en todo el país.</p>
      </div>
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all duration-300">
        <h3 class="font-extrabold text-[#f00856] text-xs uppercase tracking-widest mb-3">Datos de Compra y Actividad</h3>
        <p class="text-sm text-slate-400 leading-relaxed mb-0">Detalles de pedidos, productos seleccionados en el carrito y configuraciones de cuenta del usuario.</p>
      </div>
    </div>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      2. Uso de la información
    </h2>
    <p class="text-slate-300 leading-relaxed">Toda la información personal recopilada es confidencial y se utiliza exclusivamente para:</p>
    <ul class="list-none space-y-3.5 my-6 pl-0">
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Gestionar y entregar tus compras con la agencia seleccionada.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Procesar pagos y validar transacciones de forma segura.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Brindar soporte técnico y atención post-venta personalizada.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Enviar promociones y novedades sobre productos si el usuario se encuentra suscripto.</span>
      </li>
    </ul>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      3. Pagos y seguridad
    </h2>
    <p class="text-slate-300 leading-relaxed">
      Los pagos se procesan mediante proveedores y pasarelas de pago externas con altos estándares de seguridad (SSL). 
      <strong class="text-white">Collectibles Uruguay no almacena</strong> datos completos de tarjetas de crédito o débito ni credenciales bancarias sensibles en sus servidores públicos.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      4. Comunicación con el cliente
    </h2>
    <p class="text-slate-300 leading-relaxed">
      Podemos comunicarnos contigo por correo electrónico, WhatsApp o llamada telefónica con el único objetivo de coordinar el éxito de tu orden, responder tus solicitudes de soporte o confirmar el despacho del producto.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      5. Derechos del usuario
    </h2>
    <p class="text-slate-300 leading-relaxed mb-4">
      Tienes pleno derecho a solicitar el acceso, rectificación o eliminación definitiva de tus datos personales de nuestra base de datos. 
      Puedes hacerlo escribiendo a cualquiera de nuestros canales oficiales de contacto.
    </p>
  </div>
</div>`;
    }

    if (s.includes('condiciones')) {
      return `<div class="space-y-8 font-sans">
  <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-8">
    <p class="text-base md:text-lg text-slate-200 leading-relaxed font-semibold mb-0">
      Al adquirir cualquiera de nuestros productos en el sitio, el comprador acepta y está sujeto a las condiciones y pautas de compra comerciales descritas a continuación.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      Aspectos Generales de Transacción
    </h2>
    <ul class="list-none space-y-3.5 my-6 pl-0">
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Toda transacción se realiza bajo rigurosas medidas de seguridad SSL para proteger los datos de compra.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">El cliente es responsable del resguardo de su contraseña de acceso y uso del perfil.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Los precios del sitio web se expresan en <strong>Pesos Uruguayos (UYU)</strong> e incluyen IVA.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Los precios y promociones están vigentes durante la sesión activa y pueden fluctuar o modificarse sin previo aviso.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Todos los artículos están sujetos a disponibilidad de stock al momento del empaque.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">El cliente dispone de un plazo de hasta 30 días corridos para solicitar cambios de mercadería en stock.</span>
      </li>
    </ul>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      Preventas y Reservas Especiales
    </h2>
    <p class="text-slate-300 leading-relaxed">Los productos disponibles en preventa corresponden a lanzamientos del exterior y tienen características de entrega particulares:</p>
    <div class="bg-gradient-to-r from-red-950/20 to-[#f00856]/5 border border-[#f00856]/20 rounded-2xl p-6 my-6">
      <h3 class="font-extrabold text-[#f00856] text-sm uppercase tracking-wider mb-2">Tiempos de Llegada de Preventa</h3>
      <p class="text-sm text-slate-300 leading-relaxed mb-0">
        Debido a los procesos logísticos y de importación, el producto puede tardar hasta un máximo de <strong>180 días corridos</strong> desde su llegada a nuestro depósito de origen. 
        Si se excede este plazo límite de entrega, el comprador podrá solicitar la devolución completa de su dinero o seña abonada.
      </p>
    </div>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      Datos de Facturación Comercial
    </h2>
    <p class="text-slate-300 leading-relaxed">Toda compra genera una factura legal. Los datos de la firma operadora son:</p>
    <div class="grid sm:grid-cols-2 gap-6 my-6">
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-5">
        <span class="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Razón Social</span>
        <p class="text-white font-extrabold text-base mt-1 mb-0">Sagittarius Importaciones SRL</p>
      </div>
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-5">
        <span class="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">RUT de la Empresa</span>
        <p class="text-white font-extrabold text-base mt-1 mb-0">217180080010</p>
      </div>
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-5">
        <span class="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Correo Institucional</span>
        <p class="text-white font-extrabold text-base mt-1 mb-0">info@collectibles.com.uy</p>
      </div>
      <div class="bg-[#0e1320] border border-white/10 rounded-2xl p-5">
        <span class="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">Teléfono de Soporte</span>
        <p class="text-white font-extrabold text-base mt-1 mb-0">(+598) 096 889 596</p>
      </div>
    </div>
  </div>
</div>`;
    }

    if (s.includes('envio') || s.includes('envío') || s.includes('devolucion')) {
      return `<div class="space-y-8 font-sans">
  <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-8">
    <p class="text-base md:text-lg text-slate-200 leading-relaxed font-semibold mb-0">
      En Collectibles queremos que tu experiencia sea totalmente satisfactoria. Aquí encontrarás la información oficial sobre nuestras políticas de envíos y devoluciones.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      Devoluciones y Cambios
    </h2>
    <p class="text-slate-300 leading-relaxed">Para procesar una devolución o cambio de producto, es requisito indispensable que el artículo:</p>
    <ul class="list-none space-y-3.5 my-6 pl-0">
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Se encuentre en perfectas condiciones, sin marcas de uso ni aperturas.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Conserve todos los empaques, folletos, plásticos protectores y etiquetas originales de fábrica.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Se presente acompañado del ticket de cambio, factura digital o el código de compra correspondiente.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Los cambios de stock estándar deben gestionarse dentro de los primeros 15 días corridos.</span>
      </li>
    </ul>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      Cambios por Agencia o Correo
    </h2>
    <p class="text-slate-300 leading-relaxed">Para realizar cambios a distancia mediante agencias de envío:</p>
    <div class="rounded-2xl border border-white/10 bg-[#101522]/60 p-6 my-6">
      <p class="font-extrabold text-[#f00856] tracking-widest text-[10px] uppercase mb-2">Dirección de Retorno Autorizada</p>
      <p class="text-white font-black text-lg">COLLECTIBLES</p>
      <p class="text-slate-300">Vazquez 1418</p>
      <p class="text-slate-300">Montevideo · CP 11200</p>
      <p class="text-slate-300">Teléfono: 096 889 596</p>
    </div>
    <p class="text-xs text-slate-500 mt-2">Nota: Los costos de envío relacionados con cambios o devoluciones que no provengan de fallas de fábrica correrán por cuenta del cliente.</p>
  </div>
</div>`;
    }

    if (s.includes('terminos') || s.includes('términos')) {
      return `<div class="space-y-8 font-sans">
  <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-8">
    <p class="text-base md:text-lg text-slate-200 leading-relaxed font-semibold mb-0">
      Bienvenido a Collectibles Uruguay. Al acceder, navegar o utilizar este sitio web, usted acepta cumplir y estar sujeto a los siguientes términos y condiciones de uso del servicio.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      1. Productos y Autenticidad
    </h2>
    <p class="text-slate-300 leading-relaxed">
      <strong>Collectibles Uruguay</strong> posee más de 13 años de trayectoria en el mercado y opera como distribuidor autorizado oficial de destacadas marcas internacionales en el país. 
      Nos comprometemos a entregar únicamente productos oficiales, en perfectas condiciones y embalajes sellados de fábrica.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      2. Responsabilidad de Datos
    </h2>
    <p class="text-slate-300 leading-relaxed">
      Es responsabilidad exclusiva del cliente proveer con absoluta precisión los datos para la facturación y el domicilio de entrega. 
      La empresa no se responsabiliza por demoras o retornos de paquetes derivados de información incorrecta suministrada por el usuario.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      3. Pautas Logísticas y Entrega
    </h2>
    <ul class="list-none space-y-3.5 my-6 pl-0">
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Las fotos e imágenes son ilustrativas; las tonalidades y colores reales pueden diferir levemente de la pantalla.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Las medidas y pesos descritos son provistos directamente por el fabricante del artículo.</span>
      </li>
      <li class="flex items-start gap-3">
        <span class="text-[#f00856] font-bold text-base mt-0.5">•</span>
        <span class="text-slate-300">Todo producto es transportado y despachado con la protección adecuada para conservar su estado de colección.</span>
      </li>
    </ul>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      4. Cambios y Derechos de Devolución
    </h2>
    <p class="text-slate-300 leading-relaxed">
      El comprador puede solicitar la devolución del pago o desistimiento de la compra dentro de los primeros 5 días hábiles desde la entrega del paquete. 
      Posteriormente, el cliente tiene hasta 30 días para realizar cambios físicos de productos en stock, siempre y cuando se encuentren cerrados y en perfecto estado.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      5. Seguridad de Cuentas de Usuario
    </h2>
    <p class="text-slate-300 leading-relaxed">
      El usuario es responsable de mantener la confidencialidad de sus datos de acceso. La transferencia de cuentas entre diferentes personas está prohibida, y nos reservamos el derecho de desactivar cuentas que demuestren comportamiento abusivo o fraudulento.
    </p>
  </div>

  <div class="border-t border-white/5 pt-8">
    <h2 class="text-xl md:text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
      <span class="w-1.5 h-6 bg-[#f00856] rounded-full inline-block"></span>
      6. Propiedad Intelectual y Derechos de Autor
    </h2>
    <p class="text-slate-300 leading-relaxed mb-8">
      El diseño de la tienda, logotipos, banners, textos y material gráfico están protegidos por derechos de propiedad intelectual. Queda estrictamente prohibida la copia, reproducción o distribución de cualquier elemento sin autorización previa de la empresa.
    </p>
  </div>
</div>`;
    }

    return sanitizeRichHtml(page?.content || '');
  }, [page?.content, slug]);

  // Dynamic subtitles depending on the current slug
  const pageSubtitle = useMemo(() => {
    if (!slug) return 'Información institucional de Collectibles Uruguay.';
    const s = slug.toLowerCase();
    if (s.includes('privacidad')) {
      return 'Información clara sobre cómo cuidamos tus datos, pedidos y comunicación dentro de Collectibles.';
    }
    if (s.includes('terminos') || s.includes('términos')) {
      return 'Condiciones generales de uso del sitio web, transacciones y responsabilidades de nuestra plataforma.';
    }
    if (s.includes('condiciones')) {
      return 'Información detallada sobre procesos de compra, métodos de pago, envíos y reembolsos.';
    }
    if (s.includes('envio') || s.includes('envío') || s.includes('devolucion')) {
      return 'Detalles sobre las políticas de envío a todo el país y el proceso de cambios y devoluciones.';
    }
    if (s === 'contact') {
      return 'Ponte en contacto con nuestro equipo de soporte para cualquier consulta o inconveniente.';
    }
    if (s === 'about') {
      return 'Conoce nuestra historia, misión y nuestro compromiso con los coleccionistas de Uruguay.';
    }
    return 'Información institucional y pautas oficiales de Collectibles Uruguay.';
  }, [slug]);

  // Sidebar navigation links
  const docLinks = useMemo(() => [
    { name: 'Privacidad', slug: 'pol-ticas-de-privacidad', href: '/page/pol-ticas-de-privacidad' },
    { name: 'Términos', slug: 'terminos', href: '/page/terminos' },
    { name: 'Condiciones', slug: 'condiciones-de-compra', href: '/page/condiciones-de-compra' },
    { name: 'Devoluciones', slug: 'envios-devoluciones', href: '/page/envios-devoluciones' },
    { name: 'Nosotros', slug: 'about', href: '/about' },
    { name: 'Contacto', slug: 'contact', href: '/contact' },
  ], []);

  const formattedDate = useMemo(() => {
    if (!page?.updated_at && !page?.created_at) return 'Mayo 2026';
    const dateStr = page.updated_at || page.created_at;
    try {
      const d = new Date(dateStr);
      const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return `${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return 'Mayo 2026';
    }
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 mt-4 font-medium animate-pulse">Cargando página...</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <FileText className="w-16 h-16 text-slate-500 mb-4" />
        <h1 className="text-3xl font-black text-white mb-2">Página no encontrada</h1>
        <p className="text-slate-400 mb-8 max-w-md">La página que buscas no existe, fue movida o se encuentra actualmente en borrador.</p>
        <Link to="/" className="btn-primary flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Volver al Inicio</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white font-sans bg-[#05070f]">
      {/* HERO DOCUMENTO */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(240,8,86,.15),transparent_40%),linear-gradient(90deg,#05070f_0%,#05070f_55%,#250313_100%)]"></div>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }}></div>
        <div className="relative max-w-[1500px] mx-auto px-6 py-16 md:py-20">
          <div className="max-w-4xl">
            <div className="text-[#f00856] text-xs font-black tracking-[0.35em] uppercase mb-5 animate-pulse">Collectibles Uruguay</div>
            <h1 className="text-4xl md:text-6xl font-black leading-none tracking-tight text-white">{page.title}</h1>
            <p className="text-slate-300 text-lg md:text-xl mt-6 leading-relaxed max-w-3xl font-medium">{pageSubtitle}</p>
          </div>
        </div>
      </section>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-[1500px] mx-auto px-6 py-12 md:py-16 grid lg:grid-cols-[260px_1fr_320px] gap-8 items-start">
        {/* SIDE NAV IZQUIERDO */}
        <aside className="hidden lg:block sticky top-28">
          <div className="rounded-3xl border border-white/10 bg-[#0b0f18] p-5 shadow-xl">
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase mb-4">Documentos</div>
            <nav className="space-y-2 text-sm font-bold text-slate-400">
              {docLinks.map((item) => {
                const isActive = slug === item.slug;
                return (
                  <Link
                    key={item.slug}
                    className={`block rounded-xl px-4 py-3 transition-all duration-200 border ${
                      isActive
                        ? 'bg-[#f00856]/10 border-[#f00856]/30 text-white font-extrabold shadow-md shadow-[#f00856]/5'
                        : 'border-transparent hover:bg-white/5 hover:text-white'
                    }`}
                    to={item.href}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* DOCUMENT CARD CENTRAL */}
        <article className="rounded-[2rem] border border-white/10 bg-[#0b0f18]/80 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden">
          <div className="border-b border-white/10 px-6 md:px-10 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white/[0.01]">
            <div>
              <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase">Documento institucional</div>
              <div className="text-slate-500 text-sm font-bold mt-1">Última actualización: {formattedDate}</div>
            </div>
            <Link to="/shop" className="inline-flex w-fit rounded-full bg-white text-[#05070f] px-5 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all shadow-md">
              Volver al catálogo
            </Link>
          </div>

          <div className="px-6 md:px-10 py-8 md:py-10 text-[15px] md:text-base">
            <div
              className="max-w-none text-[#cbd5e1] font-sans
                [&_h2]:text-white [&_h2]:font-black [&_h2]:text-xl md:[&_h2]:text-2xl [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:tracking-tight [&_h2]:flex [&_h2]:items-center [&_h2]:gap-3
                [&_h2_span]:w-1.5 [&_h2_span]:h-6 [&_h2_span]:bg-[#f00856] [&_h2_span]:rounded-full [&_h2_span]:inline-block
                [&_h2:not(:has(span))]:before:content-[''] [&_h2:not(:has(span))]:before:w-1.5 [&_h2:not(:has(span))]:before:h-6 [&_h2:not(:has(span))]:before:bg-[#f00856] [&_h2:not(:has(span))]:before:rounded-full [&_h2:not(:has(span))]:before:inline-block
                [&_h3]:text-white [&_h3]:font-black [&_h3]:text-[1.1rem] [&_h3]:mt-6 [&_h3]:mb-2
                [&_p]:text-[#cbd5e1] [&_p]:leading-[1.85] [&_p]:mb-4
                [&_ul]:text-[#cbd5e1] [&_ul]:leading-[1.8] [&_ul]:my-4 [&_ul]:pl-5 [&_ul]:list-disc
                [&_li]:mb-1.5
                [&_strong]:text-white [&_strong]:font-extrabold
                [&_a]:text-[#f00856] [&_a]:font-extrabold hover:[&_a]:underline"
              dangerouslySetInnerHTML={{ __html: safeContent }}
            />
          </div>
        </article>

        {/* SIDE NAV DERECHO (HELP CARD) */}
        <aside className="hidden lg:block sticky top-28 space-y-5">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#151b2a] to-[#070a12] p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#f00856]/5 blur-2xl rounded-full transition-transform group-hover:scale-150 duration-500"></div>
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase">Collectibles Uruguay</div>
            <h3 className="text-2xl font-black mt-3 leading-tight text-white">Compra segura para coleccionistas.</h3>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">Productos oficiales, pagos totalmente protegidos y envíos garantizados a todo Uruguay.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0b0f18] p-6 shadow-xl">
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Compra segura
            </div>
            <ul className="mt-4 space-y-3.5 text-sm text-slate-400 font-bold">
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Pagos protegidos SSL
              </li>
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Envíos a todo Uruguay
              </li>
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Garantía de autenticidad
              </li>
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Productos 100% oficiales
              </li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
