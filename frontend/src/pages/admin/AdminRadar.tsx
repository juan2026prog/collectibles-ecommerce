import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Radio, Plus, Edit2, Trash2, Calendar, Eye, EyeOff, 
  Save, CheckCircle2, AlertCircle, Sparkles, ExternalLink,
  Tag, Award, Package, RefreshCw
} from 'lucide-react';
import type { ReleaseEvent, ReleaseStatus, ReleasePrecision, RadarSignal } from '../../plugins/collector-radar/types';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

const STATUS_LABELS: Record<ReleaseStatus, { label: string; bg: string; text: string; border: string }> = {
  PREORDER_OPEN: { label: 'Preventa Abierta', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  PREORDER_SOON: { label: 'Preventa Próxima', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  ANNOUNCED: { label: 'Anunciado', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  REVEALED: { label: 'Revelado', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  COMING_SOON: { label: 'Próximamente', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  SHIPPING: { label: 'En Despacho / Envíos', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  RELEASED: { label: 'Lanzado al Mercado', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  DELAYED: { label: 'Postergado', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  RUMORED: { label: 'Rumor / Filtración', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  SOLD_OUT: { label: 'Agotado', bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-300' },
  RESTOCKED: { label: 'Re-stock', bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' }
};

export default function AdminRadar() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [licenses, setLicenses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRelease, setEditingRelease] = useState<Partial<ReleaseEvent> | null>(null);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    loadReleases();
    loadRelations();
  }, []);

  const loadRelations = async () => {
    try {
      const [brandsRes, licensesRes, productsRes] = await Promise.all([
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('licenses').select('id, name').order('name'),
        supabase.from('products').select('id, title').limit(50).order('title')
      ]);

      if (brandsRes.data) setBrands(brandsRes.data);
      if (licensesRes.data) setLicenses(licensesRes.data);
      if (productsRes.data) setProducts(productsRes.data);
    } catch (err) {
      console.error('Error loading relations for radar:', err);
    }
  };

  const loadReleases = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select(`
          *,
          brand:brands(id, name),
          license:licenses(id, name)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReleases(data as any);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar eventos de radar');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRelease || !editingRelease.title || !editingRelease.slug) {
      toast.error('Completa los campos obligatorios (Título y Slug)');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: editingRelease.title,
        slug: editingRelease.slug,
        subtitle: editingRelease.subtitle || null,
        description: editingRelease.description || null,
        summary: editingRelease.summary || null,
        status: editingRelease.status || 'ANNOUNCED',
        brand_id: editingRelease.brand_id || null,
        license_id: editingRelease.license_id || null,
        catalog_product_id: editingRelease.catalog_product_id || null,
        msrp: editingRelease.msrp || null,
        release_precision: editingRelease.release_precision || 'QUARTER',
        date_display_text: editingRelease.date_display_text || null,
        official_image_url: editingRelease.official_image_url || null,
        is_published: editingRelease.is_published ?? true,
        is_featured: editingRelease.is_featured ?? false,
        radar_signal: editingRelease.radar_signal || null,
        radar_why: editingRelease.radar_why || null,
        updated_at: new Date().toISOString()
      };

      if (editingRelease.id) {
        const { error } = await supabase
          .from('release_events')
          .update(payload)
          .eq('id', editingRelease.id);
        if (error) throw error;
        toast.success('Lanzamiento actualizado con éxito');
      } else {
        const { error } = await supabase
          .from('release_events')
          .insert(payload);
        if (error) throw error;
        toast.success('Lanzamiento creado en el Radar');
      }
      setEditingRelease(null);
      loadReleases();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al guardar el lanzamiento');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('release_events')
        .update({ is_published: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentStatus ? 'Lanzamiento ocultado' : 'Lanzamiento publicado');
      loadReleases();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = (id: string, title: string) => {
    confirm({
      title: '¿Eliminar lanzamiento del Radar?',
      message: `Esta acción removerá "${title}" de la cartelera del radar de forma permanente.`,
      confirmLabel: 'Eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('release_events')
            .delete()
            .eq('id', id);
          if (error) throw error;
          toast.success('Lanzamiento eliminado');
          loadReleases();
        } catch (err: any) {
          toast.error(err.message || 'Error al eliminar');
        }
      }
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Radar & Lanzamientos</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
              Release Engine
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            CRUD y cronograma de lanzamientos mundiales, precisión de fechas y señales editoriales del radar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReleases}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 bg-white"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setEditingRelease({
              title: '',
              slug: '',
              status: 'ANNOUNCED',
              release_precision: 'QUARTER',
              date_display_text: 'Q1 2027',
              is_published: true,
              is_featured: false
            })}
            className="px-4 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            <span>Crear Lanzamiento</span>
          </button>
        </div>
      </div>

      {/* Editor Modal */}
      {editingRelease && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#f00856]" />
                <h2 className="text-base font-bold text-gray-900">
                  {editingRelease.id ? 'Editar Lanzamiento en Radar' : 'Nuevo Lanzamiento para Radar'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingRelease(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">
                    Título del Lanzamiento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Batman Armory (The Dark Knight)"
                    value={editingRelease.title || ''}
                    onChange={(e) => {
                      const title = e.target.value;
                      const slug = !editingRelease.id 
                        ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                        : (editingRelease.slug || '');
                      setEditingRelease({ ...editingRelease, title, slug });
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">
                    Slug URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej: batman-armory-dark-knight"
                    value={editingRelease.slug || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, slug: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Estado de Lanzamiento</label>
                  <select
                    value={editingRelease.status || 'ANNOUNCED'}
                    onChange={(e) => setEditingRelease({ ...editingRelease, status: e.target.value as ReleaseStatus })}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  >
                    <option value="PREORDER_OPEN">🟢 Preventa Abierta</option>
                    <option value="PREORDER_SOON">🟡 Preventa Próxima</option>
                    <option value="ANNOUNCED">📢 Anunciado</option>
                    <option value="REVEALED">🔍 Revelado Oficialmente</option>
                    <option value="COMING_SOON">⏱️ Próximamente</option>
                    <option value="SHIPPING">📦 En Envíos / Despacho</option>
                    <option value="RELEASED">🎉 Lanzado al Mercado</option>
                    <option value="DELAYED">⚠️ Postergado</option>
                    <option value="SOLD_OUT">⛔ Agotado</option>
                    <option value="RESTOCKED">🔄 Re-stock</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Precisión de Fecha</label>
                  <select
                    value={editingRelease.release_precision || 'QUARTER'}
                    onChange={(e) => setEditingRelease({ ...editingRelease, release_precision: e.target.value as ReleasePrecision })}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  >
                    <option value="EXACT_DATE">Fecha Exacta</option>
                    <option value="MONTH">Mes (ej: Noviembre 2026)</option>
                    <option value="QUARTER">Trimestre (ej: Q1 2027)</option>
                    <option value="HALF_YEAR">Semestre (ej: H2 2026)</option>
                    <option value="YEAR">Año (ej: 2027)</option>
                    <option value="TBA">Por Anunciar (TBA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Texto Visible de Fecha</label>
                  <input
                    type="text"
                    value={editingRelease.date_display_text || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, date_display_text: e.target.value })}
                    placeholder="Ej: Q1 2027, Nov 2026"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Marca / Fabricante</label>
                  <select
                    value={editingRelease.brand_id || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, brand_id: e.target.value || null })}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  >
                    <option value="">Seleccionar Fabricante...</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Licencia / Franquicia</label>
                  <select
                    value={editingRelease.license_id || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, license_id: e.target.value || null })}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  >
                    <option value="">Seleccionar Licencia...</option>
                    {licenses.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">MSRP (USD Estimado)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-mono text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editingRelease.msrp || ''}
                      onChange={(e) => setEditingRelease({ ...editingRelease, msrp: parseFloat(e.target.value) || undefined })}
                      className="w-full pl-8 pr-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">URL Imagen Oficial / Render</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={editingRelease.official_image_url || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, official_image_url: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  />
                  {editingRelease.official_image_url && (
                    <div className="mt-2 p-2 border border-gray-100 rounded-lg bg-gray-50 flex items-center gap-3">
                      <img 
                        src={editingRelease.official_image_url} 
                        alt="Preview" 
                        className="w-12 h-12 object-contain rounded bg-white border border-gray-200" 
                        onError={(e) => { (e.target as any).style.display = 'none'; }}
                      />
                      <span className="text-[11px] text-gray-500 truncate">Vista previa de imagen cargada</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1.5">Vincular a Producto de Tienda (Opcional)</label>
                  <select
                    value={editingRelease.catalog_product_id || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, catalog_product_id: e.target.value || null })}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#f00856]"
                  >
                    <option value="">Sin vincular (Solo informativo)</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Permite a los usuarios comprar o reservar directo desde la ficha del radar.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none text-gray-800 font-medium">
                  <input
                    type="checkbox"
                    checked={editingRelease.is_published ?? true}
                    onChange={(e) => setEditingRelease({ ...editingRelease, is_published: e.target.checked })}
                    className="w-4 h-4 text-[#f00856] rounded border-gray-300 focus:ring-[#f00856]"
                  />
                  Publicado en el Radar
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-gray-800 font-medium">
                  <input
                    type="checkbox"
                    checked={editingRelease.is_featured ?? false}
                    onChange={(e) => setEditingRelease({ ...editingRelease, is_featured: e.target.checked })}
                    className="w-4 h-4 text-[#f00856] rounded border-gray-300 focus:ring-[#f00856]"
                  />
                  Destacado en Cabecera
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-5 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingRelease(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition border border-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Save size={15} />
                  <span>{saving ? 'Guardando...' : 'Guardar Lanzamiento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Lanzamiento</th>
                <th className="px-6 py-3.5">Marca / Licencia</th>
                <th className="px-6 py-3.5">Estado</th>
                <th className="px-6 py-3.5">Fecha Estimada</th>
                <th className="px-6 py-3.5">MSRP</th>
                <th className="px-6 py-3.5 text-center">Visibilidad</th>
                <th className="px-6 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#f00856]" />
                    Cargando radar de lanzamientos...
                  </td>
                </tr>
              ) : releases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    No hay lanzamientos registrados en el radar.
                  </td>
                </tr>
              ) : (
                releases.map((r) => {
                  const statusInfo = STATUS_LABELS[r.status] || {
                    label: r.status,
                    bg: 'bg-gray-100',
                    text: 'text-gray-700',
                    border: 'border-gray-200'
                  };

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {r.official_image_url ? (
                            <img
                              src={r.official_image_url}
                              alt={r.title}
                              className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-white shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                              <Radio size={16} />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block text-sm">{r.title}</span>
                            <span className="text-[11px] text-gray-400 font-mono">/{r.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <span className="text-gray-900 font-semibold block">{r.brand?.name || '—'}</span>
                          <span className="text-[11px] text-gray-500">{r.license?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-gray-800">
                        {r.date_display_text || 'TBA'}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-gray-900">
                        {r.msrp ? `$${r.msrp}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleTogglePublish(r.id, r.is_published)}
                          className={`p-1.5 rounded-lg border transition ${
                            r.is_published 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' 
                              : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
                          }`}
                          title={r.is_published ? 'Publicado (Clic para ocultar)' : 'Oculto (Clic para publicar)'}
                        >
                          {r.is_published ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingRelease(r)}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-[#f00856] hover:bg-pink-50 transition border border-transparent hover:border-pink-200"
                            title="Editar lanzamiento"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id, r.title)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition border border-transparent hover:border-red-200"
                            title="Eliminar lanzamiento"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

