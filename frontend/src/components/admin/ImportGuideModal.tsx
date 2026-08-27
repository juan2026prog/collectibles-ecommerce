import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Download, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getMasterFields } from '../../lib/productFieldRegistry';
import { downloadXlsxImportTemplate } from '../../lib/bulkTemplateGenerator';

export interface ImportGuideModalProps {
  onClose: () => void;
  userRole?: 'admin' | 'vendor';
}

export default function ImportGuideModal({ onClose, userRole = 'admin' }: ImportGuideModalProps) {
  const fields = useMemo(() => getMasterFields(userRole).filter(f => f.importable), [userRole]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-950/80 z-[1050] backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 m-auto w-full max-w-5xl h-[88vh] bg-white z-[1100] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">Guía Oficial de Importación Masiva</h2>
              <p className="text-xs text-slate-500 font-medium">Especificación centralizada de columnas, tipos de datos y reglas de validación</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadXlsxImportTemplate(userRole)}
              className="btn-secondary text-xs px-3.5 py-2 font-bold flex items-center gap-2 border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"
            >
              <Download className="w-4 h-4 text-emerald-600" /> Descargar Plantilla XLSX
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
              aria-label="Cerrar Guía de Importación"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* Key Principles Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide">Identificación por SKU</h4>
                <p className="text-xs text-blue-700 mt-1 font-medium">El SKU es la clave única. Si existe, actualiza el producto. Si no existe o está vacío, crea uno nuevo.</p>
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Actualizaciones Parciales</h4>
                <p className="text-xs text-amber-700 mt-1 font-medium">Las columnas ausentes en tu archivo no modificarán los datos existentes del catálogo.</p>
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Validación Estricta</h4>
                <p className="text-xs text-emerald-700 mt-1 font-medium">Marcas y categorías deben existir previamente en Collectibles.uy para ser aceptadas.</p>
              </div>
            </div>
          </div>

          {/* Dynamic Master Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
                    <th className="p-3.5 px-4">#</th>
                    <th className="p-3.5 px-4">Campo (Columna)</th>
                    <th className="p-3.5 px-4">Obligatorio</th>
                    <th className="p-3.5 px-4">Tipo</th>
                    <th className="p-3.5 px-4">Descripción y Reglas</th>
                    <th className="p-3.5 px-4">Ejemplo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-xs">
                  {fields.map(field => (
                    <tr key={field.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 px-4 font-mono font-bold text-slate-400">{field.order}</td>
                      <td className="p-3.5 px-4 font-bold text-slate-800">
                        {field.label}
                        <div className="text-[10px] font-mono text-slate-400 font-normal mt-0.5">{field.key}</div>
                      </td>
                      <td className="p-3.5 px-4">
                        {field.requiredForPublish ? (
                          <span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded border border-red-200 text-[11px]">
                            Obligatorio
                          </span>
                        ) : field.requiredForCreate ? (
                          <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                            Al crear
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">Opcional</span>
                        )}
                      </td>
                      <td className="p-3.5 px-4 font-mono text-slate-600 font-medium">
                        {field.type.toUpperCase()}
                      </td>
                      <td className="p-3.5 px-4 text-slate-600 leading-relaxed">
                        {field.description}
                        {field.allowedValues && (
                          <div className="mt-1 text-[11px] font-mono bg-slate-50 p-1.5 rounded border border-slate-200 text-slate-700">
                            Valores: {field.allowedValues.map(v => v.value).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 px-4 font-mono text-slate-700 bg-slate-50/50">
                        {field.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary rounded-xl text-xs py-2.5 px-6 font-bold"
          >
            Entendido
          </button>
        </div>

      </div>
    </>,
    document.body
  );
}
