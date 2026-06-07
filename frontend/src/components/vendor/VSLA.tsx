import { Clock, CheckCircle, AlertTriangle, TrendingUp, Truck, XCircle, BarChart3 } from 'lucide-react';

const mockSLA = {
  todayMet: 94.2, monthMet: 96.1, atRisk: 2, overdue: 1, bestOperator: 'Soy Delivery', worstOperator: 'DAC',
  stages: [
    { stage: 'Compra → Aceptación', avg: '12 min', target: '30 min', met: 98 },
    { stage: 'Aceptación → Preparación', avg: '1.2h', target: '2h', met: 95 },
    { stage: 'Preparación → Despacho', avg: '45 min', target: '1h', met: 97 },
    { stage: 'Despacho → Entrega', avg: '3.5h', target: '6h', met: 92 },
  ],
  alerts: [
    { order: 'ORD-4819', msg: 'Preparación supera SLA (2h)', type: 'warning' },
    { order: 'ORD-4810', msg: 'Pickup no solicitado a tiempo', type: 'error' },
  ],
};

export default function VSLA() {
  return (
    <div className="max-w-7xl space-y-10 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 px-4">
        <div>
           <div className="text-[12px] text-primary-600 font-black uppercase tracking-[0.5em] mb-4">Performance Standards</div>
           <h2 className="text-5xl font-black text-gray-900 tracking-tighter">SLA Logístico</h2>
           <p className="text-sm text-gray-500 font-bold mt-4 uppercase tracking-[0.2em]">Monitoreo de tiempos de respuesta y cumplimiento de promesas de entrega</p>
        </div>
        <div className="bg-white border border-gray-200 p-8 rounded-[2rem] flex items-center gap-8 shadow-sm relative overflow-hidden group hover:border-primary-300 transition-all">
           <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-primary-50 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
           <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm relative z-10">
              <BarChart3 className="w-8 h-8 text-primary-600" />
           </div>
           <div className="relative z-10">
              <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.4em]">Global Efficiency</p>
              <p className="text-3xl font-black text-gray-900 tracking-tighter mt-1">{mockSLA.monthMet}% Met</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 px-4">
        <SCard label="SLA Hoy" value={`${mockSLA.todayMet}%`} icon={CheckCircle} good={mockSLA.todayMet >= 90} />
        <SCard label="SLA Mes" value={`${mockSLA.monthMet}%`} icon={TrendingUp} good={mockSLA.monthMet >= 90} />
        <SCard label="At Risk Units" value={mockSLA.atRisk.toString()} icon={AlertTriangle} good={mockSLA.atRisk === 0} />
        <SCard label="Overdue Ops" value={mockSLA.overdue.toString()} icon={XCircle} good={mockSLA.overdue === 0} />
        <SCard label="Peak Operator" value={mockSLA.bestOperator} icon={Truck} good />
        <SCard label="Node Lagging" value={mockSLA.worstOperator} icon={Truck} good={false} />
      </div>

      <div className="px-4">
        <div className="bg-white rounded-[3rem] border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-10 border-b border-gray-100 bg-gray-50 flex items-center gap-6">
             <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-primary-600" />
             </div>
             <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-[0.5em]">Lifecycle Latency per Stage</h3>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[11px] font-black text-gray-500 uppercase tracking-[0.4em]">
                  <th className="p-10">Operational Stage</th>
                  <th className="p-10">Avg Latency</th>
                  <th className="p-10">Target Threshold</th>
                  <th className="p-10">Compliance Rate</th>
                  <th className="p-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mockSLA.stages.map(s => (
                  <tr key={s.stage} className="hover:bg-gray-50 transition-colors group">
                    <td className="p-10">
                       <p className="font-black text-gray-900 text-[16px] uppercase tracking-widest group-hover:text-primary-600 transition-colors">{s.stage}</p>
                    </td>
                    <td className="p-10 text-[18px] font-black text-gray-700 tracking-tighter">{s.avg}</td>
                    <td className="p-10 text-[11px] text-gray-400 font-black uppercase tracking-widest">{s.target}</td>
                    <td className="p-10">
                      <div className="flex items-center gap-6">
                        <div className="w-48 h-2 bg-gray-50 rounded-full overflow-hidden shadow-inner">
                          <div className={`h-full group-hover:scale-x-105 transition-all duration-1000 origin-left ${s.met >= 95 ? 'bg-emerald-500 shadow-sm' : s.met >= 85 ? 'bg-yellow-500 shadow-sm' : 'bg-red-500 shadow-sm'}`} style={{ width: `${s.met}%` }}></div>
                        </div>
                        <span className={`text-[14px] font-black tracking-tighter ${s.met >= 95 ? 'text-emerald-500' : s.met >= 85 ? 'text-yellow-500' : 'text-red-500'}`}>{s.met}%</span>
                      </div>
                    </td>
                    <td className="p-10 text-right">
                       {s.met < 90 && <AlertTriangle className="w-6 h-6 text-primary-600 animate-pulse drop-shadow-sm" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="bg-white rounded-[3rem] border border-red-500/20 bg-red-500/[0.03] p-12 group hover:bg-red-500/[0.05] transition-all shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none text-red-500">
             <AlertTriangle className="w-64 h-64 -rotate-12" />
          </div>
          <h3 className="text-[12px] font-black text-red-500 uppercase tracking-[0.5em] mb-10 flex items-center gap-4 relative z-10">
             <div className="w-8 h-[2px] bg-red-500"></div> Active Violations / Warning
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
            {mockSLA.alerts.map((a, i) => (
              <div key={i} className={`p-8 rounded-[2rem] border transition-all flex items-center gap-8 shadow-sm ${a.type === 'error' ? 'bg-black/40 border-red-500/20 hover:border-red-500/40' : 'bg-black/20 border-yellow-500/20 hover:border-yellow-500/40'}`}>
                <div className={`w-3 h-3 shrink-0 rounded-full ${a.type === 'error' ? 'bg-red-500 shadow-sm animate-pulse' : 'bg-yellow-500 shadow-sm'}`}></div>
                <div className="flex-1">
                   <p className="text-[15px] font-black text-gray-900 uppercase tracking-tight">{a.order}</p>
                   <p className="text-[11px] text-gray-500 font-bold mt-1 uppercase tracking-widest">{a.msg}</p>
                </div>
                <button className="text-[10px] font-black text-gray-900 uppercase tracking-widest border border-gray-200 px-6 py-3 rounded-full hover:bg-white hover:text-black transition-all shadow-lg active:scale-95">Resolve</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SCard({ label, value, icon: Icon, good }: { label: string; value: string; icon: any; good: boolean }) {
  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-200 p-10 group hover:bg-gray-50 transition-all shadow-sm relative overflow-hidden">
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-gray-50 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
      <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-8 transition-all shadow-lg relative z-10 ${good ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5 group-hover:bg-emerald-500/10' : 'border-primary-600/20 text-primary-600 bg-primary-50 group-hover:bg-primary-100'}`}>
         <Icon className="w-7 h-7" />
      </div>
      <p className="text-4xl font-black text-gray-900 group-hover:text-primary-600 transition-colors mb-3 tracking-tighter relative z-10">{value}</p>
      <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] relative z-10 group-hover:text-gray-500 transition-colors">{label}</p>
    </div>
  );
}
