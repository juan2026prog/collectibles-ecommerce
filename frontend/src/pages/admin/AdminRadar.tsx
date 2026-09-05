import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Radio, Plus, Edit2, Trash2, Calendar, Eye, EyeOff, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ReleaseEvent, ReleaseStatus, ReleasePrecision } from '../../plugins/collector-radar/types';

export default function AdminRadar() {
  const [releases, setReleases] = useState<ReleaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRelease, setEditingRelease] = useState<Partial<ReleaseEvent> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReleases();
  }, []);

  const loadReleases = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('release_events')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReleases(data as any);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRelease || !editingRelease.title || !editingRelease.slug) return;
    setSaving(true);
    try {
      if (editingRelease.id) {
        await supabase
          .from('release_events')
          .update({
            title: editingRelease.title,
            slug: editingRelease.slug,
            subtitle: editingRelease.subtitle,
            description: editingRelease.description,
            summary: editingRelease.summary,
            status: editingRelease.status,
            msrp: editingRelease.msrp,
            release_precision: editingRelease.release_precision,
            date_display_text: editingRelease.date_display_text,
            official_image_url: editingRelease.official_image_url,
            is_published: editingRelease.is_published,
            is_featured: editingRelease.is_featured,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRelease.id);
      } else {
        await supabase
          .from('release_events')
          .insert({
            title: editingRelease.title,
            slug: editingRelease.slug,
            subtitle: editingRelease.subtitle,
            description: editingRelease.description,
            summary: editingRelease.summary,
            status: editingRelease.status || 'ANNOUNCED',
            msrp: editingRelease.msrp,
            release_precision: editingRelease.release_precision || 'TBA',
            date_display_text: editingRelease.date_display_text,
            official_image_url: editingRelease.official_image_url,
            is_published: editingRelease.is_published ?? true,
            is_featured: editingRelease.is_featured ?? false
          });
      }
      setEditingRelease(null);
      loadReleases();
    } catch (err) {
      console.error(err);
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
            <h1 className="text-2xl font-bold tracking-wide">Gestión del Radar & Lanzamientos</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Release Engine
            </span>
          </div>
          <p className="text-xs text-zinc-400">CRUD manual de lanzamientos, precisiones de fecha e historial de eventos</p>
        </div>

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
          className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/20"
        >
          <Plus size={15} />
          <span>Crear Lanzamiento</span>
        </button>
      </div>

      {/* Editor Modal/Panel */}
      {editingRelease && (
        <form onSubmit={handleSave} className="bg-zinc-900 border border-white/15 rounded-2xl p-6 space-y-4 max-w-3xl shadow-2xl">
          <h2 className="text-base font-bold text-white mb-2">
            {editingRelease.id ? 'Editar Lanzamiento' : 'Nuevo Lanzamiento en Radar'}
          </h2>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Título</label>
              <input
                type="text"
                required
                value={editingRelease.title || ''}
                onChange={(e) => setEditingRelease({ ...editingRelease, title: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Slug URL</label>
              <input
                type="text"
                required
                value={editingRelease.slug || ''}
                onChange={(e) => setEditingRelease({ ...editingRelease, slug: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado</label>
              <select
                value={editingRelease.status || 'ANNOUNCED'}
                onChange={(e) => setEditingRelease({ ...editingRelease, status: e.target.value as ReleaseStatus })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="ANNOUNCED">ANNOUNCED</option>
                <option value="REVEALED">REVEALED</option>
                <option value="PREORDER_SOON">PREORDER_SOON</option>
                <option value="PREORDER_OPEN">PREORDER_OPEN</option>
                <option value="COMING_SOON">COMING_SOON</option>
                <option value="SHIPPING">SHIPPING</option>
                <option value="RELEASED">RELEASED</option>
                <option value="DELAYED">DELAYED</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Precisión de Fecha</label>
              <select
                value={editingRelease.release_precision || 'QUARTER'}
                onChange={(e) => setEditingRelease({ ...editingRelease, release_precision: e.target.value as ReleasePrecision })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="EXACT_DATE">EXACT_DATE</option>
                <option value="MONTH">MONTH</option>
                <option value="QUARTER">QUARTER</option>
                <option value="HALF_YEAR">HALF_YEAR</option>
                <option value="YEAR">YEAR</option>
                <option value="TBA">TBA</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Texto de Fecha Visible</label>
              <input
                type="text"
                value={editingRelease.date_display_text || ''}
                onChange={(e) => setEditingRelease({ ...editingRelease, date_display_text: e.target.value })}
                placeholder="Ej: Q1 2027, Noviembre 2026"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">MSRP (USD)</label>
              <input
                type="number"
                step="0.01"
                value={editingRelease.msrp || ''}
                onChange={(e) => setEditingRelease({ ...editingRelease, msrp: parseFloat(e.target.value) || undefined })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">URL Imagen Oficial</label>
              <input
                type="url"
                value={editingRelease.official_image_url || ''}
                onChange={(e) => setEditingRelease({ ...editingRelease, official_image_url: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setEditingRelease(null)}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Save size={14} />
              <span>{saving ? 'Guardando...' : 'Guardar Lanzamiento'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-zinc-900/80 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.02] text-zinc-400 border-b border-white/5 font-bold uppercase text-[10px]">
            <tr>
              <th className="px-5 py-3">Lanzamiento</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Fecha Estimada</th>
              <th className="px-5 py-3">MSRP</th>
              <th className="px-5 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-zinc-300">
            {releases.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.01]">
                <td className="px-5 py-3 font-semibold text-white">{r.title}</td>
                <td className="px-5 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                    {r.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono">{r.date_display_text || 'TBA'}</td>
                <td className="px-5 py-3 font-mono">{r.msrp ? `$${r.msrp}` : '-'}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setEditingRelease(r)}
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
