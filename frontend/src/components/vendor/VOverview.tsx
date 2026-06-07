import { ShoppingCart, Package, DollarSign, Clock, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';

interface Props { onChangeTab: (t: string) => void; }

// Mock data for demo
const mock = {
  salesMonth: 152300, 
  orders: 38,
  activeProducts: 524, 
  pendingBalance: 24500,
  paidBalance: 45600,
  commission: 10,
  nextSettlement: '13/06/2026',
  urgentOrders: [
    { id: 'ORD-4821', client: 'María López', items: 2, total: 4500, status: 'new', date: '06/06/2026' },
    { id: 'ORD-4819', client: 'Carlos Ruiz', items: 1, total: 1890, status: 'prep', date: '06/06/2026' },
    { id: 'ORD-4817', client: 'Ana García', items: 3, total: 7200, status: 'new', date: '05/06/2026' },
  ],
  lowStockProducts: [
    { id: 'PROD-01', name: 'Funko Pop Marvel', stock: 2, price: 1200 },
    { id: 'PROD-02', name: 'Remera Oversize', stock: 0, price: 800 },
    { id: 'PROD-03', name: 'Figura Neca', stock: 1, price: 3500 },
  ],
};

export default function VOverview({ onChangeTab }: Props) {
  const kpis = [
    { label: 'Ventas', val: `$${mock.salesMonth.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pedidos', val: mock.orders, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Productos', val: mock.activeProducts, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Pendiente', val: `$${mock.pendingBalance.toLocaleString()}`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="max-w-7xl space-y-6 pb-10">
      
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${k.bg} ${k.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                 <p className="text-sm font-medium text-gray-500">{k.label}</p>
                 <p className="text-2xl font-bold text-gray-900">{k.val}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column: Pedidos */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-900">Pedidos Recientes</h3>
              <button onClick={() => onChangeTab('orders')} className="text-sm font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                Ver todos <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pedido</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mock.urgentOrders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{o.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{o.client}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${o.total.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${o.status === 'new' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {o.status === 'new' ? 'Nuevo' : 'Preparar'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Productos bajo stock */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-900">Atención de Stock</h3>
              <button onClick={() => onChangeTab('products')} className="text-sm font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                Ir a Productos <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-200">
              {mock.lowStockProducts.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 inline-flex text-xs font-semibold rounded-md ${p.stock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {p.stock === 0 ? 'Sin stock' : `Queda ${p.stock}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Column: Finanzas */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-900">Resumen Financiero</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Saldo Pendiente</p>
                <p className="text-3xl font-black text-gray-900">${mock.pendingBalance.toLocaleString()}</p>
              </div>
              <div className="h-px bg-gray-100 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pagado</p>
                  <p className="text-lg font-bold text-emerald-600">${mock.paidBalance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Comisión</p>
                  <p className="text-lg font-bold text-gray-900">{mock.commission}%</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary-500" />
                <div>
                  <p className="text-xs text-gray-500 font-medium">Próxima Liquidación</p>
                  <p className="text-sm font-bold text-gray-900">{mock.nextSettlement}</p>
                </div>
              </div>
              <button onClick={() => onChangeTab('finances')} className="w-full py-2.5 bg-gray-100 text-gray-700 font-bold text-sm rounded-lg hover:bg-gray-200 transition-colors">
                Ir a Finanzas
              </button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
