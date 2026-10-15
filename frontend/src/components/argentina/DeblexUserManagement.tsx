import React, { useState } from 'react';
import { Users, UserPlus, Shield, UserX, AlertCircle, CheckCircle2, Mail, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface DeblexUserItem {
  id: string;
  email: string;
  role: 'deblex_admin' | 'deblex_operator';
  is_active: boolean;
  created_at: string;
}

interface DeblexUserManagementProps {
  currentUserEmail?: string;
  users: DeblexUserItem[];
  onRefreshUsers: () => Promise<void>;
}

export const DeblexUserManagement: React.FC<DeblexUserManagementProps> = ({
  currentUserEmail,
  users,
  onRefreshUsers,
}) => {
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'deblex_operator' | 'deblex_admin'>('deblex_operator');
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Core business rule: Max 8 Deblex accounts in total (2 initial admins + max 6 operators)
  const MAX_TOTAL_DEBLEX_USERS = 8;
  const currentCount = users.length;
  const canCreateMore = currentCount < MAX_TOTAL_DEBLEX_USERS;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateMore) {
      setStatusMessage({
        type: 'error',
        text: `Se ha alcanzado el límite máximo permitido de ${MAX_TOTAL_DEBLEX_USERS} usuarios del portal Deblex (2 administradores + 6 operadores).`,
      });
      return;
    }

    if (!newEmail || !newPassword) {
      setStatusMessage({ type: 'error', text: 'Completá correo y contraseña temporal.' });
      return;
    }

    setIsCreating(true);
    setStatusMessage(null);

    try {
      // Invocar Edge Function deblex-manage-users que valida JWT, admin Deblex y reserva cupo atómicamente
      const { data, error } = await supabase.functions.invoke('deblex-manage-users', {
        body: { email: newEmail.trim().toLowerCase() }
      });

      if (error) {
        setStatusMessage({ type: 'error', text: error.message || 'Error invocando función de gestión' });
      } else if (data && data.error) {
        setStatusMessage({ type: 'error', text: data.error });
      } else {
        setStatusMessage({ 
          type: 'success', 
          text: data?.message || `Invitación enviada exitosamente a ${newEmail}. Activará su cuenta por correo seguro.` 
        });
        setNewEmail('');
        await onRefreshUsers();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error al invitar operador' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('deblex_portal_users')
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      await onRefreshUsers();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error al cambiar estado' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-700/60 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            Gestión de Usuarios — Portal Deblex
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Administración de cuentas con acceso restringido al depósito y manifiestos de Miami.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg border border-gray-700 font-mono">
            Cupo de Cuentas: <strong className="text-white">{currentCount} / {MAX_TOTAL_DEBLEX_USERS}</strong>
          </span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-red-950/40 border-red-800 text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Create New User Form */}
      {canCreateMore ? (
        <div className="bg-gray-800/60 border border-gray-700/60 rounded-2xl p-5 space-y-4">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            Crear Usuario Adicional del Portal
          </span>
          <p className="text-xs text-gray-400">
            Los operadores creados solo tienen acceso a las operaciones logísticas de Miami en <code className="text-amber-300">/deblex</code> y no a la administración general de Collectibles.
          </p>

          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-gray-400 mb-1">Correo Electrónico del Operador *</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="operador@deblex.com.ar"
                required
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <UserPlus className="w-4 h-4" />
                {isCreating ? 'Enviando Invitación...' : 'Invitar Operador'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-4 bg-gray-800/40 border border-gray-700/60 rounded-2xl text-xs text-gray-400 flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0" />
          <span>
            Límite de 8 usuarios alcanzado (2 administradores + 6 operadores). Para habilitar más cuentas se requiere autorización administrativa.
          </span>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700/60 bg-gray-800/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-700/60 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3">Usuario (Email)</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Fecha de Alta</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/40 text-gray-300">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-700/20">
                <td className="p-3 font-medium text-white flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-500" />
                  {u.email}
                  {u.email === currentUserEmail && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      Tú
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      u.role === 'deblex_admin'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : 'bg-sky-950 text-sky-300 border border-sky-800'
                    }`}
                  >
                    {u.role === 'deblex_admin' ? 'Administrador Deblex' : 'Operador'}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      u.is_active
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-red-950 text-red-300 border border-red-800'
                    }`}
                  >
                    {u.is_active ? 'Activo' : 'Suspendido'}
                  </span>
                </td>
                <td className="p-3 text-gray-400 text-[11px]">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="p-3 text-right">
                  {u.email !== currentUserEmail && (
                    <button
                      onClick={() => handleToggleActive(u.id, u.is_active)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                        u.is_active
                          ? 'bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800'
                          : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {u.is_active ? 'Suspender' : 'Reactivar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
