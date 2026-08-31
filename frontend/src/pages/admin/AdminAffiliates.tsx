import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Share2, Plus, Edit, Trash2, DollarSign, User } from 'lucide-react';
import {
  BackofficePageHeader,
  BackofficePrimaryAction,
  BackofficeSearch,
  BackofficeResponsiveDataList,
  BackofficeStatusBadge,
  BackofficeActionMenu,
} from '../../components/backoffice';

export default function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('affiliates').select('*');
      if (data) setAffiliates(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = affiliates.filter((a) => {
    const term = search.toLowerCase();
    const name = (a.name || a.code || '').toLowerCase();
    return name.includes(term);
  });

  return (
    <div className="space-y-4 min-w-0">
      <BackofficePageHeader
        title="Afiliados"
        subtitle="Gestión de códigos, comisiones y liquidación de ganancias."
        count={affiliates.length}
        countLabel="afiliados"
        actions={
          <BackofficePrimaryAction icon={Plus} variant="admin">
            Nuevo Afiliado
          </BackofficePrimaryAction>
        }
      />

      <BackofficeSearch
        value={search}
        onChange={setSearch}
        placeholder="Buscar afiliado o código..."
      />

      <BackofficeResponsiveDataList
        data={filtered}
        loading={loading}
        keyExtractor={(aff) => aff.id}
        emptyTitle="SIN AFILIADOS REGISTRADOS"
        emptyDescription="Los afiliados y sus códigos promocionales aparecerán aquí."
        renderCard={(aff) => {
          const nombre = aff.name || 'Sin Nombre';
          const usuario = aff.email || 'N/D';
          const ganancia = aff.total_earnings || aff.earned_commissions || 0;

          return (
            <div key={aff.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2 shadow-2xs min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 bg-pink-50 text-pink-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-gray-900 dark:text-white text-xs truncate">{nombre}</h4>
                    <span className="text-[10px] text-gray-400 font-mono block truncate">Usuario: {usuario}</span>
                  </div>
                </div>

                <BackofficeStatusBadge
                  status="code"
                  label={aff.code || 'GOD_MODE'}
                  type="info"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  Comisión: {aff.base_commission_rate || 10}% · ${ganancia.toLocaleString()}
                </span>

                <BackofficeActionMenu
                  items={[
                    { label: 'Editar', icon: Edit, onClick: () => {} },
                    { label: 'Eliminar', icon: Trash2, onClick: () => {}, danger: true },
                  ]}
                />
              </div>
            </div>
          );
        }}
        renderTableHeader={() => (
          <tr>
            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Nombre</th>
            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Código</th>
            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Comisión</th>
            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase tracking-wider">Ganancias</th>
            <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
          </tr>
        )}
        renderTableRow={(aff) => (
          <tr key={aff.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
            <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{aff.name || 'Sin Nombre'}</td>
            <td className="px-6 py-4 font-mono font-bold text-indigo-600">{aff.code || 'GOD_MODE'}</td>
            <td className="px-6 py-4 font-semibold text-gray-700 dark:text-gray-300">{aff.base_commission_rate || 10}%</td>
            <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400">${(aff.total_earnings || 0).toLocaleString()}</td>
            <td className="px-6 py-4 text-right">
              <BackofficeActionMenu
                items={[
                  { label: 'Editar', icon: Edit, onClick: () => {} },
                  { label: 'Eliminar', icon: Trash2, onClick: () => {}, danger: true },
                ]}
              />
            </td>
          </tr>
        )}
      />
    </div>
  );
}
