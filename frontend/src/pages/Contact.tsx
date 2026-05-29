import { useState, useMemo } from 'react';
import { Mail, MapPin, Phone, Send, CheckCircle, Clock, MessageCircle } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';

export default function Contact() {
  const { settings } = useSiteSettings();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const whatsappUrl = useMemo(() => {
    const raw = settings['social_whatsapp_url'];
    if (!raw) return 'https://wa.me/59899000000';
    const trimmed = raw.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.includes('wa.me') || trimmed.includes('whatsapp.com')) {
      return `https://${trimmed.replace(/^(https?:\/\/)?/, '')}`;
    }
    const cleanNumber = trimmed.replace(/[\s\-\(\)\+]/g, '');
    return `https://wa.me/${cleanNumber}`;
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Completá todos los campos obligatorios.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('https://formsubmit.co/ajax/collectiblesuy@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          subject: form.subject || 'Consulta desde la web',
          message: form.message,
          _subject: `[Collectibles Web] ${form.subject || 'Nueva consulta de ' + form.name}`,
        }),
      });

      if (!res.ok) throw new Error('Error al enviar');
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setError('No se pudo enviar el mensaje. Intentá de nuevo o escribinos por WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen text-white font-sans bg-[#05070f]">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(240,8,86,.15),transparent_40%),linear-gradient(90deg,#05070f_0%,#05070f_55%,#250313_100%)]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative max-w-[1500px] mx-auto px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="text-[#f00856] text-xs font-black tracking-[0.35em] uppercase mb-5">Collectibles Uruguay</div>
            <h1 className="text-4xl md:text-6xl font-black leading-none tracking-tight text-white">Contacto</h1>
            <p className="text-slate-300 text-lg md:text-xl mt-6 leading-relaxed max-w-2xl font-medium">
              ¿Tenés alguna consulta, problema con un pedido o querés saber más sobre un producto? Escribinos y te respondemos lo antes posible.
            </p>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <main className="max-w-[1500px] mx-auto px-6 py-12 md:py-16 grid lg:grid-cols-[1fr_380px] gap-10 items-start">
        {/* FORM */}
        <div className="rounded-[2rem] border border-white/10 bg-[#0b0f18]/80 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden">
          <div className="border-b border-white/10 px-6 md:px-10 py-6 bg-white/[0.01]">
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase">Formulario de contacto</div>
            <div className="text-slate-500 text-sm font-bold mt-1">Te respondemos en menos de 24 horas hábiles</div>
          </div>

          <div className="px-6 md:px-10 py-8 md:py-10">
            {sent ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-3">¡Mensaje enviado!</h3>
                <p className="text-slate-400 font-medium max-w-md mx-auto">
                  Recibimos tu consulta correctamente. Te vamos a responder a la brevedad por email.
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-8 btn-primary px-8 py-3 text-sm rounded-full"
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-300 uppercase tracking-widest mb-2">
                      Nombre <span className="text-[#f00856]">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Tu nombre completo"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 focus:border-[#f00856]/50 transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-300 uppercase tracking-widest mb-2">
                      Email <span className="text-[#f00856]">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="tu@email.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 focus:border-[#f00856]/50 transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-300 uppercase tracking-widest mb-2">
                    Asunto
                  </label>
                  <select
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 focus:border-[#f00856]/50 transition-all appearance-none"
                  >
                    <option value="" className="bg-[#0b0f18]">Seleccioná un asunto</option>
                    <option value="Consulta sobre producto" className="bg-[#0b0f18]">Consulta sobre producto</option>
                    <option value="Estado de mi pedido" className="bg-[#0b0f18]">Estado de mi pedido</option>
                    <option value="Cambios y devoluciones" className="bg-[#0b0f18]">Cambios y devoluciones</option>
                    <option value="Problemas con el pago" className="bg-[#0b0f18]">Problemas con el pago</option>
                    <option value="Pedido mayorista" className="bg-[#0b0f18]">Pedido mayorista</option>
                    <option value="Otro" className="bg-[#0b0f18]">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-300 uppercase tracking-widest mb-2">
                    Mensaje <span className="text-[#f00856]">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Contanos en qué te podemos ayudar..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-semibold placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 focus:border-[#f00856]/50 transition-all resize-none"
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm font-bold">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  className="btn-primary w-full sm:w-auto px-10 py-4 text-sm rounded-full font-black inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                >
                  {sending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar mensaje
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* SIDEBAR INFO */}
        <aside className="space-y-5 lg:sticky lg:top-28">
          {/* Contact Info Card */}
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#151b2a] to-[#070a12] p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#f00856]/5 blur-2xl rounded-full transition-transform group-hover:scale-150 duration-500" />
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase mb-5">Información de contacto</div>

            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f00856]/10 border border-[#f00856]/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[#f00856]" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Email</div>
                  <a href="mailto:collectiblesuy@gmail.com" className="text-sm font-bold text-white hover:text-[#f00856] transition-colors">
                    collectiblesuy@gmail.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f00856]/10 border border-[#f00856]/20 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-[#f00856]" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Dirección</div>
                  <div className="text-sm font-bold text-slate-300">Vázquez 1418, Montevideo, Uruguay</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f00856]/10 border border-[#f00856]/20 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-[#f00856]" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Horarios</div>
                  <div className="text-sm font-bold text-slate-300">Lun a Vie 12:00–19:00</div>
                  <div className="text-sm font-bold text-slate-400">Sáb 10:00–14:00</div>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Card */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-3xl border border-[#25D366]/20 bg-[#25D366]/5 p-6 shadow-xl hover:bg-[#25D366]/10 transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-white font-black text-sm">WhatsApp</div>
                <div className="text-[10px] text-[#25D366] font-bold uppercase tracking-widest">Respuesta rápida</div>
              </div>
            </div>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Si necesitás una respuesta inmediata, escribinos por WhatsApp. Te atendemos al instante en horario comercial.
            </p>
          </a>

          {/* Trust Card */}
          <div className="rounded-3xl border border-white/10 bg-[#0b0f18] p-6 shadow-xl">
            <div className="text-[10px] text-[#f00856] font-black tracking-[0.28em] uppercase flex items-center gap-1.5 mb-4">
              <CheckCircle className="w-3.5 h-3.5" /> Compromiso
            </div>
            <ul className="space-y-3 text-sm text-slate-400 font-bold">
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Respondemos en menos de 24hs
              </li>
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> Soporte personalizado
              </li>
              <li className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <CheckCircle className="w-4 h-4 text-[#f00856] shrink-0" /> +13 años de experiencia
              </li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
