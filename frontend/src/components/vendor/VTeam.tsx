import { Users, Plus, Shield } from 'lucide-react';

const mockTeam = [
  { id: 1, name: 'Juan Pérez', email: 'admin@tienda.com', role: 'owner', permissions: ['todo'], lastActive: 'Hoy 10:15' },
  { id: 2, name: 'María López', email: 'maria@tienda.com', role: 'manager', permissions: ['productos', 'pedidos', 'finanzas', 'reglas'], lastActive: 'Hoy 09:40' },
  { id: 3, name: 'Carlos Ruiz', email: 'logistica@tienda.com', role: 'logistica', permissions: ['pedidos', 'envíos', 'depósitos'], lastActive: 'Ayer 18:00' },
  { id: 4, name: 'Ana García', email: 'catalogo@tienda.com', role: 'catalogo', permissions: ['productos', 'importaciones'], lastActive: '25/03' },
];

const roles: Record<string, { label: string; cls: string }> = {
  owner: { label: 'Owner', cls: 'border-primary-600/20 text-primary-600 bg-primary-50' },
  manager: { label: 'Manager', cls: 'border-blue-500/20 text-blue-500 bg-blue-500/5' },
  catalogo: { label: 'Catálogo', cls: 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' },
  logistica: { label: 'Logística', cls: 'border-orange-500/20 text-orange-500 bg-orange-500/5' },
  finanzas: { label: 'Finanzas', cls: 'border-cyan-500/20 text-cyan-500 bg-cyan-500/5' },
  operador: { label: 'Operador', cls: 'border-gray-200 text-gray-500 bg-gray-50' },
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
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-primary-600 font-black uppercase tracking-[0.4em] mb-3">Access Control</div>
           <h2 className="text-5xl font-black text-gray-900">Equipo & Permisos</h2>
           <p className="text-sm text-gray-500 font-bold mt-3 uppercase tracking-[0.2em]">{mockTeam.length} Miembros con acceso activo</p>
        </div>
        <button className="bg-white text-black text-[11px] font-black uppercase tracking-widest px-10 py-5 rounded-full hover:bg-primary-600 hover:text-gray-900 transition-all shadow-sm active:scale-[0.98]">
           + Invite Collaborator
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockTeam.map(m => (
          <div key={m.id} className="soft rounded-[2.5rem] p-10 hover:bg-gray-50 transition-all group border border-gray-100 hover:border-primary-300 shadow-sm">
            <div className="flex items-center justify-between gap-6 mb-10">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-center text-gray-900 font-black text-2xl group-hover:border-primary-600 group-hover:text-primary-600 group-hover:scale-110 transition-all shadow-inner">
                   {m.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-xl font-black text-gray-900 uppercase tracking-widest group-hover:text-primary-600 transition-colors">{m.name}</p>
                  <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest mt-2">{m.email}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`badge ${roles[m.role]?.cls.split(' border')[0]} px-4 py-2`}>{roles[m.role]?.label}</span>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-4">Active: {m.lastActive}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-10 border-t border-gray-100">
              {m.permissions.includes('todo') ? (
                <span className="text-[10px] bg-primary-100 text-primary-600 font-black uppercase tracking-widest px-5 py-2 rounded-full flex items-center gap-3 border border-primary-600/20 shadow-sm">
                   <Shield className="w-4 h-4" /> Root Access
                </span>
              ) : m.permissions.map(p => (
                <span key={p} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-500 font-black uppercase tracking-widest px-5 py-2 rounded-full group-hover:text-gray-700 group-hover:border-white/20 transition-all hover:bg-gray-100">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-10 md:p-12 border-b border-gray-100 bg-gray-50 flex items-center gap-6">
           <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm">
              <Shield className="w-6 h-6 text-primary-600" />
           </div>
           <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.4em]">Matrix: Rol & Permissions</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/[0.01] border-b border-gray-100">
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                <th className="p-8">Permission Module</th>
                {Object.entries(roles).map(([k, v]) => <th key={k} className="p-8 text-center">{v.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allPermissions.map(p => (
                <tr key={p.key} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-8 text-gray-700 text-[11px] font-black uppercase tracking-widest group-hover:text-gray-900 transition-colors">{p.label}</td>
                  <td className="p-8 text-center text-emerald-500 font-black text-2xl">✓</td>
                  <td className="p-8 text-center text-emerald-500 font-black text-2xl">✓</td>
                  <td className="p-8 text-center">
                     {['productos', 'importaciones'].includes(p.key) ? <span className="text-emerald-500 font-black text-2xl animate-pulse">✓</span> : <span className="text-slate-800 font-black text-xl">—</span>}
                  </td>
                  <td className="p-8 text-center">
                     {['pedidos', 'envíos', 'depósitos'].includes(p.key) ? <span className="text-emerald-500 font-black text-2xl animate-pulse">✓</span> : <span className="text-slate-800 font-black text-xl">—</span>}
                  </td>
                  <td className="p-8 text-center">
                     {p.key === 'finanzas' ? <span className="text-emerald-500 font-black text-2xl animate-pulse">✓</span> : <span className="text-slate-800 font-black text-xl">—</span>}
                  </td>
                  <td className="p-8 text-center"><span className="text-slate-800 font-black text-xl">—</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
