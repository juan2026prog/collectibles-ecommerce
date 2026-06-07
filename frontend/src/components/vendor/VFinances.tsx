import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, ArrowDownCircle, Clock, CreditCard, FileText, Download, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const stMap: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pendiente', c: 'border-orange-500/20 text-orange-500 bg-orange-500/5' },
  held: { l: 'Retenido', c: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' },
  settlable: { l: 'Liquidable', c: 'border-green-500/20 text-green-500 bg-green-500/5' },
  paid: { l: 'Pagado', c: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  adjusted: { l: 'Ajustado', c: 'border-blue-500/20 text-blue-500 bg-blue-500/5' },
  refunded: { l: 'Reembolsado', c: 'border-red-500/20 text-red-500 bg-red-500/5' },
};

export default function VFinances({ mode = 'finances' }: { mode?: 'finances' | 'settlements' }) {
  const { user } = useAuth();
  const [finances, setFinances] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadFinances() {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendor_payouts')
        .select(`
          *,
          order_item:order_items(price, product_variant_id),
          order:orders(id, created_at, customer:profiles(first_name, last_name, email))
        `)
        .eq('vendor_id', user!.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setFinances(data.map(p => {
          const gross = Number(p.amount) / (1 - Number(p.fee_percentage) / 100);
          return {
            date: new Date(p.created_at).toLocaleDateString('es'),
            order: p.order?.id?.slice(0, 8).toUpperCase() || 'N/A',
            client: p.order?.customer?.first_name 
                      ? `${p.order.customer.first_name} ${p.order.customer.last_name || ''}` 
                      : (p.order?.customer?.email || 'Anónimo'),
            gross: gross,
            feePlatform: gross - Number(p.amount),
            feeGateway: 0,
            shipping: 0,
            net: Number(p.amount),
            status: p.status,
            id: p.id
          };
        }));
        
        // Group into settlements (fake logic to show paid vs pending batches)
        const s_paid = data.filter(p => p.status === 'paid');
        const s_pending = data.filter(p => p.status === 'pending');
        
        const setts = [];
        if (s_pending.length > 0) {
          const gross = s_pending.reduce((acc, p) => acc + (Number(p.amount) / (1 - Number(p.fee_percentage) / 100)), 0);
          const final = s_pending.reduce((acc, p) => acc + Number(p.amount), 0);
          setts.push({
            id: 'LIQ-PENDING', period: 'Actual', orders: s_pending.length, gross, discounts: gross - final, adjustments: 0, final, payDate: '-', status: 'pending'
          });
        }
        if (s_paid.length > 0) {
          const gross = s_paid.reduce((acc, p) => acc + (Number(p.amount) / (1 - Number(p.fee_percentage) / 100)), 0);
          const final = s_paid.reduce((acc, p) => acc + Number(p.amount), 0);
          setts.push({
            id: 'LIQ-PAST', period: 'Anterior', orders: s_paid.length, gross, discounts: gross - final, adjustments: 0, final, payDate: 'Procesado', status: 'paid'
          });
        }
        setSettlements(setts);
      }
      setLoading(false);
    }
    loadFinances();
  }, [user]);

  if (loading) {
    return <div className="text-gray-900 text-center p-12">Cargando datos financieros...</div>;
  }

  if (mode === 'settlements') {
    return (
      <div className="space-y-8 animation-fade-in pb-20">
        <div>
           <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Accounting Ledger</div>
           <h2 className="text-5xl font-black text-gray-900">Liquidaciones & Pagos</h2>
           <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">Historial de transferencias bancarias procesadas</p>
        </div>

        <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                  <th className="p-8">Statement ID</th>
                  <th className="p-8">Period</th>
                  <th className="p-8 text-center">Orders</th>
                  <th className="p-8 text-right">Gross</th>
                  <th className="p-8 text-right">Fees</th>
                  <th className="p-8 text-right">Adjust</th>
                  <th className="p-8 text-right font-black text-gray-900">Net Final</th>
                  <th className="p-8">Bank Status</th>
                  <th className="p-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlements.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 group transition-colors">
                    <td className="p-8 font-black text-gray-900 text-[16px] group-hover:text-primary-600 transition-colors">{s.id}</td>
                    <td className="p-8">
                       <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{s.period}</p>
                       <p className="text-[9px] text-gray-400 font-black uppercase mt-1.5">Paid: {s.payDate}</p>
                    </td>
                    <td className="p-8 text-center font-black text-gray-900 text-[16px]">{s.orders}</td>
                    <td className="p-8 text-right font-black text-gray-500 text-[15px]">${s.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-8 text-right font-black text-red-500 text-[15px]">-${s.discounts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-8 text-right font-black text-gray-400 text-[15px]">{s.adjustments < 0 ? `-$${Math.abs(s.adjustments).toLocaleString()}` : '$0'}</td>
                    <td className="p-8 text-right font-black text-gray-900 text-[18px] bg-white/[0.01] group-hover:bg-gray-50 transition-colors tracking-tighter">${s.final.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-8">
                       <span className={`badge px-4 py-2 ${s.status === 'paid' ? 'text-emerald-400 bg-emerald-400/10' : 'text-orange-400 bg-orange-400/10'}`}>
                          {s.status === 'paid' ? 'Transfered' : 'Processing'}
                       </span>
                    </td>
                    <td className="p-8 text-right">
                       <button className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary-600 hover:border-primary-600/50 transition-all active:scale-90"><Download className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {settlements.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-500">No hay liquidaciones registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="bg-white rounded-[2rem] border border-gray-200 p-12 bg-gray-50 shadow-sm">
           <div className="flex items-center gap-5 mb-10">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm">
                 <CreditCard className="w-6 h-6 text-primary-600" />
              </div>
              <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.4em]">Banking Information</h4>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              <div className="soft p-8 rounded-3xl border border-gray-100">
                 <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Primary Account</p>
                 <p className="text-lg font-black text-gray-900 uppercase tracking-widest">A configurar</p>
              </div>
              <div className="soft p-8 rounded-3xl border border-gray-100">
                 <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Payout Schedule</p>
                 <p className="text-lg font-black text-gray-900 uppercase tracking-widest">Semanal</p>
              </div>
              <div className="lg:flex lg:items-center lg:justify-end">
                 <button className="text-[11px] font-black text-primary-600 uppercase tracking-[0.3em] hover:underline hover:translate-x-2 transition-all flex items-center gap-3">Update Payment Method <ArrowRight className="w-4 h-4" /></button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  const totals = {
    gross: finances.reduce((s, f) => s + f.gross, 0),
    fees: finances.reduce((s, f) => s + f.feePlatform + f.feeGateway, 0),
    shipping: finances.reduce((s, f) => s + f.shipping, 0),
    net: finances.reduce((s, f) => s + f.net, 0),
    pending: finances.filter(f => f.status === 'pending').reduce((s, f) => s + f.net, 0),
    paid: finances.filter(f => f.status === 'paid').reduce((s, f) => s + f.net, 0),
  };

  return (
    <div className="space-y-8 animation-fade-in pb-20">
      <div>
         <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Financial Engine</div>
         <h2 className="text-5xl font-black text-gray-900">Balances & Rendimiento</h2>
         <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">Análisis de ingresos netos y estructuras de costos</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ventas Brutas" value={`$${totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} color="emerald" />
        <StatCard label="Comisiones" value={`$${totals.fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={ArrowDownCircle} color="red" />
        <StatCard label="Logística" value={`$${totals.shipping.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={CreditCard} color="purple" />
        <StatCard label="Neto Histórico" value={`$${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color="green" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="soft rounded-[2.5rem] p-12 hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
          <p className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-6">Escrow Balance</p>
          <div className="flex items-end gap-5">
             <p className="text-6xl font-black text-gray-900 tracking-tighter">${totals.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
             <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Pendiente de cierre</span>
          </div>
        </div>
        <div className="bg-white rounded-[2.5rem] border border-primary-600/30 p-12 bg-primary-50 relative overflow-hidden group shadow-sm">
          <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
             <CreditCard className="w-48 h-48 text-gray-900 -rotate-12" />
          </div>
          <div className="relative z-10">
            <p className="text-[11px] text-emerald-500 font-black uppercase tracking-[0.4em] mb-6">Settled Amount</p>
            <p className="text-6xl font-black text-emerald-500 tracking-tighter mb-6">${totals.paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[11px] font-black text-gray-900/40 uppercase tracking-widest">Ya Transferido</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
           <div>
              <h3 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.4em] mb-1">Transaction Stream</h3>
              <h4 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Detalle Financiero por Pedido</h4>
           </div>
           <button className="text-[11px] font-black text-gray-500 uppercase tracking-widest border border-gray-200 px-8 py-4 rounded-full hover:bg-white hover:text-black transition-all active:scale-95">Export XLS</button>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.01] border-b border-gray-100">
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                <th className="p-8">Timestamp</th>
                <th className="p-8">Order</th>
                <th className="p-8">Client</th>
                <th className="p-8 text-right">Gross</th>
                <th className="p-8 text-right">Platform Fee</th>
                <th className="p-8 text-right font-black text-gray-900">Net Flow</th>
                <th className="p-8">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {finances.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 group transition-colors">
                  <td className="p-8 text-gray-500 text-[11px] font-black uppercase tracking-widest">{f.date}</td>
                  <td className="p-8 font-black text-gray-900 text-[16px] group-hover:text-primary-600 transition-colors uppercase">{f.order}</td>
                  <td className="p-8 text-gray-500 text-[13px] font-black uppercase tracking-widest">{f.client}</td>
                  <td className="p-8 text-right font-black text-gray-900 text-[16px]">${f.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-8 text-right font-black text-red-500 text-[15px]">-${f.feePlatform.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-8 text-right font-black text-emerald-500 text-[18px] bg-white/[0.01] group-hover:bg-emerald-500/5 transition-colors tracking-tighter">+${f.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-8">
                     <span className={`badge px-4 py-2 ${stMap[f.status]?.c.replace('border-', 'text-').split(' ')[0] + ' bg' + stMap[f.status]?.c.split(' bg')[1]}`}>
                        {stMap[f.status]?.l}
                     </span>
                  </td>
                </tr>
              ))}
              {finances.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No hay transacciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const c: Record<string, string> = { 
    emerald: 'bg-emerald-500/10 text-emerald-500 shadow-sm', 
    red: 'bg-red-500/10 text-red-500 shadow-sm', 
    purple: 'bg-purple-500/10 text-purple-500 shadow-sm', 
    green: 'bg-green-500/10 text-green-500 shadow-sm' 
  };
  return (
    <div className="soft rounded-3xl p-10 group hover:bg-gray-50 transition-all border border-gray-100 hover:border-primary-300 shadow-sm">
      <div className="flex justify-between items-start mb-8">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c[color]}`}><Icon className="w-5 h-5" /></div>
        <span className="text-3xl font-black text-gray-900 group-hover:text-primary-600 transition-colors">{value}</span>
      </div>
      <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
}
