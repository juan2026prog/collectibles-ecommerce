import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, SlidersHorizontal, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../contexts/CurrencyContext';
import { getProductImage } from '../lib/imageUtils';

export default function VendorPrueba() {
  const [products, setProducts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // 'all', 'in', 'out'

  const { formatCurrencyPrice } = useCurrency();

  useEffect(() => {
    fetchFilters();
    fetchProducts();
  }, []);

  async function fetchFilters() {
    try {
      const [{ data: vnds }, { data: brs }, { data: cats }] = await Promise.all([
        supabase.from('vendors').select('id, store_name').order('store_name'),
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name')
      ]);
      setVendors(vnds || []);
      setBrands(brs || []);
      setCategories(cats || []);
    } catch (err) {
      console.error('Error loading filters:', err);
    }
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          vendor:vendors(id, store_name),
          brand:brands(id, name),
          categories:product_categories(category:categories(id, name)),
          variants:product_variants(id, sku, inventory_count),
          ml_catalog_links(last_sync_status, last_sync_error)
        `)
        .not('vendor_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || 
                          p.variants?.[0]?.sku?.toLowerCase().includes(search.toLowerCase());
    const matchesVendor = !selectedVendor || p.vendor_id === selectedVendor;
    const matchesBrand = !selectedBrand || p.brand_id === selectedBrand;
    
    const matchesCategory = !selectedCategory || p.categories?.some((c: any) => c.category?.id === selectedCategory);
    
    // Status translation check
    let matchesStatus = true;
    if (selectedStatus) {
      matchesStatus = p.status === selectedStatus;
    }

    // Stock check
    const stockCount = p.variants?.[0]?.inventory_count || 0;
    let matchesStock = true;
    if (stockFilter === 'in') {
      matchesStock = stockCount > 0;
    } else if (stockFilter === 'out') {
      matchesStock = stockCount <= 0;
    }

    return matchesSearch && matchesVendor && matchesBrand && matchesCategory && matchesStatus && matchesStock;
  });

  return (
    <div className="min-h-screen bg-[#05070f] text-white pt-24 pb-16 px-4 md:px-8">
      <Helmet>
        <title>Prueba de Vendors | Collectibles</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            Panel de Prueba de Vendors <span className="bg-red-500/10 text-[#f00856] border border-[#f00856]/20 text-xs px-2 py-0.5 rounded font-mono uppercase">Preview</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Visualiza y depura cómo se muestran los productos de los vendors en tiempo real sin mezclarlos en el catálogo global.
          </p>
        </div>

        {/* Filters Panel */}
        <div className="bg-[#0b0f19] border border-white/10 p-6 rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-2">
            <SlidersHorizontal className="w-4 h-4 text-[#f00856]" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-300">Filtros de búsqueda</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Search Input */}
            <div className="col-span-1 md:col-span-2 relative">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Título o SKU..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 placeholder:text-slate-600 transition-all"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Vendor Select */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vendor</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 outline-none transition-all"
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
              >
                <option value="" className="bg-[#0b0f19]">Todos</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id} className="bg-[#0b0f19]">{v.store_name}</option>
                ))}
              </select>
            </div>

            {/* Brand Select */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Marca</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 outline-none transition-all"
                value={selectedBrand}
                onChange={e => setSelectedBrand(e.target.value)}
              >
                <option value="" className="bg-[#0b0f19]">Todas</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id} className="bg-[#0b0f19]">{b.name}</option>
                ))}
              </select>
            </div>

            {/* Category Select */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Categoría</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 outline-none transition-all"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="" className="bg-[#0b0f19]">Todas</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id} className="bg-[#0b0f19]">{c.name}</option>
                ))}
              </select>
            </div>

            {/* Status & Stock */}
            <div className="grid grid-cols-2 gap-2 col-span-1 md:col-span-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Estado</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 outline-none transition-all"
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                >
                  <option value="" className="bg-[#0b0f19]">Todos</option>
                  <option value="published" className="bg-[#0b0f19]">Activo</option>
                  <option value="pending_taxonomy_review" className="bg-[#0b0f19]">Pend. Taxon.</option>
                  <option value="draft" className="bg-[#0b0f19]">Pendiente</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Stock</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#f00856]/50 outline-none transition-all"
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value)}
                >
                  <option value="all" className="bg-[#0b0f19]">Todos</option>
                  <option value="in" className="bg-[#0b0f19]">Con Stock</option>
                  <option value="out" className="bg-[#0b0f19]">Sin Stock</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="text-center py-24 text-slate-400 animate-pulse font-bold">Cargando productos vendor...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-24 text-slate-500 border border-white/5 rounded-2xl bg-[#0b0f19]/30">
            No se encontraron productos de vendors con los filtros seleccionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredProducts.map(p => {
              const stock = p.variants?.[0]?.inventory_count || 0;
              const sku = p.variants?.[0]?.sku || '-';
              const img = getProductImage(p);
              const price = p.base_price + (p.variants?.[0]?.price_adjustment || 0);

              // Sync status check
              const syncFailed = p.ml_catalog_links?.[0]?.last_sync_status === 'failed';

              return (
                <article key={p.id} className="bg-[#0b0f19] border border-white/5 rounded-xl overflow-hidden shadow-lg hover:border-[#f00856]/30 transition-all flex flex-col group">
                  {/* Image Wrapper */}
                  <div className="bg-white aspect-square w-full p-4 flex items-center justify-center relative">
                    <img
                      src={img}
                      alt={p.title}
                      className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Status badges */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      {p.status === 'published' && (
                        <span className="bg-green-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                          Activo
                        </span>
                      )}
                      {p.status === 'pending_taxonomy_review' && (
                        <span className="bg-yellow-500 text-black text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                          Pendiente Taxonomía
                        </span>
                      )}
                      {p.status === 'draft' && (
                        <span className="bg-orange-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                          Pendiente
                        </span>
                      )}
                      {stock <= 0 && (
                        <span className="bg-red-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                          Sin Stock
                        </span>
                      )}
                      {syncFailed && (
                        <span className="bg-red-800 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow" title={p.ml_catalog_links?.[0]?.last_sync_error}>
                          Error Sync ML
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                        <span>SKU: {sku}</span>
                        <span>Stock: {stock} u.</span>
                      </div>
                      <h3 className="font-bold text-sm text-white line-clamp-2 min-h-[40px] leading-tight">
                        {p.title}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="border-t border-white/5 pt-2.5 flex justify-between items-baseline">
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Vendido por</p>
                          <p className="text-xs font-black text-slate-300">{p.vendor?.store_name || 'Desconocido'}</p>
                        </div>
                        <span className="text-[#f00856] font-black text-lg">
                          {formatCurrencyPrice(price)}
                        </span>
                      </div>

                      <Link
                        to={`/p/${p.slug}`}
                        className="w-full bg-white/5 hover:bg-[#f00856] hover:text-white border border-white/10 hover:border-transparent py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver producto
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
