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
  draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600' },
  active: { label: 'Activo', cls: 'bg-green-50 text-green-700' },
  paused: { label: 'Pausado', cls: 'bg-yellow-50 text-yellow-700' },
  out_of_stock: { label: 'Sin Stock', cls: 'bg-red-50 text-red-700' },
  archived: { label: 'Archivado', cls: 'bg-gray-50 text-gray-500' },
  sync_error: { label: 'Error Sync', cls: 'bg-red-100 text-red-700' },
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
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(p => p.id));

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">Productos</h2>
          <p className="text-sm text-gray-500">{mockProducts.length} productos · {mockProducts.filter(p => p.status === 'active').length} activos</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-gray-800 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Crear Producto</button>
          <button className="bg-white border border-gray-200 text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"><Upload className="w-4 h-4" /> Importar</button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        {['all', 'active', 'draft', 'out_of_stock', 'paused', 'sync_error'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${filterStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            {s === 'all' ? 'Todos' : statusMap[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm font-bold text-blue-800">{selected.length} seleccionados</span>
          <div className="flex gap-2">
            <button className="text-xs font-bold bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50">Editar Precios</button>
            <button className="text-xs font-bold bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50">Editar Stock</button>
            <button className="text-xs font-bold bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50">Pausar</button>
            <button className="text-xs font-bold bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50">Duplicar</button>
            <button className="text-xs font-bold bg-white border border-red-200 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Archivar</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-3 pl-4 w-10"><input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" /></th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">SKU</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Precio</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Stock</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Variantes</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">ML</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Origen</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 group">
                  <td className="p-3 pl-4"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Image className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.category} · {p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-500">{p.sku}</td>
                  <td className="p-3">
                    {p.promoPrice ? (
                      <div>
                        <span className="line-through text-gray-400 text-xs">${p.price}</span>
                        <span className="font-black text-red-600 ml-1">${p.promoPrice}</span>
                      </div>
                    ) : <span className="font-black text-gray-900">${p.price}</span>}
                  </td>
                  <td className="p-3">
                    <span className={`font-black ${p.stock === 0 ? 'text-red-600' : p.stock <= 5 ? 'text-yellow-600' : 'text-gray-900'}`}>{p.stock}</span>
                    {p.stock <= 5 && p.stock > 0 && <AlertTriangle className="w-3 h-3 text-yellow-500 inline ml-1" />}
                  </td>
                  <td className="p-3 text-gray-600">{p.variants}</td>
                  <td className="p-3">
                    <span className={`w-2 h-2 rounded-full inline-block ${p.ml_synced ? 'bg-green-400' : 'bg-gray-300'}`}></span>
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusMap[p.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                      {statusMap[p.status]?.label || p.status}
                    </span>
                  </td>
                  <td className="p-3 text-[10px] text-gray-400 uppercase">{p.origin}</td>
                  <td className="p-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-gray-100"><Eye className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100"><Edit3 className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100"><Copy className="w-3.5 h-3.5 text-gray-400" /></button>
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
