import { useState } from 'react';
import { ShoppingCart, Search, ChevronRight, Package, Truck, CheckCircle, XCircle, AlertTriangle, Clock, Printer, MapPin } from 'lucide-react';

const mockOrders = [
  { id: 'ORD-4821', client: 'María López', email: 'maria@mail.com', items: [{ name: 'Remera Oversize', qty: 2 }], total: 4500, payStatus: 'paid', prepStatus: 'new', shipStatus: 'pending', address: 'Av. Brasil 2845, Pocitos', zone: 'Zona 6', operator: 'Soy Delivery', tracking: null, warehouse: 'Principal', promise: 'Hoy 18:00', date: '2026-03-27 10:15', priority: 'same_day' },
  { id: 'ORD-4819', client: 'Carlos Ruiz', email: 'carlos@mail.com', items: [{ name: 'Jean Slim Fit', qty: 1 }], total: 4890, payStatus: 'paid', prepStatus: 'preparing', shipStatus: 'pending', address: 'Rambla Rep. de México 5200, Carrasco', zone: 'Zona 5', operator: 'Soy Delivery', tracking: null, warehouse: 'Principal', promise: 'Hoy 18:00', date: '2026-03-27 09:40', priority: 'same_day' },
  { id: 'ORD-4817', client: 'Ana García', email: 'ana@mail.com', items: [{ name: 'Campera Puffer', qty: 1 }, { name: 'Gorra Snapback', qty: 2 }], total: 11270, payStatus: 'paid', prepStatus: 'packed', shipStatus: 'pending', address: '18 de Julio 1234, Centro', zone: 'Zona 6', operator: 'DAC', tracking: null, warehouse: 'Principal', promise: 'Mañana', date: '2026-03-27 08:20', priority: 'standard' },
  { id: 'ORD-4815', client: 'Pedro Martínez', email: 'pedro@mail.com', items: [{ name: 'Zapatillas Runner X', qty: 1 }], total: 6490, payStatus: 'paid', prepStatus: 'dispatched', shipStatus: 'in_transit', address: 'Canelones 1450, Cordón', zone: 'Zona 6', operator: 'Soy Delivery', tracking: 'SD-78452', warehouse: 'Principal', promise: 'Hoy 14:00', date: '2026-03-26 16:30', priority: 'same_day' },
  { id: 'ORD-4810', client: 'Laura Sánchez', email: 'laura@mail.com', items: [{ name: 'Bermuda Cargo', qty: 1 }], total: 3490, payStatus: 'paid', prepStatus: 'delivered', shipStatus: 'delivered', address: 'Bvar. Artigas 1100, Tres Cruces', zone: 'Zona 6', operator: 'Soy Delivery', tracking: 'SD-78410', warehouse: 'Principal', promise: 'Entregado', date: '2026-03-25 11:00', priority: 'standard' },
  { id: 'ORD-4808', client: 'Sofía Rodríguez', email: 'sofia@mail.com', items: [{ name: 'Remera Oversize', qty: 1 }], total: 1990, payStatus: 'refunded', prepStatus: 'cancelled', shipStatus: 'cancelled', address: 'Libertad 2300, Punta Carretas', zone: 'Zona 6', operator: '-', tracking: null, warehouse: '-', promise: 'Cancelado', date: '2026-03-24 14:50', priority: 'standard' },
];

