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
    <div className="space-y-5 max-w-5xl">
      <h2 className="text-2xl font-black text-gray-900">SLA Logístico</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SCard label="SLA Hoy" value={`${mockSLA.todayMet}%`} icon={CheckCircle} good={mockSLA.todayMet >= 90} />
        <SCard label="SLA Mes" value={`${mockSLA.monthMet}%`} icon={TrendingUp} good={mockSLA.monthMet >= 90} />
        <SCard label="En Riesgo" value={mockSLA.atRisk.toString()} icon={AlertTriangle} good={mockSLA.atRisk === 0} />
        <SCard label="Vencidos" value={mockSLA.overdue.toString()} icon={XCircle} good={mockSLA.overdue === 0} />
        <SCard label="Mejor Operador" value={mockSLA.bestOperator} icon={Truck} good />
        <SCard label="Peor Operador" value={mockSLA.worstOperator} icon={Truck} good={false} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900">Tiempos por Etapa</h3></div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <tr><th className="p-3 pl-4">Etapa</th><th className="p-3">Promedio</th><th className="p-3">Target</th><th className="p-3">Cumplimiento</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {mockSLA.stages.map(s => (
              <tr key={s.stage} className="hover:bg-gray-50">
                <td className="p-3 pl-4 font-bold text-gray-900">{s.stage}</td>
                <td className="p-3 font-medium">{s.avg}</td>
                <td className="p-3 text-gray-500">{s.target}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full max-w-[100px]">
                      <div className={`h-full rounded-full ${s.met >= 95 ? 'bg-green-500' : s.met >= 85 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${s.met}%` }}></div>
                    </div>
                    <span className={`text-xs font-black ${s.met >= 95 ? 'text-green-600' : s.met >= 85 ? 'text-yellow-600' : 'text-red-600'}`}>{s.met}%</span>
                  </div>
                </td>
                <td className="p-3">{s.met < 90 && <AlertTriangle className="w-4 h-4 text-yellow-500" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Alertas SLA</h3>
        <div className="space-y-2">
          {mockSLA.alerts.map((a, i) => (
            <div key={i} className={`p-3 rounded-lg flex items-center gap-3 ${a.type === 'error' ? 'bg-red-50' : 'bg-yellow-50'}`}>
              <div className={`w-2 h-2 rounded-full ${a.type === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
              <span className="text-sm font-bold text-gray-800">{a.order}</span>
              <span className="text-sm text-gray-600">{a.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SCard({ label, value, icon: Icon, good }: { label: string; value: string; icon: any; good: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <Icon className={`w-5 h-5 mb-2 ${good ? 'text-green-500' : 'text-red-500'}`} />
      <p className="text-xl font-black text-gray-900">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
