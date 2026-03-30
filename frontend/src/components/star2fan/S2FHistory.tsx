import { useState } from 'react';
import { Search, Filter, ChevronRight } from 'lucide-react';

interface Props {
  requests: any[];
  onSelectRequest: (r: any) => void;
  onChangeTab: (tab: string) => void;
}

export default function S2FHistory({ requests, onSelectRequest, onChangeTab }: Props) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOccasion, setFilterOccasion] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'price'>('date');

  const statuses = ['all', 'new', 'pending_acceptance', 'accepted', 'recording', 'internal_review', 'delivered', 'completed', 'rejected', 'cancelled'];
  const occasions = ['all', ...new Set(requests.map(r => r.occasion).filter(Boolean))];

  const statusLabels: Record<string, string> = {
    all: 'Todos', new: 'Nuevo', pending_acceptance: 'Pend. Aceptación', accepted: 'Aceptado',
    recording: 'En Grabación', internal_review: 'Revisión', delivered: 'Entregado',
    completed: 'Completado', rejected: 'Rechazado', cancelled: 'Cancelado',
  };

  const statusColors: Record<string, string> = {
    new: 'bg-blue-50 text-blue-700', pending_acceptance: 'bg-orange-50 text-orange-700',
    accepted: 'bg-sky-50 text-sky-700', recording: 'bg-purple-50 text-purple-700',
    internal_review: 'bg-indigo-50 text-indigo-700', delivered: 'bg-green-50 text-green-700',
    completed: 'bg-emerald-50 text-emerald-700', rejected: 'bg-red-50 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  let filtered = requests;
  if (filterStatus !== 'all') filtered = filtered.filter(r => r.status === filterStatus);
  if (filterOccasion !== 'all') filtered = filtered.filter(r => r.occasion === filterOccasion);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      r.fan_buyer_name?.toLowerCase().includes(q) ||
      r.recipient_name?.toLowerCase().includes(q) ||
      r.occasion?.toLowerCase().includes(q) ||
      r.id?.toLowerCase().includes(q)
    );
  }
  if (sortBy === 'date') filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else filtered.sort((a, b) => Number(b.price) - Number(a.price));

  return (
    <div className="space-y-6 max-w-6xl">
      <h2 className="text-3xl font-black text-gray-900 tracking-tight">Historial de Pedidos</h2>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, ID, ocasión..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-rose-500" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:border-rose-500">
          {statuses.map(s => <option key={s} value={s}>{statusLabels[s] || s}</option>)}
        </select>
        <select value={filterOccasion} onChange={e => setFilterOccasion(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:border-rose-500 capitalize">
          {occasions.map(o => <option key={o} value={o}>{o === 'all' ? 'Todas las Ocasiones' : o}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:border-rose-500">
          <option value="date">Más recientes</option>
          <option value="price">Mayor precio</option>
        </select>
      </div>

      {/* Results */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-bold text-gray-500">{filtered.length} resultados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-3 pl-5">Fecha</th>
                <th className="p-3">Destinatario</th>
                <th className="p-3">Ocasión</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Precio</th>
                <th className="p-3">Entrega</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer group" onClick={() => { onSelectRequest(r); onChangeTab('requests'); }}>
                  <td className="p-3 pl-5 text-gray-600 font-medium">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <p className="font-bold text-gray-900">{r.recipient_name}</p>
                    <p className="text-[11px] text-gray-500">Fan: {r.fan_buyer_name}</p>
                  </td>
                  <td className="p-3 capitalize">{r.occasion}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusColors[r.status] || 'bg-gray-100 text-gray-500'}`}>
                      {statusLabels[r.status] || r.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-black">${r.price}</td>
                  <td className="p-3 text-xs text-gray-500">{r.delivered_at ? new Date(r.delivered_at).toLocaleDateString() : '—'}</td>
                  <td className="p-3 pr-5">
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-rose-500 transition-colors ml-auto" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400 text-sm">No se encontraron pedidos con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
