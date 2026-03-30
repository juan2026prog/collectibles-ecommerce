import { DollarSign, TrendingUp, ArrowDownCircle, Clock, CreditCard, FileText, Download } from 'lucide-react';

const mockFinances = [
  { date: '27/03', order: 'ORD-4821', client: 'María López', gross: 4500, feePlatform: 450, feeGateway: 135, shipping: 169, net: 3746, status: 'pending' },
  { date: '27/03', order: 'ORD-4819', client: 'Carlos Ruiz', gross: 4890, feePlatform: 489, feeGateway: 147, shipping: 169, net: 4085, status: 'pending' },
  { date: '26/03', order: 'ORD-4815', client: 'Pedro Martínez', gross: 6490, feePlatform: 649, feeGateway: 195, shipping: 200, net: 5446, status: 'held' },
  { date: '25/03', order: 'ORD-4810', client: 'Laura Sánchez', gross: 3490, feePlatform: 349, feeGateway: 105, shipping: 169, net: 2867, status: 'settlable' },
  { date: '24/03', order: 'ORD-4805', client: 'Diego Torres', gross: 7990, feePlatform: 799, feeGateway: 240, shipping: 290, net: 6661, status: 'paid' },
];

const mockSettlements = [
  { id: 'LIQ-042', period: '18/03 - 24/03', orders: 12, gross: 45800, discounts: 6870, adjustments: -500, final: 38430, payDate: '28/03/2026', status: 'pending' },
  { id: 'LIQ-041', period: '11/03 - 17/03', orders: 18, gross: 67200, discounts: 10080, adjustments: 0, final: 57120, payDate: '21/03/2026', status: 'paid' },
  { id: 'LIQ-040', period: '04/03 - 10/03', orders: 15, gross: 52300, discounts: 7845, adjustments: -1200, final: 43255, payDate: '14/03/2026', status: 'paid' },
];

const stMap: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pendiente', c: 'bg-orange-50 text-orange-700' }, held: { l: 'Retenido', c: 'bg-yellow-50 text-yellow-700' },
  settlable: { l: 'Liquidable', c: 'bg-green-50 text-green-700' }, paid: { l: 'Pagado', c: 'bg-emerald-50 text-emerald-700' },
  adjusted: { l: 'Ajustado', c: 'bg-blue-50 text-blue-700' }, refunded: { l: 'Reembolsado', c: 'bg-red-50 text-red-700' },
};

export default function VFinances({ mode = 'finances' }: { mode?: 'finances' | 'settlements' }) {
  if (mode === 'settlements') {
    return (
      <div className="space-y-5 max-w-5xl">
        <h2 className="text-2xl font-black text-gray-900">Liquidaciones</h2>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr><th className="p-3 pl-4">ID</th><th className="p-3">Período</th><th className="p-3">Pedidos</th><th className="p-3 text-right">Bruto</th><th className="p-3 text-right">Descuentos</th><th className="p-3 text-right">Ajustes</th><th className="p-3 text-right">Final</th><th className="p-3">Pago</th><th className="p-3">Estado</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockSettlements.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="p-3 pl-4 font-bold text-gray-900">{s.id}</td>
                  <td className="p-3 text-gray-700 text-xs">{s.period}</td>
                  <td className="p-3 text-gray-600 text-center">{s.orders}</td>
                  <td className="p-3 text-right font-medium">${s.gross.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-500">-${s.discounts.toLocaleString()}</td>
                  <td className="p-3 text-right text-gray-500">{s.adjustments < 0 ? `-$${Math.abs(s.adjustments).toLocaleString()}` : '$0'}</td>
                  <td className="p-3 text-right font-black text-gray-900">${s.final.toLocaleString()}</td>
                  <td className="p-3 text-xs text-gray-500">{s.payDate}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${s.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>{s.status === 'paid' ? 'Pagado' : 'Pendiente'}</span></td>
                  <td className="p-3"><button className="text-[10px] text-blue-600 font-bold flex items-center gap-1"><Download className="w-3 h-3" /> PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
          <p className="font-bold text-gray-800 mb-2">Información de Cobro</p>
          <p>Cuenta: BROU — **** 4521 · Titular: Tienda Demo SRL</p>
          <p>Frecuencia: Semanal · Día estimado: Viernes</p>
        </div>
      </div>
    );
  }

  const totals = {
    gross: mockFinances.reduce((s, f) => s + f.gross, 0),
    fees: mockFinances.reduce((s, f) => s + f.feePlatform + f.feeGateway, 0),
    shipping: mockFinances.reduce((s, f) => s + f.shipping, 0),
    net: mockFinances.reduce((s, f) => s + f.net, 0),
    pending: mockFinances.filter(f => f.status === 'pending').reduce((s, f) => s + f.net, 0),
    settlable: mockFinances.filter(f => f.status === 'settlable').reduce((s, f) => s + f.net, 0),
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <h2 className="text-2xl font-black text-gray-900">Finanzas</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Ventas Brutas" value={`$${totals.gross.toLocaleString()}`} icon={DollarSign} color="emerald" />
        <Card label="Comisiones" value={`$${totals.fees.toLocaleString()}`} icon={ArrowDownCircle} color="red" />
        <Card label="Costo Envío" value={`$${totals.shipping.toLocaleString()}`} icon={CreditCard} color="purple" />
        <Card label="Neto a Cobrar" value={`$${totals.net.toLocaleString()}`} icon={TrendingUp} color="green" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 text-white p-6 rounded-xl">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Saldo Retenido</p>
          <p className="text-3xl font-black">${totals.pending.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 p-6 rounded-xl">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Saldo Liquidable</p>
          <p className="text-3xl font-black text-green-600">${totals.settlable.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Próxima liquidación: 28/03/2026</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900">Detalle Financiero</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr><th className="p-3 pl-4">Fecha</th><th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3 text-right">Bruto</th><th className="p-3 text-right">Fee Plat.</th><th className="p-3 text-right">Fee Pasarela</th><th className="p-3 text-right">Envío</th><th className="p-3 text-right">Neto</th><th className="p-3">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockFinances.map(f => (
                <tr key={f.order} className="hover:bg-gray-50">
                  <td className="p-3 pl-4 text-gray-600 text-xs">{f.date}</td>
                  <td className="p-3 font-bold text-gray-900">{f.order}</td>
                  <td className="p-3 text-gray-700">{f.client}</td>
                  <td className="p-3 text-right">${f.gross.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-500">-${f.feePlatform}</td>
                  <td className="p-3 text-right text-red-400">-${f.feeGateway}</td>
                  <td className="p-3 text-right text-gray-500">-${f.shipping}</td>
                  <td className="p-3 text-right font-black text-green-600">+${f.net.toLocaleString()}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${stMap[f.status]?.c}`}>{stMap[f.status]?.l}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const c: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', purple: 'bg-purple-50 text-purple-600', green: 'bg-green-50 text-green-600' };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-start mb-2"><div className={`p-2 rounded-lg ${c[color]}`}><Icon className="w-4 h-4" /></div><span className="text-lg font-black text-gray-900">{value}</span></div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
