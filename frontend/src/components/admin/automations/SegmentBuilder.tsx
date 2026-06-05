import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Users, Plus, Trash2, Edit, Save, X, Filter } from 'lucide-react';
import { useToast } from '../Toast';

export default function SegmentBuilder() {
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchSegments();
  }, []);

  async function fetchSegments() {
    setLoading(true);
    const { data } = await supabase.from('customer_segments').select('*').order('created_at', { ascending: false });
    if (data) setSegments(data);
    setLoading(false);
  }

  const handleEdit = (seg: any) => {
    setEditingId(seg.id);
    setForm({
      name: seg.name,
      description: seg.description || '',
      type: seg.type || 'dynamic',
      query_rules: seg.query_rules?.operator ? seg.query_rules : { operator: 'AND', conditions: [] }
    });
  };

  const handleNew = () => {
    setEditingId('new');
    setForm({ 
      name: '', 
      description: '', 
      type: 'dynamic', 
      query_rules: { operator: 'AND', conditions: [] }
    });
  };

  const addCondition = () => {
    setForm({
      ...form,
      query_rules: {
        ...form.query_rules,
        conditions: [...form.query_rules.conditions, { field: 'total_spent', operator: 'greater_than', value: '' }]
      }
    });
  };

  const updateCondition = (idx: number, key: string, val: any) => {
    const newConds = [...form.query_rules.conditions];
    newConds[idx][key] = val;
    setForm({
      ...form,
      query_rules: { ...form.query_rules, conditions: newConds }
    });
  };

  const removeCondition = (idx: number) => {
    const newConds = form.query_rules.conditions.filter((_: any, i: number) => i !== idx);
    setForm({
      ...form,
      query_rules: { ...form.query_rules, conditions: newConds }
    });
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error('Nombre es requerido');
      return;
    }

    const payload = {
      name: form.name,
      description: form.description,
      type: form.type,
      query_rules: form.query_rules,
      // For dynamic we reset count to 0, later a chron or edge function updates it
      last_calculated_count: 0 
    };

    if (editingId === 'new') {
      const { error } = await supabase.from('customer_segments').insert([payload]);
      if (error) toast.error('Error al crear segmento');
      else { toast.success('Segmento creado'); fetchSegments(); setEditingId(null); }
    } else {
      const { error } = await supabase.from('customer_segments').update(payload).eq('id', editingId);
      if (error) toast.error('Error al actualizar');
      else { toast.success('Segmento actualizado'); fetchSegments(); setEditingId(null); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar segmento? Se perderán las campañas asociadas.')) return;
    const { error } = await supabase.from('customer_segments').delete().eq('id', id);
    if (error) toast.error('Error al eliminar');
    else { toast.success('Segmento eliminado'); fetchSegments(); }
  };

  const calculateEstimate = async () => {
    if (!form.query_rules) return;
    try {
      const { data, error } = await supabase.rpc('calculate_segment_estimate', { rules: form.query_rules });
      if (error) throw error;
      toast.success(`Estimación: ${data.total} clientes cumplen estas condiciones`);
      setForm({ ...form, last_calculated_count: data.total });
    } catch (e: any) {
      toast.error('Error al calcular: ' + e.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando segmentos...</div>;

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-500" />
            {editingId === 'new' ? 'Nuevo Segmento' : 'Editar Segmento'}
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
              <label className="block text-sm font-bold text-slate-300 mb-1">Nombre del Segmento</label>
              <input className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Clientes VIP" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">Descripción</label>
              <textarea rows={2} className="form-input bg-dark-800 border-white/10 text-white w-full" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
          </div>
          
          <div className="glass p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-200 flex items-center gap-2"><Filter className="w-4 h-4 text-primary-400"/> Reglas de Inclusión</h3>
              <select className="bg-dark-900 border border-white/10 text-xs px-2 py-1 rounded" value={form.query_rules.operator} onChange={(e) => setForm({...form, query_rules: {...form.query_rules, operator: e.target.value}})}>
                <option value="AND">Cumplir TODAS (AND)</option>
                <option value="OR">Cumplir AL MENOS UNA (OR)</option>
              </select>
            </div>
            
            <div className="space-y-3">
              {form.query_rules.conditions.map((cond: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 bg-dark-900 p-2 rounded border border-white/5">
                  <select className="bg-dark-800 border-white/10 text-xs px-2 py-1.5 rounded flex-1" value={cond.field} onChange={(e) => updateCondition(idx, 'field', e.target.value)}>
                    <option value="total_spent">Total Gastado</option>
                    <option value="order_count">Cant. de Pedidos</option>
                    <option value="last_order_date">Fecha Último Pedido</option>
                    <option value="category_purchased">Categoría Comprada</option>
                    <option value="brand_purchased">Marca Comprada</option>
                    <option value="city">Ciudad</option>
                    <option value="email_opt_in">Email Opt-In</option>
                    <option value="whatsapp_opt_in">WhatsApp Opt-In</option>
                    <option value="abandoned_cart_count">Carritos Abandonados</option>
                  </select>
                  <select className="bg-dark-800 border-white/10 text-xs px-2 py-1.5 rounded w-32" value={cond.operator} onChange={(e) => updateCondition(idx, 'operator', e.target.value)}>
                    <option value="equals">Igual a</option>
                    <option value="not_equals">Distinto de</option>
                    <option value="greater_than">Mayor a</option>
                    <option value="less_than">Menor a</option>
                    <option value="contains">Contiene</option>
                    <option value="in_last_days">Últimos N Días</option>
                    <option value="older_than_days">Más de N Días</option>
                  </select>
                  <input type="text" className="bg-dark-800 border-white/10 text-xs px-2 py-1.5 rounded w-32 placeholder:text-slate-600" placeholder="Valor" value={cond.value} onChange={(e) => updateCondition(idx, 'value', e.target.value)} />
                  <button type="button" onClick={() => removeCondition(idx)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={addCondition} className="flex-1 py-2 border border-dashed border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/30 transition-colors rounded flex items-center justify-center gap-2">
                <Plus className="w-3 h-3"/> Agregar Condición
              </button>
              <button type="button" onClick={calculateEstimate} className="flex-1 py-2 bg-dark-900 border border-white/10 text-xs text-primary-400 hover:text-primary-300 hover:border-primary-500/30 transition-colors rounded flex items-center justify-center gap-2">
                <Users className="w-3 h-3"/> Calcular Estimados
              </button>
            </div>
            {form.last_calculated_count !== undefined && (
              <p className="text-xs font-bold text-primary-400 mt-2">
                Clientes estimados: {form.last_calculated_count}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">Este segmento se procesa dinámicamente según estas reglas estructurales.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-500" />
          Segmentación de Clientes
        </h2>
        <button onClick={handleNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4"/> Nuevo Segmento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {segments.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-500 glass rounded-xl">No hay segmentos creados.</div>
        ) : (
          segments.map(seg => (
            <div key={seg.id} className="glass rounded-xl p-5 border border-white/5 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-lg">{seg.name}</h3>
                <div className="px-2 py-0.5 bg-primary-500/20 text-primary-400 rounded text-xs font-bold">
                  {seg.last_calculated_count || 0} users
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4 h-8 overflow-hidden">{seg.description || 'Sin descripción'}</p>
              
              <div className="flex justify-between items-center pt-3 border-t border-white/10">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">{seg.type}</span>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(seg)} className="p-1.5 text-slate-400 hover:text-white bg-white/5 rounded transition-colors"><Edit className="w-3.5 h-3.5"/></button>
                  <button onClick={() => handleDelete(seg.id)} className="p-1.5 text-slate-400 hover:text-red-500 bg-white/5 rounded transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
