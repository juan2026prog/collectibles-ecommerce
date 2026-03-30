import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CreditCard, FileText, ArrowUpRight, CheckCircle, Clock, XCircle, Download } from 'lucide-react';

export default function AdminFinances() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'payouts'>('payouts');
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayouts();
  }, []);

  const fetchPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_payouts')
        .select(`
          id, amount, status, requested_at, paid_at, receipt_url,
          vendors ( store_name )
        `)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setPayouts(data || []);
    } catch (err) {
      console.error('Error fetching payouts', err);
    } finally {
      setLoading(false);
    }
  };

  const approvePayout = async (id: string) => {
    try {
      const { error } = await supabase
        .from('vendor_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fetchPayouts();
    } catch (err) {
      console.error(err);
      alert('Error al aprobar el pago');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Finanzas y Facturación</h2>
          <p className="text-gray-500 mt-1">Control de pagos a vendedores, afiliados y facturación de la plataforma.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('payouts')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'payouts' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Liquidaciones (Payouts)
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

      {activeTab === 'payouts' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">Cargando...</td></tr>
                ) : payouts.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No hay retiros solicitados.</td></tr>
                ) : (
                  payouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-gray-50">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {payout.requested_at ? new Date(payout.requested_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {payout.status === 'pending' && (
                          <button
                            onClick={() => approvePayout(payout.id)}
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
