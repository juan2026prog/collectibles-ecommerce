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
  draft: { label: 'Borrador', cls: 'border-white/10 text-slate-500 bg-white/5' },
  active: { label: 'Activo', cls: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  paused: { label: 'Pausado', cls: 'border-yellow-500/20 text-yellow-500 bg-yellow-500/5' },
  out_of_stock: { label: 'Sin Stock', cls: 'border-red-500/20 text-red-500 bg-red-500/5' },
  archived: { label: 'Archivado', cls: 'border-white/5 text-slate-600 bg-white/5' },
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
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Inventory Control</div>
           <h2 className="text-5xl font-black text-white">Gestión de Catálogo</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">{mockProducts.length} items total · {mockProducts.filter(p => p.status === 'active').length} publicados</p>
        </div>
        <div className="flex gap-4 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none bg-[#f00856] text-white text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-[#ff2c68] transition-all shadow-[0_0_40px_rgba(240,8,86,0.3)] active:scale-[0.98] border border-white/10">
             + New Product
          </button>
          <button className="flex-1 lg:flex-none glass border border-white/10 text-white text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-white/10 transition-all shadow-xl">
             <Upload className="w-5 h-5 inline mr-3" /> Import CSV
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="relative flex-1 group">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-[#f00856] transition-colors" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by SKU, Name or Category..."
            className="w-full bg-white/5 border border-white/10 p-7 pl-20 rounded-[2rem] text-sm font-black uppercase tracking-widest outline-none focus:border-[#f00856] focus:bg-white/[0.08] transition-all placeholder:text-slate-800 shadow-inner group-hover:border-white/20" />
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {['all', 'active', 'draft', 'out_of_stock', 'paused', 'sync_error'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-10 py-6 text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-3xl border ${filterStatus === s ? 'bg-white text-black border-white shadow-2xl scale-[1.05]' : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
              {s === 'all' ? 'Ver Todos' : statusMap[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-[#f00856] p-10 rounded-[3rem] flex flex-col md:flex-row items-center justify-between gap-10 animation-slide-up shadow-[0_30px_60px_rgba(240,8,86,0.4)] border border-white/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
             <Package className="w-32 h-32 text-white -rotate-12" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
             <div className="w-14 h-14 rounded-2xl bg-white text-[#f00856] flex items-center justify-center font-black text-2xl shadow-2xl animate-in zoom-in duration-300">{selected.length}</div>
             <div>
                <span className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Items seleccionados</span>
                <p className="text-[10px] text-white/60 font-black uppercase mt-1">Acción masiva en progreso</p>
             </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 relative z-10">
            {['Edit Prices', 'Edit Stock', 'Pause', 'Duplicate'].map(act => (
              <button key={act} className="text-[11px] font-black uppercase tracking-widest bg-black/20 text-white px-8 py-4 rounded-full hover:bg-black/40 transition-all border border-white/10 active:scale-95 shadow-lg">
                {act}
              </button>
            ))}
            <button className="text-[11px] font-black uppercase tracking-widest bg-white text-[#f00856] px-8 py-4 rounded-full hover:bg-black hover:text-white transition-all shadow-2xl active:scale-95">
              Delete Forever
            </button>
          </div>
        </div>
      )}

      {/* Table Area */}
      <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.04] border-b border-white/5">
              <tr className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em]">
                <th className="p-10 w-16">
                  <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} 
                    className="w-6 h-6 bg-black/40 border-white/10 rounded-lg checked:bg-[#f00856] transition-all cursor-pointer shadow-inner" />
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
            <tbody className="divide-y divide-white/5">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.02] group transition-colors">
                  <td className="p-10">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} 
                      className="w-6 h-6 bg-black/40 border-white/10 rounded-lg checked:bg-[#f00856] transition-all cursor-pointer shadow-inner" />
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-8">
                      <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-[#f00856]/40 group-hover:bg-[#f00856]/5 transition-all overflow-hidden shadow-inner">
                        <Image className="w-8 h-8 text-slate-800 group-hover:text-[#f00856] transition-colors" />
                      </div>
                      <div>
                        <p className="font-black text-white text-[18px] group-hover:text-[#f00856] transition-colors uppercase tracking-tight">{p.name}</p>
                        <p className="text-[11px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2 bg-white/5 px-2 py-1 rounded inline-block">{p.category} · {p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-10">
                    <span className="font-mono text-[12px] text-slate-500 tracking-tighter bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 group-hover:text-white transition-colors">{p.sku}</span>
                  </td>
                  <td className="p-10">
                    {p.promoPrice ? (
                      <div className="space-y-1">
                        <p className="line-through text-slate-700 text-[12px] font-black">${p.price}</p>
                        <p className="font-black text-[#f00856] text-[20px] tracking-tighter">${p.promoPrice}</p>
                      </div>
                    ) : <p className="font-black text-white text-[20px] tracking-tighter">${p.price}</p>}
                  </td>
                  <td className="p-10">
                    <div className="flex items-center gap-4">
                       <span className={`text-[20px] font-black ${p.stock === 0 ? 'text-red-500' : p.stock <= 5 ? 'text-amber-500' : 'text-white'}`}>{p.stock}</span>
                       {p.stock <= 5 && <AlertTriangle className={`w-5 h-5 ${p.stock === 0 ? 'text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse' : 'text-amber-500'}`} />}
                    </div>
                    <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2 bg-white/5 px-2 py-0.5 rounded inline-block">{p.variants} variants</p>
                  </td>
                  <td className="p-10">
                    <div className={`w-4 h-4 rounded-full border-2 border-black ${p.ml_synced ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-slate-800 shadow-[0_0_10px_rgba(0,0,0,0.5)]'}`} title={p.ml_synced ? 'Synced' : 'Not Synced'}></div>
                  </td>
                  <td className="p-10 text-center">
                    <span className={`badge px-5 py-2.5 rounded-full ${statusMap[p.status]?.cls.split(' border')[0]} shadow-xl text-[10px]`}>
                      {statusMap[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="p-10">
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all justify-end scale-95 group-hover:scale-100">
                      <button className="w-12 h-12 rounded-2xl border border-white/5 bg-white/5 hover:bg-[#f00856] hover:text-white hover:border-[#f00856] flex items-center justify-center transition-all shadow-xl">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="w-12 h-12 rounded-2xl border border-white/5 bg-white/5 hover:bg-[#f00856] hover:text-white hover:border-[#f00856] flex items-center justify-center transition-all shadow-xl">
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button className="w-12 h-12 rounded-2xl border border-white/5 bg-white/5 hover:bg-[#f00856] hover:text-white hover:border-[#f00856] flex items-center justify-center transition-all shadow-xl">
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
