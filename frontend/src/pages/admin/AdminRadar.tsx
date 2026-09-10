import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Radio, Plus, Edit2, Trash2, Calendar, Eye, EyeOff, 
  Save, CheckCircle2, AlertCircle, Sparkles, ExternalLink,
  Tag, Award, Package, RefreshCw, Bot, ShieldCheck, X,
  ShoppingBag, Search, Layers, ChevronDown
} from 'lucide-react';
import type { ReleaseEvent, ReleaseStatus, ReleasePrecision, RadarSignal } from '../../plugins/collector-radar/types';
import { 
  parseReleaseWithAI, 
  persistRadarRelease, 
  validateAndScoreImage,
  slugify 
} from '../../plugins/collector-radar/core/radarAIEngine';
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

const RADAR_SIGNALS_LIST: { id: RadarSignal; label: string }[] = [
  { id: 'PREVENTA_CERRANDO', label: '🔴 Preventa Cerrando' },
  { id: 'NUEVO_ANUNCIO', label: '🟣 Nuevo Anuncio' },
  { id: 'ACABA_DE_SALIR', label: '🟢 Acaba de Salir' },
  { id: 'PREVENTA_ABIERTA', label: '🟩 Preventa Abierta' },
  { id: 'ALTA_DEMANDA', label: '🔥 Alta Demanda' },
  { id: 'EXCLUSIVO', label: '⭐ Exclusivo' },
  { id: 'REEDICION', label: '🔵 Reedición' },
  { id: 'AGOTADO', label: '⚫ Agotado' },
  { id: 'VUELVE_A_STOCK', label: '🔄 Vuelve a Stock' },
  { id: 'MERECE_ATENCION', label: '📡 Merece Atención' }
];

