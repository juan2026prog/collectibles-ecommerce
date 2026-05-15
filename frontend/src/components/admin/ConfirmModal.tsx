import { useState, useCallback, createContext, useContext } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// ConfirmModal — replaces native confirm() and prompt()
// Usage:
//   const { confirm, prompt } = useConfirmModal();
//   const ok = await confirm('¿Eliminar producto?', { danger: true });
//   const reason = await prompt('Razón de cancelación:');
// ═══════════════════════════════════════════════════════════

interface ConfirmOptions {
  title?: string;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
}

interface ModalState {
  type: 'confirm' | 'prompt';
  message: string;
  options: ConfirmOptions & PromptOptions;
  resolve: (value: any) => void;
}

interface ConfirmModalContextType {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
}

const ConfirmModalContext = createContext<ConfirmModalContextType | null>(null);

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [inputValue, setInputValue] = useState('');

  const confirmFn = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setModal({ type: 'confirm', message, options, resolve });
    });
  }, []);

  const promptFn = useCallback((message: string, options: PromptOptions = {}) => {
    return new Promise<string | null>((resolve) => {
      setInputValue(options.defaultValue || '');
      setModal({ type: 'prompt', message, options, resolve });
    });
  }, []);

  const handleClose = (result: any) => {
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
