import { useState, useEffect } from 'react';
import { Package, Search, Plus, Upload, Copy, Edit3, Eye, MoreHorizontal, ChevronRight, Image as ImageIcon, Tag, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { resolveImage } from '../../lib/imageUtils';
import { useCurrency } from '../../contexts/CurrencyContext';

const statusMap: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'border-gray-200 text-gray-500 bg-gray-50' },
  active: { label: 'Activo', cls: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  paused: { label: 'Pausado', cls: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' },
  out_of_stock: { label: 'Sin Stock', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
  archived: { label: 'Archivado', cls: 'border-gray-100 text-gray-400 bg-gray-50' },
  sync_error: { label: 'Error Sync', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
};

export default function VProducts() {
  const { user } = useAuth();
  const { formatCurrencyPrice } = useCurrency();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [mlSellers, setMlSellers] = useState<string[]>([]);

  const loadProducts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch seller IDs for the vendor
      const { data: mlAccounts } = await supabase.from('ml_seller_accounts').select('ml_seller_id').eq('vendor_id', user.id);
      const sellerIds = mlAccounts?.map(a => a.ml_seller_id) || [];
      setMlSellers(sellerIds);

      // Fetch vendor products with base product details and variants
      const { data, error } = await supabase
        .from('vendor_products')
        .select(`
          id, price, status, product_id, created_at,
          product:products (id, title, category_id, brand_id, base_price, product_images(url)),
          variants:vendor_product_variants(id, variant_id, inventory_count, price_adjustment, sku_vendedor)
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Find if they are synced with ML
        let mlItems: any[] = [];
        if (sellerIds.length > 0) {
          const { data: items } = await supabase
            .from('ml_raw_items')
            .select('catalog_product_id, status')
            .in('seller_id', sellerIds);
          if (items) mlItems = items;
        }

        const formatted = data.map((vp: any) => {
          const baseProduct = vp.product || {};
          const variants = vp.variants || [];
          const basePrice = Number(vp.price || baseProduct.base_price || 0);
          const totalStock = variants.reduce((sum: number, v: any) => sum + (v.inventory_count || 0), 0);
          const totalValue = variants.reduce((sum: number, v: any) => sum + ((v.inventory_count || 0) * (basePrice + Number(v.price_adjustment || 0))), 0);
          
          let derivedStatus = vp.status;
          if (derivedStatus === 'active' && totalStock === 0) derivedStatus = 'out_of_stock';

          const minPrice = variants.length > 0 
            ? Math.min(...variants.map((v: any) => basePrice + Number(v.price_adjustment || 0)))
            : basePrice;

          const mlMatch = mlItems.find(i => i.catalog_product_id === baseProduct.id);

          return {
            id: vp.id,
            product_id: baseProduct.id,
            name: baseProduct.title || 'Producto sin título',
            sku: variants[0]?.sku_vendedor || 'Sin SKU',
            category: baseProduct.category_id || 'General',
            brand: baseProduct.brand_id || 'Genérica',
            price: minPrice,
            stock: totalStock,
            totalValue: totalValue,
            status: derivedStatus,
            images: baseProduct.product_images?.length || 0,
            primaryImage: baseProduct.product_images?.[0]?.url,
            variants: variants.length,
            ml_synced: !!mlMatch,
            origin: mlMatch ? 'mercadolibre' : 'local'
          };
        });
        setProducts(formatted);
      }
    } catch (err) {
      console.error('Error fetching vendor products:', err);
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
      const { error } = await supabase.from('vendor_products').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Error updating status:', err);
      loadProducts();
    }
  };

  const handleBulkUpdateStatus = async (newStatus: string) => {
    if (selected.length === 0) return;
    try {
      setProducts(prev => prev.map(p => selected.includes(p.id) ? { ...p, status: newStatus } : p));
      const { error } = await supabase.from('vendor_products').update({ status: newStatus }).in('id', selected);
      if (error) throw error;
      setSelected([]);
    } catch (err) {
      console.error('Error updating status:', err);
      loadProducts();
    }
  };

  useEffect(() => {
    loadProducts();
  }, [user]);

  const filtered = products.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length && filtered.length > 0 ? [] : filtered.map(p => p.id));

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Inventory Control</div>
           <h2 className="text-5xl font-black text-gray-900">Gestión de Catálogo</h2>
           <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">{products.length} items total — {products.filter(p => p.status === 'active').length} publicados</p>
        </div>
        <div className="flex gap-4 w-full lg:w-auto">
          <button onClick={loadProducts} className="flex-1 lg:flex-none bg-white text-gray-900 text-[12px] font-black uppercase tracking-widest px-8 py-5 rounded-full hover:bg-gray-100 transition-all shadow-sm border border-gray-200 flex items-center justify-center">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex-1 lg:flex-none bg-primary-600 text-gray-900 text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-[#ff2c68] transition-all shadow-sm active:scale-[0.98] border border-gray-200">
             + Nuevo Producto
          </button>
          <button className="flex-1 lg:flex-none bg-white border border-gray-200 text-gray-900 text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-gray-100 transition-all shadow-sm">
             <Upload className="w-5 h-5 inline mr-3" /> Import CSV
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Activos</p>
          <p className="text-3xl font-black text-gray-900">{products.filter(p => p.status === 'active').length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-1">Sin Stock</p>
          <p className="text-3xl font-black text-red-500">{products.filter(p => p.stock === 0).length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest mb-1">Pendientes</p>
          <p className="text-3xl font-black text-orange-500">{products.filter(p => p.status === 'pending' || p.status === 'draft').length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-[#FFE600] font-black uppercase tracking-widest mb-1">Mercado Libre</p>
          <p className="text-3xl font-black text-gray-900">{products.filter(p => p.ml_synced).length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-red-600 font-black uppercase tracking-widest mb-1">Error Sync</p>
          <p className="text-3xl font-black text-red-600">{products.filter(p => p.status === 'sync_error').length}</p>
        </div>
        <div className="bg-primary-50 p-6 rounded-3xl border border-primary-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] text-primary-600 font-black uppercase tracking-widest mb-1">Valor Inventario</p>
          <p className="text-xl lg:text-2xl font-black text-primary-700 tracking-tighter">{formatCurrencyPrice(products.reduce((sum, p) => sum + p.totalValue, 0))}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between bg-white p-4 rounded-full border border-gray-200 shadow-sm">
        <div className="flex items-center bg-gray-50 rounded-full px-6 py-4 flex-1 border border-gray-100 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 transition-all">
          <Search className="w-5 h-5 text-gray-400 mr-3" />
          <input 
            type="text" 
            placeholder="Buscar por SKU, Nombre, Marca o EAN..." 
            className="bg-transparent border-none outline-none w-full text-sm font-bold text-gray-900 placeholder-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 lg:pb-0">
          {['all', 'active', 'out_of_stock', 'pending', 'sync_error'].map(s => (
            <button 
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`whitespace-nowrap px-6 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                filterStatus === s 
                ? 'bg-gray-900 text-white shadow-md' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              {s === 'all' ? 'Ver Todos' : statusMap[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-primary-600 p-10 rounded-[3rem] flex flex-col md:flex-row items-center justify-between gap-10 animation-slide-up shadow-sm border border-white/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
             <Package className="w-32 h-32 text-gray-900 -rotate-12" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
             <div className="w-14 h-14 rounded-2xl bg-white text-primary-600 flex items-center justify-center font-black text-2xl shadow-sm animate-in zoom-in duration-300">{selected.length}</div>
             <div>
                <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.4em]">{selected.length} items seleccionados</span>
                <p className="text-[10px] text-gray-900/60 font-black uppercase mt-1">Acción masiva en progreso</p>
             </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 relative z-10">
            <button onClick={() => handleBulkUpdateStatus('paused')} className="text-[11px] font-black uppercase tracking-widest bg-black/20 text-gray-900 px-8 py-4 rounded-full hover:bg-black/40 transition-all border border-gray-200 active:scale-95 shadow-lg">
              Pausar
            </button>
            <button onClick={() => handleBulkUpdateStatus('active')} className="text-[11px] font-black uppercase tracking-widest bg-black/20 text-gray-900 px-8 py-4 rounded-full hover:bg-black/40 transition-all border border-gray-200 active:scale-95 shadow-lg">
              Activar
            </button>
            <button className="text-[11px] font-black uppercase tracking-widest bg-white text-primary-600 px-8 py-4 rounded-full hover:bg-black hover:text-gray-900 transition-all shadow-sm active:scale-95">
              Delete Forever
            </button>
          </div>
        </div>
      )}

      {/* Table Area */}
      <div className="bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-[11px] font-black text-gray-500 uppercase tracking-[0.4em]">
                <th className="p-10 w-16">
                  <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} 
                    className="w-6 h-6 bg-black/40 border-gray-200 rounded-lg checked:bg-primary-600 transition-all cursor-pointer shadow-inner" />
                </th>
                <th className="p-10">Product Details</th>
                <th className="p-10">SKU</th>
                <th className="p-10">Financials</th>
                <th className="p-10">Inventory</th>
                <th className="p-10">Sync</th>
                <th className="p-10 text-center">Status</th>
                <th className="p-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 group transition-colors">
                  <td className="p-10">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} 
                      className="w-6 h-6 bg-black/40 border-gray-200 rounded-lg checked:bg-primary-600 transition-all cursor-pointer shadow-inner" />
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-8">
                      <div className="w-20 h-20 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-primary-600/40 group-hover:bg-primary-50 transition-all overflow-hidden shadow-inner">
                        {p.primaryImage ? (
                          <img src={resolveImage(p.primaryImage)} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-slate-800 group-hover:text-primary-600 transition-colors" />
                        )}
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-[18px] group-hover:text-primary-600 transition-colors uppercase tracking-tight">{p.name}</p>
                        <p className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 bg-gray-50 px-2 py-1 rounded inline-block">{p.category} — {p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-10">
                    <span className="font-mono text-[12px] text-gray-500 tracking-tighter bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 group-hover:text-gray-900 transition-colors">{p.sku}</span>
                  </td>
                  <td className="p-10">
                    <p className="font-black text-gray-900 text-[20px] tracking-tighter">{formatCurrencyPrice(p.price)}</p>
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-4">
                       <span className={`text-[20px] font-black ${p.stock === 0 ? 'text-red-500' : p.stock <= 5 ? 'text-amber-500' : 'text-gray-900'}`}>{p.stock}</span>
                       {p.stock <= 5 && <AlertTriangle className={`w-5 h-5 ${p.stock === 0 ? 'text-red-500 shadow-sm animate-pulse' : 'text-amber-500'}`} />}
                    </div>
                    <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-2 bg-gray-50 px-2 py-0.5 rounded inline-block">{p.variants} variantes</p>
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 border-black ${p.ml_synced ? 'bg-[#FFE600] shadow-sm' : 'bg-slate-200 shadow-sm'}`} title={p.ml_synced ? 'Synced' : 'Not Synced'}></div>
                      <span className="text-xs font-bold text-gray-500">{p.ml_synced ? 'WEB + ML' : 'WEB'}</span>
                    </div>
                  </td>
                  <td className="p-10 text-center">
                    <span className={`badge px-5 py-2.5 rounded-full ${statusMap[p.status]?.cls.split(' border')[0]} shadow-sm text-[10px]`}>
                      {statusMap[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="p-10">
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all justify-end scale-95 group-hover:scale-100">
                      <button onClick={() => window.open(`/product/${p.product_id}`, '_blank')} className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm" title="Ver en tienda">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleUpdateStatus(p.id, p.status === 'active' ? 'paused' : 'active')} className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm" title={p.status === 'active' ? 'Pausar' : 'Activar'}>
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      <button className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm" title="Editar">
                        <Edit3 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
