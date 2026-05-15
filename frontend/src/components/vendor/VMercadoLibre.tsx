import { RefreshCw, Link2, AlertTriangle, CheckCircle, Clock, Search, Layers } from 'lucide-react';

const mockSync = [
  { internal: 'Remera Oversize Urban', sku: 'REM-OVS-001', mlId: 'MLA-12345', syncStatus: 'synced', localStock: 45, mlStock: 45, localPrice: 2490, mlPrice: 2490, lastSync: '27/03 10:15', error: null },
  { internal: 'Jean Slim Fit Premium', sku: 'JEA-SLM-002', mlId: 'MLA-12346', syncStatus: 'synced', localStock: 12, mlStock: 12, localPrice: 4890, mlPrice: 4890, lastSync: '27/03 10:15', error: null },
  { internal: 'Zapatillas Runner X', sku: 'ZAP-RUN-003', mlId: 'MLA-12347', syncStatus: 'error', localStock: 0, mlStock: 3, localPrice: 7990, mlPrice: 7990, lastSync: '27/03 08:00', error: 'Stock no sincronizado' },
  { internal: 'Campera Puffer Light', sku: 'CAM-PUF-004', mlId: null, syncStatus: 'unlinked', localStock: 3, mlStock: null, localPrice: 8990, mlPrice: null, lastSync: null, error: 'Sin vincular' },
  { internal: 'Gorra Snapback Classic', sku: 'GOR-SNP-005', mlId: 'MLA-12349', syncStatus: 'synced', localStock: 78, mlStock: 78, localPrice: 1290, mlPrice: 1290, lastSync: '27/03 10:15', error: null },
];

const mockLogs = [
  { time: '27/03 10:15', action: 'Sync completa', items: 4, status: 'ok', user: 'Auto' },
  { time: '27/03 08:00', action: 'Sync stock ZAP-RUN-003', items: 1, status: 'error', user: 'Auto' },
  { time: '26/03 22:00', action: 'Sync precios', items: 5, status: 'ok', user: 'Auto' },
  { time: '26/03 16:30', action: 'Importar publicación MLA-12349', items: 1, status: 'ok', user: 'admin' },
];
export default function VMercadoLibre() {
  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Ecosystem Sync</div>
           <h2 className="text-5xl font-black text-white">Mercado Libre</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Sincronización omnicanal de catálogo, stock y precios</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-[#FFE600] text-black text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:shadow-[0_0_50px_rgba(255,230,0,0.4)] transition-all flex items-center gap-4 active:scale-[0.98] border border-black/10">
             <RefreshCw className="w-5 h-5" /> Sync ML Catalog
          </button>
          <button className="glass border border-white/10 text-white text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-white/10 transition-all flex items-center gap-4 shadow-xl">
             <Link2 className="w-5 h-5" /> Account Manager
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <MiniStat label="Synced Nodes" value={mockSync.filter(s => s.syncStatus === 'synced').length} color="emerald" />
        <MiniStat label="Sync Failures" value={mockSync.filter(s => s.syncStatus === 'error').length} color="red" />
        <MiniStat label="Pending Link" value={mockSync.filter(s => s.syncStatus === 'unlinked').length} color="orange" />
        <MiniStat label="Last Update" value="10:15" color="blue" />
      </div>

      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.04] flex items-center gap-6">
           <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-xl">
              <Layers className="w-6 h-6 text-[#f00856]" />
           </div>
           <h3 className="text-[12px] font-black text-white uppercase tracking-[0.5em]">Synchronization Matrix</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">
                <th className="p-10">Asset / SKU</th>
                <th className="p-10">ML Publication ID</th>
                <th className="p-10 text-center">Sync</th>
                <th className="p-10 text-center">Local Qty</th>
                <th className="p-10 text-center">ML Qty</th>
                <th className="p-10 text-right">Local Price</th>
                <th className="p-10 text-right">ML Price</th>
                <th className="p-10">Diagnostic</th>
                <th className="p-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mockSync.map(s => (
                <tr key={s.sku} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-10">
                     <p className="font-black text-white text-[18px] group-hover:text-[#f00856] transition-colors uppercase tracking-tight">{s.internal}</p>
                     <p className="text-[11px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2 bg-white/5 px-2 py-0.5 rounded inline-block">{s.sku}</p>
                  </td>
                  <td className="p-10">
                     <span className="font-mono text-[12px] text-slate-500 uppercase bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 group-hover:text-white transition-colors">{s.mlId || '—'}</span>
                  </td>
                  <td className="p-10 text-center">
                     <div className="flex justify-center">
                        <div className={`w-4 h-4 rounded-full border-2 border-black ${s.syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : s.syncStatus === 'error' ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-slate-800 shadow-xl'}`}></div>
                     </div>
                  </td>
                  <td className="p-10 text-center font-black text-white text-[18px] tracking-tighter">{s.localStock}</td>
                  <td className="p-10 text-center font-black text-slate-600 text-[18px] tracking-tighter group-hover:text-slate-400 transition-colors">{s.mlStock ?? '—'}</td>
                  <td className="p-10 text-right text-[18px] font-black text-white tracking-tighter">${s.localPrice}</td>
                  <td className="p-10 text-right text-[18px] font-black text-slate-500 tracking-tighter group-hover:text-slate-300 transition-colors">{s.mlPrice ? `$${s.mlPrice}` : '—'}</td>
                  <td className="p-10">
                     {s.error && <span className="badge rounded-lg border border-red-500/20 text-red-500 bg-red-500/10 px-4 py-2 text-[10px] whitespace-nowrap shadow-lg">{s.error}</span>}
                  </td>
                  <td className="p-10 text-right">
                     <button className="text-[11px] font-black text-white uppercase tracking-widest border border-white/10 px-8 py-4 rounded-full hover:bg-[#f00856] hover:border-[#f00856] transition-all active:scale-[0.95] shadow-xl group-hover:shadow-[#f00856]/20">
                        {s.syncStatus === 'unlinked' ? 'Link Now' : 'Retry'}
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.04] flex items-center gap-6">
           <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
              <Clock className="w-6 h-6 text-slate-500" />
           </div>
           <h3 className="text-[12px] font-black text-white uppercase tracking-[0.5em]">Event Log / System Activity</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-white/5">
              {mockLogs.map((l, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-10 text-[12px] text-slate-700 font-black uppercase tracking-[0.2em] w-56">{l.time}</td>
                  <td className="p-10 font-black text-white text-[16px] uppercase tracking-widest group-hover:text-[#f00856] group-hover:translate-x-3 transition-all">{l.action}</td>
                  <td className="p-10 text-slate-600 text-[12px] font-black uppercase tracking-widest">{l.items} products affected</td>
                  <td className="p-10">
                     <span className={`badge px-5 py-2.5 rounded-full shadow-2xl text-[10px] ${l.status === 'ok' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>{l.status}</span>
                  </td>
                  <td className="p-10 text-[12px] font-black text-slate-800 uppercase tracking-widest text-right group-hover:text-slate-600 transition-colors">{l.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="soft rounded-[2rem] p-12 group hover:bg-white/[0.04] transition-all border border-white/5 hover:border-[#f00856]/30 shadow-xl overflow-hidden relative">
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
      <p className="text-5xl font-black text-white group-hover:text-[#f00856] transition-all mb-4 tracking-tighter relative z-10">{value}</p>
      <p className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em] relative z-10 group-hover:text-slate-400 transition-colors">{label}</p>
    </div>
  );
}
