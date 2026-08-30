import React, { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, X, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { useToast } from '../admin/Toast';

export interface EmailRecipient {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface EmailRecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: EmailRecipient[];
  onSave: (updatedRecipients: EmailRecipient[]) => Promise<void> | void;
  scope?: 'admin' | 'vendor';
}

export const EmailRecipientsModal: React.FC<EmailRecipientsModalProps> = ({
  isOpen,
  onClose,
  recipients,
  onSave,
  scope = 'admin'
}) => {
  const { toast } = useToast();
  const [draftRecipients, setDraftRecipients] = useState<EmailRecipient[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!recipients || recipients.length === 0) {
        setDraftRecipients([
          {
            id: `email-${Date.now()}-1`,
            name: scope === 'admin' ? 'Administración' : 'Dueño',
            email: '',
            active: true
          }
        ]);
      } else {
        setDraftRecipients(JSON.parse(JSON.stringify(recipients)));
      }
    }
  }, [isOpen, recipients, scope]);

  if (!isOpen) return null;

  const activeCount = draftRecipients.filter(r => r.active && r.email.trim() !== '').length;

  const handleAddRecipient = () => {
    if (draftRecipients.length >= 3) {
      toast.error('Solo se permiten hasta 3 destinatarios de correo.');
      return;
    }

    const defaultNames = ['Administración', 'Depósito', 'Soporte'];
    const nextIndex = draftRecipients.length;
    const newRecipient: EmailRecipient = {
      id: `email-${Date.now()}-${nextIndex + 1}`,
      name: defaultNames[nextIndex] || `Destinatario ${nextIndex + 1}`,
      email: '',
      active: true
    };
    setDraftRecipients([...draftRecipients, newRecipient]);
  };

  const handleRemoveRecipient = (id: string) => {
    if (draftRecipients.length <= 1) {
      toast.error('Debe existir al menos un registro de destinatario.');
      return;
    }
    setDraftRecipients(draftRecipients.filter(r => r.id !== id));
  };

  const handleUpdateField = (id: string, field: keyof EmailRecipient, value: any) => {
    setDraftRecipients(
      draftRecipients.map(r => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSaveInternal = async () => {
    if (draftRecipients.length > 3) {
      toast.error('Máximo 3 destinatarios permitidos.');
      return;
    }

    for (const r of draftRecipients) {
      const emailClean = r.email.trim();
      if (r.active) {
        if (emailClean === '') {
          toast.error(`El destinatario "${r.name || 'Email'}" está activo pero no tiene un correo ingresado.`);
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
          toast.error(`El formato de correo "${r.email}" no es válido.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await onSave(draftRecipients);
      toast.success('Configuración de destinatarios email guardada correctamente');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar destinatarios');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" role="dialog" aria-modal="true">
      <div 
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 w-full sm:w-calc(100vw-24px) max-w-3xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="p-2 sm:p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">DESTINATARIOS EMAIL</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider shrink-0">
                  MÁX. 3
                </span>
                <span className="text-xs text-gray-500 font-medium shrink-0">
                  {activeCount} de {draftRecipients.length} activo(s)
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate hidden sm:block">
                Configurá hasta 3 cuentas internas para recibir notificaciones y reportes del sistema.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {draftRecipients.map((recipient, index) => {
              const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email.trim());
              const isReady = recipient.active && isValidEmail;

              return (
                <div
                  key={recipient.id || index}
                  className={`p-4 rounded-xl border transition-all ${
                    isReady
                      ? 'bg-white border-blue-200 shadow-sm'
                      : 'bg-gray-50/70 border-gray-200'
                  }`}
                >
                  {/* Card Top */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      EMAIL {index + 1}
                    </span>
                    {draftRecipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(recipient.id)}
                        className="text-gray-400 hover:text-rose-600 transition-colors p-1.5 rounded hover:bg-rose-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Eliminar este destinatario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Nombre / Rol
                      </label>
                      <input
                        type="text"
                        value={recipient.name}
                        onChange={(e) => handleUpdateField(recipient.id, 'name', e.target.value)}
                        placeholder="Ej: Administración"
                        className="w-full text-base sm:text-xs px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black bg-white min-h-[44px] sm:min-h-[36px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        value={recipient.email}
                        onChange={(e) => handleUpdateField(recipient.id, 'email', e.target.value)}
                        placeholder="ejemplo@collectibles.uy"
                        className="w-full text-base sm:text-xs font-mono px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-black focus:border-black bg-white min-h-[44px] sm:min-h-[36px]"
                      />
                    </div>

                    {/* Active & Status Badge */}
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer select-none py-1">
                        <input
                          type="checkbox"
                          checked={recipient.active}
                          onChange={(e) => handleUpdateField(recipient.id, 'active', e.target.checked)}
                          className="w-5 h-5 sm:w-4 sm:h-4 text-black border-gray-300 rounded focus:ring-black cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-700 ml-2">Activo</span>
                      </label>

                      {isReady ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Listo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full">
                          <AlertCircle className="w-3 h-3 text-gray-400" />
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Recipient Button */}
          {draftRecipients.length < 3 && (
            <button
              type="button"
              onClick={handleAddRecipient}
              className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 text-xs font-bold hover:bg-blue-50/50 hover:border-blue-300 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Agregar destinatario ({draftRecipients.length}/3)
            </button>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 sticky bottom-0 z-10 pb-safe">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 sm:flex-none py-2.5 px-4 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] sm:min-h-[36px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveInternal}
            disabled={saving}
            className="flex-1 sm:flex-none py-2.5 px-5 text-xs font-bold text-white bg-black rounded-lg hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm min-h-[44px] sm:min-h-[36px]"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
};
