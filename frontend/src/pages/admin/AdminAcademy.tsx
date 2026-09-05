import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { GraduationCap, Plus, Edit2, Save, FileText, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { validatePublishAction } from '../../plugins/collector-academy/core/draftGuard';
import type { AcademyContentStatus } from '../../plugins/collector-academy/types';

export default function AdminAcademy() {
  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContent, setEditingContent] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadContents();
  }, []);

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
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContent) return;
    setErrorMsg(null);

    // Enforce AI Draft guardrail
    const validation = validatePublishAction(
      editingContent.originalStatus || 'DRAFT',
      editingContent.status
    );

    if (!validation.allowed) {
      setErrorMsg(validation.error || 'Acción no permitida');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: editingContent.title,
        slug: editingContent.slug,
        type: editingContent.type || 'ARTICLE',
        excerpt: editingContent.excerpt,
        body: editingContent.body || '',
        status: editingContent.status,
        updated_at: new Date().toISOString()
      };

      if (editingContent.id) {
        await supabase.from('academy_content').update(payload).eq('id', editingContent.id);
      } else {
        await supabase.from('academy_content').insert(payload);
      }
      setEditingContent(null);
      loadContents();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">Panel Editorial: Collector Academy</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Knowledge Base
            </span>
          </div>
          <p className="text-xs text-zinc-400">Gestión de guías técnicas, artículos editoriales y borradores asistidos por IA</p>
        </div>

        <button
          onClick={() => setEditingContent({
            title: '',
            slug: '',
            type: 'ARTICLE',
            status: 'DRAFT',
            excerpt: '',
            body: ''
          })}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
        >
          <Plus size={15} />
          <span>Nuevo Contenido</span>
        </button>
      </div>

      {/* Editor Modal */}
      {editingContent && (
        <form onSubmit={handleSave} className="bg-zinc-900 border border-white/15 rounded-2xl p-6 space-y-4 max-w-3xl shadow-2xl">
          <h2 className="text-base font-bold mb-2">
            {editingContent.id ? 'Editar Contenido' : 'Crear Contenido en Academy'}
          </h2>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Título</label>
              <input
                type="text"
                required
                value={editingContent.title || ''}
                onChange={(e) => setEditingContent({ ...editingContent, title: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Slug URL</label>
              <input
                type="text"
                required
                value={editingContent.slug || ''}
                onChange={(e) => setEditingContent({ ...editingContent, slug: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Tipo de Contenido</label>
              <select
                value={editingContent.type || 'ARTICLE'}
                onChange={(e) => setEditingContent({ ...editingContent, type: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="ARTICLE">Artículo General</option>
                <option value="GUIDE">Guía Paso a Paso</option>
                <option value="SCALE_GUIDE">Guía de Escalas</option>
                <option value="MATERIAL_GUIDE">Guía de Materiales</option>
                <option value="BRAND_GUIDE">Guía de Marca</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado de Publicación</label>
              <select
                value={editingContent.status || 'DRAFT'}
                onChange={(e) => setEditingContent({ ...editingContent, status: e.target.value as AcademyContentStatus })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="DRAFT">DRAFT (Borrador Interno)</option>
                <option value="AI_DRAFT">AI_DRAFT (Generado por IA - Requiere revisión)</option>
                <option value="REVIEW">REVIEW (En Revisión Editorial)</option>
                <option value="PUBLISHED">PUBLISHED (Público e Indexable)</option>
                <option value="ARCHIVED">ARCHIVED (Archivado)</option>
              </select>
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-zinc-400 font-semibold mb-1">Extracto / Resumen Corto</label>
            <textarea
              rows={2}
              value={editingContent.excerpt || ''}
              onChange={(e) => setEditingContent({ ...editingContent, excerpt: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
            />
          </div>

          <div className="text-xs">
            <label className="block text-zinc-400 font-semibold mb-1">Cuerpo del Artículo</label>
            <textarea
              rows={6}
              required
              value={editingContent.body || ''}
              onChange={(e) => setEditingContent({ ...editingContent, body: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setEditingContent(null)}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Save size={14} />
              <span>{saving ? 'Guardando...' : 'Guardar'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-zinc-900/80 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.02] text-zinc-400 border-b border-white/5 font-bold uppercase text-[10px]">
            <tr>
              <th className="px-5 py-3">Título</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-zinc-300">
            {contents.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.01]">
                <td className="px-5 py-3 font-semibold text-white">{c.title}</td>
                <td className="px-5 py-3">{c.type}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setEditingContent({ ...c, originalStatus: c.status })}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition"
                  >
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
