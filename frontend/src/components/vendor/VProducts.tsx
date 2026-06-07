import { useState } from 'react';
import { Package, Search, Plus, Upload, Copy, Edit3, Eye, MoreHorizontal, ChevronRight, Image, Tag, AlertTriangle } from 'lucide-react';

const mockProducts = [
  { id: 'SKU-001', name: 'Remera Oversize Urban', sku: 'REM-OVS-001', category: 'Remeras', brand: 'UrbanCo', price: 2490, promoPrice: 1990, stock: 45, status: 'active', images: 2, variants: 3, ml_synced: true, origin: 'local' },
  { id: 'SKU-002', name: 'Jean Slim Fit Premium', sku: 'JEA-SLM-002', category: 'Jeans', brand: 'DenimPro', price: 4890, promoPrice: null, stock: 12, status: 'active', images: 4, variants: 5, ml_synced: true, origin: 'mercadolibre' },
  { id: 'SKU-003', name: 'Zapatillas Runner X', sku: 'ZAP-RUN-003', category: 'Calzado', brand: 'SpeedRun', price: 7990, promoPrice: 6490, stock: 0, status: 'out_of_stock', images: 5, variants: 4, ml_synced: false, origin: 'local' },
  { id: 'SKU-004', name: 'Campera Puffer Light', sku: 'CAM-PUF-004', category: 'Abrigos', brand: 'NordWear', price: 8990, promoPrice: null, stock: 3, status: 'active', images: 3, variants: 2, ml_synced: true, origin: 'csv' },
  { id: 'SKU-005', name: 'Gorra Snapback Classic', sku: 'GOR-SNP-005', category: 'Accesorios', brand: 'CapCo', price: 1290, promoPrice: 990, stock: 78, status: 'draft', images: 1, variants: 6, ml_synced: false, origin: 'local' },
  { id: 'SKU-006', name: 'Bermuda Cargo Tech', sku: 'BER-CAR-006', category: 'Shorts', brand: 'UrbanCo', price: 3490, promoPrice: null, stock: 2, status: 'active', images: 2, variants: 3, ml_synced: true, origin: 'local' },
];

const statusMap: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'border-gray-200 text-gray-500 bg-gray-50' },
  active: { label: 'Activo', cls: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  paused: { label: 'Pausado', cls: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' },
  out_of_stock: { label: 'Sin Stock', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
  archived: { label: 'Archivado', cls: 'border-gray-100 text-gray-400 bg-gray-50' },
  sync_error: { label: 'Error Sync', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
};

export default function VProducts() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = mockProducts.filter(p => {
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
           <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">{mockProducts.length} items total · {mockProducts.filter(p => p.status === 'active').length} publicados</p>
        </div>
        <div className="flex gap-4 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none bg-primary-600 text-gray-900 text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-[#ff2c68] transition-all shadow-sm active:scale-[0.98] border border-gray-200">
             + New Product
          </button>
          <button className="flex-1 lg:flex-none bg-white border border-gray-200 text-gray-900 text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-gray-100 transition-all shadow-sm">
             <Upload className="w-5 h-5 inline mr-3" /> Import CSV
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="relative flex-1 group">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary-600 transition-colors" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by SKU, Name or Category..."
            className="w-full bg-gray-50 border border-gray-200 p-7 pl-20 rounded-[2rem] text-sm font-black uppercase tracking-widest outline-none focus:border-primary-600 focus:bg-white/[0.08] transition-all placeholder:text-slate-800 shadow-inner group-hover:border-white/20" />
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {['all', 'active', 'draft', 'out_of_stock', 'paused', 'sync_error'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-10 py-6 text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-3xl border ${filterStatus === s ? 'bg-white text-black border-white shadow-sm scale-[1.05]' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-white/20'}`}>
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
                <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.4em]">Items seleccionados</span>
                <p className="text-[10px] text-gray-900/60 font-black uppercase mt-1">Acción masiva en progreso</p>
             </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 relative z-10">
            {['Edit Prices', 'Edit Stock', 'Pause', 'Duplicate'].map(act => (
              <button key={act} className="text-[11px] font-black uppercase tracking-widest bg-black/20 text-gray-900 px-8 py-4 rounded-full hover:bg-black/40 transition-all border border-gray-200 active:scale-95 shadow-lg">
                {act}
              </button>
            ))}
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
                        <Image className="w-8 h-8 text-slate-800 group-hover:text-primary-600 transition-colors" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-[18px] group-hover:text-primary-600 transition-colors uppercase tracking-tight">{p.name}</p>
                        <p className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 bg-gray-50 px-2 py-1 rounded inline-block">{p.category} · {p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-10">
                    <span className="font-mono text-[12px] text-gray-500 tracking-tighter bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 group-hover:text-gray-900 transition-colors">{p.sku}</span>
                  </td>
                  <td className="p-10">
                    {p.promoPrice ? (
                      <div className="space-y-1">
                        <p className="line-through text-gray-500 text-[12px] font-black">${p.price}</p>
                        <p className="font-black text-primary-600 text-[20px] tracking-tighter">${p.promoPrice}</p>
                      </div>
                    ) : <p className="font-black text-gray-900 text-[20px] tracking-tighter">${p.price}</p>}
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-4">
                       <span className={`text-[20px] font-black ${p.stock === 0 ? 'text-red-500' : p.stock <= 5 ? 'text-amber-500' : 'text-gray-900'}`}>{p.stock}</span>
                       {p.stock <= 5 && <AlertTriangle className={`w-5 h-5 ${p.stock === 0 ? 'text-red-500 shadow-sm animate-pulse' : 'text-amber-500'}`} />}
                    </div>
                    <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-2 bg-gray-50 px-2 py-0.5 rounded inline-block">{p.variants} variants</p>
                  </td>
                  <td className="p-10">
                    <div className={`w-4 h-4 rounded-full border-2 border-black ${p.ml_synced ? 'bg-emerald-500 shadow-sm' : 'bg-slate-800 shadow-sm'}`} title={p.ml_synced ? 'Synced' : 'Not Synced'}></div>
                  </td>
                  <td className="p-10 text-center">
                    <span className={`badge px-5 py-2.5 rounded-full ${statusMap[p.status]?.cls.split(' border')[0]} shadow-sm text-[10px]`}>
                      {statusMap[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="p-10">
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all justify-end scale-95 group-hover:scale-100">
                      <button className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm">
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button className="w-12 h-12 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-primary-600 hover:text-gray-900 hover:border-primary-600 flex items-center justify-center transition-all shadow-sm">
                        <Copy className="w-5 h-5" />
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
