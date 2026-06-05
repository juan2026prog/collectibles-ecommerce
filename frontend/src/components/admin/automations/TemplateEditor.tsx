import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { LayoutTemplate, Plus, Trash2, Edit, Save, X } from 'lucide-react';
import { useToast } from '../Toast';

export default function TemplateEditor() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase.from('communication_templates').select('*').order('created_at', { ascending: false });
    if (data) setTemplates(data);
    setLoading(false);
  }

  const handleEdit = (tpl: any) => {
    setEditingId(tpl.id);
    setForm(tpl);
  };

  const handleNew = () => {
    setEditingId('new');
    setForm({ name: '', type: 'email', subject: '', content: '', variables: [], is_active: true });
  };

  const handleSave = async () => {
    if (!form.name || !form.content) {
      toast.error('Nombre y contenido son requeridos');
      return;
    }

    const payload = {
      name: form.name,
      type: form.type,
      subject: form.type === 'email' ? form.subject : null,
      content: form.content,
      is_active: form.is_active,
      updated_at: new Date().toISOString()
    };

    if (editingId === 'new') {
      const { error } = await supabase.from('communication_templates').insert([payload]);
      if (error) toast.error('Error al crear plantilla');
      else { toast.success('Plantilla creada'); fetchTemplates(); setEditingId(null); }
    } else {
      const { error } = await supabase.from('communication_templates').update(payload).eq('id', editingId);
      if (error) toast.error('Error al actualizar');
      else { toast.success('Plantilla actualizada'); fetchTemplates(); setEditingId(null); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar plantilla? Esto puede romper reglas activas.')) return;
    const { error } = await supabase.from('communication_templates').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Plantilla eliminada'); fetchTemplates(); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando plantillas...</div>;

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-primary-500" />
            {editingId === 'new' ? 'Nueva Plantilla' : 'Editar Plantilla'}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setEditingId(null)} className="btn-secondary py-2 px-4 flex items-center gap-2">
              <X className="w-4 h-4"/> Cancelar
            </button>
            <button onClick={handleSave} className="btn-primary py-2 px-4 flex items-center gap-2">
              <Save className="w-4 h-4"/> Guardar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Nombre Interno</label>
              <input className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Canal</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="email">Email (HTML)</option>
                <option value="whatsapp">WhatsApp (Texto)</option>
              </select>
            </div>
            {form.type === 'email' && (
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-1">Asunto (Subject)</label>
                <input className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.subject || ''} onChange={e => setForm({...form, subject: e.target.value})} />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-slate-300">Contenido ({form.type === 'email' ? 'HTML' : 'Texto Plano'})</label>
                <button type="button" onClick={() => {
                  if(window.confirm('Esto reemplazará el contenido actual. ¿Continuar?')) {
                    const fallback = form.type === 'email' 
                      ? '<p>Hola {{nombre}}, este es el contenido por defecto para probar que el fallback funciona correctamente. Saludos!</p>'
                      : 'Hola {{nombre}}, este es el texto por defecto.';
                    setForm({...form, content: fallback});
                  }
                }} className="text-xs text-primary-400 hover:text-primary-300 underline">Restaurar Predeterminado</button>
              </div>
              <textarea rows={12} className="form-input bg-dark-800 border-white/10 text-white w-full font-mono text-sm" value={form.content} onChange={e => setForm({...form, content: e.target.value})} />
            </div>
          </div>
          
          <div className="glass p-6 space-y-4">
             <h3 className="font-bold text-slate-200">Vista Previa</h3>
             <div className="bg-white text-black p-4 rounded-lg min-h-[300px] border border-gray-200" dangerouslySetInnerHTML={{ __html: form.type === 'email' ? form.content : form.content.replace(/\n/g, '<br/>') }} />
             
             <div className="mt-4 p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl">
               <h4 className="text-sm font-bold text-primary-400 mb-2">Variables Disponibles</h4>
               <p className="text-xs text-slate-400 mb-2">Usa las variables encerrándolas entre llaves dobles, por ejemplo: `{'{{nombre}}'}`</p>
               <div className="flex flex-wrap gap-2">
                 {['nombre', 'apellido', 'email', 'order_id', 'total', 'tracking_url', 'cupon', 'producto'].map(v => (
                   <span key={v} className="px-2 py-1 bg-dark-900 rounded font-mono text-xs text-primary-300 border border-white/10">{'{{' + v + '}}'}</span>
                 ))}
               </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <LayoutTemplate className="w-5 h-5 text-primary-500" />
          Plantillas de Comunicación
        </h2>
        <button onClick={handleNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4"/> Nueva Plantilla
        </button>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 text-sm">
              <th className="p-4 font-medium">Nombre</th>
              <th className="p-4 font-medium">Canal</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {templates.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">No hay plantillas creadas</td></tr>
            ) : (
              templates.map(tpl => (
                <tr key={tpl.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">{tpl.name}</div>
                    {tpl.subject && <div className="text-xs text-slate-400 mt-1">Asunto: {tpl.subject}</div>}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs uppercase font-bold tracking-wider ${tpl.type === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                      {tpl.type}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${tpl.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {tpl.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(tpl)} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(tpl.id)} className="p-2 text-slate-400 hover:text-red-500 bg-white/5 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
