import { useState } from 'react';
import { DollarSign, Clock, Globe, Camera, Shield, Save, User, Image, Link2, Hash, AlertTriangle, Tag, ToggleLeft, ToggleRight, Settings } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';

interface Props {
  creatorData: any;
  onSave: (data: any) => void;
  saving: boolean;
}

export default function S2FProfile({ creatorData, onSave, saving }: Props) {
  const { language, currency, setLanguage, setCurrency } = useLocale();
  const [form, setForm] = useState({
    stage_name: creatorData?.stage_name || '',
    category: creatorData?.category || '',
    short_bio: creatorData?.short_bio || '',
    country: creatorData?.country || '',
    standard_price: creatorData?.standard_price || 50,
    premium_price: creatorData?.premium_price || 100,
    rush_delivery_price: creatorData?.rush_delivery_price || 20,
    estimated_delivery_time: creatorData?.estimated_delivery_time || 3,
    approximate_video_duration: creatorData?.approximate_video_duration || 60,
    availability_status: creatorData?.availability_status || 'available',
    daily_request_limit: creatorData?.daily_request_limit || 10,
    weekly_request_limit: creatorData?.weekly_request_limit || 50,
    auto_pause_enabled: creatorData?.auto_pause_enabled || false,
    content_rules: creatorData?.content_rules || '',
    blocked_keywords: creatorData?.blocked_keywords || '',
    languages: creatorData?.languages || ['es'],
    social_links: creatorData?.social_links || {},
    accepted_request_types: creatorData?.accepted_request_types || ['birthday', 'anniversary', 'motivation', 'general', 'corporate'],
    rejected_request_types: creatorData?.rejected_request_types || [],
  });

  const update = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const occasions = [
    { id: 'birthday', label: 'Cumpleaños' },
    { id: 'anniversary', label: 'Aniversario' },
    { id: 'motivation', label: 'Motivación' },
    { id: 'general', label: 'Saludo General' },
    { id: 'congratulation', label: 'Felicitación' },
    { id: 'corporate', label: 'Corporativo' },
  ];

  const toggleOccasion = (id: string) => {
    const accepted = [...(form.accepted_request_types as string[])];
    if (accepted.includes(id)) update('accepted_request_types', accepted.filter(x => x !== id));
    else update('accepted_request_types', [...accepted, id]);
  };

  return (
    <div className="max-w-4xl space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-1">Mi Perfil & Configuración</h2>
        <p className="text-gray-500 font-medium">Controlá cómo te ven los fans, precios, disponibilidad y reglas de contenido.</p>
      </div>

      {/* Global Settings */}
      <Section title="Preferencias del Panel (Global)" icon={Settings}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
           <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Idioma del Panel</label>
              <select
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-semibold outline-none focus:border-rose-500"
                 value={language}
                 onChange={e => setLanguage(e.target.value as any)}
              >
                 <option value="es">Español</option>
                 <option value="en">English (US)</option>
              </select>
           </div>
           <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Moneda (Visualización)</label>
              <select
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-semibold outline-none focus:border-rose-500"
                 value={currency}
                 onChange={e => setCurrency(e.target.value as any)}
              >
                 <option value="UYU">Pesos Uruguayos (UYU)</option>
                 <option value="USD">Dólares Estadounidenses (USD)</option>
                 <option value="ARS">Pesos Argentinos (ARS)</option>
              </select>
           </div>
        </div>
      </Section>

      {/* Section 1: Identity */}
      <Section title="Identidad Pública" icon={User}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Nombre Artístico" value={form.stage_name} onChange={v => update('stage_name', v)} />
          <Field label="Categoría" value={form.category} onChange={v => update('category', v)} placeholder="Actor, Músico, Deportista..." />
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Biografía Corta</label>
            <textarea value={form.short_bio} onChange={e => update('short_bio', e.target.value)} rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-gray-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 text-sm resize-none" />
          </div>
          <Field label="País" value={form.country} onChange={v => update('country', v)} placeholder="Argentina" />
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Idiomas</label>
            <input value={(form.languages as string[]).join(', ')} onChange={e => update('languages', e.target.value.split(',').map(s => s.trim()))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 font-medium text-gray-900 outline-none focus:border-rose-500 text-sm" placeholder="es, en, pt" />
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Foto de Perfil & Banner</label>
          <div className="flex gap-4">
            <div className="w-24 h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center cursor-pointer hover:border-rose-400 transition-colors">
              {creatorData?.profile_photo_url
                ? <img src={creatorData.profile_photo_url} className="w-full h-full object-cover rounded-2xl" />
                : <Camera className="w-6 h-6 text-gray-400" />}
            </div>
            <div className="flex-1 h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center cursor-pointer hover:border-rose-400 transition-colors">
              {creatorData?.cover_banner_url
                ? <img src={creatorData.cover_banner_url} className="w-full h-full object-cover rounded-2xl" />
                : <Image className="w-6 h-6 text-gray-400" />}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Redes Sociales (JSON)</label>
          <input value={JSON.stringify(form.social_links)} onChange={e => { try { update('social_links', JSON.parse(e.target.value)); } catch { } }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-gray-900 outline-none focus:border-rose-500 text-xs font-mono" placeholder='{"instagram":"@user","tiktok":"@user"}' />
        </div>
      </Section>

      {/* Section 2: Pricing */}
      <Section title="Precios & Tiempos" icon={DollarSign}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <NumberField label="Precio Estándar ($)" value={form.standard_price} onChange={v => update('standard_price', v)} />
          <NumberField label="Precio Premium ($)" value={form.premium_price} onChange={v => update('premium_price', v)} />
          <NumberField label="Recargo Urgente ($)" value={form.rush_delivery_price} onChange={v => update('rush_delivery_price', v)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Tiempo de Entrega</label>
            <select value={form.estimated_delivery_time} onChange={e => update('estimated_delivery_time', Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 font-bold text-gray-900 outline-none focus:border-rose-500">
              <option value={1}>24 Horas</option>
              <option value={3}>3 Días (Recomendado)</option>
              <option value={5}>5 Días</option>
              <option value={7}>7 Días</option>
            </select>
          </div>
          <NumberField label="Duración Aprox. Video (seg)" value={form.approximate_video_duration} onChange={v => update('approximate_video_duration', v)} />
        </div>
      </Section>

      {/* Section 3: Request Types */}
      <Section title="Tipos de Saludo" icon={Tag}>
        <p className="text-sm text-gray-500 mb-4">Seleccioná qué tipo de saludos aceptás.</p>
        <div className="flex flex-wrap gap-2">
          {occasions.map(o => {
            const active = (form.accepted_request_types as string[]).includes(o.id);
            return (
              <button key={o.id} onClick={() => toggleOccasion(o.id)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${active ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                {active ? '✓ ' : ''}{o.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Section 4: Availability */}
      <Section title="Disponibilidad" icon={Clock}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Estado Público</label>
            <select value={form.availability_status} onChange={e => update('availability_status', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 font-bold text-gray-900 outline-none focus:border-rose-500">
              <option value="available">🟢 Disponible</option>
              <option value="busy">🟡 Ocupado (pocos pedidos)</option>
              <option value="paused">🟠 Pausado (Vacaciones)</option>
              <option value="out_of_service">🔴 Fuera de Servicio</option>
            </select>
          </div>
          <NumberField label="Límite Diario de Pedidos" value={form.daily_request_limit} onChange={v => update('daily_request_limit', v)} />
          <NumberField label="Límite Semanal" value={form.weekly_request_limit} onChange={v => update('weekly_request_limit', v)} />
          <div className="flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
            <button onClick={() => update('auto_pause_enabled', !form.auto_pause_enabled)}>
              {form.auto_pause_enabled
                ? <ToggleRight className="w-8 h-8 text-rose-500" />
                : <ToggleLeft className="w-8 h-8 text-gray-400" />}
            </button>
            <div>
              <p className="text-sm font-bold text-gray-800">Auto-Pausa</p>
              <p className="text-xs text-gray-500">Pausar al alcanzar el máximo</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5: Content Rules */}
      <Section title="Reglas & Límites de Contenido" icon={Shield}>
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Reglas de Contenido</label>
            <textarea value={form.content_rules} onChange={e => update('content_rules', e.target.value)} rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-gray-900 outline-none focus:border-rose-500 text-sm resize-none"
              placeholder="Ej: No hago contenido político, religioso ni ofensivo..." />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> Palabras / Temáticas Prohibidas
            </label>
            <input value={form.blocked_keywords} onChange={e => update('blocked_keywords', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-gray-900 outline-none focus:border-rose-500 text-sm"
              placeholder="Separadas por coma: drogas, violencia, ..." />
          </div>
        </div>
      </Section>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={() => onSave(form)} disabled={saving}
          className="bg-gray-900 text-white font-black px-10 py-4 rounded-xl hover:bg-gray-800 transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2">
          <Save className="w-5 h-5" />
          {saving ? 'Guardando...' : 'Guardar y Publicar'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 lg:p-6">
        <h4 className="flex items-center gap-2 font-black text-gray-900 uppercase tracking-widest text-sm mb-5 pb-2 border-b border-gray-100">
          <Icon className="w-5 h-5 text-rose-500" /> {title}
        </h4>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 font-medium text-gray-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 text-sm" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 font-black text-gray-900 text-lg outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10" />
    </div>
  );
}
