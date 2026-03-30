import { Users, Plus, Shield } from 'lucide-react';

const mockTeam = [
  { id: 1, name: 'Juan Pérez', email: 'admin@tienda.com', role: 'owner', permissions: ['todo'], lastActive: 'Hoy 10:15' },
  { id: 2, name: 'María López', email: 'maria@tienda.com', role: 'manager', permissions: ['productos', 'pedidos', 'finanzas', 'reglas'], lastActive: 'Hoy 09:40' },
  { id: 3, name: 'Carlos Ruiz', email: 'logistica@tienda.com', role: 'logistica', permissions: ['pedidos', 'envíos', 'depósitos'], lastActive: 'Ayer 18:00' },
  { id: 4, name: 'Ana García', email: 'catalogo@tienda.com', role: 'catalogo', permissions: ['productos', 'importaciones'], lastActive: '25/03' },
];

const roles: Record<string, { label: string; cls: string }> = {
  owner: { label: 'Owner', cls: 'bg-purple-50 text-purple-700' },
  manager: { label: 'Manager', cls: 'bg-blue-50 text-blue-700' },
  catalogo: { label: 'Catálogo', cls: 'bg-green-50 text-green-700' },
  logistica: { label: 'Logística', cls: 'bg-orange-50 text-orange-700' },
  finanzas: { label: 'Finanzas', cls: 'bg-emerald-50 text-emerald-700' },
  operador: { label: 'Operador', cls: 'bg-gray-100 text-gray-600' },
};

const allPermissions = [
  { key: 'productos', label: 'Ver/Editar Productos' },
  { key: 'pedidos', label: 'Ver/Gestionar Pedidos' },
  { key: 'envíos', label: 'Despachar/Tracking' },
  { key: 'finanzas', label: 'Ver Finanzas' },
  { key: 'reglas', label: 'Gestionar Reglas' },
  { key: 'integraciones', label: 'Integraciones' },
  { key: 'depósitos', label: 'Gestionar Depósitos' },
  { key: 'importaciones', label: 'Importar Productos' },
];

export default function VTeam() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex justify-between items-center">
        <div><h2 className="text-2xl font-black text-gray-900">Equipo</h2><p className="text-sm text-gray-500">{mockTeam.length} miembros</p></div>
        <button className="bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg hover:bg-gray-800 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Invitar Miembro</button>
      </div>
      <div className="space-y-3">
        {mockTeam.map(m => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-bold text-sm">{m.name.split(' ').map(n => n[0]).join('')}</div>
                <div>
                  <p className="font-bold text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded ${roles[m.role]?.cls}`}>{roles[m.role]?.label}</span>
                <p className="text-[10px] text-gray-400 mt-1">Activo: {m.lastActive}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.permissions.includes('todo') ? (
                <span className="text-[10px] bg-purple-50 text-purple-600 font-bold px-2 py-0.5 rounded flex items-center gap-1"><Shield className="w-3 h-3" /> Acceso Total</span>
              ) : m.permissions.map(p => (
                <span key={p} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 font-bold px-2 py-0.5 rounded">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> Permisos por Rol</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <tr>
                <th className="p-2 text-left">Permiso</th>
                {Object.entries(roles).map(([k, v]) => <th key={k} className="p-2 text-center">{v.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allPermissions.map(p => (
                <tr key={p.key} className="hover:bg-gray-50">
                  <td className="p-2 text-gray-700 font-medium">{p.label}</td>
                  <td className="p-2 text-center text-green-500">✓</td>
                  <td className="p-2 text-center text-green-500">✓</td>
                  <td className="p-2 text-center">{['productos', 'importaciones'].includes(p.key) ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="p-2 text-center">{['pedidos', 'envíos', 'depósitos'].includes(p.key) ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="p-2 text-center">{p.key === 'finanzas' ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="p-2 text-center"><span className="text-gray-300">—</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
