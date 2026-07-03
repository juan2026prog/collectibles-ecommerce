import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import { 
  RefreshCw, Search, ChevronLeft, ChevronRight, X, User, DollarSign, 
  Calendar, Tag, AlertCircle, FileText, CheckCircle, Clock, Trash2, 
  ShieldAlert, ShieldCheck, HelpCircle, ArrowRightLeft, Sparkles, Filter
} from 'lucide-react';

export default function AdminRefunds() {
  const { toast } = useToast();
  const { confirm, prompt } = useConfirmModal();

  // Tabs: 'refunds' | 'disputes' | 'adjustments'
  const [activeTab, setActiveTab] = useState<'refunds' | 'disputes' | 'adjustments'>('refunds');

  // Loading states
  const [loading, setLoading] = useState(true);

  // Data lists
  const [refunds, setRefunds] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const pageSize = 20;

  // Modals state
  const [selectedApiResponse, setSelectedApiResponse] = useState<any>(null);
  const [isNewRefundModalOpen, setIsNewRefundModalOpen] = useState(false);
  const [isNewDisputeModalOpen, setIsNewDisputeModalOpen] = useState(false);

  // New refund form state
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [searchedOrder, setSearchedOrder] = useState<any>(null);
  const [searchingOrder, setSearchingOrder] = useState(false);
  const [selectedSuborderId, setSelectedSuborderId] = useState<string>('');
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [bypassLiquidation, setBypassLiquidation] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // New dispute form state
  const [disputePaymentId, setDisputePaymentId] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeAmount, setDisputeAmount] = useState('');
  const [disputeStatus, setDisputeStatus] = useState('open');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter, providerFilter, searchQuery]);

  useEffect(() => {
    if (activeTab === 'refunds') {
      fetchRefunds();
    } else if (activeTab === 'disputes') {
      fetchDisputes();
    } else {
      fetchAdjustments();
    }
  }, [activeTab, page, statusFilter, providerFilter, searchQuery]);

  // Fetch Refunds
  async function fetchRefunds() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('refunds')
        .select(`
          *,
          order:orders(id, order_number, customer_name, customer_email, total_amount, payment_method, status),
          suborder:order_suborders(id, suborder_number, vendor_name, product_subtotal, shipping_cost, discount_total, liquidation_status),
          vendor:vendors(id, store_name, slug),
          payment:payments(id, transaction_external_id, status)
        `, { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (providerFilter !== 'all') {
        query = query.eq('provider', providerFilter);
      }

      if (searchQuery) {
        // Simple search on reason
        query = query.ilike('reason', `%${searchQuery}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setRefunds(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err: any) {
      console.error('Error fetching refunds:', err);
      toast.error('Error al cargar reembolsos: ' + err.message);
    }
    setLoading(false);
  }

  // Fetch Disputes
  async function fetchDisputes() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('payment_disputes')
        .select(`
          *,
          order:orders(id, order_number, customer_name, customer_email, total_amount),
          suborder:order_suborders(id, suborder_number, vendor_name),
          vendor:vendors(id, store_name, slug),
          payment:payments(id, transaction_external_id, status)
        `, { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (providerFilter !== 'all') {
        query = query.eq('provider', providerFilter);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setDisputes(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err: any) {
      console.error('Error fetching disputes:', err);
      toast.error('Error al cargar contracargos: ' + err.message);
    }
    setLoading(false);
  }

  // Fetch Adjustments
  async function fetchAdjustments() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('vendor_financial_adjustments')
        .select(`
          *,
          vendor:vendors(store_name, slug),
          order:orders(order_number),
          suborder:order_suborders(suborder_number),
          refund:refunds(id, amount)
        `, { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setAdjustments(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err: any) {
      console.error('Error fetching adjustments:', err);
      toast.error('Error al cargar ajustes financieros: ' + err.message);
    }
    setLoading(false);
  }

  // Search Order for Refund Modal
  async function handleSearchOrder() {
    if (!orderSearchTerm.trim()) return;
    setSearchingOrder(true);
    setSearchedOrder(null);
    setSelectedSuborderId('');
    setRefundAmount('');

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          suborders:order_suborders(
            id, suborder_number, vendor_name, vendor_id,
            product_subtotal, shipping_cost, discount_total,
            status, liquidation_status
          )
        `);

      if (orderSearchTerm.length === 36) {
        query = query.eq('id', orderSearchTerm);
      } else {
        query = query.ilike('order_number', `%${orderSearchTerm}%`);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error('Pedido no encontrado.');
      } else {
        setSearchedOrder(data);
        setRefundAmount(data.total_amount.toString());
      }
    } catch (err: any) {
      console.error('Error searching order:', err);
      toast.error('Error al buscar pedido: ' + err.message);
    }
    setSearchingOrder(false);
  }

  // Handle Suborder Change inside Refund Modal
  const handleSuborderChange = (subId: string) => {
    setSelectedSuborderId(subId);
    if (!searchedOrder) return;

    if (!subId) {
      setRefundAmount(searchedOrder.total_amount.toString());
    } else {
      const sub = searchedOrder.suborders.find((s: any) => s.id === subId);
      if (sub) {
        const netCost = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.discount_total || 0);
        setRefundAmount(netCost.toFixed(2));
      }
    }
  };

  // Submit Refund via Edge Function
  async function handleSubmitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!searchedOrder) return;

    setSubmittingRefund(true);
    try {
      const { data, error } = await supabase.functions.invoke('refund-order', {
        body: {
          orderId: searchedOrder.id,
          suborderId: selectedSuborderId || null,
          amount: refundAmount ? Number(refundAmount) : null,
          reason: refundReason,
          bypassLiquidationCheck: bypassLiquidation
        }
      });

      if (error) throw error;

      if (data?.manualRequired) {
        toast.warning('Esta pasarela requiere devolución manual. Se ha registrado la solicitud.');
      } else {
        toast.success('Reembolso procesado exitosamente.');
      }

      setIsNewRefundModalOpen(false);
      resetRefundForm();
      fetchRefunds();
    } catch (err: any) {
      console.error('Error executing refund:', err);
      toast.error('Error al procesar reembolso: ' + err.message);
    }
    setSubmittingRefund(false);
  }

  function resetRefundForm() {
    setOrderSearchTerm('');
    setSearchedOrder(null);
    setSelectedSuborderId('');
    setRefundAmount('');
    setRefundReason('');
    setBypassLiquidation(false);
  }

  // Create Dispute Manually
  async function handleSubmitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!disputePaymentId) return;

    setSubmittingDispute(true);
    try {
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .select('*, order:orders(id, customer_id)')
        .eq('id', disputePaymentId)
        .maybeSingle();

      if (payErr || !payment) {
        throw new Error('Pago no encontrado en la base de datos.');
      }

      const { data: suborders } = await supabase
        .from('order_suborders')
        .select('*')
        .eq('parent_order_id', payment.order_id);

      const firstSuborder = suborders?.[0];

      const { error: dispErr } = await supabase
        .from('payment_disputes')
        .insert({
          provider: payment.provider || 'unknown',
          payment_id: payment.id,
          order_id: payment.order_id,
          suborder_id: firstSuborder?.id || null,
          vendor_id: firstSuborder?.vendor_id || null,
          dispute_reason: disputeReason,
          status: disputeStatus,
          amount: disputeAmount ? Number(disputeAmount) : payment.amount
        });

      if (dispErr) throw dispErr;

      toast.success('Contracargo / Disputa registrado correctamente.');
      setIsNewDisputeModalOpen(false);
      setDisputePaymentId('');
      setDisputeReason('');
      setDisputeAmount('');
      fetchDisputes();
    } catch (err: any) {
      console.error('Error creating dispute:', err);
      toast.error('Error al registrar contracargos: ' + err.message);
    }
    setSubmittingDispute(false);
  }

  // Update Dispute Status
  async function handleUpdateDisputeStatus(disputeId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('payment_disputes')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', disputeId);

      if (error) throw error;
      toast.success(`Disputa actualizada a: ${newStatus}`);
      fetchDisputes();
    } catch (err: any) {
      console.error('Error updating dispute:', err);
      toast.error('Error al actualizar la disputa: ' + err.message);
    }
  }

  // Retry / Confirm Manual Refund
  async function handleResolveManualRefund(refund: any) {
    const providerRefundId = await prompt('Introduce el ID de transacción de reembolso de la pasarela (opcional):', {
      title: 'Confirmar Devolución Manual Realizada',
      placeholder: 'ID de reembolso del portal de pago...'
    });

    if (providerRefundId === null) return;

    try {
      // 1. Update refund status to completed
      const { error: refundErr } = await supabase
        .from('refunds')
        .update({
          status: 'completed',
          provider_refund_id: providerRefundId || 'MANUAL-' + Date.now(),
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', refund.id);

      if (refundErr) throw refundErr;

      // 2. Update payment status to refunded/partially_refunded
      if (refund.payment_id) {
        const { error: payErr } = await supabase
          .from('payments')
          .update({
            status: refund.suborder_id ? 'partially_refunded' : 'refunded',
            provider_refund_id: providerRefundId || 'MANUAL-' + Date.now(),
            refund_amount: refund.amount,
            refund_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', refund.payment_id);

        if (payErr) throw payErr;
      }

      // 3. Update order / suborder status & recalculate parent order status
      if (refund.suborder_id) {
        const { error: subErr } = await supabase
          .from('order_suborders')
          .update({
            status: 'refunded',
            liquidation_status: refund.suborder?.liquidation_status === 'paid' ? 'paid' : 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', refund.suborder_id);

        if (subErr) throw subErr;

        // Check if all suborders are now refunded/cancelled
        const { data: updatedSubs } = await supabase
          .from('order_suborders')
          .select('status')
          .eq('parent_order_id', refund.order_id);

        const allCancelledOrRefunded = updatedSubs && updatedSubs.every((s: any) => s.status === 'cancelled' || s.status === 'refunded');
        const anyCancelledOrRefunded = updatedSubs && updatedSubs.some((s: any) => s.status === 'cancelled' || s.status === 'refunded');

        let nextOrderStatus = refund.order?.status;
        if (allCancelledOrRefunded) {
          nextOrderStatus = 'refunded';
        } else if (anyCancelledOrRefunded) {
          nextOrderStatus = 'partially_refunded';
        }

        await supabase
          .from('orders')
          .update({
            payment_status: allCancelledOrRefunded ? 'refunded' : 'partially_refunded',
            status: nextOrderStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', refund.order_id);

      } else {
        // Full order refunded
        const { error: subErr } = await supabase
          .from('order_suborders')
          .update({
            status: 'refunded',
            liquidation_status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('parent_order_id', refund.order_id);

        if (subErr) throw subErr;

        const { error: ordErr } = await supabase
          .from('orders')
          .update({
            status: 'refunded',
            payment_status: 'refunded',
            updated_at: new Date().toISOString()
          })
          .eq('id', refund.order_id);

        if (ordErr) throw ordErr;
      }

      // 4. Log in payment_audit_logs
      await supabase.from('payment_audit_logs').insert({
        action: 'manual_refund_resolved',
        order_id: refund.order_id,
        suborder_id: refund.suborder_id,
        payment_id: refund.payment_id,
        refund_id: refund.id,
        provider: refund.provider,
        amount: refund.amount,
        api_response: { resolved_manually: true, input_refund_id: providerRefundId }
      });

      toast.success('El reembolso manual ha sido marcado como COMPLETADO.');
      fetchRefunds();
    } catch (err: any) {
      console.error('Error completing manual refund:', err);
      toast.error('Error al resolver reembolso: ' + err.message);
    }
  }

  // Cancel / Reject pending refund request
  async function handleRejectRefund(refundId: string) {
    const ok = await confirm('¿Está seguro de que desea rechazar y cancelar esta solicitud de reembolso?', {
      title: 'Rechazar Solicitud de Reembolso',
      danger: true,
      confirmText: 'Sí, Rechazar',
      cancelText: 'Cancelar'
    });

    if (!ok) return;

    try {
      const { error } = await supabase
        .from('refunds')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', refundId);

      if (error) throw error;

      toast.success('La solicitud de reembolso fue rechazada.');
      fetchRefunds();
    } catch (err: any) {
      console.error('Error rejecting refund:', err);
      toast.error('Error al rechazar reembolso: ' + err.message);
    }
  }

  const totalPages = Math.ceil(totalRecords / pageSize);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-indigo-600 animate-pulse" />
            Protección Financiera y Reembolsos
          </h1>
          <p className="text-gray-500 mt-1">
            Audita contracargos, gestiona devoluciones de las pasarelas, registra ajustes y protege las liquidaciones de vendedores.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsNewRefundModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100 text-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Solicitar Reembolso
          </button>

          <button
            onClick={() => setIsNewDisputeModalOpen(true)}
            className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-4 py-2.5 rounded-xl transition-all text-sm flex items-center gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Registrar Disputa
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6 -mb-px">
          <button
            onClick={() => { setActiveTab('refunds'); setStatusFilter('all'); }}
            className={`pb-4 px-2 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'refunds'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Reembolsos Realizados ({activeTab === 'refunds' ? totalRecords : '...'})
          </button>
          <button
            onClick={() => { setActiveTab('disputes'); setStatusFilter('all'); }}
            className={`pb-4 px-2 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'disputes'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Contracargos y Disputas ({activeTab === 'disputes' ? totalRecords : '...'})
          </button>
          <button
            onClick={() => { setActiveTab('adjustments'); setStatusFilter('all'); }}
            className={`pb-4 px-2 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'adjustments'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Ajustes Financieros ({activeTab === 'adjustments' ? totalRecords : '...'})
          </button>
        </nav>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'refunds' ? "Buscar reembolsos por motivo..." : activeTab === 'disputes' ? "Buscar disputas..." : "Buscar ajustes..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
          />
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 md:w-48 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos los estados</option>
            {activeTab === 'refunds' ? (
              <>
                <option value="pending">Pendiente</option>
                <option value="manual_refund_required">Reembolso Manual Requerido</option>
                <option value="processing">Procesando</option>
                <option value="completed">Completado</option>
                <option value="failed">Fallido</option>
                <option value="rejected">Rechazado</option>
              </>
            ) : activeTab === 'disputes' ? (
              <>
                <option value="open">Abierto (Bloquea Liquidación)</option>
                <option value="won">Ganado</option>
                <option value="lost">Perdido</option>
                <option value="refunded">Reembolsado</option>
              </>
            ) : (
              <>
                <option value="pending">Pendiente de Aplicar</option>
                <option value="applied">Aplicado</option>
                <option value="cancelled">Cancelado</option>
              </>
            )}
          </select>

          {activeTab !== 'adjustments' && (
            <select
              value={providerFilter}
              onChange={e => setProviderFilter(e.target.value)}
              className="flex-1 md:w-48 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todas las pasarelas</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="paypal">PayPal</option>
              <option value="handy">Handy</option>
              <option value="dlocalgo">dLocal Go</option>
              <option value="dlocal">dLocal</option>
            </select>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          {activeTab === 'refunds' ? (
            /* =================== REFUNDS TABLE =================== */
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pedido / Cliente</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Suborden / Vendor</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pasarela</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Importe devuelto</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha & Motivo</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="p-12 text-center text-gray-400 animate-pulse">Cargando reembolsos...</td></tr>
                ) : refunds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center text-gray-400">
                      <RefreshCw className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                      <p className="font-semibold text-gray-600">No se encontraron reembolsos</p>
                      <p className="text-xs text-gray-400 mt-1">Modifica los filtros o solicita un nuevo reembolso.</p>
                    </td>
                  </tr>
                ) : (
                  refunds.map(refund => (
                    <tr key={refund.id} className="hover:bg-gray-50/50 transition-colors text-sm">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{refund.order?.order_number || 'Pedido General'}</div>
                        <div className="text-xs text-gray-500">{refund.order?.customer_name || 'Cliente desconocido'}</div>
                      </td>
                      <td className="px-6 py-4">
                        {refund.suborder ? (
                          <>
                            <div className="font-semibold text-gray-900">{refund.suborder.suborder_number}</div>
                            <div className="text-xs text-gray-500">{refund.suborder.vendor_name}</div>
                          </>
                        ) : (
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Orden Completa</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-bold capitalize">
                          {refund.provider}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-indigo-700">
                        ${Number(refund.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${
                          refund.status === 'completed' ? 'bg-green-100 text-green-800' :
                          refund.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          refund.status === 'manual_refund_required' ? 'bg-orange-100 text-orange-850 animate-pulse border border-orange-250' :
                          refund.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {refund.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-600" />}
                          {refund.status === 'pending' && <Clock className="w-3 h-3 text-amber-500" />}
                          {refund.status === 'manual_refund_required' && <AlertCircle className="w-3 h-3 text-orange-500" />}
                          {refund.status === 'manual_refund_required' ? 'manual refund required' : refund.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="text-xs text-gray-400">{new Date(refund.created_at).toLocaleString('es')}</div>
                        <div className="text-xs text-gray-700 truncate mt-0.5" title={refund.reason}>{refund.reason || 'Sin motivo registrado'}</div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                        {refund.api_response && Object.keys(refund.api_response).length > 0 && (
                          <button
                            onClick={() => setSelectedApiResponse(refund.api_response)}
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100"
                          >
                            API Resp
                          </button>
                        )}
                        {(refund.status === 'pending' || refund.status === 'manual_refund_required') && (
                          <>
                            <button
                              onClick={() => handleResolveManualRefund(refund)}
                              className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
                            >
                              {refund.status === 'manual_refund_required' ? 'Confirmar Devolución Manual' : 'Resolver'}
                            </button>
                            <button
                              onClick={() => handleRejectRefund(refund.id)}
                              className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : activeTab === 'disputes' ? (
            /* =================== DISPUTES TABLE =================== */
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pedido / Cliente</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tienda (Vendor)</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pasarela</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Importe en Disputa</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha & Razón</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="p-12 text-center text-gray-400 animate-pulse">Cargando disputas...</td></tr>
                ) : disputes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center text-gray-400">
                      <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                      <p className="font-semibold text-gray-600">No hay disputas ni contracargos activos</p>
                      <p className="text-xs text-gray-400 mt-1">Las finanzas operan bajo protección normal.</p>
                    </td>
                  </tr>
                ) : (
                  disputes.map(dispute => (
                    <tr key={dispute.id} className="hover:bg-gray-50/50 transition-colors text-sm">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{dispute.order?.order_number}</div>
                        <div className="text-xs text-gray-500">{dispute.order?.customer_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{dispute.vendor?.store_name || 'Desconocido'}</div>
                        <div className="text-xs text-gray-400">{dispute.suborder?.suborder_number || ''}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-bold capitalize">
                          {dispute.provider}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-red-600">
                        ${Number(dispute.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${
                          dispute.status === 'open' ? 'bg-red-100 text-red-800 animate-pulse' :
                          dispute.status === 'won' ? 'bg-green-100 text-green-800' :
                          dispute.status === 'lost' ? 'bg-gray-100 text-gray-800' :
                          'bg-indigo-100 text-indigo-800'
                        }`}>
                          {dispute.status === 'open' && <AlertCircle className="w-3 h-3" />}
                          {dispute.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-400">{new Date(dispute.created_at).toLocaleString('es')}</div>
                        <div className="text-xs text-gray-700 mt-0.5">{dispute.dispute_reason || 'Sin razón'}</div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                        {dispute.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleUpdateDisputeStatus(dispute.id, 'won')}
                              className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
                            >
                              Ganado
                            </button>
                            <button
                              onClick={() => handleUpdateDisputeStatus(dispute.id, 'lost')}
                              className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white"
                            >
                              Perdido
                            </button>
                            <button
                              onClick={() => handleUpdateDisputeStatus(dispute.id, 'refunded')}
                              className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                              Reembolsado
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* =================== ADJUSTMENTS TABLE =================== */
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Ajuste ID</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Vendedor</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pedido / Suborden</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Monto</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha & Razón</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="p-12 text-center text-gray-400 animate-pulse">Cargando ajustes...</td></tr>
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center text-gray-400">
                      <HelpCircle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                      <p className="font-semibold text-gray-600">No hay ajustes financieros registrados</p>
                    </td>
                  </tr>
                ) : (
                  adjustments.map(adj => (
                    <tr key={adj.id} className="hover:bg-gray-50/50 transition-colors text-sm">
                      <td className="px-6 py-4 font-mono font-bold text-gray-500 text-xs">
                        {adj.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        {adj.vendor?.store_name || 'Desconocido'}
                        <div className="text-xs text-gray-500">{adj.vendor?.slug || ''}</div>
                      </td>
                      <td className="px-6 py-4">
                        {adj.order?.order_number && (
                          <div className="font-bold text-gray-900">{adj.order.order_number}</div>
                        )}
                        {adj.suborder?.suborder_number && (
                          <div className="text-xs text-gray-500">Suborden: {adj.suborder.suborder_number}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                          adj.type.includes('credit') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                          {adj.type}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-black ${
                        adj.type.includes('credit') ? 'text-green-600' : 'text-red-700'
                      }`}>
                        {adj.type.includes('credit') ? '+' : '-'}${Number(adj.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${
                          adj.status === 'applied' ? 'bg-green-100 text-green-800' :
                          adj.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {adj.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-400">{new Date(adj.created_at).toLocaleString('es')}</div>
                        <div className="text-xs text-gray-700 mt-0.5">{adj.reason || 'Sin motivo'}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Mostrando <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, totalRecords)}</span> de <span className="font-bold">{totalRecords}</span> registros
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =================== MODAL: NEW REFUND REQUEST =================== */}
      {isNewRefundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-indigo-50/50">
              <div>
                <h3 className="text-lg font-black text-indigo-900 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" style={{ animationDuration: '4s' }} />
                  Solicitar Reembolso (Total o Parcial)
                </h3>
                <p className="text-xs text-indigo-700 mt-1">Comunica con la pasarela original del pedido y recalcula comisiones.</p>
              </div>
              <button onClick={() => { setIsNewRefundModalOpen(false); resetRefundForm(); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRefund} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Order Search */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Buscar Pedido</label>
                  <input
                    type="text"
                    placeholder="Número de pedido (ej: ORDER-1001) o UUID..."
                    value={orderSearchTerm}
                    onChange={e => setOrderSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none bg-gray-50/50 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearchOrder}
                  disabled={searchingOrder}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm self-end transition-colors"
                >
                  {searchingOrder ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {searchedOrder && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Order Overview Panel */}
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold">CLIENTE:</span>
                      <span className="font-bold text-gray-800">{searchedOrder.customer_name} ({searchedOrder.customer_email})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold">MÉTODO DE PAGO:</span>
                      <span className="font-bold text-gray-800 capitalize">{searchedOrder.payment_method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-bold">TOTAL PEDIDO:</span>
                      <span className="font-black text-indigo-700">${searchedOrder.total_amount} {searchedOrder.currency}</span>
                    </div>
                  </div>

                  {/* Gateways manual/automatic helper */}
                  <div className={`p-4 rounded-xl text-xs font-bold border ${
                    ['handy', 'dlocalgo', 'dlocal'].includes(searchedOrder.payment_method)
                      ? 'bg-orange-50 border-orange-200 text-orange-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    {['handy', 'dlocalgo', 'dlocal'].includes(searchedOrder.payment_method) ? (
                      <p>⚠️ Devolución manual requerida para esta pasarela ({searchedOrder.payment_method}). El sistema registrará la solicitud en estado 'manual_refund_required' y no actualizará los estados del pago ni la orden hasta que confirmes la realización manual externa.</p>
                    ) : (
                      <p>⚡ Reembolso automático disponible para esta pasarela ({searchedOrder.payment_method}). El sistema intentará procesarlo de forma programática inmediata.</p>
                    )}
                  </div>

                  {/* Suborder Selection (For Partial Refund support) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Ámbito del Reembolso</label>
                    <select
                      value={selectedSuborderId}
                      onChange={e => handleSuborderChange(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-indigo-500"
                    >
                      <option value="">Reembolso Completo (Toda la Orden)</option>
                      {searchedOrder.suborders?.map((sub: any) => {
                        const totalSub = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.discount_total || 0);
                        return (
                          <option key={sub.id} value={sub.id}>
                            Suborden: {sub.suborder_number} ({sub.vendor_name}) - ${totalSub.toFixed(2)} - Liquidación: {sub.liquidation_status}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Refund Amount Input */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Importe a Reembolsar</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={refundAmount}
                        onChange={e => setRefundAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none font-bold text-gray-800"
                      />
                    </div>
                  </div>

                  {/* Check if liquidation protection requires Special Bypass checkbox */}
                  {(() => {
                    const isPaid = selectedSuborderId 
                      ? searchedOrder.suborders.find((s: any) => s.id === selectedSuborderId)?.liquidation_status === 'paid'
                      : searchedOrder.suborders.some((s: any) => s.liquidation_status === 'paid');

                    if (isPaid) {
                      return (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                          <div className="flex gap-2 text-red-850">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-xs uppercase tracking-wider">Reembolso Post-Liquidación Detectado</p>
                              <p className="text-xs mt-0.5">
                                Esta orden o suborden ya fue liquidada al vendedor. Al autorizar esta acción, se creará un ajuste financiero negativo (`refund_debit`) que descontará el importe en la próxima liquidación de este vendor.
                              </p>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-red-100 hover:bg-red-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={bypassLiquidation}
                              onChange={e => setBypassLiquidation(e.target.checked)}
                              className="w-4 h-4 text-red-650 border-red-300 rounded focus:ring-red-500"
                            />
                            <span className="text-xs font-bold text-red-700">Autorizar Bypass Especial y Registrar Débito al Vendedor</span>
                          </label>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Motivo del Reembolso</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Escriba la razón de la devolución..."
                      value={refundReason}
                      onChange={e => setRefundReason(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-500 outline-none"
                    />
                  </div>

                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 flex gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setIsNewRefundModalOpen(false); resetRefundForm(); }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund || !searchedOrder}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm transition-colors flex justify-center items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingRefund ? 'Procesando...' : 
                   searchedOrder && ['handy', 'dlocalgo', 'dlocal'].includes(searchedOrder.payment_method)
                     ? 'Registrar solicitud de devolución manual'
                     : 'Procesar reembolso ahora'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================== MODAL: NEW DISPUTE / CHARGEBACK =================== */}
      {isNewDisputeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-red-50/50">
              <div>
                <h3 className="text-lg font-black text-red-950 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-red-700" />
                  Registrar Contracargo (Disputa)
                </h3>
                <p className="text-xs text-red-700 mt-1">Registra disputas bancarias o de pasarelas para congelar liquidaciones.</p>
              </div>
              <button onClick={() => setIsNewDisputeModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">UUID de Pago (Payments.id)</label>
                <input
                  type="text"
                  required
                  placeholder="Introduce el UUID del pago..."
                  value={disputePaymentId}
                  onChange={e => setDisputePaymentId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none bg-gray-50/50 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monto en Disputa (Opcional)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Dejar vacío para usar total del pago..."
                    value={disputeAmount}
                    onChange={e => setDisputeAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Estado Inicial</label>
                <select
                  value={disputeStatus}
                  onChange={e => setDisputeStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:border-red-500"
                >
                  <option value="open">Abierto (Congela Liquidación)</option>
                  <option value="won">Ganado</option>
                  <option value="lost">Perdido</option>
                  <option value="refunded">Reembolsado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Motivo / Evidencia</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describa el motivo del contracargo o disputa..."
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-red-500 outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewDisputeModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingDispute}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors flex justify-center items-center gap-2 shadow-lg shadow-red-100 disabled:opacity-50"
                >
                  {submittingDispute ? 'Registrando...' : 'Registrar Disputa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================== MODAL: VIEW API RESPONSE =================== */}
      {selectedApiResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  API Response Details
                </h3>
                <p className="text-xs text-gray-500 mt-1">Respuesta técnica cruda del proveedor del pago.</p>
              </div>
              <button onClick={() => setSelectedApiResponse(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <pre className="bg-gray-950 text-indigo-300 p-5 rounded-2xl overflow-x-auto text-xs font-mono border border-gray-800 shadow-inner max-h-[50vh]">
                {JSON.stringify(selectedApiResponse, null, 2)}
              </pre>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setSelectedApiResponse(null)}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