export default function AdminRadar() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [licenses, setLicenses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRelease, setEditingRelease] = useState<Partial<ReleaseEvent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<string>('ALL');

  // AI Discovery Modal State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [aiInputUrl, setAiInputUrl] = useState('');
  const [aiSourceSelect, setAiSourceSelect] = useState('Hasbro Pulse');
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiPreviewResult, setAiPreviewResult] = useState<any | null>(null);

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
        supabase.from('products').select('id, title').limit(100).order('title')
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
    if (!editingRelease || !editingRelease.title) {
      toast.error('El título es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const slug = editingRelease.slug || slugify(editingRelease.title);
      
      const result = await persistRadarRelease({
        ...editingRelease,
        slug
      });

      if (!result.success) throw new Error(result.error);
      
      toast.success(editingRelease.id ? 'Lanzamiento actualizado con éxito' : 'Lanzamiento creado en Radar');
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
        .update({ 
          is_published: !currentStatus,
          approval_status: !currentStatus ? 'PUBLISHED' : 'DRAFT'
        })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentStatus ? 'Lanzamiento ocultado' : 'Lanzamiento publicado en Radar');
      loadReleases();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = (id: string, title: string) => {
    confirm({
      title: '¿Eliminar lanzamiento del Radar?',
      message: `Esta acción removerá "${title}" de la base de datos de Radar y Release Calendar de forma permanente.`,
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

  const handleRunAIDiscovery = async () => {
    if (!aiInputText.trim() && !aiInputUrl.trim()) {
      toast.error('Ingresa una URL o descripción de la novedad');
      return;
    }

    setAiExtracting(true);
    setAiPreviewResult(null);

    try {
      const results = await parseReleaseWithAI({
        text: aiInputText,
        url: aiInputUrl,
        sourceName: aiSourceSelect
      });

      if (results.length > 0) {
        const item = results[0];
        const imgVal = validateAndScoreImage(item, item.official_image_url, item.image_source_url);
        item.image_match_score = imgVal.score;
        item.official_image_url = imgVal.finalImageUrl;

        setAiPreviewResult(item);
        toast.success('Lanzamiento interpretado por IA con éxito');
      }
    } catch (err: any) {
      console.error('Error running AI extraction:', err);
      toast.error('Error en la extracción por IA');
    } finally {
      setAiExtracting(false);
    }
  };

  const handleAcceptAIPreview = async (publishDirectly: boolean) => {
    if (!aiPreviewResult) return;
    setSaving(true);
    try {
      const candidate = {
        ...aiPreviewResult,
        is_published: publishDirectly,
        approval_status: publishDirectly ? 'PUBLISHED' : 'DRAFT'
      };

      const res = await persistRadarRelease(candidate);
      if (!res.success) throw new Error(res.error);

      toast.success(publishDirectly ? 'Lanzamiento publicado directamente en Radar' : 'Lanzamiento guardado en Borradores para revisión');
      setIsAIModalOpen(false);
      setAiPreviewResult(null);
      setAiInputText('');
      setAiInputUrl('');
      loadReleases();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const filteredReleases = releases.filter(r => {
    if (approvalFilter === 'PUBLISHED') return r.is_published;
    if (approvalFilter === 'DRAFT') return !r.is_published || r.approval_status === 'DRAFT';
    if (approvalFilter === 'ARCHIVED') return r.approval_status === 'ARCHIVED';
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Radar & Lanzamientos</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-1">
              <Bot size={12} />
              AI Release Engine
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Descubrimiento con IA, control editorial, señales de mercado y sincronización con el Calendario de Lanzamientos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAIModalOpen(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow"
          >
            <Sparkles size={15} />
            <span>Descubrir con IA</span>
          </button>
          <button
            onClick={loadReleases}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition border border-gray-200 bg-white"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setEditingRelease({
              title: '',
              slug: '',
              status: 'ANNOUNCED',
              radar_signal: 'NUEVO_ANUNCIO',
              is_published: true,
              approval_status: 'PUBLISHED'
            })}
            className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
          >
            <Plus size={15} />
            <span>Nuevo Lanzamiento</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        {[
          { id: 'ALL', label: `Todos (${releases.length})` },
          { id: 'PUBLISHED', label: `Publicados (${releases.filter(r => r.is_published).length})` },
          { id: 'DRAFT', label: `Borradores / Revisión (${releases.filter(r => !r.is_published).length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setApprovalFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              approvalFilter === tab.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Releases Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Lanzamiento</th>
                <th className="p-4">Fabricante & Línea</th>
                <th className="p-4">Señal Radar</th>
                <th className="p-4">Estado & Fecha</th>
                <th className="p-4">Fuente / Trazabilidad</th>
                <th className="p-4">En Tienda</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500 font-mono">
                    Cargando eventos de Radar...
                  </td>
                </tr>
              ) : filteredReleases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No hay eventos registrados. Usa "Descubrir con IA" o "Nuevo Lanzamiento".
                  </td>
                </tr>
              ) : (
                filteredReleases.map(item => {
                  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.ANNOUNCED;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                            {item.official_image_url ? (
                              <img src={item.official_image_url} alt={item.title} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <Radio size={18} className="text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm line-clamp-1">{item.title}</p>
                            <p className="text-[11px] text-gray-500 font-mono">/{item.slug}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-gray-800">{item.brand?.name || item.manufacturer || '—'}</div>
                        <div className="text-[11px] text-gray-500">{item.product_line || item.franchise || 'Línea Regular'}</div>
                      </td>

                      <td className="p-4">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          {item.radar_signal || 'NUEVO_ANUNCIO'}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border uppercase mb-1 ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                          {statusInfo.label}
                        </span>
                        <div className="text-[11px] text-gray-500 font-mono">{item.date_display_text || 'TBA'}</div>
                      </td>

                      <td className="p-4">
                        {item.source_url ? (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px] font-bold"
                          >
                            <ShieldCheck size={13} className="text-emerald-500" />
                            <span>{item.source_name || 'Fuente Oficial'}</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-gray-400 text-[11px]">Sin URL</span>
                        )}
                      </td>

                      <td className="p-4">
                        {item.catalog_product_id ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 size={11} /> Vinculado
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">No vinculado</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleTogglePublish(item.id, item.is_published)}
                            className={`p-1.5 rounded-lg border transition ${
                              item.is_published
                                ? 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                                : 'text-gray-400 hover:bg-gray-100 border-gray-200'
                            }`}
                            title={item.is_published ? 'Publicado (Click para ocultar)' : 'Oculto (Click para publicar)'}
                          >
                            {item.is_published ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>

                          <button
                            onClick={() => setEditingRelease(item)}
                            className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
                            title="Editar"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => handleDelete(item.id, item.title)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                            title="Eliminar"
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

      {/* Edit/Create Modal */}
      {editingRelease && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-gray-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingRelease.id ? 'Editar Lanzamiento en Radar' : 'Nuevo Lanzamiento en Radar'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Control de campos estructurados, imágenes y trazabilidad.</p>
              </div>
              <button
                onClick={() => setEditingRelease(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-gray-700">Título del Lanzamiento *</label>
                  <input
                    type="text"
                    required
                    value={editingRelease.title || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-semibold"
                    placeholder="Ej: NECA Ultimate Chucky (TV Series)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Slug URL *</label>
                  <input
                    type="text"
                    required
                    value={editingRelease.slug || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, slug: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-mono"
                    placeholder="neca-ultimate-chucky"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Fabricante / Marca</label>
                  <input
                    type="text"
                    value={editingRelease.manufacturer || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, manufacturer: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="NECA, Hasbro, Bandai Spirits..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Línea de Producto</label>
                  <input
                    type="text"
                    value={editingRelease.product_line || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, product_line: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="Ultimate, S.H.Figuarts, Marvel Legends..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Franquicia / Universo</label>
                  <input
                    type="text"
                    value={editingRelease.franchise || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, franchise: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="Marvel, Dragon Ball, Batman, Chucky..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Escala</label>
                  <input
                    type="text"
                    value={editingRelease.scale || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, scale: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="1:12, 1:6, 1:10, 18 cm..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">MSRP (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingRelease.msrp || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, msrp: parseFloat(e.target.value) || null })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="39.99"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Señal de Radar</label>
                  <select
                    value={editingRelease.radar_signal || 'NUEVO_ANUNCIO'}
                    onChange={(e) => setEditingRelease({ ...editingRelease, radar_signal: e.target.value as RadarSignal })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-bold"
                  >
                    {RADAR_SIGNALS_LIST.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Estado de Lanzamiento</label>
                  <select
                    value={editingRelease.status || 'ANNOUNCED'}
                    onChange={(e) => setEditingRelease({ ...editingRelease, status: e.target.value as ReleaseStatus })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-bold"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Texto de Fecha para Display</label>
                  <input
                    type="text"
                    value={editingRelease.date_display_text || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, date_display_text: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-mono"
                    placeholder="Noviembre 2026, Q1 2027, Inmediato..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Vincular con Producto en Tienda</label>
                  <select
                    value={editingRelease.catalog_product_id || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, catalog_product_id: e.target.value || null })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                  >
                    <option value="">No vincular (Solo seguimiento Radar)</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-gray-700">Por qué está en Radar (Editorial)</label>
                  <input
                    type="text"
                    value={editingRelease.radar_why || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, radar_why: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="Explicación concisa para coleccionistas..."
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-gray-700">URL de Imagen Oficial Verificada</label>
                  <input
                    type="url"
                    value={editingRelease.official_image_url || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, official_image_url: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-mono"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">Nombre de la Fuente</label>
                  <input
                    type="text"
                    value={editingRelease.source_name || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, source_name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                    placeholder="NECA Online, Hasbro Pulse..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-700">URL Original de la Fuente</label>
                  <input
                    type="url"
                    value={editingRelease.source_url || ''}
                    onChange={(e) => setEditingRelease({ ...editingRelease, source_url: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-mono"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRelease.is_published ?? true}
                    onChange={(e) => setEditingRelease({ ...editingRelease, is_published: e.target.checked })}
                    className="w-4 h-4 rounded text-gray-900 focus:ring-gray-900"
                  />
                  <span className="font-bold text-gray-800">Publicado y visible al público</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRelease(null)}
                    className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-bold transition flex items-center gap-2 shadow"
                  >
                    <Save size={15} />
                    <span>{saving ? 'Guardando...' : 'Guardar Lanzamiento'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Discovery Modal */}
      {isAIModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-gray-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-200">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Descubrimiento de Novedades con IA</h3>
                  <p className="text-xs text-gray-500">Extrae, valida y normaliza lanzamientos desde fuentes oficiales.</p>
                </div>
              </div>
              <button
                onClick={() => { setIsAIModalOpen(false); setAiPreviewResult(null); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-gray-700">Fuente Oficial / Fabricante</label>
                <select
                  value={aiSourceSelect}
                  onChange={(e) => setAiSourceSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-bold"
                >
                  <option value="NECA Official">NECA Official Site</option>
                  <option value="Hasbro Pulse">Hasbro Pulse / HasLab</option>
                  <option value="Bandai Tamashii Nations">Bandai Spirits / Tamashii Nations</option>
                  <option value="Hot Toys Official">Hot Toys Official</option>
                  <option value="Mattel Creations">Mattel Creations</option>
                  <option value="McFarlane Toys">McFarlane Toys Store</option>
                  <option value="Super7">Super7 Official</option>
                  <option value="LEGO Official">LEGO Icons</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700">URL del Comunicado o Producto</label>
                <input
                  type="url"
                  value={aiInputUrl}
                  onChange={(e) => setAiInputUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs font-mono"
                  placeholder="https://hasbropulse.com/products/..."
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700">Texto o Descripción Oficial del Lanzamiento</label>
                <textarea
                  rows={4}
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-gray-900 outline-none text-xs"
                  placeholder="Pega aquí el texto del anuncio, escala, especificaciones y fecha..."
                />
              </div>

              <button
                type="button"
                onClick={handleRunAIDiscovery}
                disabled={aiExtracting}
                className="w-full py-3 rounded-xl bg-gray-900 hover:bg-black text-white font-bold transition flex items-center justify-center gap-2 shadow"
              >
                {aiExtracting ? <RefreshCw size={15} className="animate-spin" /> : <Bot size={15} />}
                <span>{aiExtracting ? 'Procesando con IA...' : 'Extraer y Normalizar Estructura'}</span>
              </button>

              {/* Preview Card */}
              {aiPreviewResult && (
                <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-gray-500">Resultado Estructurado IA</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Confianza: {aiPreviewResult.confidence_score}%
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{aiPreviewResult.title}</h4>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {aiPreviewResult.manufacturer} · {aiPreviewResult.franchise} · {aiPreviewResult.scale}
                    </p>
                    <p className="text-gray-600 text-xs mt-1.5 italic">"{aiPreviewResult.radar_why}"</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleAcceptAIPreview(false)}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold transition"
                    >
                      Guardar en Borradores
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptAIPreview(true)}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition shadow"
                    >
                      Publicar Directamente en Radar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
