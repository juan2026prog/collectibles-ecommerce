import { useState } from 'react';
import { Warehouse, Search, Plus, ArrowRightLeft, Lock, Unlock, TrendingDown, AlertTriangle, History, Package, Clock } from 'lucide-react';

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

import { MapPin } from 'lucide-react';

export default function VInventory({ mode = 'inventory' }: { mode?: 'inventory' | 'warehouses' }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  if (mode === 'warehouses') {
    return (
      <div className="space-y-8 animation-fade-in pb-20">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div>
            <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Network Architecture</div>
            <h2 className="text-5xl font-black text-white">Centros de Distribución</h2>
            <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">{mockWarehouses.length} nodos activos en la red</p>
          </div>
          <button className="bg-white text-black text-[11px] font-black uppercase tracking-widest px-10 py-5 rounded-full hover:bg-[#f00856] hover:text-white transition-all shadow-xl active:scale-[0.98]">
             + Add Distribution Center
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockWarehouses.map(w => (
            <div key={w.id} className="soft rounded-[2.5rem] p-10 hover:bg-white/[0.04] transition-all group border border-white/5 hover:border-[#f00856]/30 shadow-xl">
              <div className="flex justify-between items-start mb-10">
                <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${w.type === 'principal' ? 'bg-blue-500/10 text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : w.type === 'pickup' ? 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-purple-500/10 text-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.1)]'}`}>
                    <Warehouse className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-widest">{w.name}</h3>
                    <span className="badge mt-2">{w.type} center</span>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-3xl font-black text-white group-hover:text-[#f00856] transition-colors">{w.products}</p>
                   <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">SKUs</p>
                </div>
              </div>
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-[#f00856]" /></div>
                  <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">{w.address}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4 text-slate-700" /></div>
                  <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Lead: {w.responsible}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Clock className="w-4 h-4 text-slate-700" /></div>
                  <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest">{w.hours}</p>
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-white/5 flex flex-wrap gap-3">
                <button className="text-[10px] font-black uppercase tracking-widest bg-white/5 text-white px-6 py-3 rounded-full hover:bg-white hover:text-black transition-all border border-white/10">Stock</button>
                <button className="text-[10px] font-black uppercase tracking-widest bg-white/5 text-white px-6 py-3 rounded-full hover:bg-white hover:text-black transition-all border border-white/10">Edit</button>
                <button className="text-[10px] font-black uppercase tracking-widest bg-white/5 text-white px-6 py-3 rounded-full hover:bg-white hover:text-black transition-all border border-white/10">Transfer</button>
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
    <div className="space-y-8 animation-fade-in pb-20">
      <div>
         <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Inventory System</div>
         <h2 className="text-5xl font-black text-white">Control de Existencias</h2>
         <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Monitoreo en tiempo real de unidades disponibles</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Stock Total" value={mockInventory.reduce((s, p) => s + p.current, 0).toString()} color="blue" />
        <StatCard label="Reservado" value={mockInventory.reduce((s, p) => s + p.reserved, 0).toString()} color="purple" />
        <StatCard label="Sin Stock" value={mockInventory.filter(p => p.status === 'out').length.toString()} color="red" />
        <StatCard label="Stock Bajo" value={mockInventory.filter(p => p.status === 'low').length.toString()} color="yellow" />
      </div>

      <div className="flex flex-col xl:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-[#f00856] transition-colors" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by SKU or Product Name..."
            className="w-full bg-white/5 border border-white/10 p-6 pl-16 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:border-[#f00856] focus:bg-white/[0.08] transition-all placeholder:text-slate-800" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {['all', 'low', 'out'].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-2xl border ${filterStatus === f ? 'bg-white text-black border-white shadow-xl' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
              {f === 'all' ? 'Ver Todos' : f === 'low' ? 'Stock Bajo' : 'Sin Stock'}
            </button>
          ))}
          <button className="px-8 py-5 text-[10px] font-black uppercase tracking-widest bg-[#f00856] text-white rounded-2xl hover:bg-[#ff2c68] transition-all whitespace-nowrap flex items-center gap-3 shadow-[0_0_20px_rgba(240,8,86,0.2)] active:scale-95">
            <Plus className="w-4 h-4" /> Add Units
          </button>
        </div>
      </div>

      <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/5">
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                <th className="p-8">Product Item</th>
                <th className="p-8">SKU</th>
                <th className="p-8 text-center">In Hand</th>
                <th className="p-8 text-center">Reserved</th>
                <th className="p-8 text-center font-black text-white">Net Avail</th>
                <th className="p-8 text-center">Threshold</th>
                <th className="p-8">Warehouse</th>
                <th className="p-8">Status</th>
                <th className="p-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(p => (
                <tr key={p.sku} className="hover:bg-white/[0.02] group transition-colors">
                  <td className="p-8">
                     <p className="font-black text-white text-[15px] group-hover:text-[#f00856] transition-colors uppercase tracking-widest">{p.name}</p>
                  </td>
                  <td className="p-8">
                     <span className="font-mono text-[11px] text-slate-500 tracking-tighter bg-white/5 px-2 py-1 rounded-md">{p.sku}</span>
                  </td>
                  <td className="p-8 text-center font-black text-white text-[16px]">{p.current}</td>
                  <td className="p-8 text-center text-purple-500 font-black text-[16px]">{p.reserved}</td>
                  <td className="p-8 text-center font-black text-[#f00856] text-[18px] bg-white/[0.01] group-hover:bg-[#f00856]/5 transition-colors">{p.available}</td>
                  <td className="p-8 text-center text-slate-600 font-black text-[16px]">{p.minimum}</td>
                  <td className="p-8">
                     <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{p.warehouse}</span>
                  </td>
                  <td className="p-8">
                    <span className={`badge px-4 py-2 ${p.status === 'ok' ? 'text-emerald-400 bg-emerald-400/10' : p.status === 'low' ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'}`}>
                      {p.status === 'ok' ? 'Nominal' : p.status === 'low' ? 'Critical' : 'Depleted'}
                    </span>
                  </td>
                  <td className="p-8 text-right">
                     <button className="text-[11px] font-black uppercase tracking-widest text-[#f00856] hover:underline px-6 py-3 rounded-full hover:bg-[#f00856]/10 transition-all">Adjust</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement History */}
      <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.03] flex items-center gap-6">
          <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(240,8,86,0.1)]">
             <History className="w-6 h-6 text-[#f00856]" />
          </div>
          <div>
             <h3 className="text-[11px] font-black text-[#f00856] uppercase tracking-[0.4em] mb-1">Operational Logs</h3>
             <h4 className="text-2xl font-black text-white uppercase tracking-widest">Historial de Movimientos</h4>
          </div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-white/[0.01] border-b border-white/5">
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                <th className="p-8">Timestamp</th>
                <th className="p-8">Ref SKU</th>
                <th className="p-8">Operation</th>
                <th className="p-8 text-center">Delta</th>
                <th className="p-8">Operator</th>
                <th className="p-8">System Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mockMovements.map((m, i) => (
                <tr key={i} className="hover:bg-white/[0.01] transition-colors group">
                  <td className="p-8 text-slate-500 text-[11px] font-black uppercase tracking-widest">{m.date}</td>
                  <td className="p-8">
                     <span className="font-mono text-[11px] text-slate-500 tracking-tighter bg-white/5 px-2 py-1 rounded-md">{m.sku}</span>
                  </td>
                  <td className="p-8 text-slate-300 text-[11px] font-black uppercase tracking-widest group-hover:text-white transition-colors">{m.action}</td>
                  <td className={`p-8 text-center font-black ${m.qty > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                     <span className="text-[16px]">{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                  </td>
                  <td className="p-8 text-slate-500 text-[11px] font-black uppercase tracking-widest">{m.user}</td>
                  <td className="p-8 text-slate-600 text-[11px] font-black uppercase tracking-widest">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="soft rounded-3xl p-10 group hover:bg-white/[0.04] transition-all border border-white/5 hover:border-[#f00856]/30 shadow-xl">
      <p className="text-4xl font-black text-white mb-3 group-hover:text-[#f00856] transition-colors">{value}</p>
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
}
