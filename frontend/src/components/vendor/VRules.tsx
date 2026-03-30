import { useState } from 'react';
import { Zap, Plus, GripVertical, ChevronRight, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const mockRules = [
  { id: 1, name: 'Envío cercana MVD', active: true, conditions: [{ field: 'zona', op: '=', value: '5, 6, 7' }, { field: 'hora_pedido', op: '<', value: '13:00' }], actions: [{ type: 'shipping_method', value: 'Envío en el día' }, { type: 'shipping_cost', value: '$169' }, { type: 'operator', value: 'Soy Delivery' }, { type: 'sla', value: 'Entrega hoy' }] },
  { id: 2, name: 'Envío media distancia', active: true, conditions: [{ field: 'zona', op: '=', value: '1, 2, 3, 4, 10' }], actions: [{ type: 'shipping_cost', value: '$200' }, { type: 'operator', value: 'Soy Delivery' }] },
  { id: 3, name: 'Envío lejana', active: true, conditions: [{ field: 'zona', op: '=', value: '8, 9, 11' }], actions: [{ type: 'shipping_cost', value: '$290' }, { type: 'operator', value: 'Soy Delivery' }] },
  { id: 4, name: 'Interior → DAC', active: true, conditions: [{ field: 'destino', op: '=', value: 'interior' }], actions: [{ type: 'operator', value: 'DAC' }, { type: 'sla', value: '3-5 días' }] },
  { id: 5, name: 'Fuera de corte → mañana', active: true, conditions: [{ field: 'hora_pedido', op: '>=', value: '13:00' }], actions: [{ type: 'delivery_window', value: 'Siguiente día hábil' }] },
  { id: 6, name: 'Envío gratis > $5000', active: false, conditions: [{ field: 'monto_pedido', op: '>', value: '$5000' }], actions: [{ type: 'shipping_cost', value: '$0 (Gratis)' }] },
  { id: 7, name: 'Fallback depósito B', active: true, conditions: [{ field: 'stock_deposito_a', op: '=', value: '0' }], actions: [{ type: 'warehouse', value: 'Depósito Secundario' }] },
  { id: 8, name: 'Frágil → bloquear operador', active: true, conditions: [{ field: 'tag_producto', op: '=', value: 'fragil' }], actions: [{ type: 'block_operator', value: 'Operador X' }] },
];

export default function VRules() {
  const [rules, setRules] = useState(mockRules);
  const toggle = (id: number) => setRules(rules.map(r => r.id === id ? { ...r, active: !r.active } : r));

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex justify-between items-center">
        <div><h2 className="text-2xl font-black text-gray-900">Motor de Reglas</h2><p className="text-sm text-gray-500">Automatizaciones enterprise para envíos, stock y pedidos</p></div>
        <button className="bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-gray-800 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Nueva Regla</button>
      </div>
      <div className="space-y-3">
        {rules.map((r, idx) => (
          <div key={r.id} className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${r.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <div className="p-4 flex items-center gap-3">
              <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />
              <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded">#{idx + 1}</span>
              <h3 className="font-bold text-gray-900 flex-1">{r.name}</h3>
              <button onClick={() => toggle(r.id)}>{r.active ? <ToggleRight className="w-7 h-7 text-green-500" /> : <ToggleLeft className="w-7 h-7 text-gray-400" />}</button>
              <button className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="px-4 pb-4 flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-blue-50 rounded-lg p-3">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">SI</p>
                {r.conditions.map((c, i) => (
                  <p key={i} className="text-xs text-blue-800"><span className="font-bold">{c.field}</span> {c.op} <span className="font-mono bg-blue-100 px-1 rounded">{c.value}</span></p>
                ))}
              </div>
              <div className="flex items-center justify-center"><ChevronRight className="w-5 h-5 text-gray-300" /></div>
              <div className="flex-1 bg-green-50 rounded-lg p-3">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">ENTONCES</p>
                {r.actions.map((a, i) => (
                  <p key={i} className="text-xs text-green-800"><span className="font-bold">{a.type.replace(/_/g, ' ')}</span> = <span className="font-mono bg-green-100 px-1 rounded">{a.value}</span></p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
