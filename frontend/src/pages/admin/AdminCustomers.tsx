import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Eye } from 'lucide-react';
import ResponsiveDataList from '../../components/admin/ResponsiveDataList';
import FilterDrawer from '../../components/admin/FilterDrawer';

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
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
           <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">CRM de Clientes</h2>
           <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">
             {customers.length} {customers.length === 1 ? 'cliente' : 'clientes'}
           </span>
        </div>

        <FilterDrawer
          activeCount={(search ? 1 : 0) + (activeSegment !== 'all' ? 1 : 0)}
          onClear={() => { setSearch(''); setActiveSegment('all'); }}
        >
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <select value={activeSegment} onChange={e => setActiveSegment(e.target.value)} className="w-full md:w-48 pl-3 pr-4 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm bg-gray-50 outline-none min-h-[44px] md:min-h-[36px]">
               <option value="all">Todas las etiquetas</option>
               {Array.from(new Set(customers.flatMap(c => c.crm_tags || []))).map(tag => (
                  <option key={tag as string} value={tag as string}>{tag}</option>
               ))}
            </select>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-base sm:text-xs focus:border-blue-500 outline-none w-full min-h-[44px] md:min-h-[36px]" />
            </div>
          </div>
        </FilterDrawer>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        <ResponsiveDataList
          items={filtered}
          keyExtractor={(c) => c.id}
          loading={loading}
          emptyTitle="0 CLIENTES ENCONTRADOS"
          emptyDescription="No se encontraron clientes con los criterios ingresados."
          renderCard={(c) => (
            <div key={c.id} className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">
                    {(c.first_name || c.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate">
                      {c.first_name ? `${c.first_name} ${c.last_name || ''}` : 'Sin nombre'}
                    </h4>
                    <p className="text-xs text-gray-500 font-medium truncate">{c.email}</p>
                  </div>
                </div>
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-gray-100 py-2">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Valor LTV</span>
                  <span className="font-black text-emerald-600 text-sm">${c.ltv || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Actividad</span>
                  <span className="font-bold text-gray-700">{c.order_count || 0} pedidos · {c.total_loyalty_points || 0} pts</span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-semibold mb-1">Etiquetas CRM</span>
                <div className="flex flex-wrap gap-1 items-center">
                  {(c.crm_tags || []).map((t: string) => (
                     <span key={t} className="px-2 py-0.5 text-[10px] font-black uppercase tracking-tight bg-gray-100 text-gray-600 border border-gray-200 rounded flex items-center gap-1">
                        {t}
                        <button onClick={() => handleRemoveLabel(c.id, c.crm_tags, t)} className="hover:text-red-500 p-0.5">×</button>
                     </span>
                  ))}
                  {inlineEditTag === c.id ? (
                     <input autoFocus type="text" className="w-24 px-2 py-1 text-base sm:text-[10px] uppercase font-black border rounded focus:border-blue-500 outline-none" value={newTagInput} onChange={e => setNewTagInput(e.target.value)} onBlur={() => handleAddLabel(c.id, c.crm_tags)} onKeyDown={e => e.key === 'Enter' && handleAddLabel(c.id, c.crm_tags)} />
                  ) : (
                     <button onClick={() => { setInlineEditTag(c.id); setNewTagInput(''); }} className="px-2 py-1 text-xs font-bold bg-white border border-dashed border-gray-300 text-gray-400 hover:text-blue-500 rounded min-h-[36px]">+ Etiqueta</button>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-gray-400 font-medium pt-1">
                Registrado: {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
          )}
          renderTableHeader={() => (
            <tr>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Vida / Fidelización</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Etiquetas CRM</th>
              <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Registro</th>
              <th className="px-6 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
            </tr>
          )}
          renderTableRow={(c) => (
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
          )}
        />
      </div>
    </div>
  );
}
