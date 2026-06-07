import { useState } from 'react';
import { Zap, Plus, GripVertical, ChevronRight, Trash2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

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
    <div className="max-w-7xl space-y-10 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 px-4">
        <div>
           <div className="text-[12px] text-primary-600 font-black uppercase tracking-[0.5em] mb-4">Automated Governance</div>
           <h2 className="text-5xl font-black text-gray-900 tracking-tighter">Motor de Reglas</h2>
           <p className="text-sm text-gray-500 font-bold mt-4 uppercase tracking-[0.2em]">Orquestación de flujos logísticos y validación de inventario</p>
        </div>
        <button className="bg-white text-black text-[12px] font-black uppercase tracking-[0.3em] px-10 py-5 rounded-full hover:bg-primary-600 hover:text-gray-900 transition-all shadow-sm border border-gray-200 active:scale-95">
           + Build New Logic
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4">
        {rules.map((r, idx) => (
          <div key={r.id} className={`bg-white rounded-[2.5rem] border transition-all group overflow-hidden shadow-sm ${r.active ? 'border-gray-200' : 'border-gray-100 opacity-40 grayscale-[0.5]'}`}>
            <div className="p-10 border-b border-gray-100 bg-gray-50 flex items-center gap-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                 <Zap className="w-32 h-32 text-gray-900 -rotate-12" />
              </div>
              <GripVertical className="w-6 h-6 text-gray-500 cursor-grab group-hover:text-primary-600 transition-colors shrink-0" />
              <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 font-black text-lg shrink-0 group-hover:border-primary-600/40 shadow-inner group-hover:bg-primary-50 transition-all">
                 {idx + 1}
              </div>
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest flex-1 group-hover:text-primary-600 transition-colors">{r.name}</h3>
              <div className="flex items-center gap-10 relative z-10">
                <button onClick={() => toggle(r.id)} className="transition-all active:scale-90 scale-110">
                   {r.active ? <ToggleRight className="w-12 h-12 text-primary-600 drop-shadow-sm" /> : <ToggleLeft className="w-12 h-12 text-slate-800" />}
                </button>
                <button className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 text-gray-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all flex items-center justify-center shadow-lg">
                   <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-1 lg:p-2 bg-black/20 flex flex-col lg:flex-row gap-1">
              <div className="flex-1 bg-gray-50 border border-gray-100 p-10 rounded-[2rem] group-hover:bg-blue-500/5 transition-all shadow-inner m-2">
                <p className="text-[12px] font-black text-blue-500 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                   <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div> SI (IF)
                </p>
                <div className="space-y-6">
                   {r.conditions.map((c, i) => (
                     <div key={i} className="flex items-center gap-6 group/cond">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest min-w-[120px] group-hover/cond:text-blue-400 transition-colors">{c.field}</span>
                        <span className="text-[11px] font-black text-blue-400/50 bg-blue-400/10 w-8 h-8 rounded-lg flex items-center justify-center font-mono">{c.op}</span>
                        <span className="text-[12px] font-black text-gray-900 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl border border-gray-200 shadow-lg group-hover/cond:bg-blue-500/10 transition-all">{c.value}</span>
                     </div>
                   ))}
                </div>
              </div>

              <div className="flex items-center justify-center p-6 lg:p-0">
                 <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 group-hover:text-gray-900 group-hover:bg-primary-600 group-hover:border-primary-600 transition-all shadow-sm scale-90 group-hover:scale-100">
                    <ChevronRight className="w-8 h-8" />
                 </div>
              </div>

              <div className="flex-1 bg-gray-50 border border-gray-100 p-10 rounded-[2rem] group-hover:bg-primary-50 transition-all shadow-inner m-2">
                <p className="text-[12px] font-black text-primary-600 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
                   <div className="w-3 h-3 rounded-full bg-primary-600 shadow-sm"></div> ENTONCES (THEN)
                </p>
                <div className="space-y-6">
                   {r.actions.map((a, i) => (
                     <div key={i} className="flex items-center gap-6 group/act">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest min-w-[120px] group-hover/act:text-primary-600 transition-colors">{a.type.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] font-black text-primary-600/50 bg-primary-100 w-8 h-8 rounded-lg flex items-center justify-center font-mono">=</span>
                        <span className="text-[12px] font-black text-gray-900 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl border border-gray-200 shadow-lg group-hover/act:bg-primary-100 transition-all">{a.value}</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4">
        <div className="bg-white rounded-[3rem] border border-gray-200 p-12 flex flex-col md:flex-row justify-between items-center gap-10 shadow-sm relative overflow-hidden">
           <div className="absolute top-0 left-0 p-12 opacity-5 pointer-events-none">
              <RefreshCw className="w-32 h-32 text-primary-600 animate-spin-slow" />
           </div>
           <div className="flex items-center gap-8 relative z-10">
              <div className="w-16 h-16 rounded-[1.5rem] bg-primary-100 flex items-center justify-center shadow-sm border border-primary-600/20">
                 <Zap className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                 <p className="text-3xl font-black text-gray-900 uppercase tracking-widest tracking-tighter">Priority Execution Hub</p>
                 <p className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2">Las reglas se ejecutan de forma secuencial de arriba hacia abajo.</p>
              </div>
           </div>
           <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest max-w-[320px] text-center md:text-right relative z-10 leading-relaxed border-l border-gray-200 pl-10 hidden md:block">
              Drag and drop rules to adjust priority. Conflicting rules will resolve based on position in the stack.
           </p>
        </div>
      </div>
    </div>
  );
}
