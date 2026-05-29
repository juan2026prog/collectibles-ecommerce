import { useState, useRef } from 'react';
import { Download, UploadCloud, X, FileText, CheckCircle2 } from 'lucide-react';
import { downloadTemplate, parseProductsFile, type ParsedProduct } from '../../lib/bulkImportUtils';

export default function ImportModal({ onClose, onConfirm }: { onClose: () => void, onConfirm: (products: ParsedProduct[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setError(null);
    try {
      const products = await parseProductsFile(selectedFile);
      if (products.length === 0) {
        setError('No se encontraron productos válidos. Asegúrate de que tu planilla tenga una columna identificada como "título", "nombre", o "title" y no esté vacía.');
      } else {
        setParsed(products);
      }
    } catch (err: any) {
      setError('Error al procesar el archivo: ' + err.message);
    }
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

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 m-auto w-full max-w-2xl h-fit bg-white z-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-slate-100">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Importación Masiva de Productos</h2>
            <p className="text-xs text-slate-500 mt-1">Sube tu planilla propia o el Excel de Mercado Libre</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-8">
          {!parsed ? (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 rounded-2xl ${
                  isDragging ? 'border-primary-500 bg-primary-50/30 scale-[1.02]' : 'border-slate-200 bg-slate-50/50 hover:border-primary-400 hover:bg-slate-50'
                }`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" className="hidden" />
                <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">Haz clic o arrastra tu archivo aquí</h3>
                <p className="text-sm text-slate-500 font-medium">Soporta formatos .CSV, .XLS, y .XLSX</p>
                {error && <p className="text-sm text-red-600 font-bold mt-4 bg-red-50 border border-red-100 p-3 rounded-xl">{error}</p>}
              </div>

              <div className="flex items-center justify-between bg-blue-50/50 p-4 border border-blue-100 rounded-2xl">
                <div className="flex items-start gap-3">
                  <FileText className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-blue-900 text-sm">¿No tienes un archivo preparado?</h4>
                    <p className="text-xs text-blue-700 mt-1 max-w-sm">Descarga nuestra plantilla estructurada para saber exactamente cómo organizar tus datos antes de subirlos.</p>
                  </div>
                </div>
                <button onClick={downloadTemplate} className="btn-secondary whitespace-nowrap bg-white text-xs px-4 py-2 flex items-center gap-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                  <Download className="w-4 h-4 text-slate-500" /> Bajar Plantilla Base
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-green-50/50 p-4 border border-green-100 rounded-2xl">
                <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-green-900">¡Archivo procesado con éxito!</h4>
                  <p className="text-sm text-green-700">Se encontraron <strong>{parsed.length}</strong> productos válidos listos para ser importados.</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100/80 backdrop-blur-sm sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Título</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Precio</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {parsed.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-xs font-mono text-slate-400">{p.sku || 'N/A'}</td>
                        <td className="px-4 py-2 text-sm font-semibold text-slate-700 max-w-[200px] truncate">{p.title}</td>
                        <td className="px-4 py-2 text-sm text-slate-700 font-black">${p.base_price}</td>
                        <td className="px-4 py-2 text-sm text-slate-500 font-medium">{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button onClick={() => setParsed(null)} className="btn-secondary rounded-xl text-xs py-2 px-4 border border-slate-200 hover:bg-slate-50 transition-colors">Cancelar y Subir Otro</button>
                <button onClick={() => onConfirm(parsed)} className="btn-primary rounded-xl text-xs py-2 px-4 gap-2 flex items-center shadow-md shadow-primary-500/10">
                  <UploadCloud className="w-4 h-4" /> Finalizar Importación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
