import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, ArrowDownCircle, Clock, CreditCard, Download, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isRealPaidOrder } from '../../lib/payments';

const suborderStatusMap: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pendiente', c: 'border-gray-500/20 text-gray-400 bg-gray-500/5' },
  confirmed: { l: 'Confirmado', c: 'border-blue-500/20 text-blue-500 bg-blue-500/5' },
  preparing: { l: 'Preparando', c: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' },
  shipped: { l: 'Enviado', c: 'border-indigo-500/20 text-indigo-500 bg-indigo-500/5' },
  delivered: { l: 'Entregado', c: 'border-green-500/20 text-green-500 bg-green-500/5' },
  cancelled: { l: 'Cancelado', c: 'border-red-500/20 text-red-500 bg-red-500/5' },
  refunded: { l: 'Reembolsado', c: 'border-purple-500/20 text-purple-500 bg-purple-500/5' },
  claim_open: { l: 'Reclamo', c: 'border-orange-500/20 text-orange-500 bg-orange-500/5' }
};

const liqStatusMap: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pendiente', c: 'text-gray-400 bg-gray-400/10' },
  eligible: { l: 'Elegible', c: 'text-blue-500 bg-blue-500/10' },
  included_in_batch: { l: 'En Lote', c: 'text-yellow-500 bg-yellow-500/10' },
  paid: { l: 'Pagado', c: 'text-emerald-500 bg-emerald-500/10' },
  blocked: { l: 'Bloqueado', c: 'text-red-500 bg-red-500/10' },
  cancelled: { l: 'Cancelado', c: 'text-gray-500 bg-gray-500/10' }
};

