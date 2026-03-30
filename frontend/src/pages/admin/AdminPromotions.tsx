import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Percent, Plus, Trash2, Save, X, Calendar, DollarSign, Tag } from 'lucide-react';

interface Promo {
  id?: string;
  name: string;
  type: 'percentage' | 'fixed' | '2x1' | 'buy_x_get_y' | 'bank_discount';
  value: number;
  min_purchase: number;
  max_discount: number;
  bank_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  applies_to: 'all' | 'category' | 'brand' | 'group';
  target_id: string;
}

export default function AdminPromotions() {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    const { data } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
    setPromos(data || []);
    setLoading(false);
  }

  function startNew() {
    setEditing({
      name: '', type: 'percentage', value: 10, min_purchase: 0, max_discount: 0,
      bank_name: '', start_date: '', end_date: '', is_active: true,
      applies_to: 'all', target_id: '',
    });
  }

  async function savePromo() {
    if (!editing || !editing.name) return;
    const payload = { ...editing };
    if (editing.id) {
      await supabase.from('promotions').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('promotions').insert(payload);
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    setEditing(null); fetchPromos();
  }

  async function deletePromo(id: string) {
    if (!confirm('¿Eliminar esta promoción?')) return;
    await supabase.from('promotions').delete().eq('id', id);
    fetchPromos();
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('promotions').update({ is_active: !current }).eq('id', id);
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  }

  const typeLabels: Record<string, string> = {
    percentage: 'Descuento %', fixed: 'Monto Fijo', '2x1': '2x1', buy_x_get_y: 'Lleva X, Paga Y', bank_discount: 'Promo Bancaria',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Percent className="w-6 h-6 text-primary-600" /> Promociones</h2>
          <p className="text-sm text-gray-500 mt-1">Descuentos porcentuales, 2x1, promos bancarias y por cantidad</p>
        </div>
        <div className="flex gap-2">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva Promoción</button>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className="bg-white rounded-xl border-2 border-primary-200 shadow-lg p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">{editing.id ? 'Editar' : 'Nueva'} Promoción</h3>
            <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre</label>
              <input className="form-input w-full" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Hot Sale 2026" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Tipo</label>
              <select className="form-input w-full" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as any })}>
                <option value="percentage">Descuento Porcentual (%)</option>
                <option value="fixed">Monto Fijo ($)</option>
                <option value="2x1">2x1</option>
                <option value="buy_x_get_y">Lleva X, Paga Y</option>
                <option value="bank_discount">Promoción Bancaria</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Valor {editing.type === 'percentage' ? '(%)' : '($)'}</label>
              <input type="number" className="form-input w-full" value={editing.value} onChange={e => setEditing({ ...editing, value: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Compra Mínima ($)</label>
              <input type="number" className="form-input w-full" value={editing.min_purchase} onChange={e => setEditing({ ...editing, min_purchase: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Tope Descuento ($)</label>
              <input type="number" className="form-input w-full" value={editing.max_discount} onChange={e => setEditing({ ...editing, max_discount: +e.target.value })} />
            </div>
          </div>

          {editing.type === 'bank_discount' && (
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Banco / Emisor</label>
              <input className="form-input w-full" value={editing.bank_name} onChange={e => setEditing({ ...editing, bank_name: e.target.value })} placeholder="Santander, BBVA, Visa, etc." />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Fecha Inicio</label>
              <input type="datetime-local" className="form-input w-full" value={editing.start_date} onChange={e => setEditing({ ...editing, start_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Fecha Fin</label>
              <input type="datetime-local" className="form-input w-full" value={editing.end_date} onChange={e => setEditing({ ...editing, end_date: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-5 h-5 rounded" />
                <span className="text-sm font-bold">Promoción Activa</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={savePromo} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Guardar</button>
          </div>
        </div>
      )}

      {/* Promos List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse">Cargando promociones...</div>
      ) : promos.length === 0 && !editing ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-bold text-gray-500">No hay promociones activas</p>
          <button onClick={startNew} className="mt-4 btn-primary text-sm">Crear primera promoción</button>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => {
            const now = new Date();
            const start = p.start_date ? new Date(p.start_date) : null;
            const end = p.end_date ? new Date(p.end_date) : null;
            const isExpired = end && end < now;
            const isUpcoming = start && start > now;

            return (
              <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow ${isExpired ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${
                    p.type === 'percentage' ? 'bg-green-100 text-green-700' :
                    p.type === 'bank_discount' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {p.type === 'percentage' ? `${p.value}%` : p.type === '2x1' ? '2x1' : `$${p.value}`}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-900">{p.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${p.is_active && !isExpired ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                        {isExpired ? 'Expirada' : isUpcoming ? 'Próxima' : p.is_active ? 'Activa' : 'Pausada'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span className="font-bold text-gray-600">{typeLabels[p.type] || p.type}</span>
                      {p.bank_name && <span>· {p.bank_name}</span>}
                      {start && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {start.toLocaleDateString('es')}</span>}
                      {end && <span>→ {end.toLocaleDateString('es')}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleActive(p.id, p.is_active)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${p.is_active ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                    {p.is_active ? 'Pausar' : 'Activar'}
                  </button>
                  <button onClick={() => setEditing(p)} className="btn-secondary text-xs py-1.5 px-3">Editar</button>
                  <button onClick={() => deletePromo(p.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
