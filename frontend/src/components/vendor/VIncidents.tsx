import { AlertTriangle, Search } from 'lucide-react';
import { useState } from 'react';

const mockIncidents = [
  { id: 'INC-01', type: 'sync_ml', order: 'ORD-4817', operator: '-', severity: 'high', status: 'open', responsible: 'Sistema', date: '27/03', desc: 'Sync ML falló para ZAP-RUN-003' },
  { id: 'INC-02', type: 'delivery_delayed', order: 'ORD-4810', operator: 'Soy Delivery', severity: 'medium', status: 'investigating', responsible: 'Logística', date: '26/03', desc: 'Envío demorado 6h sobre SLA' },
  { id: 'INC-03', type: 'stock_error', order: 'ORD-4805', operator: '-', severity: 'low', status: 'resolved', responsible: 'Catálogo', date: '25/03', desc: 'Stock negativo en variante XL' },
  { id: 'INC-04', type: 'return', order: 'ORD-4798', operator: 'DAC', severity: 'medium', status: 'open', responsible: 'Ventas', date: '24/03', desc: 'Devolución por producto incorrecto' },
];

const sevMap: Record<string, string> = { 
  high: 'border-red-500/20 text-red-500 bg-red-500/5', 
  medium: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5', 
  low: 'border-blue-500/20 text-blue-500 bg-blue-500/5' 
};
const stMap: Record<string, string> = { 
  open: 'border-red-500/20 text-red-500 bg-red-500/5', 
  investigating: 'border-orange-500/20 text-orange-500 bg-orange-500/5', 
  resolved: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' 
};

export default function VIncidents() {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? mockIncidents : mockIncidents.filter(i => i.status === filter);

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Ops Monitoring</div>
           <h2 className="text-5xl font-black text-white">Log de Incidencias</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Seguimiento de fallos críticos, devoluciones y errores de sincronización</p>
        </div>
        <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-full shadow-xl">
          {['all', 'open', 'investigating', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest transition-all rounded-full ${filter === f ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-slate-500 hover:text-white'}`}>
              {f === 'all' ? 'All Units' : f === 'open' ? 'Critical' : f === 'investigating' ? 'Active Lab' : 'Resolved'}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/5">
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                <th className="p-8">Registry ID</th>
                <th className="p-8">Anomaly Type</th>
                <th className="p-8">Order Ref</th>
                <th className="p-8">Carrier / Node</th>
                <th className="p-8">Severity</th>
                <th className="p-8">Protocol Status</th>
                <th className="p-8">Responsibility</th>
                <th className="p-8">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(i => (
                <tr key={i.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <td className="p-8 font-black text-white text-[15px] uppercase tracking-widest group-hover:text-[#f00856] transition-colors">{i.id}</td>
                  <td className="p-8 text-[11px] font-black text-slate-300 uppercase tracking-widest group-hover:text-white transition-colors">{i.type.replace(/_/g, ' ')}</td>
                  <td className="p-8">
                     <span className="font-mono text-[11px] text-slate-500 tracking-tighter bg-white/5 px-2 py-1 rounded-md">{i.order}</span>
                  </td>
                  <td className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">{i.operator}</td>
                  <td className="p-8">
                     <span className={`badge px-4 py-2 ${sevMap[i.severity].replace('border-', 'text-').split(' ')[0] + ' bg' + sevMap[i.severity].split(' bg')[1]}`}>
                        {i.severity}
                     </span>
                  </td>
                  <td className="p-8">
                     <span className={`badge px-4 py-2 ${stMap[i.status].replace('border-', 'text-').split(' ')[0] + ' bg' + stMap[i.status].split(' bg')[1]}`}>
                        {i.status}
                     </span>
                  </td>
                  <td className="p-8 text-[11px] font-black text-slate-600 uppercase tracking-widest">{i.responsible}</td>
                  <td className="p-8 text-[11px] font-black text-slate-700 uppercase tracking-widest">{i.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="soft rounded-[2rem] border border-[#f00856]/30 bg-[#f00856]/5 p-10 flex items-center gap-10 group hover:bg-[#f00856]/10 transition-all shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
            <AlertTriangle className="w-48 h-48 text-white -rotate-12" />
         </div>
         <div className="w-16 h-16 rounded-2xl bg-[#f00856] text-white flex items-center justify-center shadow-[0_0_30px_rgba(240,8,86,0.2)] shrink-0 z-10 group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-8 h-8" />
         </div>
         <div className="relative z-10">
            <p className="text-[12px] font-black text-white uppercase tracking-[0.5em] mb-3">Operational Protocol</p>
            <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest leading-loose">
               Todas las incidencias críticas (High) deben ser resueltas en menos de 4 horas para mantener el SLA de la plataforma. <br/>
               <span className="text-[#f00856] bg-[#f00856]/10 px-2 py-0.5 rounded-md mt-2 inline-block">Consulte el manual de crisis en el centro de ayuda si es necesario.</span>
            </p>
         </div>
      </div>
    </div>
  );
}
