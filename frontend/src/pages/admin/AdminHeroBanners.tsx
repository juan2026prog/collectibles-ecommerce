import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, Upload, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import BeybladeHeroBanner, { type BeybladeBanner } from '../../components/BeybladeHeroBanner';

// Upload image helper
async function uploadHeroImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const path = `beyblade-banners/${Date.now()}-${sanitized}.${ext}`;
  const { error } = await supabase.storage.from('public-assets').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminHeroBanners() {
  const [banners, setBanners] = useState<BeybladeBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BeybladeBanner | null>(null);
  const [form, setForm] = useState<Omit<BeybladeBanner, 'id'>>({
    badge: '',
    title_line1: '',
    title_line2: '',
    subtitle: '',
    cta_primary_text: '',
    cta_primary_url: '',
    cta_secondary_text: '',
    cta_secondary_url: '',
    image_right_url: '',
    country_code: 'UY',
    is_active: true
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewBannerData, setPreviewBannerData] = useState<BeybladeBanner | null>(null);
  
  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchBanners();
  }, []);

  async function fetchBanners() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hero_banners')
        .select('*')
        .order('country_code')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setBanners(data || []);
    } catch (err: any) {
      console.error('Error fetching banners:', err);
      toast.error('Error al cargar los banners');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({
      badge: '',
      title_line1: '',
      title_line2: '',
      subtitle: '',
      cta_primary_text: '',
      cta_primary_url: '',
      cta_secondary_text: '',
      cta_secondary_url: '',
      image_right_url: '',
      country_code: 'UY',
      is_active: true
    });
    setShowForm(true);
  }

  function openEdit(b: BeybladeBanner) {
    setEditing(b);
    setForm({
      badge: b.badge || '',
      title_line1: b.title_line1 || '',
      title_line2: b.title_line2 || '',
      subtitle: b.subtitle || '',
      cta_primary_text: b.cta_primary_text || '',
      cta_primary_url: b.cta_primary_url || '',
      cta_secondary_text: b.cta_secondary_text || '',
      cta_secondary_url: b.cta_secondary_url || '',
      image_right_url: b.image_right_url || '',
      country_code: b.country_code,
      is_active: b.is_active !== false
    });
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;
    setUploadingImage(true);
    try {
      const url = await uploadHeroImage(e.target.files[0]);
      setForm(prev => ({ ...prev, image_right_url: url }));
      toast.success('Imagen subida correctamente');
    } catch (err) {
      console.error('Error uploading image:', err);
      toast.error('Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave() {
    if (!form.country_code) {
      toast.error('El país asociado es obligatorio');
      return;
    }
    
    try {
      const payload = {
        badge: form.badge || null,
        title_line1: form.title_line1 || null,
        title_line2: form.title_line2 || null,
        subtitle: form.subtitle || null,
        cta_primary_text: form.cta_primary_text || null,
        cta_primary_url: form.cta_primary_url || null,
        cta_secondary_text: form.cta_secondary_text || null,
        cta_secondary_url: form.cta_secondary_url || null,
        image_right_url: form.image_right_url || null,
        country_code: form.country_code,
        is_active: form.is_active
      };

      if (editing) {
        const { error } = await supabase
          .from('hero_banners')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Banner actualizado');
      } else {
        const { error } = await supabase
          .from('hero_banners')
          .insert(payload);
        if (error) throw error;
        toast.success('Banner creado');
      }
      
      setShowForm(false);
      fetchBanners();
    } catch (err: any) {
      console.error('Error saving banner:', err);
      toast.error('Error al guardar el banner');
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Está seguro de que desea eliminar este banner?', { danger: true }))) return;
    try {
      const { error } = await supabase
        .from('hero_banners')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Banner eliminado');
      fetchBanners();
    } catch (err) {
      console.error('Error deleting banner:', err);
      toast.error('Error al eliminar el banner');
    }
  }

  async function toggleActive(banner: BeybladeBanner) {
    try {
      const { error } = await supabase
        .from('hero_banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);
      if (error) throw error;
      toast.success(`Banner ${!banner.is_active ? 'activado' : 'desactivado'}`);
      fetchBanners();
    } catch (err) {
      console.error('Error toggling active:', err);
      toast.error('Error al cambiar estado');
    }
  }

  function handlePreview(b: BeybladeBanner) {
    setPreviewBannerData(b);
    setShowPreviewModal(true);
  }

  return (
    <div className="space-y-6">
      {/* Explicación de funcionalidad */}
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-800/40 rounded-2xl p-6 text-sm text-blue-200">
        <h3 className="font-bold text-white mb-2 text-base">🛡️ Administración de Hero Banner (Beyblade)</h3>
        <p className="leading-relaxed">
          Configure los banners principales que se muestran en el Home segmentados por el país activo del usuario.
          El sistema carga de forma automática el banner correspondiente a la moneda/país seleccionado.
          Para Uruguay, no se mostrarán leyendas de la <strong>LIGA LATAM</strong> de forma predeterminada.
        </p>
      </div>

      {/* Acciones principales */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="text-gray-500 font-medium text-sm">
          Banners configurados: <span className="font-black text-gray-900">{banners.length}</span>
        </div>
        <button onClick={openCreate} className="btn-primary gap-2 px-5 py-2.5 rounded-xl cursor-pointer">
          <Plus className="w-4.5 h-4.5" /> Crear Hero Banner
        </button>
      </div>

      {/* Lista de banners */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Cargando banners...
          </div>
        ) : banners.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            No hay banners registrados. Crea uno nuevo para comenzar.
          </div>
        ) : (
          banners.map((b) => (
            <div key={b.id} className={`bg-white rounded-2xl border ${b.is_active ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-70'} overflow-hidden flex flex-col md:flex-row transition-all duration-300 hover:shadow-md`}>
              
              {/* Image Preview Left */}
              <div className="w-full md:w-60 h-40 bg-dark-950 flex-shrink-0 relative overflow-hidden flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-100">
                {b.image_right_url ? (
                  <img src={b.image_right_url} alt={b.title_line1 || 'Banner'} className="max-w-full max-h-full object-contain p-4" />
                ) : (
                  <span className="text-xs text-slate-500 font-bold uppercase">Sin Imagen</span>
                )}
                <span className="absolute top-3 left-3 bg-primary-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                  {b.country_code}
                </span>
              </div>

              {/* Banner Details */}
              <div className="flex-1 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-[#f00856] uppercase tracking-wider bg-[#f00856]/5 border border-[#f00856]/10 px-2 py-0.5 rounded-full">
                      {b.badge || 'Sin Badge'}
                    </span>
                    <span className="text-xs font-bold text-gray-400">ID: {b.id?.substring(0, 8)}...</span>
                  </div>
                  <h3 className="font-extrabold text-gray-900 text-lg uppercase leading-tight">
                    {b.title_line1} {b.title_line2}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2 max-w-xl">{b.subtitle || 'Sin subtítulo.'}</p>
                  
                  {/* CTA labels */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-semibold pt-2">
                    <span>CTA 1: <strong className="text-slate-600">{b.cta_primary_text || '—'}</strong> ({b.cta_primary_url || '—'})</span>
                    {b.cta_secondary_text && (
                      <span>CTA 2: <strong className="text-slate-600">{b.cta_secondary_text}</strong> ({b.cta_secondary_url})</span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0">
                  <button
                    onClick={() => handlePreview(b)}
                    className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                    title="Previsualizar"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => toggleActive(b)}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                      b.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={b.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {b.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => openEdit(b)}
                    className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                    title="Editar"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => b.id && handleDelete(b.id)}
                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editor Modal (Creación / Edición) */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-6xl bg-white z-50 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-black text-gray-900 text-xl uppercase tracking-wide">
                  {editing ? 'Editar Hero Banner' : 'Nuevo Hero Banner'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Defina el contenido del banner y su país de destino.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Split Form & Real-time Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Form columns */}
              <div className="lg:col-span-6 space-y-4">
                
                {/* Segmentación país y estado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">País Asociado *</label>
                    <select
                      className="form-input w-full rounded-xl border-gray-200 text-sm font-semibold cursor-pointer"
                      value={form.country_code}
                      onChange={e => setForm({...form, country_code: e.target.value})}
                    >
                      <option value="UY">Uruguay (UY)</option>
                      <option value="AR">Argentina (AR)</option>
                      <option value="LATAM">Continental (LATAM)</option>
                      <option value="BR">Brasil (BR)</option>
                      <option value="MX">México (MX)</option>
                      <option value="CL">Chile (CL)</option>
                      <option value="CO">Colombia (CO)</option>
                      <option value="PE">Perú (PE)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Estado</label>
                    <div className="flex items-center h-10">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.is_active}
                          onChange={e => setForm({...form, is_active: e.target.checked})}
                          className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 cursor-pointer"
                        />
                        <span className="text-sm font-bold text-gray-700">Banner Activo</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Badge superior</label>
                    <input
                      className="form-input w-full rounded-xl border-gray-200 text-sm"
                      value={form.badge || ''}
                      onChange={e => setForm({...form, badge: e.target.value})}
                      placeholder="Ej: BEYBLADE X"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Título Línea 1</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-sm"
                        value={form.title_line1 || ''}
                        onChange={e => setForm({...form, title_line1: e.target.value})}
                        placeholder="Ej: BEYBLADE X"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Título Línea 2 (Glow)</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-sm"
                        value={form.title_line2 || ''}
                        onChange={e => setForm({...form, title_line2: e.target.value})}
                        placeholder="Ej: URUGUAY"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Subtítulo</label>
                    <textarea
                      className="form-input w-full rounded-xl border-gray-200 text-sm min-h-[80px] resize-none py-2"
                      value={form.subtitle || ''}
                      onChange={e => setForm({...form, subtitle: e.target.value})}
                      placeholder="Escriba una descripción llamativa para el banner..."
                    />
                  </div>
                </div>

                {/* CTAs */}
                <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest block border-b pb-1">CTA Principal</span>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Texto</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-xs"
                        value={form.cta_primary_text || ''}
                        onChange={e => setForm({...form, cta_primary_text: e.target.value})}
                        placeholder="Ver Beyblades"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">URL / Link</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-xs"
                        value={form.cta_primary_url || ''}
                        onChange={e => setForm({...form, cta_primary_url: e.target.value})}
                        placeholder="/shop?category=beyblade-x"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest block border-b pb-1">CTA Secundario</span>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Texto</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-xs"
                        value={form.cta_secondary_text || ''}
                        onChange={e => setForm({...form, cta_secondary_text: e.target.value})}
                        placeholder="Ver Arena"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">URL / Link</label>
                      <input
                        className="form-input w-full rounded-xl border-gray-200 text-xs"
                        value={form.cta_secondary_url || ''}
                        onChange={e => setForm({...form, cta_secondary_url: e.target.value})}
                        placeholder="/p/arena-beyblade-x"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Image */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Imagen Derecha *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="form-input flex-1 rounded-xl border-gray-200 text-xs"
                      value={form.image_right_url || ''}
                      onChange={e => setForm({...form, image_right_url: e.target.value})}
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowMediaPicker(true)}
                      className="px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-slate-600 flex items-center justify-center cursor-pointer"
                      title="Elegir desde biblioteca"
                    >
                      <ImageIcon className="w-4.5 h-4.5" />
                    </button>
                    <label className="px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-slate-600 flex items-center justify-center cursor-pointer">
                      <Upload className="w-4.5 h-4.5" />
                      <input type="file" onChange={handleImageUpload} className="hidden" accept="image/*" disabled={uploadingImage} />
                    </label>
                  </div>
                </div>

              </div>

              {/* Real-time Preview Area */}
              <div className="lg:col-span-6 flex flex-col justify-between border-l border-gray-100 pl-0 lg:pl-8 pt-6 lg:pt-0">
                <div className="space-y-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest block">Previsualización en tiempo real</span>
                  
                  {/* Outer preview window with dark background */}
                  <div className="relative border border-gray-800 bg-[#05070f] rounded-2xl overflow-hidden shadow-2xl h-[450px]">
                    <div className="absolute inset-0 scale-[0.6] sm:scale-[0.55] lg:scale-[0.48] xl:scale-[0.53] origin-top-left w-[185%] sm:w-[180%] lg:w-[210%] xl:w-[190%] h-[180%] sm:h-[185%]">
                      <BeybladeHeroBanner
                        banner={{
                          badge: form.badge || 'PREVIEW BADGE',
                          title_line1: form.title_line1 || 'TITULO LINEA 1',
                          title_line2: form.title_line2 || 'TITULO LINEA 2',
                          subtitle: form.subtitle || 'Este es un texto explicativo de cómo se verá el subtítulo del banner.',
                          cta_primary_text: form.cta_primary_text || 'CTA Principal',
                          cta_primary_url: '#',
                          cta_secondary_text: form.cta_secondary_text || 'CTA Secundario',
                          cta_secondary_url: '#',
                          image_right_url: form.image_right_url || 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/banners/1779596438930-beys.png',
                          country_code: form.country_code
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Save actions */}
                <div className="border-t border-gray-100 pt-6 mt-8 flex justify-end gap-3">
                  <button
                    onClick={() => setShowForm(false)}
                    className="btn-secondary px-5 py-2.5 rounded-xl cursor-pointer font-bold text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn-primary px-5 py-2.5 rounded-xl gap-2 cursor-pointer font-bold text-sm shadow-md"
                  >
                    <Save className="w-4.5 h-4.5" /> Guardar Banner
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Standalone Fullscreen Preview Modal */}
      {showPreviewModal && previewBannerData && (
        <>
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[200]" onClick={() => setShowPreviewModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-[1400px] bg-[#05070f] z-[210] rounded-3xl shadow-2xl overflow-hidden border border-white/5">
            <div className="absolute top-6 right-6 z-[220]">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer border border-white/10 hover:border-white/20 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="relative min-h-[75vh] flex items-center">
              <BeybladeHeroBanner banner={previewBannerData} />
            </div>
          </div>
        </>
      )}

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        multiple={false}
        onSelect={(url) => {
          setForm(prev => ({ ...prev, image_right_url: url }));
          setShowMediaPicker(false);
        }}
      />
    </div>
  );
}
