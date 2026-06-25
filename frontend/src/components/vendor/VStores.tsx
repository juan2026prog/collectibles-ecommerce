import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Save, X, Image as ImageIcon, Store, CheckCircle, Clock, AlertTriangle, Globe, Phone, Mail, Link as LinkIcon, Trash2 } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';

export default function VStores() {
  const { user } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]); // System brands
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Form states
  const [form, setForm] = useState({
    store_name: '',
    slug: '',
    description: '',
    logo_url: '',
    banner_url: '',
    contact_email: '',
    contact_phone: '',
    seo_title: '',
    seo_description: '',
    social_instagram: '',
    social_facebook: '',
    social_twitter: '',
  });

  // Store Brands management
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [storeBrands, setStoreBrands] = useState<any[]>([]);
  const [loadingStoreBrands, setLoadingStoreBrands] = useState(false);
  const [brandToAssociate, setBrandToAssociate] = useState('');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    if (user) {
      fetchStores();
      fetchSystemBrands();
    }
  }, [user]);

  useEffect(() => {
    if (selectedStore) {
      fetchStoreBrands(selectedStore.id);
    } else {
      setStoreBrands([]);
    }
  }, [selectedStore]);

  async function fetchStores() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendor_stores')
        .select('*')
        .eq('vendor_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStores(data || []);
      
      // Keep selectedStore reference updated if it exists
      if (selectedStore) {
        const updated = data?.find(s => s.id === selectedStore.id);
        if (updated) setSelectedStore(updated);
      }
    } catch (err: any) {
      toast.error('Error al cargar tiendas: ' + err.message);
    }
    setLoading(false);
  }

  async function fetchSystemBrands() {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('status', 'approved')
        .order('name', { ascending: true });

      if (error) throw error;
      setBrands(data || []);
    } catch (err: any) {
      console.error('Error fetching system brands:', err);
    }
  }

  async function fetchStoreBrands(storeId: string) {
    setLoadingStoreBrands(true);
    try {
      const { data, error } = await supabase
        .from('vendor_store_brands')
        .select(`
          id,
          status,
          created_at,
          brands (
            id,
            name,
            logo_url
          )
        `)
        .eq('vendor_store_id', storeId);

      if (error) throw error;
      setStoreBrands(data || []);
    } catch (err: any) {
      toast.error('Error al cargar marcas de la tienda: ' + err.message);
    }
    setLoadingStoreBrands(false);
  }

  async function uploadImage(file: File, type: 'logo' | 'banner'): Promise<string> {
    const ext = file.name.split('.').pop();
    const sanitized = file.name.replace(`.${ext}`, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const path = `stores/${user!.id}-${Date.now()}-${type}-${sanitized}.${ext}`;
    
    const { error } = await supabase.storage
      .from('public-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    
    if (type === 'logo') setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      const url = await uploadImage(file, type);
      setForm(prev => ({ ...prev, [type === 'logo' ? 'logo_url' : 'banner_url']: url }));
      toast.success(type === 'logo' ? 'Logo subido exitosamente' : 'Banner subido exitosamente');
    } catch (err: any) {
      toast.error('Error al subir imagen: ' + err.message);
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    const generatedSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    setForm(prev => ({
      ...prev,
      store_name: name,
      slug: editing ? prev.slug : generatedSlug
    }));
  }

  function openCreate() {
    setEditing(null);
    setForm({
      store_name: '',
      slug: '',
      description: '',
      logo_url: '',
      banner_url: '',
      contact_email: '',
      contact_phone: '',
      seo_title: '',
      seo_description: '',
      social_instagram: '',
      social_facebook: '',
      social_twitter: '',
    });
    setShowForm(true);
  }

  function openEdit(store: any) {
    setEditing(store);
    const social = store.social_links || {};
    setForm({
      store_name: store.store_name,
      slug: store.slug,
      description: store.description || '',
      logo_url: store.logo_url || '',
      banner_url: store.banner_url || '',
      contact_email: store.contact_email || '',
      contact_phone: store.contact_phone || '',
      seo_title: store.seo_title || '',
      seo_description: store.seo_description || '',
      social_instagram: social.instagram || '',
      social_facebook: social.facebook || '',
      social_twitter: social.twitter || '',
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.store_name.trim() || !form.slug.trim()) {
      toast.error('Nombre y slug son requeridos');
      return;
    }

    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(form.slug)) {
      toast.error('El slug solo puede contener letras minúsculas, números y guiones.');
      return;
    }

    const socialLinks = {
      instagram: form.social_instagram.trim() || null,
      facebook: form.social_facebook.trim() || null,
      twitter: form.social_twitter.trim() || null
    };

    const payload: any = {
      store_name: form.store_name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      social_links: socialLinks,
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
    };

    try {
      if (editing) {
        const { error } = await supabase
          .from('vendor_stores')
          .update(payload)
          .eq('id', editing.id);

        if (error) throw error;
        toast.success('Tienda actualizada');
      } else {
        payload.vendor_id = user!.id;
        payload.status = 'draft'; // default
        
        const { error } = await supabase
          .from('vendor_stores')
          .insert(payload);

        if (error) throw error;
        toast.success('Tienda creada en borrador');
      }

      setShowForm(false);
      fetchStores();
    } catch (err: any) {
      toast.error('Error al guardar la tienda: ' + err.message);
    }
  }

  async function handleRequestReview(storeId: string) {
    if (!(await confirm('¿Enviar esta tienda a revisión por el equipo administrador?'))) return;
    
    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ status: 'pending_review' })
        .eq('id', storeId);

      if (error) throw error;
      toast.success('Solicitud enviada a revisión');
      fetchStores();
    } catch (err: any) {
      toast.error('Error al enviar solicitud: ' + err.message);
    }
  }

  async function handleArchiveStore(storeId: string) {
    if (!(await confirm('¿Seguro que querés archivar esta tienda? No aparecerá públicamente.', { danger: true }))) return;
    
    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ status: 'archived' })
        .eq('id', storeId);

      if (error) throw error;
      toast.success('Tienda archivada');
      fetchStores();
    } catch (err: any) {
      toast.error('Error al archivar tienda: ' + err.message);
    }
  }

  async function handleAddBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStore || !brandToAssociate) return;

    try {
      const { error } = await supabase
        .from('vendor_store_brands')
        .insert({
          vendor_store_id: selectedStore.id,
          brand_id: brandToAssociate,
          vendor_id: user!.id,
          status: 'pending_review'
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Esta marca ya está asociada o en revisión para esta tienda.');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Solicitud de asociación de marca enviada');
      setBrandToAssociate('');
      fetchStoreBrands(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al asociar marca: ' + err.message);
    }
  }

  async function handleRemoveBrand(associationId: string) {
    if (!(await confirm('¿Quitar la asociación de esta marca para esta tienda?', { danger: true }))) return;

    try {
      const { error } = await supabase
        .from('vendor_store_brands')
        .delete()
        .eq('id', associationId);

      if (error) throw error;
      toast.success('Asociación de marca removida');
      fetchStoreBrands(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al remover marca: ' + err.message);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 tracking-wider">ACTIVA</span>;
      case 'pending_review':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-yellow-100 text-yellow-800 tracking-wider">PENDIENTE</span>;
      case 'suspended':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 tracking-wider">SUSPENDIDA</span>;
      case 'archived':
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-gray-100 text-gray-800 tracking-wider">ARCHIVADA</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 tracking-wider">BORRADOR</span>;
    }
  };

  return (
    <div className="animation-fade-in text-gray-900 space-y-8">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div>
           <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-2">Commercial Identities</div>
           <h2 className="text-4xl font-black">Mis Tiendas / Vendido por</h2>
           <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">Administrá las marcas oficiales e identidades de tus productos</p>
        </div>
        {!showForm && (
          <button 
            onClick={openCreate} 
            className="bg-primary-600 hover:bg-[#d00040] text-gray-900 px-6 py-3 rounded-xl font-black uppercase tracking-wider text-xs flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-gray-900" /> Crear Tienda
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-[2rem] border border-gray-200 p-8 shadow-sm max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">{editing ? 'Editar Tienda Oficial' : 'Nueva Tienda Oficial'}</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Nombre Comercial de la Tienda *</label>
                <input
                  type="text"
                  value={form.store_name}
                  onChange={handleNameChange}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                  placeholder="Ej. Hasbro Uruguay"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Slug Público (URL) *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                  placeholder="ej-hasbro-uruguay"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">Se verá como: /store/slug</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Descripción de la Tienda</label>
              <textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors resize-none"
                placeholder="Escribe una presentación para tu tienda oficial..."
              />
            </div>

            {/* Img Upload Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Logo de Tienda (1:1 recomendado)</label>
                <div className="flex gap-4 items-center">
                  <div className="w-20 h-20 rounded-xl bg-gray-50 border overflow-hidden flex items-center justify-center flex-shrink-0">
                    {form.logo_url ? <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={form.logo_url}
                      onChange={e => setForm(prev => ({ ...prev, logo_url: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                      placeholder="https://..."
                    />
                    <label className="inline-flex items-center justify-center px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors w-full">
                      {uploadingLogo ? 'Subiendo...' : 'Subir archivo'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'logo')} disabled={uploadingLogo} />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Banner de Tienda (16:9 o apaisado)</label>
                <div className="flex gap-4 items-center">
                  <div className="w-32 h-20 rounded-xl bg-gray-50 border overflow-hidden flex items-center justify-center flex-shrink-0">
                    {form.banner_url ? <img src={form.banner_url} alt="Banner" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={form.banner_url}
                      onChange={e => setForm(prev => ({ ...prev, banner_url: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                      placeholder="https://..."
                    />
                    <label className="inline-flex items-center justify-center px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors w-full">
                      {uploadingBanner ? 'Subiendo...' : 'Subir archivo'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'banner')} disabled={uploadingBanner} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact details */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest mb-4">Información de Contacto</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Email de Contacto</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="contacto@mitienda.com"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Teléfono de Contacto</label>
                  <input
                    type="text"
                    value={form.contact_phone}
                    onChange={e => setForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="+598 99 123 456"
                  />
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest mb-4">Redes Sociales</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Instagram (Username)</label>
                  <input
                    type="text"
                    value={form.social_instagram}
                    onChange={e => setForm(prev => ({ ...prev, social_instagram: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="hasbrouy"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Facebook (URL o User)</label>
                  <input
                    type="text"
                    value={form.social_facebook}
                    onChange={e => setForm(prev => ({ ...prev, social_facebook: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="hasbrouruguay"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Twitter / X (Username)</label>
                  <input
                    type="text"
                    value={form.social_twitter}
                    onChange={e => setForm(prev => ({ ...prev, social_twitter: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="hasbrouy"
                  />
                </div>
              </div>
            </div>

            {/* SEO Optimization */}
            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest mb-4">Optimización SEO</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">SEO Title</label>
                  <input
                    type="text"
                    value={form.seo_title}
                    onChange={e => setForm(prev => ({ ...prev, seo_title: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                    placeholder="Hasbro Uruguay - Tienda Oficial | Collectibles"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">SEO Meta Description</label>
                  <textarea
                    value={form.seo_description}
                    onChange={e => setForm(prev => ({ ...prev, seo_description: e.target.value }))}
                    rows={2}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors resize-none"
                    placeholder="Encontrá todas las figuras oficiales de Hasbro con garantía oficial..."
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 flex gap-4">
              <button
                type="submit"
                className="bg-primary-600 hover:bg-[#d00040] text-gray-900 px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4 text-gray-900" />
                {editing ? 'Guardar Cambios' : 'Crear Tienda Borrador'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-4 rounded-xl font-bold uppercase text-xs transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stores List */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Listado de Tiendas ({stores.length})</h3>
            
            {loading ? (
              <div className="text-gray-400 text-center py-12">Cargando tiendas...</div>
            ) : stores.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-gray-200 p-12 text-center text-gray-500 space-y-4">
                <Store className="w-16 h-16 text-gray-300 mx-auto" />
                <p className="font-bold text-lg">Aún no creaste tiendas comerciales.</p>
                <p className="text-sm max-w-md mx-auto text-gray-400">Las tiendas te permiten separar tu catálogo en marcas oficiales y presentarte ante el público bajo múltiples identidades.</p>
                <button 
                  onClick={openCreate} 
                  className="bg-primary-600 hover:bg-[#d00040] text-gray-900 px-6 py-3 rounded-xl font-black uppercase tracking-wider text-xs transition-colors mt-2"
                >
                  Crear Mi Primera Tienda
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {stores.map(store => (
                  <div 
                    key={store.id} 
                    className={`bg-white rounded-[2rem] border p-6 shadow-sm hover:border-primary-600/50 transition-all flex flex-col md:flex-row gap-6 items-start md:items-center ${selectedStore?.id === store.id ? 'ring-2 ring-primary-600 border-transparent' : 'border-gray-200'}`}
                  >
                    {/* Logo */}
                    <div className="w-16 h-16 rounded-xl bg-gray-50 border overflow-hidden flex items-center justify-center flex-shrink-0">
                      {store.logo_url ? <img src={store.logo_url} alt={store.store_name} className="w-full h-full object-contain" /> : <Store className="w-8 h-8 text-gray-400" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-bold text-gray-900">{store.store_name}</h4>
                        {store.is_official && (
                          <span className="bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> {store.official_badge_text || 'OFICIAL'}
                          </span>
                        )}
                        {getStatusBadge(store.status)}
                      </div>

                      <div className="text-xs text-gray-400 font-medium">
                        URL: <span className="font-semibold text-gray-600">/store/{store.slug}</span>
                      </div>

                      {store.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{store.description}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-400 pt-1">
                        {store.contact_email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {store.contact_email}</span>}
                        {store.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {store.contact_phone}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch w-full md:w-auto">
                      <button
                        onClick={() => setSelectedStore(store)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${selectedStore?.id === store.id ? 'bg-primary-600 text-gray-900' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                      >
                        Gestionar Marcas
                      </button>
                      
                      <button
                        onClick={() => openEdit(store)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>

                      {store.status === 'draft' && (
                        <button
                          onClick={() => handleRequestReview(store.id)}
                          className="bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                        >
                          Solicitar Aprobación
                        </button>
                      )}

                      {store.status !== 'archived' && (
                        <button
                          onClick={() => handleArchiveStore(store.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                        >
                          Archivar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Brands Management Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[2rem] border border-gray-200 p-6 shadow-sm sticky top-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Marcas Asociadas</h3>
              <p className="text-xs text-gray-400 mb-6 font-medium">Asociá marcas oficiales a tu tienda. Esto permitirá asignar automáticamente la tienda a tus productos importados.</p>

              {selectedStore ? (
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
                    <Store className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Tienda Seleccionada</div>
                      <div className="font-bold text-gray-900 text-sm">{selectedStore.store_name}</div>
                    </div>
                  </div>

                  {selectedStore.status !== 'active' && (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 flex gap-3 text-xs text-yellow-800">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <div>
                        La tienda debe estar <span className="font-bold">ACTIVA</span> para que las marcas tengan efecto en el catálogo público.
                      </div>
                    </div>
                  )}

                  {/* Add Brand Form */}
                  <form onSubmit={handleAddBrand} className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Solicitar Asociación de Marca</label>
                    <div className="flex gap-2">
                      <select
                        value={brandToAssociate}
                        onChange={e => setBrandToAssociate(e.target.value)}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                        required
                      >
                        <option value="">-- Seleccionar Marca --</option>
                        {brands.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="bg-primary-600 hover:bg-[#d00040] text-gray-900 px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors"
                      >
                        Asociar
                      </button>
                    </div>
                  </form>

                  {/* List of Store Brands */}
                  <div className="border-t border-gray-100 pt-6 space-y-4">
                    <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Marcas de la Tienda</h4>
                    
                    {loadingStoreBrands ? (
                      <div className="text-xs text-gray-400 text-center py-4">Cargando marcas asociadas...</div>
                    ) : storeBrands.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-4 italic">Esta tienda no tiene marcas asociadas.</div>
                    ) : (
                      <div className="space-y-2">
                        {storeBrands.map(sb => (
                          <div key={sb.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded bg-white border flex items-center justify-center overflow-hidden flex-shrink-0">
                                {sb.brands.logo_url ? <img src={sb.brands.logo_url} alt={sb.brands.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-gray-300" />}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{sb.brands.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {sb.status === 'approved' ? (
                                    <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5">
                                      <CheckCircle className="w-2.5 h-2.5" /> Aprobada
                                    </span>
                                  ) : sb.status === 'rejected' ? (
                                    <span className="text-[8px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5">
                                      <AlertTriangle className="w-2.5 h-2.5" /> Rechazada
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" /> En Revisión
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveBrand(sb.id)}
                              className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              title="Remover asociación"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                  Seleccioná una tienda a la izquierda para ver y gestionar sus marcas oficiales asociadas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
