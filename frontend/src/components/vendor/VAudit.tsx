import { FileText, Search } from 'lucide-react';
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
    <div className="space-y-5 max-w-6xl">
      <h2 className="text-2xl font-black text-gray-900">Auditoría de Cambios</h2>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar acción, entidad o usuario..."
          className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500" />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">Fecha</th><th className="p-3">Usuario</th><th className="p-3">Acción</th><th className="p-3">Entidad</th><th className="p-3">Valor Anterior</th><th className="p-3">Valor Nuevo</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="p-3 pl-4 text-xs text-gray-500">{a.date}</td>
                <td className="p-3 text-xs text-gray-600">{a.user}</td>
                <td className="p-3 font-bold text-gray-900">{a.action}</td>
                <td className="p-3 font-mono text-xs text-gray-600">{a.entity}</td>
                <td className="p-3 text-xs text-red-500 bg-red-50/50">{a.oldVal}</td>
                <td className="p-3 text-xs text-green-600 bg-green-50/50">{a.newVal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
