import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Eye } from 'lucide-react';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  }

  const filtered = customers.filter(c =>
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Customers ({customers.length})</h2>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary-500 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fidelización</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Roles</th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Joined</th>
              <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-sm font-bold">
                      {(c.first_name || c.email || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold">{c.first_name ? `${c.first_name} ${c.last_name || ''}` : 'No name'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{c.email}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-gray-700">Puntos: <span className="text-primary-600">{c.total_loyalty_points || 0}</span></span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {c.is_admin && <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full">ADMIN</span>}
                    {c.is_vendor && <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">VENDOR</span>}
                    {c.is_affiliate && <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">AFFILIATE</span>}
                    {c.is_artist && <span className="px-2 py-0.5 text-[10px] font-bold bg-pink-100 text-pink-700 rounded-full">ARTIST</span>}
                    {!c.is_admin && !c.is_vendor && !c.is_affiliate && !c.is_artist && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-bold">CUSTOMER</span>}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
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
