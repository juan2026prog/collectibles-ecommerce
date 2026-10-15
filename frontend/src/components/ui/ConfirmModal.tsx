import { useState, useCallback, createContext, useContext } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// ConfirmModal — replaces native confirm() and prompt()
// Usage:
//   const { confirm, prompt } = useConfirmModal();
//   const ok = await confirm('¿Eliminar producto?', { danger: true });
//   const reason = await prompt('Razón de cancelación:');
// ═══════════════════════════════════════════════════════════

export interface ConfirmOptions {
  title?: string;
  danger?: boolean;
  type?: string;
  confirmText?: string;
  cancelText?: string;
  confirmLabel?: string;
  confirmVariant?: string;
  onConfirm?: () => Promise<void> | void;
}

export interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
}

interface ModalState {
  type: 'confirm' | 'prompt';
  message: string;
  options: PromptOptions;
  resolve: (value: any) => void;
}

export interface ConfirmModalContextType {
  confirm: (messageOrOptions: string | (ConfirmOptions & { message?: string }), options?: ConfirmOptions) => Promise<boolean>;
  prompt: (messageOrOptions: string | (PromptOptions & { message?: string }), options?: PromptOptions | string) => Promise<string | null>;
}

const ConfirmModalContext = createContext<ConfirmModalContextType | null>(null);

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [inputValue, setInputValue] = useState('');

  const confirmFn = useCallback((messageOrOptions: string | (ConfirmOptions & { message?: string }), options: ConfirmOptions = {}) => {
    let msg = '';
    let opts: ConfirmOptions = { ...options };

    if (typeof messageOrOptions === 'string') {
      msg = messageOrOptions;
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      msg = messageOrOptions.message || '';
      opts = { ...messageOrOptions, ...options };
    }

    if (opts.confirmLabel && !opts.confirmText) opts.confirmText = opts.confirmLabel;
    if (opts.confirmVariant === 'destructive' || opts.type === 'warning') opts.danger = true;

    return new Promise<boolean>((resolve) => {
      setModal({ type: 'confirm', message: msg, options: opts, resolve });
    });
  }, []);

  const promptFn = useCallback((
    messageOrOptions: string | (PromptOptions & { message?: string }),
    optionsOrPlaceholder?: PromptOptions | string
  ) => {
    let msg = '';
    let opts: PromptOptions = {};

    if (typeof optionsOrPlaceholder === 'string') {
      opts.defaultValue = optionsOrPlaceholder;
    } else if (optionsOrPlaceholder && typeof optionsOrPlaceholder === 'object') {
      opts = { ...optionsOrPlaceholder };
    }

    if (typeof messageOrOptions === 'string') {
      msg = messageOrOptions;
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      msg = messageOrOptions.message || '';
      opts = { ...messageOrOptions, ...opts };
    }

    return new Promise<string | null>((resolve) => {
      setInputValue(opts.defaultValue || '');
      setModal({ type: 'prompt', message: msg, options: opts, resolve });
    });
  }, []);

  const handleClose = async (result: any) => {
    if (result && modal?.options.onConfirm) {
      try {
        await modal.options.onConfirm();
      } catch (err) {
        console.error('Error in confirm onConfirm handler:', err);
      }
    }
    modal?.resolve(result);
    setModal(null);
    setInputValue('');
  };

  return (
    <ConfirmModalContext.Provider value={{ confirm: confirmFn, prompt: promptFn }}>
      {children}

      {modal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]" onClick={() => handleClose(modal.type === 'confirm' ? false : null)} />
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
              {/* Header */}
              <div className={`p-6 pb-4 flex items-start gap-4 ${modal.options.danger ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className={`p-2 rounded-xl ${modal.options.danger ? 'bg-red-100' : 'bg-blue-100'}`}>
                  <AlertTriangle className={`w-5 h-5 ${modal.options.danger ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">
                    {modal.options.title || (modal.options.danger ? 'Confirmar acción' : 'Confirmación')}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{modal.message}</p>
                </div>
                <button onClick={() => handleClose(modal.type === 'confirm' ? false : null)} className="p-1 rounded-lg hover:bg-black/5">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Prompt Input */}
              {modal.type === 'prompt' && (
                <div className="px-6 py-4">
                  <input
                    autoFocus
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder={modal.options.placeholder || ''}
                    onKeyDown={e => e.key === 'Enter' && handleClose(inputValue)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="px-6 py-4 flex justify-end gap-3 bg-white border-t border-gray-100">
                <button
                  onClick={() => handleClose(modal.type === 'confirm' ? false : null)}
                  className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  {modal.options.cancelText || 'Cancelar'}
                </button>
                <button
                  onClick={() => handleClose(modal.type === 'confirm' ? true : inputValue)}
                  className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-colors shadow-sm ${
                    modal.options.danger
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                  }`}
                >
                  {modal.options.confirmText || 'Confirmar'}
                </button>
              </div>
            </div>
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scale-in {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
            .animate-scale-in {
              animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}} />
        </>
      )}
    </ConfirmModalContext.Provider>
  );
}

export function useConfirmModal() {
  const ctx = useContext(ConfirmModalContext);
  if (!ctx) throw new Error('useConfirmModal must be used within ConfirmModalProvider');
  return ctx;
}

export default ConfirmModalProvider;
