import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Package, User, Star, Settings } from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';

export default function CustomerPortal() {
  const { user } = useAuth();
  const { language, currency, setLanguage, setCurrency, formatPrice, t } = useLocale();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      const { data } = await supabase
        .from('orders')
        .select(`
          id, 
          total_amount, 
          currency,
          status, 
          created_at, 
          order_items (
            quantity, 
            unit_price, 
            total_price, 
            products (title, images:product_images(url))
          )
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      setOrders(data || []);
      setLoading(false);
    }
    loadData();
  }, [user]);

  if (loading) return <div className="p-12 text-center text-gray-500">Cargando perfil...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border p-8 mb-8 flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
            <User size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Mi Cuenta</h1>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        {/* Global Settings Configuration for Profiles */}
        <div className="bg-gray-50 border rounded-xl p-6 w-full md:w-auto">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-gray-700">
            <Settings className="w-4 h-4" /> Preferencias 
          </h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Idioma</label>
              <select
                className="bg-white border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                value={language}
                onChange={e => setLanguage(e.target.value as any)}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
               <label className="text-xs uppercase font-bold text-gray-500 block mb-1">Moneda</label>
               <select
                 className="bg-white border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                 value={currency}
                 onChange={e => setCurrency(e.target.value as any)}
               >
                 <option value="UYU">UYU - Pesos Uruguayos</option>
                 <option value="USD">USD - Dólar (US)</option>
                 <option value="ARS">ARS - Pesos Argentinos</option>
               </select>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Package className="text-primary-600" /> Mis Pedidos</h2>
        {orders.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-xl text-center text-gray-500 border border-dashed">
            Aún no has realizado ninguna compra.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b">
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">PEDIDO REALIZADO</p>
                    <p className="font-medium">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider text-right">TOTAL</p>
                    <p className="font-bold text-lg text-primary-600">{formatPrice(order.total_amount)}</p>
                  </div>
                  <div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${
                      ['paid', 'delivered'].includes(order.status) ? 'bg-green-100 text-green-700' : 
                      order.status === 'shipped' ? 'bg-blue-100 text-blue-700' : 
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {order.status === 'pending' && 'Pendiente de Pago'}
                      {order.status === 'paid' && 'Pago Confirmado'}
                      {order.status === 'processing' && 'En Preparación'}
                      {order.status === 'shipped' && 'En Tránsito'}
                      {order.status === 'delivered' && 'Entregado'}
                      {order.status === 'cancelled' && 'Cancelado'}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  {order.order_items.map((item: any, i: number) => (
                    <div key={i} className="flex gap-4 py-4 border-b last:border-0 last:pb-0">
                      <img src={item.products?.images?.[0]?.url || 'https://via.placeholder.com/80'} className="w-20 h-20 object-cover rounded-lg border" />
                      <div>
                        <h4 className="font-bold text-gray-900">{item.products?.title}</h4>
                        <p className="text-sm text-gray-500">Cantidad: {item.quantity}</p>
                        <p className="font-medium">{formatPrice(item.unit_price)} c/u</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

