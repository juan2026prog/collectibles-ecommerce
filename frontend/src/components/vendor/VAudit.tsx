import { FileText, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

const mockAudit = [
  { id: 1, date: '27/03 10:15', user: 'admin@tienda.com', action: 'Cambió precio', entity: 'Remera Oversize Urban', field: 'price', oldVal: '$2490', newVal: '$1990' },
  { id: 2, date: '27/03 09:40', user: 'admin@tienda.com', action: 'Ajustó stock', entity: 'Campera Puffer Light', field: 'stock', oldVal: '0', newVal: '5' },
  { id: 3, date: '27/03 09:00', user: 'logistica@tienda.com', action: 'Generó etiqueta', entity: 'ORD-4819', field: 'label', oldVal: '-', newVal: 'SD-78453' },
  { id: 4, date: '26/03 16:30', user: 'admin@tienda.com', action: 'Modificó zona envío', entity: 'Zona 5', field: 'price', oldVal: '$150', newVal: '$169' },
  { id: 5, date: '26/03 15:00', user: 'admin@tienda.com', action: 'Editó producto', entity: 'Jean Slim Fit Premium', field: 'description', oldVal: '(truncado)', newVal: '(truncado)' },
  { id: 6, date: '26/03 14:00', user: 'admin@tienda.com', action: 'Canceló pedido', entity: 'ORD-4808', field: 'status', oldVal: 'new', newVal: 'cancelled' },
  { id: 7, date: '26/03 11:00', user: 'logistica@tienda.com', action: 'Despachó pedido', entity: 'ORD-4815', field: 'status', oldVal: 'packed', newVal: 'dispatched' },
  { id: 8, date: '25/03 18:00', user: 'admin@tienda.com', action: 'Alteró liquidación', entity: 'LIQ-041', field: 'adjustment', oldVal: '$0', newVal: '-$500' },
];

export default function VAudit() {
  const [search, setSearch] = useState('');
  const filtered = search ? mockAudit.filter(a => a.action.toLowerCase().includes(search.toLowerCase()) || a.entity.toLowerCase().includes(search.toLowerCase()) || a.user.toLowerCase().includes(search.toLowerCase())) : mockAudit;

  return (
    <div className="max-w-7xl space-y-10 animation-fade-in pb-20 px-4 sm:px-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="space-y-4">
           <div className="text-[12px] text-primary-600 font-black uppercase tracking-[0.5em] flex items-center gap-3">
             <ShieldCheck className="w-5 h-5" /> Security & Accountability
           </div>
           <h2 className="text-5xl font-black text-gray-900 tracking-tighter">Registro de Auditoría</h2>
           <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.2em] max-w-2xl">Trazabilidad completa de modificaciones en catálogo, pedidos y finanzas</p>
        </div>
        <div className="relative w-full lg:w-[400px] group">
           <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary-600 transition-colors" />
           <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="SEARCH AUDIT LOGS..."
              className="w-full bg-gray-50 border border-gray-200 pl-16 pr-6 py-6 rounded-2xl text-[12px] font-black uppercase tracking-widest outline-none focus:border-primary-600 focus:bg-white/[0.08] transition-all placeholder:text-slate-800 shadow-sm" 
           />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-[11px] font-black text-gray-500 uppercase tracking-[0.4em]">
                <th className="p-10">Timestamp</th>
                <th className="p-10">Origin User</th>
                <th className="p-10">Operation</th>
                <th className="p-10">Entity Target</th>
                <th className="p-10">Previous State</th>
                <th className="p-10">Modified State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-10">
                    <span className="text-[11px] text-gray-400 font-black uppercase tracking-widest">{a.date}</span>
                  </td>
                  <td className="p-10">
                    <span className="text-[12px] font-black text-gray-500 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl">{a.user}</span>
                  </td>
                  <td className="p-10">
                    <p className="font-black text-gray-900 text-[15px] uppercase tracking-widest group-hover:text-primary-600 transition-colors">{a.action}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">{a.field}</p>
                  </td>
                  <td className="p-10">
                     <span className="font-mono text-[11px] text-gray-900/70 uppercase bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-100">{a.entity}</span>
                  </td>
                  <td className="p-10">
                     <span className="text-[10px] font-black text-red-500/60 line-through bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20 uppercase tracking-widest">{a.oldVal}</span>
                  </td>
                  <td className="p-10">
                     <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20 uppercase tracking-widest shadow-sm">{a.newVal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 mt-16 pb-10">
         <div className="w-1.5 h-20 bg-gradient-to-b from-[#f00856] to-transparent rounded-full opacity-20"></div>
         <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.5em] bg-gray-50 px-10 py-4 rounded-full border border-gray-100">End of Secure Protocol Logs</p>
      </div>
    </div>
  );
}