export default function VFinances({ mode = 'finances' }: { mode?: 'finances' | 'settlements' }) {
  const { user } = useAuth();
  const [suborders, setSuborders] = useState<any[]>([]);
  const [liquidations, setLiquidations] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadFinances() {
      setLoading(true);
      try {
        // 1. Fetch suborders
        const { data: subData, error: subError } = await supabase
          .from('order_suborders')
          .select(`
            *,
            orders!parent_order_id (
              id,
              created_at,
              customer_name,
              customer_email,
              payment_status,
              payment_processed_at,
              payment_provider,
              payment_provider_reference,
              payment_method,
              payment_id,
              is_test_order,
              status
            )
          `)
          .eq('vendor_id', user!.id)
          .order('created_at', { ascending: false });

        if (subError) throw subError;
        setSuborders(subData || []);

        // 2. Fetch liquidations
        const { data: liqData, error: liqError } = await supabase
          .from('vendor_liquidations')
          .select('*')
          .eq('vendor_id', user!.id)
          .order('created_at', { ascending: false });

        if (liqError) throw liqError;
        setLiquidations(liqData || []);

        // 3. Fetch refunds
        const { data: refData, error: refError } = await supabase
          .from('refunds')
          .select(`
            *,
            order:orders(order_number),
            suborder:order_suborders(suborder_number)
          `)
          .eq('vendor_id', user!.id)
          .order('created_at', { ascending: false });

        if (refError) throw refError;
        setRefunds(refData || []);

        // 4. Fetch disputes
        const { data: dispData, error: dispError } = await supabase
          .from('payment_disputes')
          .select(`
            *,
            order:orders(order_number),
            suborder:order_suborders(suborder_number)
          `)
          .eq('vendor_id', user!.id)
          .order('created_at', { ascending: false });

        if (dispError) throw dispError;
        setDisputes(dispData || []);
      } catch (err) {
        console.error('Error fetching vendor finances:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFinances();
  }, [user]);

  if (loading) {
    return <div className="text-gray-900 text-center p-12">Cargando datos financieros...</div>;
  }

  // Strict Financial Separation according to Marketplace Governance & isRealPaidOrder
  const now = new Date();
  const custodyThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // 1. All registered sales
  const allSuborders = suborders;

  // 2. Confirmed paid sales (certified through isRealPaidOrder)
  const paidSuborders = suborders.filter(s => {
    const parent = s.orders;
    const isRealPaid = parent && isRealPaidOrder(parent);
    return isRealPaid && !['cancelled', 'refunded'].includes(s.status);
  });

  // Open disputes set for blocking liquidation eligibility
  const openDisputeOrderIds = new Set(
    disputes.filter(d => d.status === 'open').map(d => d.order_id)
  );

  // 3. Retained by logistics / custody (delivered < 48 hours, in-transit, or open dispute)
  const retainedSuborders = paidSuborders.filter(s => {
    if (s.liquidation_status === 'paid') return false;
    const isDelivered = s.shipping_status === 'delivered';
    const isMatured = isDelivered && s.delivered_at && new Date(s.delivered_at) <= custodyThreshold;
    const hasDispute = openDisputeOrderIds.has(s.parent_order_id);
    return !isMatured || hasDispute;
  });

  // 4. Truly eligible for liquidation batch (delivered >= 48h, paid, no disputes, pending)
  const eligibleSuborders = paidSuborders.filter(s => {
    if (s.liquidation_status === 'paid') return false;
    const isDelivered = s.shipping_status === 'delivered';
    const isMatured = isDelivered && s.delivered_at && new Date(s.delivered_at) <= custodyThreshold;
    const hasDispute = openDisputeOrderIds.has(s.parent_order_id);
    return isMatured && !hasDispute;
  });

  const totals = {
    registeredGross: allSuborders.reduce((sum, s) => sum + Number(s.product_subtotal || 0) + Number(s.shipping_cost || 0), 0),
    paidGross: paidSuborders.reduce((sum, s) => sum + Number(s.product_subtotal || 0) + Number(s.shipping_cost || 0), 0),
    fees: paidSuborders.reduce((sum, s) => sum + Number(s.marketplace_fee || 0), 0),
    gateway: paidSuborders.reduce((sum, s) => sum + Number(s.payment_fee_share || 0), 0),
    shipping: paidSuborders.reduce((sum, s) => sum + Number(s.shipping_cost || 0), 0),
    net: paidSuborders.reduce((sum, s) => sum + Number(s.vendor_net_amount || 0), 0),
    retained: retainedSuborders.reduce((sum, s) => sum + Number(s.vendor_net_amount || 0), 0),
    eligible: eligibleSuborders.reduce((sum, s) => sum + Number(s.vendor_net_amount || 0), 0),
    paid: suborders
      .filter(s => s.liquidation_status === 'paid')
      .reduce((sum, s) => sum + Number(s.vendor_net_amount || 0), 0)
  };

  const nextPayoutDate = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() + (day <= 3 ? 3 - day : 10 - day); // next Wednesday
    const nextWed = new Date(d.setDate(diff));
    return nextWed.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'short' });
  };

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
                  <th className="p-8">Liquidación ID</th>
                  <th className="p-8">Período</th>
                  <th className="p-8 text-right">Venta Bruta</th>
                  <th className="p-8 text-right">Comisiones Retenidas</th>
                  <th className="p-8 text-right">Gastos Pasarela</th>
                  <th className="p-8 text-right font-black text-gray-900">Neto Final</th>
                  <th className="p-8">Estado de Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {liquidations.map(liq => (
                  <tr key={liq.id} className="hover:bg-gray-50 group transition-colors text-sm">
                    <td className="p-8 font-mono font-bold text-gray-500">{liq.id.substring(0, 8).toUpperCase()}</td>
                    <td className="p-8">
                       <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">
                         {new Date(liq.period_start).toLocaleDateString('es')} - {new Date(liq.period_end).toLocaleDateString('es')}
                       </p>
                       {liq.paid_at && (
                         <p className="text-[9px] text-gray-400 font-black uppercase mt-1.5">Pagado: {new Date(liq.paid_at).toLocaleDateString('es')}</p>
                       )}
                    </td>
                    <td className="p-8 text-right font-black text-gray-500 text-[15px]">${(Number(liq.gross_sales) + Number(liq.shipping_collected)).toLocaleString('es-UY', { minimumFractionDigits: 2 })}</td>
                    <td className="p-8 text-right font-black text-red-500 text-[15px]">-${Number(liq.marketplace_fees).toLocaleString('es-UY', { minimumFractionDigits: 2 })}</td>
                    <td className="p-8 text-right font-black text-red-500 text-[15px]">-${Number(liq.payment_fees).toLocaleString('es-UY', { minimumFractionDigits: 2 })}</td>
                    <td className="p-8 text-right font-black text-gray-900 text-[17px] bg-white/[0.01] group-hover:bg-gray-50 transition-colors tracking-tighter">${Number(liq.net_amount).toLocaleString('es-UY', { minimumFractionDigits: 2 })}</td>
                    <td className="p-8">
                       <span className={`badge px-4 py-2 font-bold rounded-full text-xs uppercase ${
                         liq.status === 'paid' ? 'text-emerald-500 bg-emerald-500/10' : 'text-yellow-600 bg-yellow-500/10'
                       }`}>
                          {liq.status === 'paid' ? 'Transferido' : 'Pendiente'}
                       </span>
                       {liq.payment_reference && (
                         <span className="block text-[10px] text-slate-400 mt-1 font-mono">Ref: {liq.payment_reference}</span>
                       )}
                    </td>
                  </tr>
                ))}
                {liquidations.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No hay liquidaciones registradas.</td></tr>
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
                 <p className="text-lg font-black text-gray-900 uppercase tracking-widest">Semanal (Miércoles)</p>
              </div>
              <div className="lg:flex lg:items-center lg:justify-end">
                 <button className="text-[11px] font-black text-primary-600 uppercase tracking-[0.3em] hover:underline hover:translate-x-2 transition-all flex items-center gap-3">Update Payment Method <ArrowRight className="w-4 h-4" /></button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animation-fade-in pb-20">
      <div>
         <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Financial Engine</div>
         <h2 className="text-5xl font-black text-gray-900">Balances & Rendimiento</h2>
         <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">Análisis de ingresos netos y estructuras de costos</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ventas Confirmadas" value={`$${totals.paidGross.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} color="emerald" />
        <StatCard label="Comisión Collectibles" value={`$${totals.fees.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={ArrowDownCircle} color="red" />
        <StatCard label="Costo Pasarela" value={`$${totals.gateway.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={ShieldAlert} color="red" />
        <StatCard label="Neto Confirmado" value={`$${totals.net.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color="green" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="soft rounded-[2.5rem] p-8 hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-amber-500" />
            <p className="text-[11px] text-amber-600 font-black uppercase tracking-[0.3em]">Saldo Retenido en Custodia</p>
          </div>
          <p className="text-4xl font-black text-gray-900 tracking-tighter">${totals.retained.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 block">En tránsito / plazo 48h pos-entrega</span>
        </div>

        <div className="soft rounded-[2.5rem] p-8 hover:bg-gray-50 transition-all border border-primary-100 bg-primary-50/20 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary-600" />
            <p className="text-[11px] text-primary-600 font-black uppercase tracking-[0.3em]">Saldo Elegible a Liquidar</p>
          </div>
          <p className="text-4xl font-black text-primary-700 tracking-tighter">${totals.eligible.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 block">Próximo corte: {nextPayoutDate()}</span>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-emerald-500/30 p-8 bg-emerald-50/20 relative overflow-hidden group shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-[11px] text-emerald-600 font-black uppercase tracking-[0.3em]">Liquidaciones Pagadas</p>
          </div>
          <p className="text-4xl font-black text-emerald-600 tracking-tighter">${totals.paid.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</p>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 block">Transferencias acreditadas</span>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
           <div>
              <h3 className="text-[11px] font-black text-primary-600 uppercase tracking-[0.4em] mb-1">Transaction Stream</h3>
              <h4 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Detalle Financiero por Pedido</h4>
           </div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.01] border-b border-gray-100">
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                <th className="p-8">Fecha</th>
                <th className="p-8">Suborden</th>
                <th className="p-8 text-right">Venta Bruta</th>
                <th className="p-8 text-right">Comisión Plataforma</th>
                <th className="p-8 text-right">Costo Pago</th>
                <th className="p-8 text-right font-black text-gray-900">Flujo Neto</th>
                <th className="p-8">Estado Envío</th>
                <th className="p-8">Estado Liquidación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {suborders.map(s => {
                const date = s.created_at ? new Date(s.created_at).toLocaleDateString('es-UY') : '-';
                const client = s.orders?.customer_name || s.orders?.customer_email || 'Cliente';
                const gross = Number(s.product_subtotal) + Number(s.shipping_cost);

                return (
                  <tr key={s.id} className="hover:bg-gray-50 group transition-colors">
                    <td className="p-8 text-gray-500 text-[11px] font-black uppercase tracking-widest">{date}</td>
                    <td className="p-8 font-black text-gray-900 text-[15px] group-hover:text-primary-600 transition-colors uppercase">
                      {s.suborder_number}
                      <span className="block text-[10px] text-gray-400 font-normal normal-case mt-0.5">{client}</span>
                    </td>
                    <td className="p-8 text-right font-bold text-gray-900">${gross.toFixed(2)}</td>
                    <td className="p-8 text-right font-bold text-red-500">-${Number(s.marketplace_fee).toFixed(2)}</td>
                    <td className="p-8 text-right font-bold text-red-500">-${Number(s.payment_fee_share).toFixed(2)}</td>
                    <td className="p-8 text-right font-black text-emerald-500 text-[17px] bg-white/[0.01] group-hover:bg-emerald-500/5 transition-colors tracking-tighter">+${Number(s.vendor_net_amount).toFixed(2)}</td>
                    <td className="p-8">
                       <span className={`inline-flex items-center border px-3 py-1 rounded-full text-xs font-bold uppercase ${
                         suborderStatusMap[s.status]?.c || 'border-gray-200 text-gray-600 bg-gray-50'
                       }`}>
                          {suborderStatusMap[s.status]?.l || s.status}
                       </span>
                    </td>
                    <td className="p-8">
                       <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase ${
                         liqStatusMap[s.liquidation_status]?.c || 'text-gray-400 bg-gray-100'
                       }`}>
                          {liqStatusMap[s.liquidation_status]?.l || s.liquidation_status}
                       </span>
                    </td>
                  </tr>
                );
              })}
              {suborders.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No hay subórdenes registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refunds and Devolutions section */}
      <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
           <div>
              <h3 className="text-[11px] text-red-500 font-black uppercase tracking-[0.4em] mb-1">Refund & Dispute Log</h3>
              <h4 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Reembolsos y Contracargos (Solo Lectura)</h4>
           </div>
        </div>
        
        {/* Refunds List */}
        <div className="p-8 border-b border-gray-100">
          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Reembolsos de Pasarela</h5>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="border-b border-gray-100">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                  <th className="pb-4">Fecha</th>
                  <th className="pb-4">Pedido / Suborden</th>
                  <th className="pb-4 text-right">Importe Devuelto</th>
                  <th className="pb-4">Estado</th>
                  <th className="pb-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {refunds.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 text-gray-500 text-[11px] font-black uppercase tracking-widest">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('es-UY') : '-'}
                    </td>
                    <td className="py-4 font-black text-gray-900 text-[15px] uppercase">
                      {r.order?.order_number || 'Pedido General'}
                      {r.suborder?.suborder_number && (
                        <span className="block text-[10px] text-gray-400 font-normal mt-0.5">Suborden: {r.suborder.suborder_number}</span>
                      )}
                    </td>
                    <td className="py-4 text-right font-black text-red-500 text-[17px] tracking-tighter">
                      -${Number(r.amount).toFixed(2)}
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.status === 'completed' ? 'text-green-600 bg-green-500/10' :
                        r.status === 'pending' ? 'text-yellow-600 bg-yellow-500/10' :
                        'text-red-500 bg-red-500/10'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-4 text-gray-600 max-w-xs truncate" title={r.reason}>
                      {r.reason || 'Sin motivo registrado'}
                    </td>
                  </tr>
                ))}
                {refunds.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-400">No hay reembolsos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disputes List */}
        <div className="p-8 bg-red-50/10">
          <h5 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4">Contracargos y Disputas</h5>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="border-b border-red-100">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                  <th className="pb-4">Fecha</th>
                  <th className="pb-4">Pedido / Suborden</th>
                  <th className="pb-4 text-right">Importe en Disputa</th>
                  <th className="pb-4">Estado</th>
                  <th className="pb-4">Motivo / Disputa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {disputes.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 text-gray-500 text-[11px] font-black uppercase tracking-widest">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString('es-UY') : '-'}
                    </td>
                    <td className="py-4 font-black text-gray-900 text-[15px] uppercase">
                      {d.order?.order_number || 'Pedido General'}
                      {d.suborder?.suborder_number && (
                        <span className="block text-[10px] text-gray-400 font-normal mt-0.5">Suborden: {d.suborder.suborder_number}</span>
                      )}
                    </td>
                    <td className="py-4 text-right font-black text-red-600 text-[17px] tracking-tighter">
                      -${Number(d.amount).toFixed(2)}
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        d.status === 'open' ? 'text-red-600 bg-red-500/10 animate-pulse' :
                        d.status === 'won' ? 'text-green-600 bg-green-500/10' :
                        'text-gray-500 bg-gray-500/10'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-4 text-gray-600 max-w-xs truncate" title={d.dispute_reason}>
                      {d.dispute_reason || 'Sin motivo registrado'}
                    </td>
                  </tr>
                ))}
                {disputes.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-400">No hay disputas registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
        <span className="text-2xl font-black text-gray-900 group-hover:text-primary-600 transition-colors">{value}</span>
      </div>
      <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
}
