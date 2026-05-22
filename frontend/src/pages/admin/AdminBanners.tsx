import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, Upload, ToggleLeft, ToggleRight, TrendingUp, Megaphone, Film } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import { updateCachedSetting } from '../../hooks/useSiteSettings';

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════
async function uploadBannerImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `banners/${Date.now()}-${sanitized}.${ext}`;
  const { error } = await supabase.storage.from('public-assets').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
  return data.publicUrl;
}

async function loadConfigJson(key: string): Promise<any> {
  const { data } = await supabase.from('public_site_config').select('value').eq('key', key).maybeSingle();
  if (data?.value) return JSON.parse(data.value);
  return null;
}

async function saveConfigJson(key: string, value: any) {
  const json = JSON.stringify(value);
  await supabase.from('public_site_config').upsert({ key, value: json, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  updateCachedSetting(key, json);
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AdminBanners() {
  const [activeTab, setActiveTab] = useState<'hero' | 'mini' | 'trending' | 'campaign'>('hero');
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  const tabs = [
    { key: 'hero' as const, label: '🎬 Hero Cinemático', icon: Film },
    { key: 'mini' as const, label: '🖼️ Mini Banners', icon: ImageIcon },
    { key: 'trending' as const, label: '📈 Tendencias', icon: TrendingUp },
    { key: 'campaign' as const, label: '🎯 Campaign Banner', icon: Megaphone },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Gestión del Home — Módulos</h2>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${
              activeTab === t.key ? 'bg-white shadow-sm text-gray-900 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'hero' && <HeroTab />}
      {activeTab === 'mini' && <MiniBannersTab />}
      {activeTab === 'trending' && <TrendingTab />}
      {activeTab === 'campaign' && <CampaignTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: HERO CINEMÁTICO (existing banner CRUD)
// ═══════════════════════════════════════════════════════════════
function HeroTab() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    title: '', subtitle: '', badge_text: '', image_url: '', mobile_image_url: '',
    link_url: '', button_text: 'SHOP NOW', secondary_button_text: '', secondary_button_url: '',
    content_position: 'center', content_align: 'left', overlay_opacity: 0.4,
    is_active: true, sort_order: 0
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaField, setActiveMediaField] = useState<'image_url' | 'mobile_image_url' | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { fetchBanners(); }, []);

  async function fetchBanners() {
    setLoading(true);
    const { data } = await supabase.from('banners').select('*').order('sort_order');
    setBanners(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', subtitle: '', badge_text: '', image_url: '', mobile_image_url: '', link_url: '', button_text: 'SHOP NOW', secondary_button_text: '', secondary_button_url: '', content_position: 'center', content_align: 'left', overlay_opacity: 0.4, is_active: true, sort_order: 0 });
    setActiveMediaField(null);
    setShowForm(true);
  }

  function openEdit(b: any) {
    setEditing(b);
    setForm({
      title: b.title || '', subtitle: b.subtitle || '', badge_text: b.badge_text || '',
      image_url: b.image_url || '', mobile_image_url: b.mobile_image_url || '', link_url: b.link_url || '',
      button_text: b.button_text || '', secondary_button_text: b.secondary_button_text || '',
      secondary_button_url: b.secondary_button_url || '', content_position: b.content_position || 'center',
      content_align: b.content_align || 'left',
      overlay_opacity: b.overlay_opacity !== null && b.overlay_opacity !== undefined ? Number(b.overlay_opacity) : 0.4,
      is_active: b.is_active, sort_order: b.sort_order || 0
    });
    setActiveMediaField(null);
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'image_url' | 'mobile_image_url') {
    if (!e.target.files?.[0]) return;
    setUploadingImage(true);
    try {
      const url = await uploadBannerImage(e.target.files[0]);
      setForm(prev => ({ ...prev, [field]: url }));
      toast.success('Imagen subida');
    } catch { toast.error('Error al subir imagen'); }
    setUploadingImage(false);
  }

  async function handleSave() {
    const payload = { ...form };
    if (editing) await supabase.from('banners').update(payload).eq('id', editing.id);
    else await supabase.from('banners').insert(payload);
    setShowForm(false);
    fetchBanners();
    toast.success(editing ? 'Slide actualizado' : 'Slide creado');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar este slide?', { danger: true }))) return;
    await supabase.from('banners').delete().eq('id', id);
    fetchBanners();
    toast.success('Slide eliminado');
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('banners').update({ is_active: !active }).eq('id', id);
    fetchBanners();
  }

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <p className="font-bold mb-1">💡 Hero Cinemático</p>
        <p className="text-xs text-blue-700">Los slides del hero principal se muestran como carrusel cinematográfico a pantalla completa al tope del home.</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Crear Slide</button>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-gray-400 text-center py-12">Cargando...</p> :
        banners.map((b, i) => (
          <div key={b.id} className={`bg-white rounded-xl border ${b.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} overflow-hidden flex`}>
            <div className="w-48 h-28 flex-shrink-0 bg-gray-100 relative">
              <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
              <span className="absolute top-1.5 left-1.5 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Hero Slide</span>
            </div>
            <div className="flex-1 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{b.title || `Slide ${i + 1}`}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">{b.subtitle}</p>
                <p className="text-xs text-gray-400 mt-1">Link: {b.link_url || '—'} • Orden: {b.sort_order}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(b.id, b.is_active)}
                  className={`px-3 py-1 text-xs font-bold rounded-full ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {b.is_active ? 'Activo' : 'Inactivo'}
                </button>
                <button onClick={() => openEdit(b)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(b.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hero Edit Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-white z-50 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-lg">{editing ? 'Editar Slide' : 'Nuevo Slide'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="form-label font-bold text-gray-700">Título Principal</label>
                  <input className="form-input w-full" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ej: Tu colección comienza acá" />
                </div>
                <div>
                  <label className="form-label font-bold text-gray-700">Subtítulo</label>
                  <textarea className="form-input w-full min-h-[70px] resize-none" value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="form-label font-bold text-gray-700">Badge</label><input className="form-input w-full" value={form.badge_text} onChange={e => setForm({...form, badge_text: e.target.value})} /></div>
                  <div><label className="form-label font-bold text-gray-700">Orden</label><input type="number" className="form-input w-full" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} /></div>
                </div>
                <div className="border-t pt-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">CTA Principal</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="form-label text-xs">Texto</label><input className="form-input w-full" value={form.button_text} onChange={e => setForm({...form, button_text: e.target.value})} /></div>
                    <div><label className="form-label text-xs">URL</label><input className="form-input w-full" value={form.link_url} onChange={e => setForm({...form, link_url: e.target.value})} /></div>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">CTA Secundario</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="form-label text-xs">Texto</label><input className="form-input w-full" value={form.secondary_button_text} onChange={e => setForm({...form, secondary_button_text: e.target.value})} /></div>
                    <div><label className="form-label text-xs">URL</label><input className="form-input w-full" value={form.secondary_button_url} onChange={e => setForm({...form, secondary_button_url: e.target.value})} /></div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <ImageField label="Imagen Desktop *" value={form.image_url} onChange={v => setForm({...form, image_url: v})} onUpload={e => handleImageUpload(e, 'image_url')} onPickMedia={() => { setActiveMediaField('image_url'); setShowMediaPicker(true); }} uploading={uploadingImage} />
                <ImageField label="Imagen Mobile" value={form.mobile_image_url} onChange={v => setForm({...form, mobile_image_url: v})} onUpload={e => handleImageUpload(e, 'mobile_image_url')} onPickMedia={() => { setActiveMediaField('mobile_image_url'); setShowMediaPicker(true); }} uploading={uploadingImage} />
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="form-label text-xs">Alineación</label><select className="form-input w-full" value={form.content_align} onChange={e => setForm({...form, content_align: e.target.value})}><option value="left">Izquierda</option><option value="center">Centro</option></select></div>
                  <div><label className="form-label text-xs">Posición</label><select className="form-input w-full" value={form.content_position} onChange={e => setForm({...form, content_position: e.target.value})}><option value="top">Arriba</option><option value="center">Centro</option><option value="bottom">Abajo</option></select></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1"><label className="form-label text-xs mb-0">Overlay Opacity</label><span className="text-xs font-bold text-primary-600">{Math.round(form.overlay_opacity * 100)}%</span></div>
                  <input type="range" min="0" max="1" step="0.05" className="w-full accent-primary-600" value={form.overlay_opacity} onChange={e => setForm({...form, overlay_opacity: parseFloat(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="border-t pt-4 mt-6 flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-4 h-4 rounded text-primary-600" /><span className="text-sm font-bold text-gray-700">Activo</span></label>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2 rounded-lg cursor-pointer">Cancelar</button>
                <button onClick={handleSave} className="btn-primary px-5 py-2 rounded-lg gap-2 cursor-pointer"><Save className="w-4 h-4" /> Guardar</button>
              </div>
            </div>
          </div>
        </>
      )}

      <MediaPickerModal isOpen={showMediaPicker} onClose={() => { setShowMediaPicker(false); setActiveMediaField(null); }} multiple={false}
        onSelect={(url) => { if (activeMediaField) setForm(prev => ({ ...prev, [activeMediaField]: url })); setShowMediaPicker(false); setActiveMediaField(null); }} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: MINI BANNERS
// ═══════════════════════════════════════════════════════════════
const MINI_BANNER_DEFAULT = { enabled: true, image_url: '', mobile_image_url: '', title: '', subtitle: '', badge_text: '', button_text: 'Ver más', link_url: '/shop', overlay_opacity: 0.4, text_align: 'left', sort_order: 0 };

function MiniBannersTab() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<{ idx: number; field: string } | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { loadConfigJson('home_mini_banners_json').then(d => { setBanners(d || []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const updateBanner = (i: number, field: string, val: any) => { const n = [...banners]; n[i] = { ...n[i], [field]: val }; setBanners(n); };

  const addBanner = () => { if (banners.length >= 2) return; setBanners([...banners, { ...MINI_BANNER_DEFAULT, sort_order: banners.length }]); };

  const removeBanner = async (i: number) => { if (!(await confirm('¿Eliminar este mini banner?', { danger: true }))) return; setBanners(banners.filter((_, idx) => idx !== i)); };

  const handleSave = async () => {
    try {
      await saveConfigJson('home_mini_banners_json', banners);
      toast.success('Mini banners guardados');
    } catch { toast.error('Error al guardar'); }
  };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, idx: number, field: string) {
    if (!e.target.files?.[0]) return;
    try {
      const url = await uploadBannerImage(e.target.files[0]);
      updateBanner(idx, field, url);
      toast.success('Imagen subida');
    } catch { toast.error('Error al subir'); }
  }

  if (loading) return <p className="text-gray-400 text-center py-12">Cargando...</p>;

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <p className="font-bold mb-1">🖼️ Mini Banners Promocionales</p>
        <p className="text-xs text-amber-700">Hasta 2 banners independientes que aparecen debajo del hero. Cada uno tiene su propia imagen, textos y CTA. Si solo hay 1, ocupa todo el ancho.</p>
        <p className="text-xs text-amber-600 mt-1">📐 Desktop: 1600×900 • Mobile: 1080×1350 • WebP preferido</p>
      </div>

      {banners.length < 2 && (
        <div className="flex justify-end mb-4">
          <button onClick={addBanner} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Agregar Mini Banner</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {banners.map((b, i) => (
          <div key={i} className={`bg-white rounded-xl border ${b.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900">Mini Banner {i + 1}</h4>
              <div className="flex items-center gap-3">
                <button onClick={() => updateBanner(i, 'enabled', !b.enabled)} className="flex items-center gap-1.5 text-sm">
                  {b.enabled ? <ToggleRight className="w-7 h-7 text-primary-500" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                  <span className={`text-xs font-bold ${b.enabled ? 'text-green-600' : 'text-gray-400'}`}>{b.enabled ? 'Activo' : 'Inactivo'}</span>
                </button>
                <button onClick={() => removeBanner(i)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <ImageField label="Imagen Desktop" value={b.image_url} onChange={v => updateBanner(i, 'image_url', v)} onUpload={e => handleUpload(e, i, 'image_url')} onPickMedia={() => { setMediaTarget({ idx: i, field: 'image_url' }); setShowMediaPicker(true); }} />
            <ImageField label="Imagen Mobile" value={b.mobile_image_url} onChange={v => updateBanner(i, 'mobile_image_url', v)} onUpload={e => handleUpload(e, i, 'mobile_image_url')} onPickMedia={() => { setMediaTarget({ idx: i, field: 'mobile_image_url' }); setShowMediaPicker(true); }} />

            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label text-xs font-bold">Título</label><input className="form-input w-full" value={b.title} onChange={e => updateBanner(i, 'title', e.target.value)} placeholder="Figuras Premium" /></div>
              <div><label className="form-label text-xs font-bold">Badge (opcional)</label><input className="form-input w-full" value={b.badge_text || ''} onChange={e => updateBanner(i, 'badge_text', e.target.value)} placeholder="NUEVO" /></div>
            </div>
            <div><label className="form-label text-xs font-bold">Subtítulo</label><input className="form-input w-full" value={b.subtitle || ''} onChange={e => updateBanner(i, 'subtitle', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label text-xs font-bold">Texto Botón</label><input className="form-input w-full" value={b.button_text} onChange={e => updateBanner(i, 'button_text', e.target.value)} /></div>
              <div><label className="form-label text-xs font-bold">Link URL</label><input className="form-input w-full font-mono text-sm" value={b.link_url} onChange={e => updateBanner(i, 'link_url', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label text-xs font-bold">Alineación</label><select className="form-input w-full" value={b.text_align} onChange={e => updateBanner(i, 'text_align', e.target.value)}><option value="left">Izquierda</option><option value="center">Centro</option></select></div>
              <div><label className="form-label text-xs font-bold">Orden</label><input type="number" className="form-input w-full" value={b.sort_order} onChange={e => updateBanner(i, 'sort_order', parseInt(e.target.value) || 0)} /></div>
              <div>
                <div className="flex justify-between"><label className="form-label text-xs font-bold mb-0">Overlay</label><span className="text-xs text-primary-600 font-bold">{Math.round((b.overlay_opacity || 0.4) * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.05" className="w-full accent-primary-600 mt-1" value={b.overlay_opacity || 0.4} onChange={e => updateBanner(i, 'overlay_opacity', parseFloat(e.target.value))} />
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && (
          <div className="col-span-2 text-center py-12 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-500 text-sm mb-2">No hay mini banners configurados</p>
            <button onClick={addBanner} className="text-primary-600 font-bold text-sm hover:underline">Crear el primero</button>
          </div>
        )}
      </div>

      {banners.length > 0 && (
        <button onClick={handleSave} className="btn-primary py-2.5 px-8 gap-2"><Save className="w-4 h-4" /> Guardar Mini Banners</button>
      )}

      <MediaPickerModal isOpen={showMediaPicker} onClose={() => { setShowMediaPicker(false); setMediaTarget(null); }} multiple={false}
        onSelect={(url) => { if (mediaTarget) updateBanner(mediaTarget.idx, mediaTarget.field, url); setShowMediaPicker(false); setMediaTarget(null); }} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: TENDENCIAS
// ═══════════════════════════════════════════════════════════════
const TRENDING_DEFAULTS = { enabled: true, title: 'Tendencias', subtitle: 'Lo más buscado', source: 'featured', manual_product_ids: [], max_items: 10, display_mode: 'grid', cta_text: 'Ver todo', cta_link: '/shop' };

function TrendingTab() {
  const [config, setConfig] = useState<any>(TRENDING_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => { loadConfigJson('home_trending_config_json').then(d => { if (d) setConfig({ ...TRENDING_DEFAULTS, ...d }); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const update = (field: string, val: any) => setConfig((c: any) => ({ ...c, [field]: val }));

  const handleSave = async () => {
    try {
      await saveConfigJson('home_trending_config_json', config);
      toast.success('Configuración de Tendencias guardada');
    } catch { toast.error('Error al guardar'); }
  };

  if (loading) return <p className="text-gray-400 text-center py-12">Cargando...</p>;

  return (
    <div className="max-w-2xl">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-sm text-emerald-800">
        <p className="font-bold mb-1">📈 Módulo de Tendencias</p>
        <p className="text-xs text-emerald-700">Muestra una grilla de productos destacados, nuevos o seleccionados manualmente. Desactivalo si no querés mostrar esta sección.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b">
          <h4 className="font-bold text-gray-900">Configuración</h4>
          <button onClick={() => update('enabled', !config.enabled)} className="flex items-center gap-2">
            {config.enabled ? <ToggleRight className="w-8 h-8 text-primary-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
            <span className={`text-sm font-bold ${config.enabled ? 'text-green-600' : 'text-gray-400'}`}>{config.enabled ? 'Activo' : 'Inactivo'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label text-xs font-bold">Título</label><input className="form-input w-full" value={config.title} onChange={e => update('title', e.target.value)} placeholder="Tendencias" /></div>
          <div><label className="form-label text-xs font-bold">Subtítulo</label><input className="form-input w-full" value={config.subtitle} onChange={e => update('subtitle', e.target.value)} placeholder="Lo más buscado" /></div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label text-xs font-bold">Fuente de Productos</label>
            <select className="form-input w-full" value={config.source} onChange={e => update('source', e.target.value)}>
              <option value="featured">Productos Destacados</option>
              <option value="newest">Más Recientes</option>
              <option value="manual">Selección Manual</option>
            </select>
          </div>
          <div><label className="form-label text-xs font-bold">Máx. Productos</label><input type="number" min="5" max="20" className="form-input w-full" value={config.max_items} onChange={e => update('max_items', parseInt(e.target.value) || 10)} /></div>
          <div>
            <label className="form-label text-xs font-bold">Modo Vista</label>
            <select className="form-input w-full" value={config.display_mode} onChange={e => update('display_mode', e.target.value)}>
              <option value="grid">Grilla</option>
              <option value="carousel">Carrusel</option>
            </select>
          </div>
        </div>

        {config.source === 'manual' && (
          <div>
            <label className="form-label text-xs font-bold">IDs de Productos (separados por coma)</label>
            <textarea className="form-input w-full font-mono text-xs" rows={3} value={(config.manual_product_ids || []).join(', ')}
              onChange={e => update('manual_product_ids', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              placeholder="uuid-1, uuid-2, uuid-3" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label text-xs font-bold">Texto CTA</label><input className="form-input w-full" value={config.cta_text} onChange={e => update('cta_text', e.target.value)} placeholder="Ver todo" /></div>
          <div><label className="form-label text-xs font-bold">Link CTA</label><input className="form-input w-full font-mono text-sm" value={config.cta_link} onChange={e => update('cta_link', e.target.value)} placeholder="/shop" /></div>
        </div>

        <button onClick={handleSave} className="btn-primary py-2.5 px-8 gap-2 w-full"><Save className="w-4 h-4" /> Guardar Tendencias</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: CAMPAIGN BANNER
// ═══════════════════════════════════════════════════════════════
const CAMPAIGN_DEFAULTS = { enabled: true, campaign_tag: 'EDICIÓN ESPECIAL', title: 'Especial Mundial', subtitle: '', cta_text: 'Ver especial', cta_link: '/shop', background_mode: 'gradient', overlay_opacity: 0.04, text_align: 'left', slides: [] as any[], autoplay: true, autoplay_interval: 5000 };

function CampaignTab() {
  const [config, setConfig] = useState<any>(CAMPAIGN_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<{ slideIdx: number; field: string } | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { loadConfigJson('home_campaign_banner_json').then(d => { if (d) setConfig({ ...CAMPAIGN_DEFAULTS, ...d }); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const update = (field: string, val: any) => setConfig((c: any) => ({ ...c, [field]: val }));
  const updateSlide = (i: number, field: string, val: string) => { const s = [...config.slides]; s[i] = { ...s[i], [field]: val }; update('slides', s); };
  const addSlide = () => update('slides', [...config.slides, { image_url: '', mobile_image_url: '' }]);
  const removeSlide = async (i: number) => { if (!(await confirm('¿Eliminar este slide?', { danger: true }))) return; update('slides', config.slides.filter((_: any, idx: number) => idx !== i)); };

  const handleSave = async () => {
    try {
      await saveConfigJson('home_campaign_banner_json', config);
      toast.success('Campaign Banner guardado');
    } catch { toast.error('Error al guardar'); }
  };

  async function handleSlideUpload(e: React.ChangeEvent<HTMLInputElement>, slideIdx: number, field: string) {
    if (!e.target.files?.[0]) return;
    try {
      const url = await uploadBannerImage(e.target.files[0]);
      updateSlide(slideIdx, field, url);
      toast.success('Imagen subida');
    } catch { toast.error('Error al subir'); }
  }

  if (loading) return <p className="text-gray-400 text-center py-12">Cargando...</p>;

  return (
    <div className="max-w-3xl">
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 text-sm text-purple-800">
        <p className="font-bold mb-1">🎯 Campaign Banner — Especiales y Eventos</p>
        <p className="text-xs text-purple-700">Banner dinámico para campañas especiales: Mundial, Comic Con, Halloween, Black Friday, Funko Week, etc. Soporta múltiples slides con fade transition.</p>
        <p className="text-xs text-purple-600 mt-1">📐 Desktop: 1920×700 • Mobile: 1080×1350</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b">
          <h4 className="font-bold text-gray-900">Configuración General</h4>
          <button onClick={() => update('enabled', !config.enabled)} className="flex items-center gap-2">
            {config.enabled ? <ToggleRight className="w-8 h-8 text-primary-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
            <span className={`text-sm font-bold ${config.enabled ? 'text-green-600' : 'text-gray-400'}`}>{config.enabled ? 'Activo' : 'Inactivo'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label text-xs font-bold">Campaign Tag</label><input className="form-input w-full" value={config.campaign_tag} onChange={e => update('campaign_tag', e.target.value)} placeholder="EDICIÓN ESPECIAL" /></div>
          <div><label className="form-label text-xs font-bold">Título</label><input className="form-input w-full" value={config.title} onChange={e => update('title', e.target.value)} placeholder="Especial Mundial" /></div>
        </div>
        <div><label className="form-label text-xs font-bold">Descripción</label><textarea className="form-input w-full" rows={3} value={config.subtitle} onChange={e => update('subtitle', e.target.value)} placeholder="Álbum, figuritas y mascotas..." /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label text-xs font-bold">Texto CTA</label><input className="form-input w-full" value={config.cta_text} onChange={e => update('cta_text', e.target.value)} /></div>
          <div><label className="form-label text-xs font-bold">Link CTA</label><input className="form-input w-full font-mono text-sm" value={config.cta_link} onChange={e => update('cta_link', e.target.value)} /></div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label text-xs font-bold">Fondo</label>
            <select className="form-input w-full" value={config.background_mode} onChange={e => update('background_mode', e.target.value)}>
              <option value="gradient">Gradiente</option>
              <option value="image">Imagen</option>
            </select>
          </div>
          <div>
            <label className="form-label text-xs font-bold">Alineación</label>
            <select className="form-input w-full" value={config.text_align} onChange={e => update('text_align', e.target.value)}>
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
            </select>
          </div>
          <div>
            <div className="flex justify-between"><label className="form-label text-xs font-bold mb-0">Overlay</label><span className="text-xs text-primary-600 font-bold">{Math.round((config.overlay_opacity || 0.04) * 100)}%</span></div>
            <input type="range" min="0" max="1" step="0.05" className="w-full accent-primary-600 mt-1" value={config.overlay_opacity} onChange={e => update('overlay_opacity', parseFloat(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={config.autoplay} onChange={e => update('autoplay', e.target.checked)} className="w-4 h-4 rounded text-primary-600" /><span className="text-sm font-bold text-gray-700">Autoplay</span></label>
          <div><label className="form-label text-xs font-bold">Intervalo (ms)</label><input type="number" className="form-input w-full" value={config.autoplay_interval} onChange={e => update('autoplay_interval', parseInt(e.target.value) || 5000)} /></div>
        </div>

        {/* Slides */}
        <div className="border-t pt-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-gray-800">Slides / Imágenes</h4>
            <button onClick={addSlide} className="btn-secondary gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> Agregar Slide</button>
          </div>

          <div className="space-y-4">
            {config.slides.map((slide: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Slide {i + 1}</span>
                  <button onClick={() => removeSlide(i)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ImageField label="Imagen Desktop" value={slide.image_url} onChange={v => updateSlide(i, 'image_url', v)} onUpload={e => handleSlideUpload(e, i, 'image_url')} onPickMedia={() => { setMediaTarget({ slideIdx: i, field: 'image_url' }); setShowMediaPicker(true); }} />
                  <ImageField label="Imagen Mobile" value={slide.mobile_image_url || ''} onChange={v => updateSlide(i, 'mobile_image_url', v)} onUpload={e => handleSlideUpload(e, i, 'mobile_image_url')} onPickMedia={() => { setMediaTarget({ slideIdx: i, field: 'mobile_image_url' }); setShowMediaPicker(true); }} />
                </div>
              </div>
            ))}
            {config.slides.length === 0 && (
              <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
                <p className="text-sm text-gray-500">Sin slides — se usará imagen de fallback de productos</p>
                <button onClick={addSlide} className="text-primary-600 font-bold text-sm mt-2 hover:underline">Agregar primer slide</button>
              </div>
            )}
          </div>
        </div>

        <button onClick={handleSave} className="btn-primary py-2.5 px-8 gap-2 w-full"><Save className="w-4 h-4" /> Guardar Campaign Banner</button>
      </div>

      <MediaPickerModal isOpen={showMediaPicker} onClose={() => { setShowMediaPicker(false); setMediaTarget(null); }} multiple={false}
        onSelect={(url) => { if (mediaTarget) updateSlide(mediaTarget.slideIdx, mediaTarget.field, url); setShowMediaPicker(false); setMediaTarget(null); }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED: Image Field Component
// ═══════════════════════════════════════════════════════════════
function ImageField({ label, value, onChange, onUpload, onPickMedia, uploading }: {
  label: string; value: string; onChange: (v: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onPickMedia: () => void; uploading?: boolean;
}) {
  return (
    <div>
      <label className="form-label text-xs font-bold text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input className="form-input flex-1 text-xs font-mono" value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
        <button type="button" onClick={onPickMedia} className="btn-secondary flex-shrink-0 px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg" title="Galería"><ImageIcon className="w-4 h-4" /></button>
        <label className={`btn-secondary flex-shrink-0 cursor-pointer px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg ${uploading ? 'opacity-50 pointer-events-none' : ''}`} title="Subir">
          <Upload className="w-4 h-4" />
          <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
        </label>
      </div>
      {value && <img src={value} alt="Preview" className="h-12 mt-2 rounded object-cover border border-gray-200" />}
    </div>
  );
}
