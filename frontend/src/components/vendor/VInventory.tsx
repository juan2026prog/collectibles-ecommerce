import { useState } from 'react';
import { Warehouse, Search, Plus, ArrowRightLeft, Lock, Unlock, TrendingDown, AlertTriangle, History, Package } from 'lucide-react';

const mockInventory = [
  { sku: 'REM-OVS-001', name: 'Remera Oversize Urban', current: 45, reserved: 3, available: 42, minimum: 10, warehouse: 'Principal', status: 'ok' },
  { sku: 'JEA-SLM-002', name: 'Jean Slim Fit Premium', current: 12, reserved: 2, available: 10, minimum: 15, warehouse: 'Principal', status: 'low' },
  { sku: 'ZAP-RUN-003', name: 'Zapatillas Runner X', current: 0, reserved: 0, available: 0, minimum: 5, warehouse: 'Principal', status: 'out' },
  { sku: 'CAM-PUF-004', name: 'Campera Puffer Light', current: 3, reserved: 1, available: 2, minimum: 8, warehouse: 'Secundario', status: 'low' },
  { sku: 'GOR-SNP-005', name: 'Gorra Snapback Classic', current: 78, reserved: 0, available: 78, minimum: 20, warehouse: 'Principal', status: 'ok' },
  { sku: 'BER-CAR-006', name: 'Bermuda Cargo Tech', current: 2, reserved: 1, available: 1, minimum: 10, warehouse: 'Principal', status: 'low' },
];

const mockMovements = [
  { date: '27/03 10:15', sku: 'REM-OVS-001', action: 'Venta', qty: -2, user: 'Sistema', note: 'ORD-4821' },
  { date: '27/03 09:00', sku: 'CAM-PUF-004', action: 'Ajuste Manual', qty: +5, user: 'admin', note: 'Reposición' },
  { date: '26/03 16:30', sku: 'JEA-SLM-002', action: 'Venta', qty: -1, user: 'Sistema', note: 'ORD-4815' },
  { date: '26/03 14:00', sku: 'ZAP-RUN-003', action: 'Venta', qty: -1, user: 'Sistema', note: 'ORD-4812' },
  { date: '25/03 11:00', sku: 'BER-CAR-006', action: 'Transferencia', qty: -3, user: 'admin', note: 'A Secundario' },
];

const mockWarehouses = [
  { id: 1, name: 'Principal', address: 'Av. Italia 3200, Montevideo', city: 'Montevideo', responsible: 'Juan Pérez', hours: 'L-V 9-18, S 9-13', products: 142, type: 'principal' },
  { id: 2, name: 'Secundario', address: 'Ruta 8 km 22, Pando', city: 'Canelones', responsible: 'María López', hours: 'L-V 8-17', products: 34, type: 'secondary' },
  { id: 3, name: 'Pickup Pocitos', address: 'Av. Brasil 2845, Pocitos', city: 'Montevideo', responsible: 'Carlos Ruiz', hours: 'L-S 10-20', products: 0, type: 'pickup' },
];

export default function VInventory({ mode = 'inventory' }: { mode?: 'inventory' | 'warehouses' }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  if (mode === 'warehouses') {
    return (
      <div className="space-y-5 max-w-5xl">
        <div className="flex justify-between items-center">
          <div><h2 className="text-2xl font-black text-gray-900">Depósitos</h2><p className="text-sm text-gray-500">{mockWarehouses.length} depósitos configurados</p></div>
          <button className="bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-gray-800 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Agregar Depósito</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockWarehouses.map(w => (
            <div key={w.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${w.type === 'principal' ? 'bg-blue-50 text-blue-600' : w.type === 'pickup' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}>
                    <Warehouse className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900">{w.name}</h3>
                    <span className="text-[10px] font-bold uppercase text-gray-400">{w.type}</span>
                  </div>
                </div>
                <span className="text-lg font-black text-gray-900">{w.products}</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-600">
                <p>📍 {w.address}</p>
                <p>👤 {w.responsible}</p>
                <p>🕐 {w.hours}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="text-[10px] font-bold bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">Ver Stock</button>
                <button className="text-[10px] font-bold bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">Editar</button>
                <button className="text-[10px] font-bold bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">Transferir</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const filtered = mockInventory.filter(p => {
    if (filterStatus === 'low' && p.status !== 'low') return false;
    if (filterStatus === 'out' && p.status !== 'out') return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5 max-w-7xl">
      <h2 className="text-2xl font-black text-gray-900">Inventario</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Stock Total" value={mockInventory.reduce((s, p) => s + p.current, 0).toString()} color="blue" />
        <StatCard label="Reservado" value={mockInventory.reduce((s, p) => s + p.reserved, 0).toString()} color="purple" />
        <StatCard label="Sin Stock" value={mockInventory.filter(p => p.status === 'out').length.toString()} color="red" />
        <StatCard label="Stock Bajo" value={mockInventory.filter(p => p.status === 'low').length.toString()} color="yellow" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        {['all', 'low', 'out'].map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${filterStatus === f ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            {f === 'all' ? 'Todos' : f === 'low' ? 'Stock Bajo' : 'Sin Stock'}
          </button>
        ))}
        <button className="ml-auto text-xs font-bold bg-gray-900 text-white px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3 h-3" /> Ingreso</button>
        <button className="text-xs font-bold bg-white border border-gray-200 px-3 py-2 rounded-lg flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" /> Transferir</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">Producto</th><th className="p-3">SKU</th><th className="p-3 text-center">Actual</th><th className="p-3 text-center">Reservado</th><th className="p-3 text-center">Disponible</th><th className="p-3 text-center">Mínimo</th><th className="p-3">Depósito</th><th className="p-3">Estado</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(p => (
              <tr key={p.sku} className="hover:bg-gray-50">
                <td className="p-3 pl-4 font-bold text-gray-900">{p.name}</td>
                <td className="p-3 font-mono text-xs text-gray-500">{p.sku}</td>
                <td className="p-3 text-center font-black">{p.current}</td>
                <td className="p-3 text-center text-purple-600 font-bold">{p.reserved}</td>
                <td className="p-3 text-center font-black text-gray-900">{p.available}</td>
                <td className="p-3 text-center text-gray-400">{p.minimum}</td>
                <td className="p-3 text-xs text-gray-500">{p.warehouse}</td>
                <td className="p-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${p.status === 'ok' ? 'bg-green-50 text-green-700' : p.status === 'low' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                    {p.status === 'ok' ? 'OK' : p.status === 'low' ? 'Bajo' : 'Agotado'}
                  </span>
                </td>
                <td className="p-3"><button className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Ajustar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Movement History */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" /><h3 className="text-sm font-black text-gray-900">Últimos Movimientos</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">Fecha</th><th className="p-3">SKU</th><th className="p-3">Acción</th><th className="p-3 text-center">Qty</th><th className="p-3">Usuario</th><th className="p-3">Nota</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {mockMovements.map((m, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="p-3 pl-4 text-gray-600 text-xs">{m.date}</td>
                <td className="p-3 font-mono text-xs text-gray-500">{m.sku}</td>
                <td className="p-3 text-gray-700 font-medium">{m.action}</td>
                <td className={`p-3 text-center font-black ${m.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                <td className="p-3 text-xs text-gray-500">{m.user}</td>
                <td className="p-3 text-xs text-gray-400">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const cls: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', red: 'bg-red-50 text-red-600', yellow: 'bg-yellow-50 text-yellow-600' };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
