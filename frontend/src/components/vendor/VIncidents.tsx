import { AlertTriangle, Search } from 'lucide-react';
import { useState } from 'react';

const mockIncidents = [
  { id: 'INC-01', type: 'sync_ml', order: 'ORD-4817', operator: '-', severity: 'high', status: 'open', responsible: 'Sistema', date: '27/03', desc: 'Sync ML falló para ZAP-RUN-003' },
  { id: 'INC-02', type: 'delivery_delayed', order: 'ORD-4810', operator: 'Soy Delivery', severity: 'medium', status: 'investigating', responsible: 'Logística', date: '26/03', desc: 'Envío demorado 6h sobre SLA' },
  { id: 'INC-03', type: 'stock_error', order: 'ORD-4805', operator: '-', severity: 'low', status: 'resolved', responsible: 'Catálogo', date: '25/03', desc: 'Stock negativo en variante XL' },
  { id: 'INC-04', type: 'return', order: 'ORD-4798', operator: 'DAC', severity: 'medium', status: 'open', responsible: 'Ventas', date: '24/03', desc: 'Devolución por producto incorrecto' },
];

const sevMap: Record<string, string> = { high: 'bg-red-50 text-red-700', medium: 'bg-yellow-50 text-yellow-700', low: 'bg-blue-50 text-blue-600' };
const stMap: Record<string, string> = { open: 'bg-red-50 text-red-700', investigating: 'bg-orange-50 text-orange-700', resolved: 'bg-green-50 text-green-700' };

export default function VIncidents() {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? mockIncidents : mockIncidents.filter(i => i.status === filter);
  return (
    <div className="space-y-5 max-w-5xl">
      <h2 className="text-2xl font-black text-gray-900">Incidencias</h2>
      <div className="flex gap-2">
        {['all', 'open', 'investigating', 'resolved'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-lg text-xs font-bold ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500'}`}>
            {f === 'all' ? 'Todas' : f === 'open' ? 'Abiertas' : f === 'investigating' ? 'Investigando' : 'Resueltas'}
          </button>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">ID</th><th className="p-3">Tipo</th><th className="p-3">Pedido</th><th className="p-3">Operador</th><th className="p-3">Severidad</th><th className="p-3">Estado</th><th className="p-3">Responsable</th><th className="p-3">Fecha</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(i => (
              <tr key={i.id} className="hover:bg-gray-50 cursor-pointer">
                <td className="p-3 pl-4 font-bold">{i.id}</td>
                <td className="p-3 text-xs">{i.type.replace(/_/g, ' ')}</td>
                <td className="p-3 font-mono text-xs">{i.order}</td>
                <td className="p-3 text-xs">{i.operator}</td>
                <td className="p-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${sevMap[i.severity]}`}>{i.severity}</span></td>
                <td className="p-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${stMap[i.status]}`}>{i.status}</span></td>
                <td className="p-3 text-xs text-gray-600">{i.responsible}</td>
                <td className="p-3 text-xs text-gray-500">{i.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
