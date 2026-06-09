import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CreditCard, FileText, ArrowUpRight, CheckCircle, Clock, XCircle, Download, Landmark, Eye, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminFinances() {
  const [activeTab, setActiveTab] = useState<'liquidations' | 'invoices' | 'legacy_payouts'>('liquidations');
  const [subTab, setSubTab] = useState<'pending' | 'batches'>('pending');
  const [liquidations, setLiquidations] = useState<any[]>([]);
  const [pendingSuborders, setPendingSuborders] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [legacyPayouts, setLegacyPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [payingLiqId, setPayingLiqId] = useState<string | null>(null);
  const [payReference, setPayReference] = useState('');
  const [expandedLiqId, setExpandedLiqId] = useState<string | null>(null);
  const [liqDetails, setLiqDetails] = useState<Record<string, any[]>>({});

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchMarketplaceData();
    fetchLegacyPayouts();
  }, []);

  const fetchLegacyPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_payouts')
        .select(`
          id, amount, status, requested_at, paid_at, receipt_url,
          vendors ( store_name )
        `)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setLegacyPayouts(data || []);
    } catch (err) {
      console.error('Error fetching legacy payouts', err);
    }
  };

  const fetchMarketplaceData = async () => {
    setLoading(true);
    try {
      // 1. Fetch vendor liquidations
      const { data: liqData, error: liqError } = await supabase
        .from('vendor_liquidations')
        .select(`
          *,
          vendors!vendor_id ( store_name )
        `)
        .order('created_at', { ascending: false });

      if (liqError) throw liqError;
      setLiquidations(liqData || []);

      // 2. Fetch pending suborders (liquidation_status = 'pending')
      const { data: subordersData, error: subError } = await supabase
        .from('order_suborders')
        .select(`
          *,
          orders!parent_order_id (
            order_number,
            payment_status,
            status,
            created_at
          ),
          vendors!vendor_id (
            store_name
          )
        `)
        .eq('is_collectibles_order', false)
        .eq('liquidation_status', 'pending');

      if (subError) throw subError;
      setPendingSuborders(subordersData || []);

      // 3. Fetch open disputes to block matching suborders
      const { data: disputesData } = await supabase
        .from('order_disputes')
        .select('order_id, vendor_id')
        .eq('status', 'open');

      setDisputes(disputesData || []);
    } catch (err) {
      console.error('Error fetching marketplace financial data:', err);
      toast.error('Error al cargar datos financieros.');
    } finally {
      setLoading(false);
    }
  };

  const approveLegacyPayout = async (id: string) => {
    if (!(await confirm('¿Aprobar este pago legacy y marcar como enviado?'))) return;
    try {
      const { error } = await supabase
        .from('vendor_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fetchLegacyPayouts();
      toast.success('Pago legacy aprobado con éxito');
    } catch (err) {
      console.error(err);
      toast.error('Error al aprobar el pago legacy');
    }
  };

  const handleGenerateLiquidations = async () => {
    if (eligibleSuborders.length === 0) {
      toast.error('No hay subórdenes elegibles para liquidar.');
      return;
    }

    const confirmMsg = `¿Está seguro de generar las liquidaciones para las ${eligibleSuborders.length} subórdenes elegibles? Esto agrupará los saldos por vendedor y creará los registros de liquidación correspondientes.`;
    if (!(await confirm(confirmMsg))) return;

    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado.');

      const { data, error } = await supabase.rpc('generate_vendor_liquidations', {
        p_admin_id: user.id
      });

      if (error) throw error;

      toast.success(`Liquidaciones generadas con éxito: ${data.liquidations_generated} lotes creados (${data.suborders_processed} subórdenes procesadas).`);
      await fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al generar liquidación: ' + (err.message || String(err)));
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkAsPaid = async (liqId: string) => {
    if (!payReference.trim()) {
      toast.error('Debe ingresar una referencia de transferencia bancaria.');
      return;
    }

    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado.');

      const { error } = await supabase.rpc('mark_liquidation_as_paid', {
        p_admin_id: user.id,
        p_liquidation_id: liqId,
        p_reference: payReference.trim()
      });

      if (error) throw error;

      toast.success('Liquidación marcada como pagada con éxito.');
      setPayingLiqId(null);
      setPayReference('');
      await fetchMarketplaceData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar pago: ' + (err.message || String(err)));
    } finally {
      setGenerating(false);
    }
  };

  const toggleLiquidationDetails = async (liqId: string) => {
    if (expandedLiqId === liqId) {
      setExpandedLiqId(null);
      return;
    }

    if (liqDetails[liqId]) {
      setExpandedLiqId(liqId);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('vendor_liquidation_items')
        .select(`
          *,
          order_suborders!suborder_id (
            suborder_number,
            status,
            delivered_at
          )
        `)
        .eq('liquidation_id', liqId);

      if (error) throw error;
      setLiqDetails(prev => ({ ...prev, [liqId]: data || [] }));
      setExpandedLiqId(liqId);
    } catch (err) {
      console.error('Error loading liquidation items:', err);
      toast.error('Error al cargar los detalles del lote.');
    }
  };

  const getNextWednesday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() + (day <= 3 ? 3 - day : 10 - day); // next wednesday
    const nextWed = new Date(d.setDate(diff));
    return nextWed.toLocaleDateString('es-UY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Classify pending suborders
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const classifiedSuborders = pendingSuborders.map(sub => {
    const isPaid = sub.orders?.payment_status === 'approved' || sub.orders?.status === 'paid';
    const isDelivered = sub.status === 'delivered';
    const isPast48h = sub.delivered_at ? new Date(sub.delivered_at) <= fortyEightHoursAgo : false;
    const hasDispute = disputes.some(d => d.order_id === sub.parent_order_id && d.vendor_id === sub.vendor_id);
    
    const isEligible = isPaid && isDelivered && isPast48h && !hasDispute;

    let blockReason = '';
    if (!isPaid) blockReason = 'Pago no acreditado';
    else if (!isDelivered) blockReason = 'No entregado';
    else if (!isPast48h) blockReason = 'Menos de 48h desde entrega';
    else if (hasDispute) blockReason = 'Reclamo abierto';

    return {
      ...sub,
      isEligible,
      blockReason
    };
  });

  const eligibleSuborders = classifiedSuborders.filter(s => s.isEligible);
  const blockedSuborders = classifiedSuborders.filter(s => !s.isEligible);

  // Totals calculations
  const totalEligibleGross = eligibleSuborders.reduce((sum, s) => sum + Number(s.product_subtotal) + Number(s.shipping_cost), 0);
  const totalEligibleNet = eligibleSuborders.reduce((sum, s) => sum + Number(s.vendor_net_amount), 0);
  const totalEligibleCommission = eligibleSuborders.reduce((sum, s) => sum + Number(s.marketplace_fee), 0);
  const totalEligibleGateway = eligibleSuborders.reduce((sum, s) => sum + Number(s.payment_fee_share), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 font-sans">Finanzas y Facturación</h2>
          <p className="text-gray-500 mt-1">Control de pagos a vendedores, afiliados y facturación de la plataforma.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('liquidations')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'liquidations' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Liquidaciones Marketplace
          </div>
        </button>
        <button
          onClick={() => setActiveTab('legacy_payouts')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'legacy_payouts' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Payouts (Legacy)
          </div>
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'invoices' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Facturación AFIP
          </div>
        </button>
      </div>

      {activeTab === 'liquidations' && (
        <div className="space-y-6">
          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Landmark className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">A Liquidar el Miércoles</p>
                <h3 className="text-xl font-bold text-gray-900 mt-1">${totalEligibleNet.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{eligibleSuborders.length} subórdenes listas</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Comisión Ganada</p>
                <h3 className="text-xl font-bold text-gray-900 mt-1">${totalEligibleCommission.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Retenido de ventas</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Costos de Pasarela</p>
                <h3 className="text-xl font-bold text-gray-900 mt-1">${totalEligibleGateway.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                <p className="text-xs text-gray-400 mt-0.5">A descontar proporcionalmente</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Próximo Miércoles</p>
                <h3 className="text-sm font-black text-gray-900 mt-2">{getNextWednesday()}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Fecha programada</p>
              </div>
            </div>
          </div>

          {/* Sub-tabs and Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-2">
            <div className="flex gap-2">
              <button
                onClick={() => setSubTab('pending')}
                className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors ${
                  subTab === 'pending' ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Subórdenes Pendientes ({classifiedSuborders.length})
              </button>
              <button
                onClick={() => setSubTab('batches')}
                className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors ${
                  subTab === 'batches' ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Lotes de Liquidación ({liquidations.length})
              </button>
            </div>

            {subTab === 'pending' && eligibleSuborders.length > 0 && (
              <button
                onClick={handleGenerateLiquidations}
                disabled={generating}
                className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors text-sm"
              >
                {generating ? 'Generando...' : 'Generar Liquidación de la Semana'}
              </button>
            )}
          </div>

          {/* Tab contents */}
          {subTab === 'pending' ? (
            <div className="space-y-6">
              {/* Classified Tables */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-sm">Subórdenes Elegibles para Liquidar</h4>
                  <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">{eligibleSuborders.length} listas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Suborden</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venta Bruta</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comisión</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gateway share</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Neto Vendor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entregado el</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {eligibleSuborders.length === 0 ? (
                        <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-400">No hay subórdenes elegibles actualmente.</td></tr>
                      ) : (
                        eligibleSuborders.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-bold text-gray-900">{sub.suborder_number}</td>
                            <td className="px-6 py-4 text-gray-700">{sub.vendors?.store_name || sub.vendor_name}</td>
                            <td className="px-6 py-4 text-gray-900">${(Number(sub.product_subtotal) + Number(sub.shipping_cost)).toFixed(2)}</td>
                            <td className="px-6 py-4 text-red-600">-${Number(sub.marketplace_fee).toFixed(2)}</td>
                            <td className="px-6 py-4 text-red-600">-${Number(sub.payment_fee_share).toFixed(2)}</td>
                            <td className="px-6 py-4 text-green-700 font-bold">${Number(sub.vendor_net_amount).toFixed(2)}</td>
                            <td className="px-6 py-4 text-gray-500 text-xs">{sub.delivered_at ? new Date(sub.delivered_at).toLocaleString('es-UY') : '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-sm">Subórdenes Bloqueadas o Pendientes de Entrega</h4>
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{blockedSuborders.length} bloqueadas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Suborden</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto Neto</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado Envío</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo de Bloqueo</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {blockedSuborders.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-400">No hay subórdenes bloqueadas.</td></tr>
                      ) : (
                        blockedSuborders.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-bold text-gray-900">{sub.suborder_number}</td>
                            <td className="px-6 py-4 text-gray-700">{sub.vendors?.store_name || sub.vendor_name}</td>
                            <td className="px-6 py-4 text-gray-950">${Number(sub.vendor_net_amount).toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                sub.status === 'delivered' ? 'bg-green-50 text-green-700' :
                                sub.status === 'shipped' ? 'bg-blue-50 text-blue-700' :
                                'bg-gray-50 text-gray-600'
                              }`}>
                                {sub.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {sub.blockReason}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Batches / Generated Liquidations */
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3"></th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lote ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venta Bruta</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comisiones</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descuento Pasarela</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto Neto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {liquidations.length === 0 ? (
                      <tr><td colSpan={9} className="px-6 py-4 text-center text-gray-400">No se han generado lotes de liquidación.</td></tr>
                    ) : (
                      liquidations.map((liq) => {
                        const isExpanded = expandedLiqId === liq.id;
                        const itemsList = liqDetails[liq.id] || [];

                        return (
                          <div key={liq.id} className="contents">
                            <tr className="hover:bg-slate-50/50">
                              <td className="px-6 py-4 text-center">
                                <button onClick={() => toggleLiquidationDetails(liq.id)} className="text-gray-500 hover:text-gray-700">
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="px-6 py-4 font-mono text-xs text-gray-500">{liq.id.substring(0, 8)}...</td>
                              <td className="px-6 py-4 font-bold text-gray-900">{liq.vendors?.store_name}</td>
                              <td className="px-6 py-4 text-gray-900">${(Number(liq.gross_sales) + Number(liq.shipping_collected)).toFixed(2)}</td>
                              <td className="px-6 py-4 text-red-600">-${Number(liq.marketplace_fees).toFixed(2)}</td>
                              <td className="px-6 py-4 text-red-600">-${Number(liq.payment_fees).toFixed(2)}</td>
                              <td className="px-6 py-4 text-green-700 font-black">${Number(liq.net_amount).toFixed(2)}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  liq.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {liq.status === 'paid' ? 'Pagado' : 'Pendiente pago'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-bold">
                                {liq.status !== 'paid' && payingLiqId !== liq.id && (
                                  <button
                                    onClick={() => setPayingLiqId(liq.id)}
                                    className="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded transition-colors"
                                  >
                                    Registrar Pago
                                  </button>
                                )}
                                {payingLiqId === liq.id && (
                                  <div className="flex items-center gap-2 justify-end">
                                    <input
                                      type="text"
                                      placeholder="Ref Transferencia"
                                      className="form-input text-xs py-1 px-2 border rounded"
                                      value={payReference}
                                      onChange={e => setPayReference(e.target.value)}
                                    />
                                    <button
                                      onClick={() => handleMarkAsPaid(liq.id)}
                                      disabled={generating}
                                      className="bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded text-xs"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => { setPayingLiqId(null); setPayReference(''); }}
                                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
                                {liq.status === 'paid' && (
                                  <div className="text-right">
                                    <span className="text-[10px] text-gray-500 block">Ref: {liq.payment_reference}</span>
                                    <span className="text-[9px] text-gray-400 block">{liq.paid_at ? new Date(liq.paid_at).toLocaleDateString() : ''}</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} className="bg-slate-50 px-8 py-4">
                                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-w-4xl">
                                    <div className="px-4 py-2 bg-slate-100 font-bold text-xs text-slate-700">Subórdenes incluidas en este lote</div>
                                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                                      <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                          <th className="px-4 py-2 text-left">Suborden</th>
                                          <th className="px-4 py-2 text-left">Venta Bruta</th>
                                          <th className="px-4 py-2 text-left">Comisión</th>
                                          <th className="px-4 py-2 text-left">Costo Gateway</th>
                                          <th className="px-4 py-2 text-left">Neto</th>
                                          <th className="px-4 py-2 text-left">Entregada</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {itemsList.length === 0 ? (
                                          <tr><td colSpan={6} className="px-4 py-2 text-center text-slate-400">Cargando subórdenes...</td></tr>
                                        ) : (
                                          itemsList.map((item) => (
                                            <tr key={item.id}>
                                              <td className="px-4 py-2 font-bold">{item.order_suborders?.suborder_number}</td>
                                              <td className="px-4 py-2">${(Number(item.product_subtotal) + Number(item.shipping_amount)).toFixed(2)}</td>
                                              <td className="px-4 py-2 text-red-600">-${Number(item.marketplace_fee).toFixed(2)}</td>
                                              <td className="px-4 py-2 text-red-600">-${Number(item.payment_fee_share).toFixed(2)}</td>
                                              <td className="px-4 py-2 font-bold text-green-700">${Number(item.net_amount).toFixed(2)}</td>
                                              <td className="px-4 py-2 text-slate-500">{item.order_suborders?.delivered_at ? new Date(item.order_suborders.delivered_at).toLocaleDateString() : '-'}</td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </div>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'legacy_payouts' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-slate-50">
            <h3 className="font-bold text-gray-800 text-sm">Historial de Payouts Legacy (Retiros Solicitados Manualmente)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendedor / Tienda</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Solicitado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Solicitud</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {legacyPayouts.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No hay retiros solicitados.</td></tr>
                ) : (
                  legacyPayouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-gray-50 text-sm">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{payout.vendors?.store_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-gray-900 font-bold">${payout.amount}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          payout.status === 'paid' ? 'bg-green-100 text-green-800' :
                          payout.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {payout.status === 'paid' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {payout.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {payout.status === 'paid' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {payout.requested_at ? new Date(payout.requested_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                        {payout.status === 'pending' && (
                          <button
                            onClick={() => approveLegacyPayout(payout.id)}
                            className="text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg transition-colors"
                          >
                            Aprobar Pago
                          </button>
                        )}
                        {payout.status === 'paid' && payout.receipt_url && (
                          <a href={payout.receipt_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:text-primary-800 flex items-center justify-end gap-1">
                            <Download className="w-4 h-4" /> Comprobante
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Módulo de Facturación Electrónica</h3>
          <p className="max-w-md mx-auto">La integración con AFIP está pendiente de configuración de claves fiscales (API de facturación). Las ventas se registrarán aquí automáticamente.</p>
        </div>
      )}
    </div>
  );
}