const prepLabels: Record<string, { label: string; cls: string }> = {
  new: { label: 'Nuevo', cls: 'border-blue-500/20 text-blue-500 bg-blue-500/5' },
  preparing: { label: 'Preparando', cls: 'border-purple-500/20 text-purple-500 bg-purple-500/5' },
  packed: { label: 'Empaquetado', cls: 'border-indigo-500/20 text-indigo-500 bg-indigo-500/5' },
  dispatched: { label: 'Despachado', cls: 'border-sky-500/20 text-sky-500 bg-sky-500/5' },
  delivered: { label: 'Entregado', cls: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  cancelled: { label: 'Cancelado', cls: 'border-white/10 text-slate-500 bg-white/5' },
  incident: { label: 'Incidencia', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
};

export default function VOrders() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<typeof mockOrders[0] | null>(null);
  const filters = ['all', 'new', 'preparing', 'packed', 'dispatched', 'delivered', 'cancelled', 'incident'];

  const filtered = mockOrders.filter(o => {
    if (filter !== 'all' && o.prepStatus !== filter) return false;
    if (search && !o.id.toLowerCase().includes(search.toLowerCase()) && !o.client.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (selectedOrder) {
    const o = selectedOrder;
    return (
      <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
        <button onClick={() => setSelectedOrder(null)} className="text-[12px] font-black text-slate-500 hover:text-[#f00856] uppercase tracking-[0.3em] flex items-center gap-4 transition-all group px-4">
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center group-hover:border-[#f00856] group-hover:bg-[#f00856]/10 transition-all">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </div>
          Back to worklist
        </button>
        
        <div className="glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-12 md:p-16 border-b border-white/5 bg-white/[0.03] flex flex-col sm:flex-row sm:items-center justify-between gap-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
               <Package className="w-48 h-48 text-white -rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="text-[12px] text-[#f00856] font-black uppercase tracking-[0.5em] mb-4">Order Tracking Protocol</div>
              <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">{o.id}</h2>
              <div className="flex items-center gap-4">
                 <p className="text-[12px] text-slate-500 font-black uppercase tracking-widest bg-white/5 px-3 py-1 rounded-md">{o.date}</p>
                 <span className="text-slate-800">•</span>
                 <p className="text-[12px] text-slate-300 font-black uppercase tracking-widest">{o.client}</p>
              </div>
            </div>
            <span className={`badge px-8 py-4 rounded-full border shadow-2xl text-[11px] ${prepLabels[o.prepStatus]?.cls.split(' border')[0]} bg${prepLabels[o.prepStatus]?.cls.split(' bg')[1]}`}>{prepLabels[o.prepStatus]?.label}</span>
          </div>

          <div className="p-12 md:p-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
            <Info label="Cliente" value={o.client} />
            <Info label="Email" value={o.email} />
            <Info label="Dirección" value={o.address} />
            <Info label="Operador" value={o.operator} />
            <Info label="Tracking" value={o.tracking || 'Pending Assignment'} />
            <Info label="Depósito" value={o.warehouse} />
            <Info label="Promesa" value={o.promise} />
            <Info label="Pago" value={o.payStatus} isStatus />
          </div>

          <div className="p-12 md:p-16 border-t border-white/5 bg-black/20">
             <div className="flex justify-between items-end mb-12">
                <div className="flex items-center gap-6">
                   <div className="w-14 h-14 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-xl">
                      <ShoppingCart className="w-7 h-7 text-[#f00856]" />
                   </div>
                   <div>
                      <div className="text-[12px] text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Items List</div>
                      <h4 className="text-3xl font-black text-white uppercase tracking-widest">Desglose de Productos</h4>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Total Order Value</p>
                   <p className="text-6xl font-black text-white tracking-tighter">${o.total.toLocaleString()}</p>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {o.items.map((item, i) => (
                  <div key={i} className="flex justify-between p-10 soft rounded-[2rem] border border-white/5 hover:border-[#f00856]/30 hover:bg-white/[0.06] transition-all group shadow-xl">
                    <div className="flex items-center gap-6">
                       <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 font-black group-hover:text-[#f00856] transition-colors">
                          {i + 1}
                       </div>
                       <span className="text-[16px] font-black text-white uppercase tracking-widest group-hover:text-[#f00856] transition-colors">{item.name}</span>
                    </div>
                    <span className="text-2xl font-black text-[#f00856] bg-[#f00856]/10 w-12 h-12 rounded-full flex items-center justify-center shadow-lg">x{item.qty}</span>
                  </div>
                ))}
             </div>
          </div>

          <div className="p-12 md:p-16 bg-white/[0.01] border-t border-white/5">
            <div className="flex items-center gap-4 mb-12">
               <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-slate-500" />
               </div>
               <div className="text-[12px] text-slate-500 font-black uppercase tracking-[0.4em]">Workflow Priority Actions</div>
            </div>
            <div className="flex flex-wrap gap-4">
              {o.prepStatus === 'new' && <Btn label="Aceptar Pedido" color="f00856" onClick={() => {}} />}
              {o.prepStatus === 'new' && <Btn label="Preparar" color="purple" onClick={() => {}} />}
              {o.prepStatus === 'preparing' && <Btn label="Empaquetar" color="indigo" onClick={() => {}} />}
              {['packed', 'preparing'].includes(o.prepStatus) && <Btn label="Imprimir Etiqueta" color="gray" onClick={() => {}} icon={<Printer className="w-5 h-5" />} />}
              {o.prepStatus === 'packed' && <Btn label="Asignar Operador" color="sky" onClick={() => {}} />}
              {o.prepStatus === 'packed' && <Btn label="Despachar" color="green" onClick={() => {}} />}
              {o.prepStatus === 'dispatched' && <Btn label="Entregar" color="emerald" onClick={() => {}} />}
              {!['delivered', 'cancelled'].includes(o.prepStatus) && <Btn label="Cancelar" color="red" onClick={() => {}} />}
              {!['delivered', 'cancelled'].includes(o.prepStatus) && <Btn label="Incidencia" color="orange" onClick={() => {}} />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
         <div>
            <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Order Management</div>
            <h2 className="text-5xl font-black text-white">Logística de Pedidos</h2>
            <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">{mockOrders.length} transacciones registradas</p>
         </div>
         <button className="bg-white text-black text-[12px] font-black uppercase tracking-widest px-14 py-6 rounded-full hover:bg-[#f00856] hover:text-white transition-all shadow-2xl active:scale-[0.98] border border-white/10">
            Sincronizar Pedidos
         </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="relative flex-1 group">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-[#f00856] transition-colors" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by Order ID or Client Name..."
            className="w-full bg-white/5 border border-white/10 p-7 pl-20 rounded-[2rem] text-sm font-black uppercase tracking-widest outline-none focus:border-[#f00856] focus:bg-white/[0.08] transition-all placeholder:text-slate-800 shadow-inner group-hover:border-white/20" />
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-10 py-6 text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-3xl border ${filter === f ? 'bg-white text-black border-white shadow-2xl scale-[1.05]' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
              {f === 'all' ? 'Ver Todos' : prepLabels[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.04] border-b border-white/5">
              <tr className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">
                <th className="p-10">ID</th>
                <th className="p-10">Client</th>
                <th className="p-10">Value</th>
                <th className="p-10">Payment</th>
                <th className="p-10 text-center">Workflow</th>
                <th className="p-10">Logistics</th>
                <th className="p-10">SLA</th>
                <th className="p-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(o => (
                <tr key={o.id} onClick={() => setSelectedOrder(o)} className="hover:bg-white/[0.02] cursor-pointer group transition-colors">
                  <td className="p-10 font-black text-white text-[18px] group-hover:text-[#f00856] transition-colors uppercase tracking-tight">{o.id}</td>
                  <td className="p-10">
                     <p className="text-[18px] font-black text-slate-200 group-hover:text-white transition-colors">{o.client}</p>
                     <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2 bg-white/5 px-2 py-0.5 rounded inline-block">{o.items.reduce((s, i) => s + i.qty, 0)} Items</p>
                  </td>
                  <td className="p-10 font-black text-white text-[20px] tracking-tighter">${o.total.toLocaleString()}</td>
                  <td className="p-10">
                     <span className={`badge px-5 py-2.5 rounded-full shadow-lg text-[10px] ${o.payStatus === 'paid' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {o.payStatus === 'paid' ? 'Paid' : 'Refund'}
                     </span>
                  </td>
                  <td className="p-10 text-center">
                     <span className={`badge px-6 py-3 rounded-full shadow-xl text-[10px] ${prepLabels[o.prepStatus]?.cls.split(' border')[0]} bg${prepLabels[o.prepStatus]?.cls.split(' bg')[1]}`}>
                        {prepLabels[o.prepStatus]?.label}
                     </span>
                  </td>
                  <td className="p-10">
                     <p className="text-[12px] font-black text-slate-300 uppercase tracking-widest">{o.operator}</p>
                     <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2">{o.zone}</p>
                  </td>
                  <td className="p-10">
                    <div className="bg-white/5 px-4 py-2 rounded-2xl border border-white/5 group-hover:bg-[#f00856]/5 group-hover:border-[#f00856]/20 transition-all">
                       <p className="text-[11px] font-black text-white uppercase tracking-widest">{o.promise}</p>
                    </div>
                  </td>
                  <td className="p-10 text-right"><ChevronRight className="w-6 h-6 text-slate-800 group-hover:text-[#f00856] transition-all group-hover:translate-x-2" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, isStatus }: { label: string; value: string; isStatus?: boolean }) {
  return (
    <div className="soft p-8 rounded-3xl border border-white/5 hover:border-white/10 transition-all shadow-lg">
       <p className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em] mb-5">{label}</p>
       {isStatus ? (
         <span className={`badge px-6 py-3 rounded-full shadow-2xl text-[10px] ${value === 'paid' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>{value}</span>
       ) : (
         <p className="text-[16px] font-black text-white uppercase tracking-widest leading-relaxed">{value}</p>
       )}
    </div>
  );
}

function Btn({ label, color, onClick, icon }: { label: string; color: string; onClick: () => void; icon?: React.ReactNode }) {
  const cls: Record<string, string> = { 
    'f00856': 'bg-[#f00856] hover:bg-[#ff2c68] text-white shadow-[0_0_40px_rgba(240,8,86,0.4)] border border-white/10', 
    purple: 'bg-purple-600/10 text-purple-400 border border-purple-500/20 hover:bg-purple-600 hover:text-white hover:shadow-[0_0_30px_rgba(147,51,234,0.3)]', 
    indigo: 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white hover:shadow-[0_0_30px_rgba(79,70,229,0.3)]', 
    sky: 'bg-sky-600/10 text-sky-400 border border-sky-500/20 hover:bg-sky-600 hover:text-white hover:shadow-[0_0_30px_rgba(2,132,199,0.3)]', 
    green: 'bg-green-600/10 text-green-400 border border-green-500/20 hover:bg-green-600 hover:text-white hover:shadow-[0_0_30_rgba(22,163,74,0.3)]', 
    emerald: 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white hover:shadow-[0_0_30px_rgba(5,150,105,0.3)]', 
    red: 'bg-red-600/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]', 
    orange: 'bg-orange-600/10 border border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white hover:shadow-[0_0_30px_rgba(234,88,12,0.3)]', 
    gray: 'bg-white/5 border border-white/10 text-white hover:bg-white hover:text-black hover:shadow-2xl' 
  };
  return (
    <button onClick={onClick} className={`text-[12px] font-black uppercase tracking-widest px-10 py-6 rounded-full flex items-center gap-5 transition-all active:scale-[0.96] shadow-xl ${cls[color]}`}>
      {icon}{label}
    </button>
  );
}
