import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, Save, X, Tag } from 'lucide-react';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: '', discount_type: 'percentage', discount_value: '', min_order_amount: '', max_uses: '', expires_at: '', is_active: true });

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    setCoupons(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm({ code: '', discount_type: 'percentage', discount_value: '', min_order_amount: '', max_uses: '', expires_at: '', is_active: true }); setShowForm(true); }
  function openEdit(c: any) { setEditing(c); setForm({ code: c.code, discount_type: c.discount_type, discount_value: c.discount_value?.toString(), min_order_amount: c.min_order_amount?.toString() || '', max_uses: c.max_uses?.toString() || '', expires_at: c.expires_at?.slice(0, 10) || '', is_active: c.is_active }); setShowForm(true); }

  async function handleSave() {
    const payload = {
      code: form.code.toUpperCase(),
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value) || 0,
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    if (editing) await supabase.from('coupons').update(payload).eq('id', editing.id);
    else await supabase.from('coupons').insert(payload);
    setShowForm(false); fetch();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this coupon?')) return;
    await supabase.from('coupons').delete().eq('id', id);
    fetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Coupons</h2>
        <button onClick={openCreate} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Create Coupon</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-gray-400 col-span-3 text-center py-12">Loading...</p> :
        coupons.length === 0 ? <p className="text-gray-400 col-span-3 text-center py-12">No coupons yet</p> :
        coupons.map(c => (
          <div key={c.id} className={`bg-white rounded-xl border p-5 ${c.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-5 h-5 text-primary-500" />
              <span className="font-mono font-extrabold text-lg text-dark-900">{c.code}</span>
              {!c.is_active && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">INACTIVE</span>}
            </div>
            <p className="text-2xl font-black text-primary-600">
              {c.discount_type === 'percentage' ? `${c.discount_value}%` : `$${c.discount_value}`}
              <span className="text-xs font-medium text-gray-400 ml-1">off</span>
            </p>
            <div className="mt-3 text-xs text-gray-500 space-y-1">
              {c.min_order_amount && <p>Min. order: ${c.min_order_amount}</p>}
              {c.max_uses && <p>Uses: {c.used_count || 0}/{c.max_uses}</p>}
              {c.expires_at && <p>Expires: {new Date(c.expires_at).toLocaleDateString()}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => openEdit(c)} className="btn-secondary py-1.5 px-3 text-xs gap-1"><Pencil className="w-3 h-3" /> Edit</button>
              <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">{editing ? 'Edit Coupon' : 'New Coupon'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="form-label">Code *</label><input className="form-input uppercase" value={form.code} onChange={e => setForm({...form, code: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Type</label>
                  <select className="form-input" value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})}>
                    <option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div><label className="form-label">Value *</label><input type="number" className="form-input" value={form.discount_value} onChange={e => setForm({...form, discount_value: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Min Order$</label><input type="number" className="form-input" value={form.min_order_amount} onChange={e => setForm({...form, min_order_amount: e.target.value})} /></div>
                <div><label className="form-label">Max Uses</label><input type="number" className="form-input" value={form.max_uses} onChange={e => setForm({...form, max_uses: e.target.value})} /></div>
              </div>
              <div><label className="form-label">Expires At</label><input type="date" className="form-input" value={form.expires_at} onChange={e => setForm({...form, expires_at: e.target.value})} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-4 h-4 rounded text-primary-600" /><span className="text-sm">Active</span></label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex-1 gap-2"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
