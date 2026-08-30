import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function MobileDrawer({ isOpen, onClose, title, children }: MobileDrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Content */}
      <div className="fixed inset-y-0 left-0 w-[85vw] max-w-[320px] bg-dark-900 text-gray-300 shadow-2xl flex flex-col z-10 transform transition-transform duration-300 ease-in-out animate-slideRight">
        {/* Header */}
        <div className="p-4 border-b border-dark-800 flex items-center justify-between bg-dark-900 sticky top-0 z-10">
          <span className="font-bold text-white text-base truncate">{title || 'Menú'}</span>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body / Nav List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 pb-safe">
          {children}
        </div>
      </div>
    </div>
  );
}
