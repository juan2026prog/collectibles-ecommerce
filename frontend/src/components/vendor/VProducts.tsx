import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Upload, Copy, Eye, Image as ImageIcon, Trash2 } from 'lucide-react';
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
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'Todos'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterBrand, setFilterBrand] = useState<string>('');

  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const loadProducts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch seller IDs for the vendor
      const { data: mlAccounts } = await supabase.from('ml_seller_accounts').select('ml_seller_id').eq('vendor_id', user.id);
      const sellerIds = mlAccounts?.map(a => a.ml_seller_id) || [];

      // Fetch categories & brands for filters
      const [{ data: cats }, { data: brs }] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('brands').select('id, name').order('name')
      ]);
      setCategories(cats || []);
      setBrands(brs || []);

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
        let mlItems: any[] = [];
        if (sellerIds.length > 0) {
          const { data: items } = await supabase.from('ml_raw_items').select('catalog_product_id, status').in('seller_id', sellerIds);
          if (items) mlItems = items;
        }

        const formatted = data.map((vp: any) => {
          const baseProduct = vp.product || {};
          const variants = vp.variants || [];
          const basePrice = Number(vp.price || baseProduct.base_price || 0);
          const totalStock = variants.reduce((sum: number, v: any) => sum + (v.inventory_count || 0), 0);
          
          let derivedStatus = vp.status;
          if (derivedStatus === 'active' && totalStock === 0) derivedStatus = 'out_of_stock';

          const minPrice = variants.length > 0 
            ? Math.min(...variants.map((v: any) => basePrice + Number(v.price_adjustment || 0)))
            : basePrice;

          const mlMatch = mlItems.find(i => i.catalog_product_id === baseProduct.id);
          
          const cat = cats?.find(c => c.id === baseProduct.category_id);
          const brand = brs?.find(b => b.id === baseProduct.brand_id);

          return {
            id: vp.id,
            product_id: baseProduct.id,
            name: baseProduct.title || 'Producto sin título',
            sku: variants[0]?.sku_vendedor || '-',
            category_id: baseProduct.category_id,
            brand_id: baseProduct.brand_id,
            categoryName: cat ? cat.name : 'General',
            brandName: brand ? brand.name : 'Genérica',
            price: minPrice,
            stock: totalStock,
            status: derivedStatus,
            primaryImage: baseProduct.product_images?.[0]?.url,
            ml_synced: !!mlMatch,
            created_at: vp.created_at
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

  useEffect(() => {
    loadProducts();
  }, [user]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'created_at' || field === 'stock' ? 'desc' : 'asc');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === '' || p.category_id === filterCategory;
      const matchesBrand = filterBrand === '' || p.brand_id === filterBrand;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [products, search, filterCategory, filterBrand]);

  const getSortedProducts = (prods: any[]) => {
    return [...prods].sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      if (sortField === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortField === 'category') {
        valA = a.categoryName; valB = b.categoryName;
      } else if (sortField === 'brand') {
        valA = a.brandName; valB = b.brandName;
      } else if (sortField === 'is_active') {
        valA = a.status === 'active' ? 1 : 0;
        valB = b.status === 'active' ? 1 : 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedAndPaginated = useMemo(() => {
    const sorted = getSortedProducts(filteredProducts);
    if (itemsPerPage === 'Todos') return sorted;
    return sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredProducts, sortField, sortOrder, currentPage, itemsPerPage]);

  return (
    <div className="max-w-full pb-20">
      {/* Header aligned with AdminProducts */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-2xl font-black text-gray-900">Productos <span className="bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded ml-2 relative -top-1">v2</span></h2>
               {!loading && (
                 <span className="bg-gray-100 border border-gray-200 text-gray-500 text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-widest hidden md:inline-flex items-center gap-1">
                   {products.length} {products.length === 1 ? 'PRODUCTO' : 'PRODUCTOS'}
                 </span>
               )}
            </div>
            <p className="text-gray-500 text-sm italic mt-1">Gestión de catálogo y stock</p>
          </div>
          
          <div className="flex items-center gap-4 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm hover:border-blue-400 transition-colors mt-2 md:mt-0">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
                checked={sortedAndPaginated.length > 0 && sortedAndPaginated.every(p => selectedProducts.includes(p.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const uniqueIds = Array.from(new Set([...selectedProducts, ...sortedAndPaginated.map((p: any) => p.id)]));
                    setSelectedProducts(uniqueIds);
                  } else {
                    const currentIds = sortedAndPaginated.map((p: any) => p.id);
                    setSelectedProducts(selectedProducts.filter(id => !currentIds.includes(id)));
                  }
                }}
              />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Página</span>
            </label>
            
            <div className="w-px h-4 bg-gray-200"></div>
            
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" 
                checked={products.length > 0 && products.length === selectedProducts.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedProducts(products.map(p => p.id));
                  else setSelectedProducts([]);
                }}
              />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Todos ({products.length})</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none btn-secondary px-4 py-2 text-sm gap-2 font-bold bg-[#4B5563] hover:bg-[#374151] border-none text-white shadow-sm flex items-center justify-center rounded-full"><Upload className="w-4 h-4" /> IMPORTAR</button>
          <button className="flex-1 lg:flex-none btn-primary gap-2 bg-blue-600 hover:bg-blue-700 border-blue-600 text-white rounded-full font-bold px-6 py-2 flex items-center justify-center shadow-lg shadow-blue-200"><Plus className="w-5 h-5" /> AÑADIR NUEVO</button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
         <div className="p-4 border-b bg-gray-50/50 flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="relative flex-1 w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar productos..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500" />
            </div>
            <div className="flex flex-wrap gap-4 items-center">
               <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-bold">Mostrar:</span>
                  <select className="border-gray-200 border rounded text-xs p-1 outline-none bg-white" value={itemsPerPage} onChange={(e) => { setItemsPerPage(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value)); setCurrentPage(1); }}>
                     <option value="50">50</option>
                     <option value="200">200</option>
                     <option value="Todos">Todos</option>
                  </select>
               </div>
               <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-500">
                  <select className="border-gray-200 border rounded px-2 py-1.5 text-xs outline-none bg-white" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las categorías</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="border-gray-200 border rounded px-2 py-1.5 text-xs outline-none bg-white" value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}>
                    <option value="">Todas las marcas</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
               </div>
            </div>
         </div>
         
         <div className="flex-1 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
               <thead className="bg-white sticky top-0 z-10 shadow-sm border-b">
                 <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                   <th className="px-6 py-4 w-12">
                     <input 
                        type="checkbox" 
                        className="rounded border-gray-300" 
                        checked={selectedProducts.length > 0 && sortedAndPaginated.length > 0 && sortedAndPaginated.every(p => selectedProducts.includes(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedProducts(sortedAndPaginated.map((p: any) => p.id));
                          else setSelectedProducts([]);
                        }}
                      />
                   </th>
                   <th className="px-6 py-4">Producto</th>
                   <th className="px-6 py-4">Precio</th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('category')}>
                     Categoría {sortField === 'category' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('brand')}>
                     Marca {sortField === 'brand' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                   <th className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('stock')}>
                     Stock {sortField === 'stock' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                   </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('is_active')}>
                      Visible (ON/OFF) {sortField === 'is_active' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('status')}>
                      Estado {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </th>
                   <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleSort('created_at')}>
                     Fecha {sortField === 'created_at' ? (sortOrder === 'asc' ? '↓' : '↑') : ''}
                   </th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 bg-white">
                 {loading ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400 animate-pulse">Cargando catálogo...</td></tr>
                 ) : sortedAndPaginated.map((p: any) => (
                    <tr key={p.id} className="hover:bg-blue-50/20 group transition-all">
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300" 
                          checked={selectedProducts.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedProducts([...selectedProducts, p.id]);
                            else setSelectedProducts(selectedProducts.filter(id => id !== p.id));
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-4">
                            {p.primaryImage ? (
                               <img src={resolveImage(p.primaryImage)} alt={p.name} className="w-12 h-12 rounded-lg object-cover border border-gray-100 shadow-sm" />
                            ) : (
                               <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-300"/></div>
                            )}
                            <div>
                               <p className="font-bold text-gray-900 text-sm group-hover:text-blue-600 transition-colors">{p.name}</p>
                               <div className="flex gap-1 items-center mt-0.5">
                                  <span className="text-[9px] font-mono text-gray-400 uppercase">{p.sku}</span>
                                  {p.ml_synced && <div className="w-6 h-3 bg-[#FFE600] rounded-sm text-[8px] flex items-center justify-center font-bold text-blue-900 ml-1">ML</div>}
                               </div>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4 font-black text-gray-900 text-sm whitespace-nowrap">
                        {formatCurrencyPrice(p.price)}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500">
                        {p.categoryName}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500">
                        {p.brandName !== 'Genérica' ? p.brandName : '-'}
                      </td>
                      <td className="px-6 py-4">
                         <span className={`text-xs font-black uppercase tracking-tight ${p.stock === 0 ? 'text-blue-600' : 'text-blue-600'}`}>
                            {p.stock} u.
                         </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleUpdateStatus(p.id, p.status === 'active' ? 'paused' : 'active')}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${p.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${p.status === 'active' ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                           {p.status === 'active' ? 'ACTIVO' : p.status === 'paused' ? 'OCULTO' : p.status === 'draft' ? 'BORRADOR' : p.status === 'out_of_stock' ? 'SIN STOCK' : p.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-medium text-gray-400">
                        <div className="flex justify-end gap-3 items-center mb-1">
                          <button onClick={() => window.open(`/product/${p.product_id}`, '_blank')} className="text-blue-500 hover:underline text-xs font-bold">Detalles</button>
                          <button className="text-gray-400 hover:text-blue-600 transition-colors" title="Copiar">
                             <Copy className="w-4 h-4" />
                          </button>
                          <button className="text-red-400 hover:text-red-600 transition-colors" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                 ))}
               </tbody>
            </table>
         </div>
         {itemsPerPage !== 'Todos' && (
            <div className="bg-white border-t px-6 py-3 flex items-center justify-between text-xs text-gray-500">
               <span>Página {currentPage}</span>
               <div className="flex items-center gap-2">
                 <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
                 <button disabled={filteredProducts.length <= (currentPage * (typeof itemsPerPage === 'number' ? itemsPerPage : 0))} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
               </div>
            </div>
         )}
      </div>
    </div>
  );
}
