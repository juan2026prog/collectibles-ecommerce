import { useState, useRef } from 'react';
import { Download, UploadCloud, X, FileText, CheckCircle2, AlertTriangle, RefreshCw, BookOpen, FileCheck2 } from 'lucide-react';
import { parseAndPreviewImportFile, executeBulkImport } from '../../lib/bulkImportEngine';
import type { ImportPreviewResult, ImportExecutionResult, ParsedImportRow } from '../../lib/bulkImportEngine';
import { downloadXlsxImportTemplate } from '../../lib/bulkTemplateGenerator';
import ImportGuideModal from './ImportGuideModal';

export interface ImportModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  userRole?: 'admin' | 'vendor';
  currentVendorId?: string | null;
}

export default function ImportModal({
  onClose,
  onSuccess,
  userRole = 'admin',
  currentVendorId = null
}: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'invalid'>('all');

  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setError(null);
    setParsing(true);
    try {
      const result = await parseAndPreviewImportFile(selectedFile, userRole, currentVendorId);
      if (result.rows.length === 0) {
        setError('No se encontraron filas válidas en el archivo subido.');
      } else {
        setPreview(result);
      }
    } catch (err: any) {
      setError('Error al procesar el archivo: ' + (err.message || String(err)));
    } finally {
      setParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await executeBulkImport(preview.rows, userRole, currentVendorId);
      setExecutionResult(result);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError('Error al ejecutar la importación: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!preview && !executionResult) return;

    let content = 'Fila,SKU,Tipo,Mensaje\r\n';
    if (preview) {
      preview.rows.filter(r => r.errors.length > 0).forEach(r => {
        content += `${r.rowIndex},"${r.sku}","Error de Validación","${r.errors.join(' | ').replace(/"/g, '""')}"\r\n`;
      });
    }
    if (executionResult) {
      executionResult.errors.forEach(e => {
        content += `${e.rowIndex},"${e.sku}","Error de Ejecución","${e.error.replace(/"/g, '""')}"\r\n`;
      });
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Errores_Importacion_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const displayedRows = preview ? preview.rows.filter(r => {
    if (filterMode === 'valid') return r.operation !== 'invalid';
    if (filterMode === 'invalid') return r.operation === 'invalid';
    return true;
  }) : [];

  return (
    <>
      {showGuide && <ImportGuideModal onClose={() => setShowGuide(false)} userRole={userRole} />}
      
      <div className="fixed inset-0 bg-slate-950/75 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 m-auto w-full max-w-4xl h-[88vh] bg-white z-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Importación Masiva de Productos</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Sube tu planilla XLSX o CSV para crear o actualizar catálogo por SKU</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-xl hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" /> Guía de Importación
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* STEP 1: Upload View */}
          {!preview && !executionResult && (
            <div className="space-y-6 my-auto pt-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 rounded-3xl ${
                  isDragging ? 'border-primary-500 bg-primary-50/40 scale-[1.01]' : 'border-slate-200 bg-slate-50/50 hover:border-primary-400 hover:bg-slate-50'
                }`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" className="hidden" />
                <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  {parsing ? <RefreshCw className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">
                  {parsing ? 'Analizando planilla...' : 'Haz clic o arrastra tu archivo aquí'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Soporta planillas en formato .CSV, .XLS, y .XLSX</p>
                {error && <p className="text-sm text-red-600 font-bold mt-4 bg-red-50 border border-red-100 p-3 rounded-xl">{error}</p>}
              </div>

              {/* Template Download Banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between bg-emerald-50/60 p-5 border border-emerald-100 rounded-2xl gap-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-emerald-900 text-sm">¿Necesitas la plantilla oficial de Collectibles?</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">Descarga el XLSX dinámico con flechitas desplegables para Marcas, Categorías, Condición y Guía integrada.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadXlsxImportTemplate(userRole)}
                  className="btn-secondary whitespace-nowrap bg-white text-xs px-4 py-2.5 flex items-center gap-2 border border-emerald-200 rounded-xl hover:bg-emerald-50 font-bold text-emerald-800 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4 text-emerald-600" /> Descargar Plantilla XLSX
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Preview View */}
          {preview && !executionResult && (
            <div className="space-y-5">
              
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filas Leídas</div>
                  <div className="text-xl font-black text-slate-800 mt-0.5">{preview.summary.totalRows}</div>
                </div>
                <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Nuevos a Crear</div>
                  <div className="text-xl font-black text-emerald-700 mt-0.5">{preview.summary.newCount}</div>
                </div>
                <div className="bg-blue-50/80 border border-blue-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">A Actualizar</div>
                  <div className="text-xl font-black text-blue-700 mt-0.5">{preview.summary.updateCount}</div>
                </div>
                <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Sin Cambios</div>
                  <div className="text-xl font-black text-amber-700 mt-0.5">{preview.summary.unchangedCount}</div>
                </div>
                <div className="bg-red-50/80 border border-red-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Con Errores</div>
                  <div className="text-xl font-black text-red-700 mt-0.5">{preview.summary.errorCount}</div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center justify-between bg-slate-100/80 p-1.5 rounded-xl text-xs font-bold">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterMode === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Todas ({preview.rows.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('valid')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterMode === 'valid' ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Válidas ({preview.rows.filter(r => r.operation !== 'invalid').length})
                  </button>
                  <button
                    onClick={() => setFilterMode('invalid')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${filterMode === 'invalid' ? 'bg-white shadow text-red-700' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Rechazadas ({preview.rows.filter(r => r.operation === 'invalid').length})
                  </button>
                </div>
                {preview.summary.errorCount > 0 && (
                  <button
                    onClick={downloadErrorReport}
                    className="text-red-700 hover:text-red-800 underline px-2 font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar Errores
                  </button>
                )}
              </div>

              {/* Preview Table */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden max-h-[340px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100/90 backdrop-blur-sm sticky top-0">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left font-bold text-slate-500 uppercase">Fila</th>
                      <th className="px-3.5 py-2.5 text-left font-bold text-slate-500 uppercase">SKU</th>
                      <th className="px-3.5 py-2.5 text-left font-bold text-slate-500 uppercase">Título</th>
                      <th className="px-3.5 py-2.5 text-left font-bold text-slate-500 uppercase">Operación</th>
                      <th className="px-3.5 py-2.5 text-left font-bold text-slate-500 uppercase">Cambios / Errores</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {displayedRows.map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3.5 py-2 font-mono text-slate-400 font-bold">{row.rowIndex}</td>
                        <td className="px-3.5 py-2 font-mono font-bold text-slate-700">{row.sku}</td>
                        <td className="px-3.5 py-2 font-semibold text-slate-800 max-w-[200px] truncate">{row.title}</td>
                        <td className="px-3.5 py-2 font-bold whitespace-nowrap">
                          {row.operation === 'create' && (
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                              Nuevo
                            </span>
                          )}
                          {row.operation === 'update' && (
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                              Actualizar
                            </span>
                          )}
                          {row.operation === 'unchanged' && (
                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                              Sin Cambios
                            </span>
                          )}
                          {row.operation === 'invalid' && (
                            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200">
                              Rechazado
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2">
                          {row.errors.length > 0 ? (
                            <div className="text-red-600 font-semibold space-y-0.5">
                              {row.errors.map((err, ei) => (
                                <div key={ei} className="flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {err}
                                </div>
                              ))}
                            </div>
                          ) : row.operation === 'unchanged' ? (
                            <span className="text-slate-400 font-medium">Idéntico a la base de datos</span>
                          ) : row.changedFieldsDetail && row.changedFieldsDetail.length > 0 ? (
                            <div className="text-blue-700 font-medium space-y-0.5">
                              {row.changedFieldsDetail.map((cf, cfi) => (
                                <div key={cfi} className="text-[11px]">
                                  <span className="font-bold">{cf.fieldLabel}:</span> {String(cf.oldValue ?? 'vacío')} → <span className="font-bold text-blue-800">{String(cf.newValue)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Listo para crear
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* STEP 3: Execution Result View */}
          {executionResult && (
            <div className="space-y-6 my-auto pt-4 text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <FileCheck2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">¡Importación Masiva Completada!</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Los cambios han sido aplicados exitosamente al catálogo de Collectibles.uy</p>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                  <div className="text-2xl font-black text-emerald-700">{executionResult.createdCount}</div>
                  <div className="text-xs font-bold text-emerald-800 mt-0.5">Creados</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
                  <div className="text-2xl font-black text-blue-700">{executionResult.updatedCount}</div>
                  <div className="text-xs font-bold text-blue-800 mt-0.5">Actualizados</div>
                </div>
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl">
                  <div className="text-2xl font-black text-red-700">{executionResult.rejectedCount}</div>
                  <div className="text-xs font-bold text-red-800 mt-0.5">Rechazados</div>
                </div>
              </div>

              {executionResult.rejectedCount > 0 && (
                <div className="pt-2">
                  <button
                    onClick={downloadErrorReport}
                    className="btn-secondary text-xs px-4 py-2 font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 flex items-center gap-2 mx-auto"
                  >
                    <Download className="w-4 h-4" /> Descargar Reporte de Errores
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          {preview && !executionResult ? (
            <>
              <button
                onClick={() => setPreview(null)}
                className="btn-secondary rounded-xl text-xs py-2.5 px-4 border border-slate-200 hover:bg-slate-100 transition-colors font-bold text-slate-600"
              >
                Cancelar y Subir Otro Archivo
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={importing || preview.summary.newCount + preview.summary.updateCount === 0}
                className="btn-primary rounded-xl text-xs py-2.5 px-6 font-bold flex items-center gap-2 shadow-lg shadow-primary-500/20 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Procesando Importación...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" /> Confirmar e Importar {preview.summary.newCount + preview.summary.updateCount} Productos Válidos
                  </>
                )}
              </button>
            </>
          ) : executionResult ? (
            <div className="w-full flex justify-end">
              <button
                onClick={onClose}
                className="btn-primary rounded-xl text-xs py-2.5 px-6 font-bold shadow-lg shadow-primary-500/20"
              >
                Cerrar Ventana
              </button>
            </div>
          ) : (
            <div className="w-full flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
