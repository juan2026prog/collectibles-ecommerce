import React, { useState } from 'react';
import { Mail, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react';

export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface EmailRecipientsConfigProps {
  recipients: EmailRecipient[];
  onChange: (recipients: EmailRecipient[]) => void;
  maxRecipients?: number;
  disabled?: boolean;
  scope?: 'admin' | 'vendor';
}

const DEFAULT_ROLES_ADMIN = ['Administración', 'Depósito', 'Contabilidad'];
const DEFAULT_ROLES_VENDOR = ['Dueño', 'Depósito', 'Administración'];

export const EmailRecipientsConfig: React.FC<EmailRecipientsConfigProps> = ({
  recipients = [],
  onChange,
  maxRecipients = 3,
  disabled = false,
  scope = 'admin'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isValidEmail = (email: string) => {
    if (!email || !email.trim()) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleAddRecipient = () => {
    if (recipients.length >= maxRecipients || disabled) return;

    const defaultRoles = scope === 'vendor' ? DEFAULT_ROLES_VENDOR : DEFAULT_ROLES_ADMIN;
    const existingCount = recipients.length;
    const defaultName = defaultRoles[existingCount] || `Email ${existingCount + 1}`;

    const newRecipient: EmailRecipient = {
      id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: defaultName,
      email: '',
      active: true
    };

    onChange([...recipients, newRecipient]);
  };

  const handleUpdateRecipient = (id: string, field: keyof EmailRecipient, value: any) => {
    if (disabled) return;
    const updated = recipients.map((r) => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    });
    onChange(updated);
  };

  const handleRemoveRecipient = (id: string) => {
    if (disabled) return;
    onChange(recipients.filter((r) => r.id !== id));
  };

  const activeCount = recipients.filter(r => r.active && isValidEmail(r.email)).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-slate-800 text-base">DESTINATARIOS EMAIL</h4>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">
                MÁX. {maxRecipients}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {scope === 'vendor'
                ? 'Configurá hasta 3 casillas de correo para recibir avisos de ventas y alertas de tu tienda.'
                : 'Configurá hasta 3 cuentas internas para recibir notificaciones y reportes del sistema.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-slate-500 font-medium mr-1">
            {activeCount} de {recipients.length} activo(s)
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            {isOpen ? (
              <>
                <span>Cerrar configuración</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Configurar</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Badge when collapsed */}
      {!isOpen && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {recipients.length === 0 ? (
            <span className="text-xs text-slate-400 italic">No hay destinatarios configurados</span>
          ) : (
            recipients.map((r, idx) => (
              <div
                key={r.id || idx}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                  r.active && isValidEmail(r.email)
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200 opacity-60'
                }`}
              >
                <span className="font-semibold">{r.name || `Email ${idx + 1}`}:</span>
                <span>{r.email || '(Sin email)'}</span>
                {r.active && isValidEmail(r.email) ? (
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                ) : (
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded">Inactivo</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Expanded Configuration Section */}
      {isOpen && (
        <div className="space-y-4 pt-2">
          {recipients.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No tenés destinatarios de email agregados</p>
              <p className="text-xs text-slate-400 mb-4">Podés agregar hasta 3 casillas para recibir avisos.</p>
              <button
                type="button"
                onClick={handleAddRecipient}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar primer destinatario</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-3">
              {recipients.map((recipient, index) => {
                const emailValid = isValidEmail(recipient.email);
                const hasError = recipient.active && !emailValid && recipient.email.length > 0;

                return (
                  <div
                    key={recipient.id || index}
                    className={`relative p-4 rounded-xl border transition-all ${
                      recipient.active
                        ? emailValid
                          ? 'border-indigo-200 bg-indigo-50/30 shadow-sm'
                          : 'border-amber-300 bg-amber-50/30'
                        : 'border-slate-200 bg-slate-50/60 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        EMAIL {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(recipient.id)}
                        disabled={disabled}
                        title="Eliminar destinatario"
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded-md hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Name / Role Field */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Nombre / Rol
                        </label>
                        <input
                          type="text"
                          value={recipient.name}
                          onChange={(e) => handleUpdateRecipient(recipient.id, 'name', e.target.value)}
                          placeholder="Ej: Administración, Depósito"
                          disabled={disabled}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                        />
                      </div>

                      {/* Email Field */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Correo Electrónico
                        </label>
                        {(() => {
                          const trimmed = (recipient.email || '').trim().toLowerCase();
                          const isDuplicate = trimmed !== '' && recipients.some((r, idx) => idx !== index && (r.email || '').trim().toLowerCase() === trimmed);
                          return (
                            <>
                              <input
                                type="email"
                                value={recipient.email}
                                onChange={(e) => handleUpdateRecipient(recipient.id, 'email', e.target.value)}
                                placeholder="usuario@dominio.com"
                                disabled={disabled}
                                className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 bg-white ${
                                  hasError || isDuplicate
                                    ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
                                    : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                                }`}
                              />
                              {hasError && (
                                <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>Formato de email inválido</span>
                                </p>
                              )}
                              {!hasError && isDuplicate && (
                                <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>Correo electrónico duplicado</span>
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Active Checkbox */}
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200/60">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={recipient.active}
                            onChange={(e) => handleUpdateRecipient(recipient.id, 'active', e.target.checked)}
                            disabled={disabled}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <span>Activo</span>
                        </label>

                        {recipient.active && emailValid && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Listo para recibir
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Button if < maxRecipients */}
          {recipients.length < maxRecipients && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleAddRecipient}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar destinatario ({recipients.length}/{maxRecipients})</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
