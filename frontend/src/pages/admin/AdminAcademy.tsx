import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  GraduationCap, Plus, Edit2, Save, FileText, Sparkles, 
  CheckCircle2, AlertTriangle, Eye, EyeOff, Trash2, 
  ExternalLink, RefreshCw, BookOpen, Layers, ImageIcon, Upload, Link2, X
} from 'lucide-react';
import { validatePublishAction } from '../../plugins/collector-academy/core/draftGuard';
import type { AcademyContentStatus } from '../../plugins/collector-academy/types';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';

// ─── Artículos hardcodeados (deben coincidir con AcademyHome.tsx) ─────────────
const HARDCODED_ARTICLES = [
  { id: 'art-empezar',             title: 'Cómo Empezar una Colección sin Comprar Todo lo que Ves',                                    defaultImage: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80' },
  { id: 'art-escalas-nuevo',       title: 'Guía de Escalas en Figuras de Colección: de 1:18 a 1:4',                                    defaultImage: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80' },
  { id: 'art-escala-nuevo',        title: 'Cómo Elegir la Escala Correcta para tu Colección',                                           defaultImage: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80' },
  { id: 'art-bootleg-nuevo',       title: 'Cómo Reconocer una Figura Original y Evitar Bootlegs',                                       defaultImage: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80' },
  { id: 'art-materiales-nuevo',    title: 'PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados',                          defaultImage: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80' },
  { id: 'art-cuidar-nuevo',        title: 'Cómo Cuidar y Exhibir tus Figuras sin Dañarlas',                                             defaultImage: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80' },
  { id: 'art-misb',                title: 'MISB, MIB, Loose y otros términos del coleccionismo',                                        defaultImage: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80' },
  { id: 'art-edicion-limitada',    title: 'Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan',                             defaultImage: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80' },
  { id: 'art-foco-coleccion',      title: 'El Arte del Foco: Cómo Elegir una Sola Línea y Dominarla sin Dispersarse',                   defaultImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80' },
  { id: 'art-completismo-curaduria', title: 'Completismo vs Curaduría: Por Qué Intentar Tener Todo Arruina el Disfrute',                defaultImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&q=80' },
  { id: 'art-presupuesto-real',    title: 'Presupuesto Real del Coleccionista: Costo Oculto de Envíos, Aduana y Exhibición',            defaultImage: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80' },
  { id: 'art-caja-cerrada-vs-open', title: 'El Síndrome de la Caja Cerrada: Debate Definitivo entre Open-Box y Conservación Sellada',  defaultImage: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80' },
  { id: 'art-batalla-1-12-import-retail', title: 'Batalla en Escala 1:12: Diferencias Reales entre Import Japonés y Retail Americano', defaultImage: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&q=80' },
  { id: 'art-frontera-18cm-1-10',  title: 'La Frontera de los 18 cm: Por Qué la Escala 1:10 de McFarlane y NECA No Encaja con Todo',   defaultImage: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80' },
  { id: 'art-salto-escala-1-6',    title: 'El Salto a 1:6: Requisitos de Espacio, Peso y Soporte Antes de Comprar tu Primera Pieza',   defaultImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&q=80' },
  { id: 'art-micro-escalas-1-18',  title: 'Micro-Escalas y Miniaturas: Guía para Integrar Figuras 1:18 y 1:24 en tu Repisa',           defaultImage: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=1200&q=80' },
  { id: 'art-bandai-vs-hottoys',   title: 'Bandai vs Hot Toys: Cuándo el Precio se Justifica y Cuándo No',                              defaultImage: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80' },
  { id: 'art-fabricantes-occidentales', title: 'NECA, McFarlane y Hasbro: El Juego de los Fabricantes Occidentales en el Mercado Actual', defaultImage: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80' },
  { id: 'art-bootleg-tecnico',     title: 'Cómo Detectar Bootlegs Técnicos: Marcas de Molde, Pintura y Articulaciones que Delatan una Copia', defaultImage: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80' },
  { id: 'art-resina-vs-pvc',       title: 'Resina vs PVC: Qué Material Envejece Mejor y Cuál Requiere Más Cuidados',                   defaultImage: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&q=80' },
  { id: 'art-degradacion-material', title: 'Degradación de Materiales en Figuras: Cómo el Calor, la Luz y la Humedad Destruyen tu Colección', defaultImage: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80' },
  { id: 'art-pegajosidad-pvc',     title: 'Pegajosidad en Figuras PVC: Causas, Prevención y Soluciones Definitivas',                   defaultImage: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80' },
  { id: 'art-hidrolisis-1-6',      title: 'Hidrólisis en Figuras Escala 1:6: La Amenaza Silenciosa de la Cuerina y el Vinilo',          defaultImage: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80' },
  { id: 'art-hidrolisis-cuidado',  title: 'Cómo Combatir la Hidrólisis en Figuras de Escala 1:6 con Soft Goods',                       defaultImage: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1200&q=80' },
  { id: 'art-fomo-aftermarket-reissue', title: 'El Fenómeno FOMO y el Aftermarket: Cuándo Pagar Precio de Reventa y Cuándo Esperar un Reissue', defaultImage: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80' },
  { id: 'art-grading-afa-cas-figuras', title: 'Grading en Figuras de Acción: Qué Hacen AFA y CAS y Cuándo Vale la Pena Certificar',    defaultImage: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80' },
  { id: 'art-preventas-depositos-retrasos', title: 'Preventas y Depósitos de Reserva: Ciclo de Producción, Retrasos Habituales y Cancelaciones', defaultImage: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80' },
  { id: 'art-guia-importacion-uruguay-franquicia', title: 'Guía de Importación en Uruguay: Cómo Usar la Franquicia de USD 200 para Coleccionables sin Pagar Recargos', defaultImage: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80' },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  PUBLISHED: { label: 'Publicado', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  DRAFT: { label: 'Borrador', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  AI_DRAFT: { label: 'Borrador IA (Revisar)', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  REVIEW: { label: 'En Revisión', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  ARCHIVED: { label: 'Archivado', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const TYPE_LABELS: Record<string, string> = {
  ARTICLE: 'Artículo General',
  GUIDE: 'Guía Paso a Paso',
  SCALE_GUIDE: 'Guía de Escalas',
  MATERIAL_GUIDE: 'Guía de Materiales',
  BRAND_GUIDE: 'Guía de Fabricante'
};

export default function AdminAcademy() {
  const [adminTab, setAdminTab] = useState<'articles' | 'images'>('articles');

  // ── Article editor state ──────────────────────────────────────────────────
  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContent, setEditingContent] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Image overrides state ─────────────────────────────────────────────────
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [savingImage, setSavingImage] = useState<string | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    loadContents();
    loadImageOverrides();
  }, []);

  // ─── Article CRUD ────────────────────────────────────────────────────────

  const loadContents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('academy_content')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setContents(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar artículos de Academy');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContent || !editingContent.title || !editingContent.slug) {
      toast.error('Completa los campos requeridos (Título y Slug)');
      return;
    }
    setErrorMsg(null);

    const validation = validatePublishAction(
      editingContent.originalStatus || 'DRAFT',
      editingContent.status
    );

    if (!validation.allowed) {
      setErrorMsg(validation.error || 'Acción no permitida');
      toast.error(validation.error || 'Acción no permitida');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: editingContent.title,
        slug: editingContent.slug,
        type: editingContent.type || 'ARTICLE',
        excerpt: editingContent.excerpt || null,
        body: editingContent.body || '',
        status: editingContent.status || 'DRAFT',
        cover_image_url: editingContent.cover_image_url || null,
        seo_title: editingContent.seo_title || null,
        seo_description: editingContent.seo_description || null,
        updated_at: new Date().toISOString()
      };

      if (editingContent.id) {
        const { error } = await supabase.from('academy_content').update(payload).eq('id', editingContent.id);
        if (error) throw error;
        toast.success('Contenido editorial actualizado');
      } else {
        const { error } = await supabase.from('academy_content').insert(payload);
        if (error) throw error;
        toast.success('Contenido creado exitosamente');
      }
      setEditingContent(null);
      loadContents();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar');
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, title: string) => {
    confirm({
      title: '¿Eliminar artículo de Academy?',
      message: `Esta acción removerá el artículo "${title}" permanentemente.`,
      confirmLabel: 'Eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('academy_content').delete().eq('id', id);
          if (error) throw error;
          toast.success('Artículo eliminado');
          loadContents();
        } catch (err: any) {
          toast.error(err.message || 'Error al eliminar');
        }
      }
    });
  };

  const handleQuickPublishAI = async (item: any) => {
    try {
      const { error } = await supabase
        .from('academy_content')
        .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      toast.success('Borrador IA aprobado y publicado');
      loadContents();
    } catch (err: any) {
      toast.error(err.message || 'Error al publicar');
    }
  };

  // ─── Image Overrides ────────────────────────────────────────────────────

  const loadImageOverrides = async () => {
    try {
      setImagesLoading(true);
      const { data, error } = await supabase
        .from('academy_article_images')
        .select('article_id, image_url');

      if (!error && data) {
        const map: Record<string, string> = {};
        const inputs: Record<string, string> = {};
        data.forEach((row: any) => {
          map[row.article_id] = row.image_url;
          inputs[row.article_id] = row.image_url;
        });
        setImageOverrides(map);
        setUrlInputs(inputs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImagesLoading(false);
    }
  };

  const saveImageOverride = async (articleId: string, imageUrl: string) => {
    if (!imageUrl.trim()) {
      toast.error('Ingresá una URL válida o seleccioná una imagen del Media Manager');
      return;
    }
    setSavingImage(articleId);
    try {
      const { error } = await supabase
        .from('academy_article_images')
        .upsert(
          { article_id: articleId, image_url: imageUrl.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'article_id' }
        );

      if (error) throw error;

      setImageOverrides(prev => ({ ...prev, [articleId]: imageUrl.trim() }));
      toast.success('Imagen actualizada. Se verá reflejada en el sitio de inmediato.');
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar imagen');
    } finally {
      setSavingImage(null);
    }
  };

  const removeImageOverride = async (articleId: string) => {
    confirm({
      title: '¿Restaurar imagen original?',
      message: 'Se eliminará el override y la nota volverá a mostrar la imagen de Unsplash por defecto.',
      confirmLabel: 'Restaurar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('academy_article_images')
            .delete()
            .eq('article_id', articleId);

          if (error) throw error;

          const newOverrides = { ...imageOverrides };
          delete newOverrides[articleId];
          setImageOverrides(newOverrides);

          const newInputs = { ...urlInputs };
          delete newInputs[articleId];
          setUrlInputs(newInputs);

          toast.success('Override eliminado — imagen restaurada al default');
        } catch (err: any) {
          toast.error(err.message || 'Error al restaurar imagen');
        }
      }
    });
  };

  const handleMediaSelect = (url: string) => {
    if (!editingImageId) return;
    setUrlInputs(prev => ({ ...prev, [editingImageId]: url }));
    saveImageOverride(editingImageId, url);
    setMediaPickerOpen(false);
    setEditingImageId(null);
  };

  const openMediaPicker = (articleId: string) => {
    setEditingImageId(articleId);
    setMediaPickerOpen(true);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Panel Editorial: Collector Academy</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Knowledge Base
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de guías técnicas, artículos editoriales y validación de borradores asistidos por IA.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadContents(); loadImageOverrides(); }}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 bg-white"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading || imagesLoading ? 'animate-spin' : ''} />
          </button>
          {adminTab === 'articles' && (
            <button
              onClick={() => {
                setEditingContent({
                  title: '',
                  slug: '',
                  type: 'ARTICLE',
                  status: 'DRAFT',
                  excerpt: '',
                  body: ''
                });
                setActiveTab('editor');
              }}
              className="px-4 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus size={16} />
              <span>Nuevo Contenido</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setAdminTab('articles')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            adminTab === 'articles'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <BookOpen size={14} />
          Artículos del Admin
        </button>
        <button
          onClick={() => setAdminTab('images')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 transition flex items-center gap-1.5 ${
            adminTab === 'images'
              ? 'border-emerald-500 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ImageIcon size={14} />
          Imágenes de Guías
          <span className="ml-1 text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
            {Object.keys(imageOverrides).length}/{HARDCODED_ARTICLES.length}
          </span>
        </button>
      </div>

      {/* ── TAB: ARTÍCULOS DEL ADMIN ─────────────────────────────────────── */}
      {adminTab === 'articles' && (
        <>
          {/* Editor Modal */}
          {editingContent && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-8">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-base font-bold text-gray-900">
                      {editingContent.id ? 'Editar Contenido Editorial' : 'Nuevo Contenido en Academy'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingContent(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSave} className="p-6 space-y-4">
                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                      <AlertTriangle size={15} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">
                        Título del Artículo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Guía de Escalas en Figuras: De 1:12 a 1:6"
                        value={editingContent.title || ''}
                        onChange={(e) => {
                          const title = e.target.value;
                          const slug = !editingContent.id
                            ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                            : (editingContent.slug || '');
                          setEditingContent({ ...editingContent, title, slug });
                        }}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-[#f00856] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">
                        Slug URL <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editingContent.slug || ''}
                        onChange={(e) => setEditingContent({ ...editingContent, slug: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-[#f00856] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">Tipo de Contenido</label>
                      <select
                        value={editingContent.type || 'ARTICLE'}
                        onChange={(e) => setEditingContent({ ...editingContent, type: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                      >
                        <option value="ARTICLE">Artículo General</option>
                        <option value="GUIDE">Guía Paso a Paso</option>
                        <option value="SCALE_GUIDE">Guía de Escalas</option>
                        <option value="MATERIAL_GUIDE">Guía de Materiales</option>
                        <option value="BRAND_GUIDE">Guía de Fabricante</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">Estado de Publicación</label>
                      <select
                        value={editingContent.status || 'DRAFT'}
                        onChange={(e) => setEditingContent({ ...editingContent, status: e.target.value as AcademyContentStatus })}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                      >
                        <option value="DRAFT">Borrador Interno (DRAFT)</option>
                        <option value="AI_DRAFT">Generado por IA (AI_DRAFT)</option>
                        <option value="REVIEW">En Revisión Editorial (REVIEW)</option>
                        <option value="PUBLISHED">Publicado e Indexable (PUBLISHED)</option>
                        <option value="ARCHIVED">Archivado (ARCHIVED)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">URL Imagen de Portada</label>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={editingContent.cover_image_url || ''}
                        onChange={(e) => setEditingContent({ ...editingContent, cover_image_url: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-[#f00856] outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block text-gray-700 font-semibold mb-1.5">Extracto / Resumen Corto</label>
                    <textarea
                      rows={2}
                      placeholder="Breve introducción para tarjetas y meta descripciones..."
                      value={editingContent.excerpt || ''}
                      onChange={(e) => setEditingContent({ ...editingContent, excerpt: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-[#f00856] outline-none"
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-gray-700 font-semibold">Cuerpo del Artículo (Markdown)</label>
                      <div className="flex gap-1 border border-gray-200 rounded-lg p-0.5 bg-gray-50">
                        <button
                          type="button"
                          onClick={() => setActiveTab('editor')}
                          className={`px-3 py-1 rounded text-xs font-semibold ${activeTab === 'editor' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                          Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('preview')}
                          className={`px-3 py-1 rounded text-xs font-semibold ${activeTab === 'preview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                          Vista Previa
                        </button>
                      </div>
                    </div>

                    {activeTab === 'editor' ? (
                      <textarea
                        rows={8}
                        required
                        placeholder="# Escribe aquí en Markdown..."
                        value={editingContent.body || ''}
                        onChange={(e) => setEditingContent({ ...editingContent, body: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs focus:ring-2 focus:ring-[#f00856] outline-none"
                      />
                    ) : (
                      <div className="min-h-[160px] p-4 bg-gray-50 border border-gray-200 rounded-lg prose prose-sm max-w-none text-gray-800 overflow-y-auto max-h-64">
                        {editingContent.body ? (
                          <div className="whitespace-pre-line text-sm">{editingContent.body}</div>
                        ) : (
                          <span className="text-gray-400 italic">No hay contenido escrito aún para previsualizar.</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setEditingContent(null)}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition border border-gray-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
                    >
                      <Save size={15} />
                      <span>{saving ? 'Guardando...' : 'Guardar Artículo'}</span>
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
                    <th className="px-6 py-3.5">Título del Artículo</th>
                    <th className="px-6 py-3.5">Tipo / Formato</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5">Fecha</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#f00856]" />
                        Cargando artículos de Academy...
                      </td>
                    </tr>
                  ) : contents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        No hay contenidos editoriales registrados.
                      </td>
                    </tr>
                  ) : (
                    contents.map((c) => {
                      const statusInfo = STATUS_CONFIG[c.status] || {
                        label: c.status,
                        bg: 'bg-gray-100',
                        text: 'text-gray-700',
                        border: 'border-gray-200'
                      };

                      return (
                        <tr key={c.id} className="hover:bg-gray-50/70 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                <BookOpen size={16} />
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 block text-sm">{c.title}</span>
                                <span className="text-[11px] text-gray-400 font-mono">/academy/{c.slug}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-gray-700">
                            {TYPE_LABELS[c.type] || c.type}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-gray-500">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {c.status === 'AI_DRAFT' && (
                                <button
                                  onClick={() => handleQuickPublishAI(c)}
                                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold transition mr-1"
                                  title="Aprobar y publicar borrador IA"
                                >
                                  Aprobar
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingContent({ ...c, originalStatus: c.status });
                                  setActiveTab('editor');
                                }}
                                className="p-1.5 rounded-lg text-gray-600 hover:text-[#f00856] hover:bg-pink-50 transition border border-transparent hover:border-pink-200"
                                title="Editar contenido"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(c.id, c.title)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition border border-transparent hover:border-red-200"
                                title="Eliminar contenido"
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
        </>
      )}

      {/* ── TAB: IMÁGENES DE GUÍAS ──────────────────────────────────────── */}
      {adminTab === 'images' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800">
            <p className="font-bold mb-1">📸 Imágenes de portada de las 28 guías editoriales</p>
            <p>Los cambios se reflejan de inmediato en la página pública sin necesidad de deploy. La imagen personalizada tiene prioridad sobre el valor por defecto (Unsplash). Podés subir tu imagen al Media Manager o pegar una URL externa.</p>
            <p className="mt-1 text-emerald-700">Tamaño recomendado: <strong>1200 × 800 px</strong> · Relación 3:2 · Peso máx. 200 KB · JPG o WebP.</p>
          </div>

          {imagesLoading ? (
            <div className="py-10 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
              Cargando overrides de imágenes...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {HARDCODED_ARTICLES.map((article) => {
                const currentImage = imageOverrides[article.id] || article.defaultImage;
                const hasOverride = Boolean(imageOverrides[article.id]);
                const inputVal = urlInputs[article.id] ?? '';
                const isSaving = savingImage === article.id;

                return (
                  <div
                    key={article.id}
                    className={`bg-white border rounded-xl overflow-hidden shadow-sm transition ${
                      hasOverride ? 'border-emerald-300' : 'border-gray-200'
                    }`}
                  >
                    {/* Image preview */}
                    <div className="relative h-36 bg-gray-100 overflow-hidden">
                      <img
                        src={currentImage}
                        alt={article.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = article.defaultImage;
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-[11px] font-bold leading-tight line-clamp-2">{article.title}</p>
                      </div>
                      {hasOverride && (
                        <div className="absolute top-2 right-2">
                          <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                            PERSONALIZADA
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="p-3 space-y-2">
                      <p className="text-[10px] text-gray-400 font-mono">{article.id}</p>

                      {/* URL input + Media picker */}
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="https://... o pegar URL"
                            value={inputVal}
                            onChange={(e) => setUrlInputs(prev => ({ ...prev, [article.id]: e.target.value }))}
                            className="w-full pl-7 pr-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>
                        <button
                          onClick={() => openMediaPicker(article.id)}
                          title="Elegir del Media Manager"
                          className="px-2.5 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-gray-600 hover:text-gray-900 transition flex-shrink-0"
                        >
                          <Upload size={14} />
                        </button>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveImageOverride(article.id, inputVal)}
                          disabled={isSaving || !inputVal.trim()}
                          className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
                        >
                          {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                          {isSaving ? 'Guardando...' : 'Guardar imagen'}
                        </button>
                        {hasOverride && (
                          <button
                            onClick={() => removeImageOverride(article.id)}
                            title="Restaurar imagen por defecto"
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs rounded-lg transition flex-shrink-0"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={mediaPickerOpen}
        onClose={() => { setMediaPickerOpen(false); setEditingImageId(null); }}
        onSelect={handleMediaSelect}
        multiple={false}
        rootPath="academy/"
      />
    </div>
  );
}
