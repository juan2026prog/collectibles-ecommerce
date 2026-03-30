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
        setError('No se encontraron productos en el archivo o el formato es inválido.');
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
      <div className="fixed inset-0 m-auto w-full max-w-2xl h-fit bg-white z-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Importación Masiva de Productos</h2>
            <p className="text-sm text-gray-500 mt-1">Sube tu planilla propia o el Excel de Mercado Libre</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-8">
          {!parsed ? (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                  isDragging ? 'border-primary-500 bg-primary-50 scale-[1.02]' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
                }`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" className="hidden" />
                <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Haz clic o arrastra tu archivo aquí</h3>
                <p className="text-sm text-gray-500">Soporta formatos .CSV, .XLS, y .XLSX</p>
                {error && <p className="text-sm text-red-600 font-bold mt-4 bg-red-50 p-3 rounded-lg">{error}</p>}
              </div>

              <div className="flex items-center justify-between bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-start gap-3">
                  <FileText className="w-6 h-6 text-blue-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-blue-900 text-sm">¿No tienes un archivo preparado?</h4>
                    <p className="text-xs text-blue-700 mt-1 max-w-sm">Descarga nuestra plantilla estructurada para saber exactamente cómo organizar tus datos antes de subirlos.</p>
                  </div>
                </div>
                <button onClick={downloadTemplate} className="btn-secondary whitespace-nowrap bg-white text-xs px-4 py-2 flex items-center gap-2">
                  <Download className="w-4 h-4" /> Bajar Plantilla Base
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-green-50/50 p-4 rounded-xl border border-green-100">
                <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-green-900">¡Archivo procesado con éxito!</h4>
                  <p className="text-sm text-green-700">Se encontraron <strong>{parsed.length}</strong> productos válidos listos para ser importados.</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Título</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Precio</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {parsed.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs font-mono text-gray-500">{p.sku || 'N/A'}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 max-w-[200px] truncate">{p.title}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">${p.base_price}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
                <button onClick={() => setParsed(null)} className="btn-secondary">Cancelar y Subir Otro</button>
                <button onClick={() => onConfirm(parsed)} className="btn-primary gap-2">
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
