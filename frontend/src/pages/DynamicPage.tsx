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
    const s = slug?.toLowerCase() || '';
    if (s.includes('privacidad') || s.includes('privacy')) {
      return `<p><strong>Collectibles Uruguay</strong> respecta la privacidad de sus clientes y usuarios. Esta política explica qué datos podemos solicitar, cómo se utilizan y qué medidas aplicamos para protegerlos.</p>

<h2>1. Información que recopilamos</h2>
<p>Podemos recopilar información necesaria para procesar pedidos, responder consultas y mejorar la experiencia de compra. Esto puede incluir nombre, email, teléfono, dirección de envío, productos comprados y datos de facturación.</p>
<ul>
  <li>Datos de contacto para coordinar compras y envíos.</li>
  <li>Información de pedidos y productos agregados al carrito.</li>
  <li>Datos técnicos básicos para seguridad y análisis del sitio.</li>
</ul>

<h2>2. Uso de la información</h2>
<p>Utilizamos tus datos para gestionar compras, confirmar pagos, coordinar entregas, brindar soporte y comunicar información relacionada con productos o promociones de Collectibles.</p>

<h2>3. Pagos y seguridad</h2>
<p>Los pagos se procesan mediante proveedores externos seguros. Collectibles no almacena datos completos de tarjetas ni información bancaria sensible en sus servidores públicos.</p>

<h2>4. Comunicación</h2>
<p>Podemos comunicarnos por email, WhatsApp o redes sociales para responder consultas, confirmar pedidos o enviar información relevante sobre tu compra.</p>

<h2>5. Derechos del usuario</h2>
<p>Podés solicitar acceso, corrección o eliminación de tus datos personales escribiendo a nuestros canales oficiales de contacto.</p>

<h2>6. Cambios en esta política</h2>
<p>Collectibles puede actualizar esta política cuando sea necesario. Los cambios se publicarán en esta misma página.</p>`;
    }

    if (s.includes('condiciones')) {
      return `<p>Al comprar cualquiera de nuestros productos, el cliente acepta los términos y condiciones detallados a continuación.</p>

<ul>
  <li>Todas las transacciones del sitio utilizan sistemas de seguridad para proteger la confidencialidad de los datos personales.</li>
  <li>El cliente es la única persona responsable de sus datos de acceso y contraseña.</li>
  <li>El comprador debe ser mayor de edad para utilizar el sitio web.</li>
  <li>Al realizar una compra, el cliente acepta formar parte de nuestra base de datos para recibir novedades, promociones o comunicaciones comerciales. Puede solicitar la baja en cualquier momento.</li>
  <li>Todos los precios están expresados en pesos uruguayos e incluyen impuestos. Los costos de envío pueden variar según la compra.</li>
  <li>Los precios tienen validez únicamente durante la sesión activa y pueden cambiar sin previo aviso.</li>
  <li>Todos los productos están sujetos a disponibilidad de stock.</li>
  <li>Los colores y medidas son aproximados y pueden variar.</li>
  <li>Los plazos de entrega y retiro son estimados.</li>
  <li>No todos los productos disponibles en el sitio se encuentran necesariamente disponibles en el local físico y viceversa.</li>
  <li>El cliente dispone de hasta 30 días corridos desde la compra para solicitar cambios o devoluciones.</li>
  <li>Es responsabilidad del cliente revisar el estado del producto al momento de recibirlo.</li>
</ul>

<h2>Condiciones de preventa / reserva</h2>
<p>Los productos disponibles para preventa o reserva siguen el mismo procedimiento de compra que los productos en stock.</p>
<p>El producto puede entregarse hasta 180 días después de su llegada a nuestro warehouse en origen, dependiendo del fabricante y procesos de importación.</p>
<p>Superado ese plazo, el cliente podrá solicitar la devolución del dinero abonado.</p>

<h2>Información de la empresa</h2>
<p><strong>Razón Social:</strong> Sagittarius Importaciones SRL</p>
<p><strong>RUT:</strong> 217180080010</p>
<p><strong>Email:</strong> info@collectibles.com.uy</p>
<p><strong>Teléfono:</strong> (+598) 096 889 596</p>`;
    }

    if (s.includes('envio') || s.includes('envío') || s.includes('devolucion')) {
      return `<h2>Devoluciones</h2>
<p>El producto deberá encontrarse en perfectas condiciones, con empaques originales y acompañado de ticket de cambio, factura o envoltorio original.</p>
<p>Los cambios deben realizarse dentro de un plazo máximo de 15 días.</p>
<p>Los reintegros pueden demorar hasta 10 días hábiles una vez aprobada la devolución.</p>

<h2>Cambios por correo</h2>
<p>Para realizar cambios mediante correo, el cliente deberá enviar el paquete previamente pago incluyendo una copia de la factura original.</p>
<p>El envío debe dirigirse a:</p>

<div class="rounded-2xl border border-white/10 bg-[#101522]/60 p-6 my-6">
  <p class="font-extrabold text-[#f00856] tracking-widest text-[10px] uppercase mb-2">Dirección de Envío</p>
  <p class="text-white font-black text-lg">COLLECTIBLES</p>
  <p class="text-slate-300">Vazquez 1418</p>
  <p class="text-slate-300">Montevideo · CP 11200</p>
  <p class="text-slate-300">Teléfono: 096 889 596</p>
</div>`;
    }

    if (s.includes('terminos') || s.includes('términos')) {
      return `<p>Al acceder o utilizar el sitio web de Collectibles, el usuario acepta estos términos de uso, los cuales constituyen un acuerdo legalmente vinculante.</p>

<h2>1. Productos</h2>
<p>Collectibles es una empresa uruguaya con más de 13 años de trayectoria y distribuidor oficial de distintas marcas internacionales.</p>
<p>La información de productos es referencial y puede modificarse sin previo aviso, incluyendo precios, disponibilidad y tiempos estimados de entrega.</p>

<h2>2. Información del cliente</h2>
<p>El cliente es responsable de proporcionar correctamente los datos de envío y facturación. Collectibles no se responsabiliza por errores derivados de información incorrecta.</p>

<h2>3. Entrega de productos</h2>
<ul>
  <li>Los colores pueden variar según la pantalla del usuario.</li>
  <li>Las medidas son aproximadas.</li>
  <li>Todos los productos están sujetos a disponibilidad.</li>
  <li>Los plazos de entrega son estimados.</li>
  <li>Los productos se entregan en su packaging original.</li>
</ul>

<h2>4. Preventa</h2>
<p>Algunos productos pueden estar sujetos a restricciones de importación, retrasos logísticos o disponibilidad limitada.</p>
<p>En caso de cancelación o falta definitiva de stock, el cliente podrá optar por una alternativa o solicitar reembolso.</p>

<h2>5. Cambios en pedidos</h2>
<p>Solo se cobrará por los productos efectivamente enviados. En determinados casos, las demoras pueden alcanzar hasta 180 días dependiendo del fabricante o importador.</p>
<p>El cliente podrá optar por esperar el producto o aceptar un reemplazo equivalente si estuviera disponible.</p>

<h2>6. Devoluciones</h2>
<p>El cliente podrá retractarse de la compra dentro de los primeros 5 días y solicitar devoluciones hasta 30 días desde la entrega, siempre que el producto se encuentre en perfectas condiciones y con su packaging original.</p>

<h2>7. Cuenta de usuario</h2>
<ul>
  <li>El usuario es responsable de la seguridad de su cuenta.</li>
  <li>Debe informar cualquier acceso no autorizado.</li>
  <li>No se permite transferir cuentas entre personas.</li>
  <li>Collectibles podrá bloquear cuentas por uso abusivo o fraudulento.</li>
</ul>

<h2>8. Precios y pagos</h2>
<p>Los precios incluyen IVA. El sitio acepta diferentes medios de pago y redes de cobranza.</p>
<p>Impuestos internacionales, costos aduaneros o cargos externos serán responsabilidad del cliente cuando corresponda.</p>

<h2>9. Protección de datos</h2>
<p>Los datos personales serán tratados conforme a la legislación uruguaya vigente, incluyendo la Ley Nº 18.331 de Protección de Datos Personales.</p>

<h2>10. Propiedad intelectual</h2>
<p>Todo el contenido del sitio web, incluyendo textos, imágenes, diseño y marcas, está protegido y no puede utilizarse sin autorización previa.</p>

<h2>11. Responsabilidad</h2>
<p>Collectibles no garantiza disponibilidad permanente del sitio web ni se responsabiliza por daños indirectos derivados del uso de la plataforma.</p>

<h2>12. Limitación de responsabilidad</h2>
<p>La responsabilidad máxima de Collectibles no excederá el valor abonado por el producto adquirido o USD 200, según corresponda.</p>

<h2>13. Ley aplicable</h2>
<p>Estos términos se rigen por la legislación de la República Oriental del Uruguay, con jurisdicción en los tribunales de Montevideo.</p>

<h2>Contacto</h2>
<p><strong>Razón Social:</strong> Sagittarius Importaciones SRL</p>
<p><strong>RUT:</strong> 217180080010</p>
<p><strong>Email:</strong> info@collectibles.com.uy</p>
<p><strong>Teléfono:</strong> (+598) 096 889 596</p>
<p><strong>Horario:</strong> Lunes a viernes de 13 a 19 hs</p>`;
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
              className="prose prose-invert max-w-none text-[#cbd5e1]
                prose-h2:text-white prose-h2:font-black prose-h2:text-xl md:prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:tracking-tight
                prose-h3:text-white prose-h3:font-black prose-h3:text-[1.1rem] prose-h3:mt-6 prose-h3:mb-2
                prose-p:text-[#cbd5e1] prose-p:leading-[1.85] prose-p:mb-4
                prose-ul:text-[#cbd5e1] prose-ul:leading-[1.8] prose-ul:my-4 prose-ul:pl-5 prose-ul:list-disc
                prose-li:mb-1.5
                prose-a:text-[#f00856] prose-a:font-extrabold hover:underline
                prose-strong:text-white"
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
