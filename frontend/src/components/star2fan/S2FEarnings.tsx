import { DollarSign, TrendingUp, ArrowDownCircle, Clock } from 'lucide-react';

interface Props {
  earnings: any[];
  requests: any[];
}

export default function S2FEarnings({ earnings, requests }: Props) {
  const totalGross = earnings.reduce((s, e) => s + Number(e.gross_amount || 0), 0);
  const totalFees = earnings.reduce((s, e) => s + Number(e.platform_fee || 0), 0);
  const totalNet = earnings.reduce((s, e) => s + Number(e.net_amount || 0), 0);
  const held = earnings.filter(e => e.payment_status === 'held').reduce((s, e) => s + Number(e.net_amount), 0);
  const pending = earnings.filter(e => e.payment_status === 'pending').reduce((s, e) => s + Number(e.net_amount), 0);
  const available = earnings.filter(e => e.payment_status === 'available').reduce((s, e) => s + Number(e.net_amount), 0);
  const paid = earnings.filter(e => e.payment_status === 'paid').reduce((s, e) => s + Number(e.net_amount), 0);
  const refunded = earnings.filter(e => e.payment_status === 'refunded').reduce((s, e) => s + Number(e.net_amount), 0);

  // Per-period
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayEarnings = earnings.filter(e => new Date(e.created_at) >= today).reduce((s, e) => s + Number(e.net_amount), 0);
  const monthEarnings = earnings.filter(e => new Date(e.created_at) >= monthStart).reduce((s, e) => s + Number(e.net_amount), 0);

  const statusColors: Record<string, string> = {
    held: 'bg-yellow-50 text-yellow-700',
    pending: 'bg-orange-50 text-orange-700',
    available: 'bg-green-50 text-green-700',
    paid: 'bg-emerald-50 text-emerald-700',
    refunded: 'bg-red-50 text-red-700',
  };
  const statusLabels: Record<string, string> = {
    held: 'Retenido', pending: 'Pendiente', available: 'Disponible', paid: 'Pagado', refunded: 'Reembolsado',
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <h2 className="text-3xl font-black text-gray-900 tracking-tight">Billetera & Ingresos</h2>

      {/* Top Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniCard label="Hoy" value={`$${todayEarnings.toFixed(0)}`} icon={DollarSign} color="rose" />
        <MiniCard label="Este Mes" value={`$${monthEarnings.toFixed(0)}`} icon={TrendingUp} color="purple" />
        <MiniCard label="Total Neto" value={`$${totalNet.toFixed(0)}`} icon={DollarSign} color="green" />
        <MiniCard label="Comisiones Plataforma" value={`$${totalFees.toFixed(0)}`} icon={ArrowDownCircle} color="gray" />
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10"><DollarSign className="w-28 h-28" /></div>
          <div className="relative z-10">
            <p className="text-gray-400 font-bold tracking-widest text-xs uppercase mb-1">Disponible para Retiro</p>
            <h3 className="text-4xl font-black mb-1">${available.toFixed(2)}</h3>
            <p className="text-gray-500 text-xs mb-6">Saldo pendiente: ${(held + pending).toFixed(2)}</p>
            <button className="bg-rose-500 hover:bg-rose-400 text-white font-black py-3.5 px-8 rounded-xl shadow-lg transition-colors w-full sm:w-auto">
              Solicitar Retiro
            </button>
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-8 rounded-2xl shadow-sm">
          <p className="text-gray-400 font-bold tracking-widest text-xs uppercase mb-1">Resumen de Saldos</p>
          <div className="space-y-3 mt-4">
            <BalRow label="Retenido (en espera)" value={held} color="text-yellow-600" />
            <BalRow label="Pendiente de liberación" value={pending} color="text-orange-600" />
            <BalRow label="Disponible" value={available} color="text-green-600" />
            <BalRow label="Ya cobrado" value={paid} color="text-emerald-600" />
            {refunded > 0 && <BalRow label="Reembolsado" value={refunded} color="text-red-500" />}
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="text-base font-black text-gray-900">Movimientos</h3>
          <span className="text-xs text-gray-400 font-bold">{earnings.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-3 pl-5">Fecha</th>
                <th className="p-3">Pedido</th>
                <th className="p-3 text-right">Bruto</th>
                <th className="p-3 text-right">Fee</th>
                <th className="p-3 text-right">Neto</th>
                <th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {earnings.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="p-3 pl-5 text-gray-600 font-medium">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{e.request_id?.substring(0, 8) || '—'}</td>
                  <td className="p-3 text-right text-gray-700 font-bold">${Number(e.gross_amount).toFixed(2)}</td>
                  <td className="p-3 text-right text-gray-400">-${Number(e.platform_fee).toFixed(2)}</td>
                  <td className="p-3 text-right text-green-600 font-black">+${Number(e.net_amount).toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusColors[e.payment_status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[e.payment_status] || e.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
              {earnings.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-sm">Aún no hay movimientos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600', purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600', gray: 'bg-gray-100 text-gray-500',
  };
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2 rounded-xl ${colorMap[color]}`}><Icon className="w-5 h-5" /></div>
        <span className="text-xl font-black text-gray-900">{value}</span>
      </div>
      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</h3>
    </div>
  );
}

function BalRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`font-black text-base ${color}`}>${value.toFixed(2)}</span>
    </div>
  );
}
