import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Eye } from 'lucide-react';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSegment, setActiveSegment] = useState<string | 'all'>('all');
  const [inlineEditTag, setInlineEditTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');

  useEffect(() => { fetch(); fetchSegments(); }, []);

  async function fetchSegments() {
    const { data } = await supabase.from('customer_segments').select('*').order('name');
    setSegments(data || []);
  }

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('id, email, first_name, last_name, is_admin, is_vendor, is_affiliate, is_artist, total_loyalty_points, created_at, crm_tags, ltv, order_count').order('created_at', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  }

  async function handleAddLabel(id: string, currentTags: string[]) {
    if (!newTagInput.trim()) { setInlineEditTag(null); return; }
    const tag = newTagInput.trim();
    if (currentTags?.includes(tag)) { setInlineEditTag(null); setNewTagInput(''); return; }
    
    const updatedTags = [...(currentTags || []), tag];
    await supabase.from('profiles').update({ crm_tags: updatedTags }).eq('id', id);
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, crm_tags: updatedTags } : c));
    setInlineEditTag(null);
    setNewTagInput('');
  }

  async function handleRemoveLabel(id: string, currentTags: string[], tagToRemove: string) {
    const updatedTags = currentTags.filter(t => t !== tagToRemove);
    await supabase.from('profiles').update({ crm_tags: updatedTags }).eq('id', id);
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, crm_tags: updatedTags } : c));
  }

  const filtered = customers.filter(c => {
    const matchesSearch = c.email?.toLowerCase().includes(search.toLowerCase()) || c.first_name?.toLowerCase().includes(search.toLowerCase()) || c.last_name?.toLowerCase().includes(search.toLowerCase());
    const matchesSegment = activeSegment === 'all' || (c.crm_tags && c.crm_tags.includes(activeSegment));
    return matchesSearch && matchesSegment;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
           <h2 className="text-2xl font-black text-gray-900">CRM de Clientes</h2>
           <p className="text-sm text-gray-500">Base de datos, segmentación y ciclo de vida.</p>
        </div>
        <div className="flex gap-4 items-center">
          <select value={activeSegment} onChange={e => setActiveSegment(e.target.value)} className="w-48 pl-3 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 outline-none">
             <option value="all">Todas las etiquetas</option>
             {Array.from(new Set(customers.flatMap(c => c.crm_tags || []))).map(tag => (
                <option key={tag as string} value={tag as string}>{tag}</option>
             ))}
          </select>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none w-64" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Vida / Fidelización</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Etiquetas CRM</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Registro</th>
              <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-bold">
                      {(c.first_name || c.email || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-gray-900">{c.first_name ? `${c.first_name} ${c.last_name || ''}` : 'Sin nombre'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 font-medium">{c.email}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-gray-900">LTV: <span className="text-green-600">${c.ltv || 0}</span></span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase">{c.order_count || 0} pedidos · {c.total_loyalty_points || 0} pts</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1 items-center">
                    {(c.crm_tags || []).map((t: string) => (
                       <span key={t} className="px-2 py-0.5 text-[10px] font-black uppercase tracking-tight bg-gray-100 text-gray-600 border border-gray-200 rounded flex items-center gap-1">
                          {t}
                          <button onClick={() => handleRemoveLabel(c.id, c.crm_tags, t)} className="hover:text-red-500">×</button>
                       </span>
                    ))}
                    {inlineEditTag === c.id ? (
                       <input autoFocus type="text" className="w-20 px-1 py-0.5 text-[10px] uppercase font-black border rounded focus:border-blue-500 outline-none" value={newTagInput} onChange={e => setNewTagInput(e.target.value)} onBlur={() => handleAddLabel(c.id, c.crm_tags)} onKeyDown={e => e.key === 'Enter' && handleAddLabel(c.id, c.crm_tags)} />
                    ) : (
                       <button onClick={() => { setInlineEditTag(c.id); setNewTagInput(''); }} className="px-2 py-0.5 text-[10px] font-black uppercase tracking-tight bg-white border border-dashed border-gray-300 text-gray-400 hover:text-blue-500 rounded">+</button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-bold text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
