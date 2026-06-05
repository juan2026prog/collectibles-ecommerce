import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Megaphone, Plus, Trash2, Edit, Save, X, Calendar, Send, PlayCircle, BarChart3 } from 'lucide-react';
import { useToast } from '../Toast';

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [simulation, setSimulation] = useState<any>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [c, s, t] = await Promise.all([
      supabase.from('campaigns').select('*, customer_segments(name), communication_templates(name, type)').order('created_at', { ascending: false }),
      supabase.from('customer_segments').select('id, name'),
      supabase.from('communication_templates').select('id, name, type').eq('is_active', true)
    ]);
    if (c.data) setCampaigns(c.data);
    if (s.data) setSegments(s.data);
    if (t.data) setTemplates(t.data);
    setLoading(false);
  }

  const handleEdit = (cmp: any) => {
    if (cmp.status === 'processing' || cmp.status === 'completed') {
      toast.error('No se puede editar una campaña que ya se envió o está en proceso');
      return;
    }
    setEditingId(cmp.id);
    setForm({
      name: cmp.name,
      segment_id: cmp.segment_id,
      template_id: cmp.template_id,
      channel: cmp.channel,
      scheduled_at: cmp.scheduled_at ? new Date(cmp.scheduled_at).toISOString().slice(0, 16) : '',
      status: cmp.status
    });
  };

  const handleNew = () => {
    setEditingId('new');
    setForm({ 
      name: '', 
      segment_id: '',
      template_id: '',
      channel: 'email',
      scheduled_at: '',
      status: 'draft'
    });
    setSimulation(null);
  };

  const handleSimulate = async () => {
    if (!form.segment_id) return toast.error('Selecciona un segmento primero');
    const seg = segments.find(s => s.id === form.segment_id);
    if (!seg || !seg.query_rules) return toast.error('El segmento no tiene reglas válidas');
    
    try {
      const { data, error } = await supabase.rpc('calculate_segment_estimate', { rules: seg.query_rules });
      if (error) throw error;
      setSimulation(data);
      toast.success('Simulación completada');
    } catch (e: any) {
      toast.error('Error al simular: ' + e.message);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.segment_id || !form.template_id) {
      toast.error('Nombre, segmento y plantilla son requeridos');
      return;
    }

    const payload = {
      name: form.name,
      segment_id: form.segment_id,
      template_id: form.template_id,
      channel: form.channel,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: form.status,
      updated_at: new Date().toISOString()
    };

    if (editingId === 'new') {
      const { error } = await supabase.from('campaigns').insert([payload]);
      if (error) toast.error('Error al crear campaña');
      else { toast.success('Campaña creada'); fetchData(); setEditingId(null); }
    } else {
      const { error } = await supabase.from('campaigns').update(payload).eq('id', editingId);
      if (error) toast.error('Error al actualizar');
      else { toast.success('Campaña actualizada'); fetchData(); setEditingId(null); }
    }
  };

  const handleDelete = async (id: string, status: string) => {
    if (status === 'processing') {
      toast.error('No se puede eliminar una campaña en progreso');
      return;
    }
    if (!window.confirm('¿Eliminar campaña?')) return;
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Campaña eliminada'); fetchData(); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando campañas...</div>;

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary-500" />
            {editingId === 'new' ? 'Nueva Campaña' : 'Editar Campaña'}
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

        <div className="glass p-6 max-w-2xl mx-auto space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1">Nombre de la Campaña</label>
            <input className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Newsletter Verano 2026" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Audiencia (Segmento)</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.segment_id} onChange={e => setForm({...form, segment_id: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Canal de Envío</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="both">Ambos</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Plantilla</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {templates.filter(t => form.channel === 'both' || t.type === form.channel).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1 flex items-center gap-2"><Calendar className="w-4 h-4"/> Fecha Programada (Opcional)</label>
              <input type="datetime-local" className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.scheduled_at} onChange={e => setForm({...form, scheduled_at: e.target.value})} />
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <label className="block text-sm font-bold text-slate-300 mb-1 flex items-center gap-2"><PlayCircle className="w-4 h-4 text-green-400"/> Estado</label>
            <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="draft">Borrador</option>
              <option value="scheduled">Programada (Lista para enviar)</option>
            </select>
            {form.status === 'scheduled' && !form.scheduled_at && (
              <p className="text-xs text-orange-400 mt-2">Al no tener fecha programada, se enviará en la próxima ejecución del motor (cada 15 min).</p>
            )}
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <button onClick={handleSimulate} className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4"/> Simular Audiencia
            </button>
            {simulation && (
              <div className="flex gap-4 text-sm">
                <div className="text-center"><p className="text-xs text-slate-400">Total</p><p className="font-bold">{simulation.total}</p></div>
                <div className="text-center"><p className="text-xs text-slate-400">Email Opt-in</p><p className="font-bold text-blue-400">{simulation.emails}</p></div>
                <div className="text-center"><p className="text-xs text-slate-400">WA Opt-in</p><p className="font-bold text-green-400">{simulation.whatsapp}</p></div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary-500" />
          Campañas y Newsletters
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 bg-dark-800 px-3 py-1.5 rounded-lg border border-white/5 cursor-pointer">
            <span className="font-bold">WhatsApp Masivo:</span>
            <input type="checkbox" className="hidden" checked={whatsappEnabled} onChange={(e) => {
              if(!e.target.checked && !window.confirm('¿Seguro? Esto bloqueará cualquier envío pendiente de WhatsApp.')) return;
              setWhatsappEnabled(e.target.checked);
              // In a real app this would save to site_settings table.
            }} />
            <div className={`w-8 h-4 rounded-full transition-colors relative ${whatsappEnabled ? 'bg-green-500' : 'bg-slate-600'}`}>
              <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${whatsappEnabled ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5'}`} />
            </div>
            {whatsappEnabled ? <span className="text-green-400 text-xs">Activo</span> : <span className="text-slate-500 text-xs">Pausado</span>}
          </label>
          <button onClick={handleNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4"/> Nueva Campaña
          </button>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 text-sm">
              <th className="p-4 font-medium">Campaña</th>
              <th className="p-4 font-medium">Segmento</th>
              <th className="p-4 font-medium">Estadísticas</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {campaigns.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">No hay campañas creadas</td></tr>
            ) : (
              campaigns.map(cmp => (
                <tr key={cmp.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">{cmp.name}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Send className="w-3 h-3"/> {cmp.channel.toUpperCase()}
                      {cmp.scheduled_at && <span className="ml-2 bg-dark-900 px-1.5 py-0.5 rounded text-primary-300">{new Date(cmp.scheduled_at).toLocaleString()}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-300">
                    {cmp.customer_segments?.name || 'N/A'}
                  </td>
                  <td className="p-4">
                    {cmp.status === 'completed' || cmp.status === 'processing' ? (
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex flex-col"><span className="text-slate-400">Enviados</span><span className="font-bold">{cmp.stats?.sent || 0}</span></div>
                        <div className="flex flex-col"><span className="text-slate-400">Aperturas</span><span className="font-bold text-blue-400">{cmp.stats?.opened || 0}</span></div>
                        <div className="flex flex-col"><span className="text-slate-400">Clics</span><span className="font-bold text-green-400">{cmp.stats?.clicked || 0}</span></div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Esperando envío</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      cmp.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      cmp.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                      cmp.status === 'processing' ? 'bg-orange-500/20 text-orange-400 animate-pulse' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {cmp.status === 'scheduled' ? 'Programada' : cmp.status === 'completed' ? 'Completada' : cmp.status === 'draft' ? 'Borrador' : cmp.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(cmp)} disabled={cmp.status === 'processing' || cmp.status === 'completed'} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-slate-400"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(cmp.id, cmp.status)} disabled={cmp.status === 'processing'} className="p-2 text-slate-400 hover:text-red-500 bg-white/5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-slate-400"><Trash2 className="w-4 h-4"/></button>
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
