import React, { useState } from 'react';
import { Users, UserPlus, Shield, UserX, AlertCircle, CheckCircle2, Mail, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface DeblexUserItem {
  id: string;
  email: string;
  role: 'deblex_admin' | 'deblex_operator';
  is_active: boolean;
  status?: string;
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

    if (!newEmail) {
      setStatusMessage({ type: 'error', text: 'Completá el correo electrónico del operador.' });
      return;
    }

    setIsCreating(true);
    setStatusMessage(null);

    try {
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
    <div className="space-y-4">
      <div className="bg-white border border-[#dce6eb] rounded-xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#edf1f4] gap-3">
          <div>
            <h2 className="text-base font-bold text-[#182f3c] flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#146981]" />
              Gestión de Usuarios — Envíos by Deblex
            </h2>
            <p className="text-[11px] text-[#6b808d] mt-0.5">
              Administración de cuentas con acceso operativo a Miami. Cupo máximo estricto: 2 administradores + 6 operadores.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#f5f8fa] border border-[#dce6eb] rounded-lg text-xs font-medium text-[#182f3c]">
            <span>Cupo asignado:</span>
            <strong className="text-[#146981] font-bold">
              {currentCount} / {MAX_TOTAL_DEBLEX_USERS}
            </strong>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-xs flex items-start gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Invite Form */}
        <form onSubmit={handleCreateUser} className="mt-3.5 p-3.5 bg-[#f8fbfc] border border-[#e2edf1] rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#182f3c] uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#146981]" />
              Invitar Nuevo Operador Deblex
            </span>
            <span className="text-[10px] text-[#6b808d]">
              {canCreateMore ? 'Cupos disponibles' : 'Cupo completo alcanzado'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-[#617885] mb-0.5">
                Correo Electrónico Corporativo
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-[#8ea4b0] absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="operador@deblex.com.ar"
                  required
                  disabled={!canCreateMore || isCreating}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-[#cddbe1] rounded-lg text-[#182f3c] placeholder-[#9fb5c0] focus:outline-none focus:ring-1 focus:ring-[#146981] disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-[#617885] mb-0.5">
                Rol Operativo
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                disabled={!canCreateMore || isCreating}
                className="w-full px-2.5 py-1 text-xs bg-white border border-[#cddbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981] disabled:opacity-50"
              >
                <option value="deblex_operator">Operador Miami (Recepción/Pesaje/Despacho)</option>
                <option value="deblex_admin">Administrador (Control total)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-0.5">
            <button
              type="submit"
              disabled={!canCreateMore || isCreating}
              className="px-3 py-1.5 bg-[#146981] hover:bg-[#0e5266] text-white font-semibold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando invitación...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Enviar Invitación Segura</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Users Table */}
        <div className="mt-4">
          <h3 className="text-[11px] font-bold text-[#182f3c] uppercase tracking-wider mb-2">
            Usuarios Activos & Registrados ({users.length})
          </h3>
          <div className="overflow-x-auto border border-[#edf1f4] rounded-lg">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#f5f8fa] text-[#698190] border-b border-[#edf1f4]">
                  <th className="py-2 px-3 font-semibold text-[11px]">Correo Electrónico</th>
                  <th className="py-2 px-3 font-semibold text-[11px]">Rol</th>
                  <th className="py-2 px-3 font-semibold text-[11px]">Estado</th>
                  <th className="py-2 px-3 font-semibold text-[11px]">Fecha Registro</th>
                  <th className="py-2 px-3 font-semibold text-right text-[11px]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f4]">
                {users.map((u) => {
                  const isCurrent = u.email === currentUserEmail;
                  const isAdmin = u.role === 'deblex_admin';

                  return (
                    <tr key={u.id} className="hover:bg-[#f8fbfc] transition">
                      <td className="py-2 px-3 font-medium text-[#182f3c] flex items-center gap-1.5 text-[11px]">
                        {isAdmin ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-[#146981]" />
                        ) : (
                          <Users className="w-3.5 h-3.5 text-[#6b808d]" />
                        )}
                        <span>{u.email}</span>
                        {isCurrent && (
                          <span className="px-1 py-0.2 bg-[#e7f3f7] text-[#125d77] text-[9px] rounded font-bold">
                            Tú
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            isAdmin
                              ? 'bg-[#e7f3f7] text-[#125d77]'
                              : 'bg-[#f0f4f7] text-[#556976]'
                          }`}
                        >
                          {isAdmin ? 'Administrador' : 'Operador Miami'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            u.is_active
                              ? 'bg-[#dff2e9] text-[#146946]'
                              : 'bg-[#fde8e8] text-[#9b1c1c]'
                          }`}
                        >
                          {u.is_active ? 'ACTIVO' : 'SUSPENDIDO'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[#718795] text-[11px]">
                        {new Date(u.created_at).toLocaleDateString('es-AR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!isCurrent && (
                          <button
                            onClick={() => handleToggleActive(u.id, u.is_active)}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition cursor-pointer ${
                              u.is_active
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.is_active ? 'Suspender' : 'Reactivar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
