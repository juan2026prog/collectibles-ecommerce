import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, GripVertical, Upload } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';

export default function AdminBanners() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: '', subtitle: '', image_url: '', link_url: '', button_text: 'SHOP NOW', is_active: true, sort_order: 0 });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('banners').select('*').order('sort_order');
    setBanners(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ title: '', subtitle: '', image_url: '', link_url: '', button_text: 'SHOP NOW', is_active: true, sort_order: 0 }); setShowForm(true); }
  function openEdit(b: any) { setEditing(b); setForm({ title: b.title || '', subtitle: b.subtitle || '', image_url: b.image_url, link_url: b.link_url || '', button_text: b.button_text || 'SHOP NOW', is_active: b.is_active, sort_order: b.sort_order }); setShowForm(true); }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      setForm({...form, image_url: data.publicUrl});
    } catch (err: any) {
      console.error(err);
      alert('Error al subir imagen a la biblioteca de medios.');
    }
    setUploadingImage(false);
  }

  async function handleSave() {
    const payload = { ...form };
    if (editing) await supabase.from('banners').update(payload).eq('id', editing.id);
    else await supabase.from('banners').insert(payload);
    setShowForm(false); fetch();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete banner?')) return;
    await supabase.from('banners').delete().eq('id', id);
    fetch();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('banners').update({ is_active: !active }).eq('id', id);
    fetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Home Banners</h2>
        <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Add Banner</button>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> :
        banners.map((b, i) => (
          <div key={b.id} className={`bg-white rounded-xl border ${b.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} overflow-hidden flex`}>
            <div className="w-48 h-28 flex-shrink-0 bg-gray-100">
              <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{b.title || `Banner ${i + 1}`}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">{b.subtitle}</p>
                <p className="text-xs text-gray-400 mt-1">Link: {b.link_url || '—'} • Order: {b.sort_order}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(b.id, b.is_active)}
                  className={`px-3 py-1 text-xs font-bold rounded-full ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">{editing ? 'Edit Banner' : 'New Banner'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
              <div><label className="form-label">Subtitle</label><input className="form-input" value={form.subtitle} onChange={e => setForm({...form, subtitle: e.target.value})} /></div>
              <div>
                <label className="form-label">Image URL *</label>
                <div className="flex gap-2">
                  <input className="form-input flex-1 border-gray-300 shadow-sm" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="https://..." />
                  
                  {/* Select from media library */}
                  <button type="button" onClick={() => setShowMediaPicker(true)} className="btn-secondary flex-shrink-0 px-3 cursor-pointer flex items-center justify-center bg-gray-50 border border-gray-300 hover:bg-gray-100" title="Seleccionar de galería">
                     <ImageIcon className="w-4 h-4" />
                  </button>

                  <label className={`btn-secondary flex-shrink-0 cursor-pointer flex items-center justify-center px-4 bg-gray-50 border border-gray-300 hover:bg-gray-100 ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`} title="Subir desde PC">
                    <Upload className="w-4 h-4" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                </div>
                {form.image_url && <img src={form.image_url} alt="Preview" className="h-16 mt-2 rounded object-cover" />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Link URL</label><input className="form-input" value={form.link_url} onChange={e => setForm({...form, link_url: e.target.value})} /></div>
                <div><label className="form-label">Button Text</label><input className="form-input" value={form.button_text} onChange={e => setForm({...form, button_text: e.target.value})} /></div>
              </div>
              <div><label className="form-label">Sort Order</label><input type="number" className="form-input" value={form.sort_order} onChange={e => setForm({...form, sort_order: parseInt(e.target.value) || 0})} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-4 h-4 rounded text-primary-600" /><span className="text-sm">Active</span></label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex-1 gap-2"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        </>
      )}
    </div>
      <MediaPickerModal 
        isOpen={showMediaPicker} 
        onClose={() => setShowMediaPicker(false)} 
        multiple={false}
        onSelect={(url) => {
           setForm(prev => ({ ...prev, image_url: url }));
           setShowMediaPicker(false);
        }}
      />
    </div>
  );
}
