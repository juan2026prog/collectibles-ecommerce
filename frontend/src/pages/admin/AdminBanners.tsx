import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, GripVertical, Upload } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';

export default function AdminBanners() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    badge_text: '',
    image_url: '',
    mobile_image_url: '',
    link_url: '',
    button_text: 'SHOP NOW',
    secondary_button_text: '',
    secondary_button_url: '',
    content_position: 'center',
    content_align: 'left',
    overlay_opacity: 0.4,
    is_active: true,
    sort_order: 0
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [activeMediaField, setActiveMediaField] = useState<'image_url' | 'mobile_image_url' | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('banners').select('*').order('sort_order');
    setBanners(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      title: '',
      subtitle: '',
      badge_text: '',
      image_url: '',
      mobile_image_url: '',
      link_url: '',
      button_text: 'SHOP NOW',
      secondary_button_text: '',
      secondary_button_url: '',
      content_position: 'center',
      content_align: 'left',
      overlay_opacity: 0.4,
      is_active: true,
      sort_order: 0
    });
    setActiveMediaField(null);
    setShowForm(true);
  }

  function openEdit(b: any) {
    setEditing(b);
    setForm({
      title: b.title || '',
      subtitle: b.subtitle || '',
      badge_text: b.badge_text || '',
      image_url: b.image_url || '',
      mobile_image_url: b.mobile_image_url || '',
      link_url: b.link_url || '',
      button_text: b.button_text || '',
      secondary_button_text: b.secondary_button_text || '',
      secondary_button_url: b.secondary_button_url || '',
      content_position: b.content_position || 'center',
      content_align: b.content_align || 'left',
      overlay_opacity: b.overlay_opacity !== null && b.overlay_opacity !== undefined ? Number(b.overlay_opacity) : 0.4,
      is_active: b.is_active,
      sort_order: b.sort_order || 0
    });
    setActiveMediaField(null);
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'image_url' | 'mobile_image_url') {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const rawName = file.name.replace(`.${fileExt}`, '');
      const sanitizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `banners/${Date.now()}-${sanitizedName}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
        
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
      setForm(prev => ({ ...prev, [field]: data.publicUrl }));
      toast.success('Imagen subida correctamente.');
    } catch (err: any) {
      console.error(err);
      toast.error('Error al subir imagen a la biblioteca de medios.');
    }
    setUploadingImage(false);
  }

  async function handleSave() {
    const payload = { ...form };
    if (editing) await supabase.from('banners').update(payload).eq('id', editing.id);
    else await supabase.from('banners').insert(payload);
    setShowForm(false); 
    fetch();
    toast.success(editing ? 'Banner actualizado' : 'Banner creado');
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar este banner?', { danger: true }))) return;
    await supabase.from('banners').delete().eq('id', id);
    fetch();
    toast.success('Banner eliminado');
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('banners').update({ is_active: !active }).eq('id', id);
    fetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Home Banners</h2>
        <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Crear Banner</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <p className="font-bold mb-1">💡 ¿Cómo funcionan los banners?</p>
        <ul className="text-xs space-y-1 text-blue-700">
          <li>• <strong>Hero Slider:</strong> Todos los banners activos se muestran como slides del carrusel principal.</li>
          <li>• <strong>Tarjetas promocionales:</strong> Los <strong>primeros 2 banners</strong> (por orden) también se muestran como tarjetas con título y subtítulo debajo del hero.</li>
          <li>• <strong>Textos editables:</strong> El título, subtítulo e imagen de cada banner se muestran en ambas secciones.</li>
          <li>• Podés activar/desactivar la sección "Tendencias", "Especial Mundial" y los propios banners desde <strong>Configuración → Theme Builder</strong>.</li>
        </ul>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> :
        banners.map((b, i) => (
          <div key={b.id} className={`bg-white rounded-xl border ${b.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} overflow-hidden flex`}>
            <div className="w-48 h-28 flex-shrink-0 bg-gray-100 relative">
              <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
              <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Hero Slide</span>
                {i < 2 && b.is_active && <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Tarjeta Promo</span>}
              </div>
            </div>
            <div className="flex-1 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{b.title || `Banner ${i + 1}`}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">{b.subtitle}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Link: {b.link_url || '—'} • Orden: {b.sort_order}
                  {b.mobile_image_url && ' • 📱 Móvil configurado'}
                  {b.content_align && ` • 📐 ${b.content_align}`}
                  {b.content_position && ` • ↕️ ${b.content_position}`}
                  {b.overlay_opacity !== null && ` • 🖤 Opacidad: ${Math.round(Number(b.overlay_opacity) * 100)}%`}
                </p>
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

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-white z-50 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-lg">{editing ? 'Editar Slide Cinematográfico' : 'Nuevo Slide Cinematográfico'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Columna Izquierda: Textos y Acciones */}
              <div className="space-y-4">
                <div>
                  <label className="form-label font-bold text-gray-700">Título Principal</label>
                  <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ej: Tu colección comienza acá" />
                </div>
                <div>
                  <label className="form-label font-bold text-gray-700">Subtítulo</label>
                  <textarea className="form-input w-full min-h-[70px] resize-none border-gray-300 rounded-lg shadow-sm" value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} placeholder="Descripción del slide..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label font-bold text-gray-700">Badge Superior</label>
                    <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.badge_text} onChange={e => setForm({...form, badge_text: e.target.value})} placeholder="Ej: PREMIUM" />
                  </div>
                  <div>
                    <label className="form-label font-bold text-gray-700">Orden (Sort)</label>
                    <input type="number" className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} />
                  </div>
                </div>

                {/* CTA Principal */}
                <div className="border-t border-gray-100 pt-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">CTA Principal</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-gray-600 text-xs">Texto Botón</label>
                      <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.button_text} onChange={e => setForm({...form, button_text: e.target.value})} placeholder="SHOP NOW" />
                    </div>
                    <div>
                      <label className="form-label text-gray-600 text-xs">URL Destino</label>
                      <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.link_url} onChange={e => setForm({...form, link_url: e.target.value})} placeholder="/shop" />
                    </div>
                  </div>
                </div>

                {/* CTA Secundario */}
                <div className="border-t border-gray-100 pt-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">CTA Secundario (Opcional)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-gray-600 text-xs">Texto Botón</label>
                      <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.secondary_button_text} onChange={e => setForm({...form, secondary_button_text: e.target.value})} placeholder="Ej: VER DETALLES" />
                    </div>
                    <div>
                      <label className="form-label text-gray-600 text-xs">URL Destino</label>
                      <input className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.secondary_button_url} onChange={e => setForm({...form, secondary_button_url: e.target.value})} placeholder="/ver-mas" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Imágenes y Diseño */}
              <div className="space-y-4">
                {/* Imagen Desktop */}
                <div>
                  <label className="form-label font-bold text-gray-700">Imagen Desktop *</label>
                  <div className="flex gap-2">
                    <input className="form-input flex-1 border-gray-300 rounded-lg shadow-sm text-xs" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="https://..." />
                    
                    <button type="button" onClick={() => { setActiveMediaField('image_url'); setShowMediaPicker(true); }} className="btn-secondary flex-shrink-0 px-3 cursor-pointer flex items-center justify-center bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg" title="Seleccionar de galería">
                      <ImageIcon className="w-4 h-4" />
                    </button>

                    <label className={`btn-secondary flex-shrink-0 cursor-pointer flex items-center justify-center px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`} title="Subir desde PC">
                      <Upload className="w-4 h-4" />
                      <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'image_url')} />
                    </label>
                  </div>
                  {form.image_url && <img src={form.image_url} alt="Preview Desktop" className="h-14 mt-2 rounded object-cover border border-gray-200" />}
                </div>

                {/* Imagen Mobile */}
                <div>
                  <label className="form-label font-bold text-gray-700">Imagen Mobile (Opcional)</label>
                  <div className="flex gap-2">
                    <input className="form-input flex-1 border-gray-300 rounded-lg shadow-sm text-xs" value={form.mobile_image_url} onChange={e => setForm({...form, mobile_image_url: e.target.value})} placeholder="https://..." />
                    
                    <button type="button" onClick={() => { setActiveMediaField('mobile_image_url'); setShowMediaPicker(true); }} className="btn-secondary flex-shrink-0 px-3 cursor-pointer flex items-center justify-center bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg" title="Seleccionar de galería">
                      <ImageIcon className="w-4 h-4" />
                    </button>

                    <label className={`btn-secondary flex-shrink-0 cursor-pointer flex items-center justify-center px-3 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-lg ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`} title="Subir desde PC">
                      <Upload className="w-4 h-4" />
                      <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'mobile_image_url')} />
                    </label>
                  </div>
                  {form.mobile_image_url && <img src={form.mobile_image_url} alt="Preview Mobile" className="h-14 mt-2 rounded object-cover border border-gray-200" />}
                </div>

                {/* Disposición & Opacidad */}
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Diseño & Composición</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-gray-600 text-xs">Alineación Contenido</label>
                      <select className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.content_align} onChange={e => setForm({...form, content_align: e.target.value})}>
                        <option value="left">Izquierda</option>
                        <option value="center">Centro</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label text-gray-600 text-xs">Posición Contenido</label>
                      <select className="form-input w-full border-gray-300 rounded-lg shadow-sm" value={form.content_position} onChange={e => setForm({...form, content_position: e.target.value})}>
                        <option value="top">Arriba</option>
                        <option value="center">Centro</option>
                        <option value="bottom">Abajo</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="form-label text-gray-600 text-xs mb-0">Opacidad de Capa Oscura (Overlay)</label>
                      <span className="text-xs font-bold text-primary-600">{Math.round(form.overlay_opacity * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" className="w-full accent-primary-600 cursor-pointer" value={form.overlay_opacity} onChange={e => setForm({...form, overlay_opacity: parseFloat(e.target.value)})} />
                  </div>
                </div>

                {/* Helper Card */}
                <div className="bg-slate-900/[0.03] border border-slate-200/60 rounded-xl p-3.5 space-y-2 text-[11px] leading-relaxed">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                    💡 Guía de Formato & Dimensiones
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-slate-600 font-medium">
                    <div>
                      <span className="font-bold text-slate-700 block">🖥️ Desktop:</span>
                      • Recomendado: 2560x1440 px<br />
                      • Mínimo: 1920x1080 px<br />
                      • Evitar texto en la imagen.<br />
                      • Mantener lado izquierdo limpio.
                    </div>
                    <div>
                      <span className="font-bold text-slate-700 block">📱 Mobile:</span>
                      • Recomendado: 1080x1920 px<br />
                      • Zona segura: Mantener personajes en el centro.
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/50">
                    Formato: <span className="font-bold text-slate-700">WebP</span> o JPG de alta calidad optimizado. El slider ajustará la imagen usando object-cover.
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mt-6 flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-4 h-4 rounded text-primary-600 border-gray-300 focus:ring-primary-500" />
                <span className="text-sm font-bold text-gray-700">Slide Activo</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2 rounded-lg cursor-pointer">Cancelar</button>
                <button onClick={handleSave} className="btn-primary px-5 py-2 rounded-lg gap-2 cursor-pointer"><Save className="w-4 h-4" /> Guardar</button>
              </div>
            </div>
          </div>
        </>
      )}

      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => { setShowMediaPicker(false); setActiveMediaField(null); }} 
        multiple={false}
        onSelect={(url) => {
           if (activeMediaField) {
             setForm(prev => ({ ...prev, [activeMediaField]: url }));
           }
           setShowMediaPicker(false);
           setActiveMediaField(null);
        }}
      />
    </div>
  );
}
