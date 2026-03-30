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
  new: { label: 'Nuevo', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing: { label: 'Preparando', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  packed: { label: 'Empaquetado', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  dispatched: { label: 'Despachado', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  delivered: { label: 'Entregado', cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  incident: { label: 'Incidencia', cls: 'bg-red-50 text-red-700 border-red-200' },
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
      <div className="space-y-5 max-w-4xl">
        <button onClick={() => setSelectedOrder(null)} className="text-sm font-bold text-gray-500 hover:text-blue-600 flex items-center gap-1">← Volver</button>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-gray-900">{o.id}</h2>
              <p className="text-sm text-gray-500">{o.date} · {o.client}</p>
            </div>
            <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-lg border ${prepLabels[o.prepStatus]?.cls}`}>{prepLabels[o.prepStatus]?.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-5 text-sm mb-6">
            <Info label="Cliente" value={o.client} />
            <Info label="Email" value={o.email} />
            <Info label="Dirección" value={o.address} />
            <Info label="Zona" value={o.zone} />
            <Info label="Operador Logístico" value={o.operator} />
            <Info label="Tracking" value={o.tracking || 'Sin asignar'} />
            <Info label="Depósito" value={o.warehouse} />
            <Info label="Promesa" value={o.promise} />
            <Info label="Pago" value={o.payStatus} />
            <Info label="Total" value={`$${o.total.toLocaleString()}`} />
          </div>
          <div className="border-t border-gray-100 pt-4 mb-6">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Productos</h4>
            {o.items.map((item, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-gray-50 text-sm">
                <span className="text-gray-800 font-medium">{item.name}</span>
                <span className="text-gray-500">x{item.qty}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {o.prepStatus === 'new' && <Btn label="Aceptar Pedido" color="blue" onClick={() => {}} />}
            {o.prepStatus === 'new' && <Btn label="Marcar Preparando" color="purple" onClick={() => {}} />}
            {o.prepStatus === 'preparing' && <Btn label="Empaquetar" color="indigo" onClick={() => {}} />}
            {['packed', 'preparing'].includes(o.prepStatus) && <Btn label="Generar Etiqueta" color="gray" onClick={() => {}} icon={<Printer className="w-3.5 h-3.5" />} />}
            {o.prepStatus === 'packed' && <Btn label="Asignar Operador" color="sky" onClick={() => {}} />}
            {o.prepStatus === 'packed' && <Btn label="Marcar Despachado" color="green" onClick={() => {}} />}
            {o.prepStatus === 'dispatched' && <Btn label="Marcar Entregado" color="emerald" onClick={() => {}} />}
            {!['delivered', 'cancelled'].includes(o.prepStatus) && <Btn label="Cancelar" color="red" onClick={() => {}} />}
            {!['delivered', 'cancelled'].includes(o.prepStatus) && <Btn label="Crear Incidencia" color="orange" onClick={() => {}} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <h2 className="text-2xl font-black text-gray-900">Pedidos</h2>
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pedido o cliente..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            {f === 'all' ? 'Todos' : prepLabels[f]?.label || f}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-3 pl-4">Pedido</th><th className="p-3">Cliente</th><th className="p-3">Items</th>
                <th className="p-3">Monto</th><th className="p-3">Pago</th><th className="p-3">Estado</th>
                <th className="p-3">Envío</th><th className="p-3">Zona</th><th className="p-3">Promesa</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(o => (
                <tr key={o.id} onClick={() => setSelectedOrder(o)} className="hover:bg-gray-50 cursor-pointer group">
                  <td className="p-3 pl-4 font-bold text-gray-900">{o.id}</td>
                  <td className="p-3 text-gray-700">{o.client}</td>
                  <td className="p-3 text-gray-500">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="p-3 font-black text-gray-900">${o.total.toLocaleString()}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${o.payStatus === 'paid' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{o.payStatus === 'paid' ? 'Pagado' : 'Reemb.'}</span></td>
                  <td className="p-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${prepLabels[o.prepStatus]?.cls}`}>{prepLabels[o.prepStatus]?.label}</span></td>
                  <td className="p-3 text-xs text-gray-500">{o.operator}</td>
                  <td className="p-3 text-xs text-gray-500">{o.zone}</td>
                  <td className="p-3 text-xs font-medium text-gray-700">{o.promise}</td>
                  <td className="p-3"><ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (<div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p><p className="font-medium text-gray-800">{value}</p></div>);
}
function Btn({ label, color, onClick, icon }: { label: string; color: string; onClick: () => void; icon?: React.ReactNode }) {
  const cls: Record<string, string> = { blue: 'bg-blue-600 hover:bg-blue-500 text-white', purple: 'bg-purple-600 hover:bg-purple-500 text-white', indigo: 'bg-indigo-600 hover:bg-indigo-500 text-white', sky: 'bg-sky-600 hover:bg-sky-500 text-white', green: 'bg-green-600 hover:bg-green-500 text-white', emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white', red: 'bg-white border border-red-200 text-red-600 hover:bg-red-50', orange: 'bg-white border border-orange-200 text-orange-600 hover:bg-orange-50', gray: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' };
  return <button onClick={onClick} className={`text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors ${cls[color]}`}>{icon}{label}</button>;
}
