import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Settings, Plus, Trash2, Edit, Save, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '../Toast';

export default function RulesEditor() {
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [r, t] = await Promise.all([
      supabase.from('automation_rules').select('*, communication_templates(name)').order('created_at', { ascending: false }),
      supabase.from('communication_templates').select('id, name, type').eq('is_active', true)
    ]);
    if (r.data) setRules(r.data);
    if (t.data) setTemplates(t.data);
    setLoading(false);
  }

  const handleEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm(rule);
  };

  const handleNew = () => {
    setEditingId('new');
    setForm({ 
      name: '', 
      trigger_event: 'cart_abandoned', 
      channel: 'email', 
      delay_minutes: 60, 
      template_id: '',
      is_active: true 
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.template_id) {
      toast.error('Nombre y Plantilla son requeridos');
      return;
    }

    const payload = {
      name: form.name,
      trigger_event: form.trigger_event,
      channel: form.channel,
      delay_minutes: parseInt(form.delay_minutes),
      template_id: form.template_id,
      is_active: form.is_active,
      updated_at: new Date().toISOString()
    };

    if (editingId === 'new') {
      const { error } = await supabase.from('automation_rules').insert([payload]);
      if (error) toast.error('Error al crear regla');
      else { toast.success('Regla creada'); fetchData(); setEditingId(null); }
    } else {
      const { error } = await supabase.from('automation_rules').update(payload).eq('id', editingId);
      if (error) toast.error('Error al actualizar');
      else { toast.success('Regla actualizada'); fetchData(); setEditingId(null); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar regla? Dejará de funcionar de inmediato.')) return;
    const { error } = await supabase.from('automation_rules').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Regla eliminada'); fetchData(); }
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('automation_rules').update({ is_active: !current }).eq('id', id);
    if (error) toast.error('Error al actualizar estado');
    else { fetchData(); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando reglas...</div>;

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-500" />
            {editingId === 'new' ? 'Nueva Regla' : 'Editar Regla'}
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
            <label className="block text-sm font-bold text-slate-300 mb-1">Nombre Interno</label>
            <input className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Carrito Recuperado 1H" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Trigger (Evento)</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.trigger_event} onChange={e => setForm({...form, trigger_event: e.target.value})}>
                <option value="cart_abandoned">Carrito Abandonado</option>
                <option value="wishlist_restock">Wishlist: Vuelve el Stock</option>
                <option value="wishlist_price_drop">Wishlist: Baja de Precio</option>
                <option value="order_placed">Compra Realizada</option>
                <option value="first_order">Primera Compra</option>
                <option value="inactive_30d">Cliente Inactivo (30 Días)</option>
                <option value="preorder_arrived">Preventa: Llegada al Local</option>
                <option value="birthday">Cumpleaños</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Canal de Envío</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
                <option value="email">Solo Email</option>
                <option value="whatsapp">Solo WhatsApp</option>
                <option value="both">Email y WhatsApp</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Demora (en minutos)</label>
              <input type="number" className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.delay_minutes} onChange={e => setForm({...form, delay_minutes: e.target.value})} />
              <p className="text-xs text-slate-400 mt-1">1H = 60 | 24H = 1440 | 48H = 2880 | Inmediato = 0</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Plantilla a Utilizar</label>
              <select className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})}>
                <option value="">-- Seleccionar --</option>
                {templates.filter(t => form.channel === 'both' || t.type === form.channel).map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-300">Regla Activa</span>
            <button onClick={() => setForm({...form, is_active: !form.is_active})}>
              {form.is_active ? <ToggleRight className="w-8 h-8 text-primary-500" /> : <ToggleLeft className="w-8 h-8 text-slate-500" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-500" />
          Reglas Automáticas
        </h2>
        <button onClick={handleNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4"/> Nueva Regla
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rules.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 glass rounded-xl">No hay reglas configuradas.</div>
        ) : (
          rules.map(rule => (
            <div key={rule.id} className={`glass rounded-xl p-5 border transition-all ${rule.is_active ? 'border-primary-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]' : 'border-white/5 opacity-70'}`}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-lg leading-tight">{rule.name}</h3>
                <button onClick={() => toggleActive(rule.id, rule.is_active)}>
                  {rule.is_active ? <ToggleRight className="w-6 h-6 text-primary-500" /> : <ToggleLeft className="w-6 h-6 text-slate-500" />}
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Trigger:</span>
                  <span className="font-mono text-xs bg-dark-900 px-2 py-0.5 rounded">{rule.trigger_event}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Demora:</span>
                  <span className="text-white">{rule.delay_minutes} minutos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Canal:</span>
                  <span className="uppercase text-xs font-bold text-primary-400 tracking-wider">{rule.channel}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/10 mt-2">
                  <span className="text-xs text-slate-400 max-w-[150px] truncate">
                    Tpl: {rule.communication_templates?.name || 'N/A'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rule)} className="p-1.5 text-slate-400 hover:text-white bg-white/5 rounded transition-colors"><Edit className="w-3.5 h-3.5"/></button>
                    <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-slate-400 hover:text-red-500 bg-white/5 rounded transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
