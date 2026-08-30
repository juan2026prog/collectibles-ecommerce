import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-lg', 'max-w-2xl'
}

export default function ResponsiveModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-xl'
}: ResponsiveModalProps) {
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
    <div className="fixed inset-0 z-50 overflow-y-auto flex flex-col justify-end md:justify-center items-center p-0 md:p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div className={`relative w-full ${maxWidth} bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh] z-10 animate-slideUp md:animate-scaleUp overflow-hidden border border-gray-100`}>
        {/* Sticky Header */}
        <div className="p-4 md:p-5 border-b border-gray-200 bg-white sticky top-0 z-20 flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <h3 className="font-bold text-gray-900 text-base md:text-lg truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 text-sm text-gray-700 space-y-4">
          {children}
        </div>

        {/* Sticky Footer (if provided) */}
        {footer && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 sticky bottom-0 z-20 pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
