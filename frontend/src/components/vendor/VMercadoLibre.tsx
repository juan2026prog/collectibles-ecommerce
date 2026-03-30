import { RefreshCw, Link2, AlertTriangle, CheckCircle, Clock, Search, Layers } from 'lucide-react';

const mockSync = [
  { internal: 'Remera Oversize Urban', sku: 'REM-OVS-001', mlId: 'MLA-12345', syncStatus: 'synced', localStock: 45, mlStock: 45, localPrice: 2490, mlPrice: 2490, lastSync: '27/03 10:15', error: null },
  { internal: 'Jean Slim Fit Premium', sku: 'JEA-SLM-002', mlId: 'MLA-12346', syncStatus: 'synced', localStock: 12, mlStock: 12, localPrice: 4890, mlPrice: 4890, lastSync: '27/03 10:15', error: null },
  { internal: 'Zapatillas Runner X', sku: 'ZAP-RUN-003', mlId: 'MLA-12347', syncStatus: 'error', localStock: 0, mlStock: 3, localPrice: 7990, mlPrice: 7990, lastSync: '27/03 08:00', error: 'Stock no sincronizado' },
  { internal: 'Campera Puffer Light', sku: 'CAM-PUF-004', mlId: null, syncStatus: 'unlinked', localStock: 3, mlStock: null, localPrice: 8990, mlPrice: null, lastSync: null, error: 'Sin vincular' },
  { internal: 'Gorra Snapback Classic', sku: 'GOR-SNP-005', mlId: 'MLA-12349', syncStatus: 'synced', localStock: 78, mlStock: 78, localPrice: 1290, mlPrice: 1290, lastSync: '27/03 10:15', error: null },
];

const mockLogs = [
  { time: '27/03 10:15', action: 'Sync completa', items: 4, status: 'ok', user: 'Auto' },
  { time: '27/03 08:00', action: 'Sync stock ZAP-RUN-003', items: 1, status: 'error', user: 'Auto' },
  { time: '26/03 22:00', action: 'Sync precios', items: 5, status: 'ok', user: 'Auto' },
  { time: '26/03 16:30', action: 'Importar publicación MLA-12349', items: 1, status: 'ok', user: 'admin' },
];

export default function VMercadoLibre() {
  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex justify-between items-center">
        <div><h2 className="text-2xl font-black text-gray-900">Mercado Libre</h2><p className="text-sm text-gray-500">Sincronización de catálogo</p></div>
        <div className="flex gap-2">
          <button className="text-sm font-bold bg-yellow-400 text-yellow-900 px-4 py-2.5 rounded-lg hover:bg-yellow-300 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Sincronizar Ahora</button>
          <button className="text-sm font-bold bg-white border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Conectar Cuenta ML</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Sincronizados" value={mockSync.filter(s => s.syncStatus === 'synced').length} color="green" />
        <MiniStat label="Con Error" value={mockSync.filter(s => s.syncStatus === 'error').length} color="red" />
        <MiniStat label="Sin Vincular" value={mockSync.filter(s => s.syncStatus === 'unlinked').length} color="orange" />
        <MiniStat label="Última Sync" value="10:15" color="blue" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900">Panel de Sincronización</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr><th className="p-3 pl-4">Producto</th><th className="p-3">ID ML</th><th className="p-3">Sync</th><th className="p-3 text-center">Stock Local</th><th className="p-3 text-center">Stock ML</th><th className="p-3 text-right">Precio Local</th><th className="p-3 text-right">Precio ML</th><th className="p-3">Última Sync</th><th className="p-3">Error</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockSync.map(s => (
                <tr key={s.sku} className="hover:bg-gray-50">
                  <td className="p-3 pl-4"><p className="font-bold text-gray-900 text-xs">{s.internal}</p><p className="text-[10px] text-gray-400">{s.sku}</p></td>
                  <td className="p-3 font-mono text-xs text-gray-500">{s.mlId || '—'}</td>
                  <td className="p-3"><span className={`w-2.5 h-2.5 rounded-full inline-block ${s.syncStatus === 'synced' ? 'bg-green-400' : s.syncStatus === 'error' ? 'bg-red-500' : 'bg-gray-300'}`}></span></td>
                  <td className="p-3 text-center font-bold">{s.localStock}</td>
                  <td className="p-3 text-center font-bold text-gray-500">{s.mlStock ?? '—'}</td>
                  <td className="p-3 text-right">${s.localPrice}</td>
                  <td className="p-3 text-right text-gray-500">{s.mlPrice ? `$${s.mlPrice}` : '—'}</td>
                  <td className="p-3 text-xs text-gray-500">{s.lastSync || '—'}</td>
                  <td className="p-3">{s.error && <span className="text-[10px] text-red-600 font-bold">{s.error}</span>}</td>
                  <td className="p-3"><button className="text-[10px] font-bold text-blue-600">{s.syncStatus === 'unlinked' ? 'Vincular' : 'Reintentar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-black text-gray-900">Logs de Sincronización</h3></div>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-gray-50">
            {mockLogs.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="p-3 pl-4 text-xs text-gray-500 w-32">{l.time}</td>
                <td className="p-3 font-medium text-gray-800">{l.action}</td>
                <td className="p-3 text-gray-500 text-xs">{l.items} productos</td>
                <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.status === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{l.status === 'ok' ? 'OK' : 'Error'}</span></td>
                <td className="p-3 text-xs text-gray-400">{l.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-xl font-black text-gray-900">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
