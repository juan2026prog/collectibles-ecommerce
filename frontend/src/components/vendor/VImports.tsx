import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';

export default function VImports() {
  const [step, setStep] = useState<'upload' | 'map' | 'validate' | 'result'>('upload');
  const mockResult = { total: 48, valid: 42, errors: 3, created: 35, updated: 7, skipped: 3 };

  return (
    <div className="space-y-5 max-w-4xl">
      <h2 className="text-2xl font-black text-gray-900">Importaciones CSV / XML</h2>

      {/* Steps */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {['upload', 'map', 'validate', 'result'].map((s, i) => (
          <button key={s} onClick={() => setStep(s as any)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${step === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            {i + 1}. {s === 'upload' ? 'Subir Archivo' : s === 'map' ? 'Mapear Columnas' : s === 'validate' ? 'Validar' : 'Resultado'}
          </button>
        ))}
      </div>

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center bg-white hover:border-blue-400 transition-colors cursor-pointer">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-lg font-black text-gray-900 mb-1">Arrastrá tu archivo acá</p>
            <p className="text-sm text-gray-500 mb-4">CSV, XML · Máximo 10MB · Hasta 10,000 filas</p>
            <button className="bg-gray-900 text-white text-sm font-bold px-6 py-2.5 rounded-lg">Seleccionar Archivo</button>
          </div>
          <div className="flex gap-3">
            <button className="text-sm font-bold bg-white border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"><Download className="w-4 h-4" /> Descargar Plantilla CSV</button>
            <button className="text-sm font-bold bg-white border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"><Download className="w-4 h-4" /> Descargar Plantilla XML</button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-900">Mapeo de Columnas</h3>
          <p className="text-xs text-gray-500">Asociá cada columna del archivo con un campo del sistema.</p>
          {['nombre', 'sku', 'precio', 'stock', 'categoría', 'descripción', 'marca', 'peso', 'imágenes'].map(field => (
            <div key={field} className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-700 w-28 capitalize">{field}</span>
              <span className="text-gray-400">→</span>
              <select className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm outline-none">
                <option>Seleccionar columna...</option>
                <option>Columna A ({field})</option>
                <option>Columna B</option>
                <option>Columna C</option>
              </select>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <button className="text-sm font-bold text-gray-500" onClick={() => setStep('upload')}>← Volver</button>
            <button className="bg-gray-900 text-white text-sm font-bold px-6 py-2.5 rounded-lg" onClick={() => setStep('validate')}>Validar →</button>
          </div>
        </div>
      )}

      {step === 'validate' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-gray-900">Previsualización & Validación</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 p-3 rounded-lg text-center"><p className="text-2xl font-black text-green-700">{mockResult.valid}</p><p className="text-[10px] font-bold text-green-600 uppercase">Válidas</p></div>
            <div className="bg-red-50 p-3 rounded-lg text-center"><p className="text-2xl font-black text-red-700">{mockResult.errors}</p><p className="text-[10px] font-bold text-red-600 uppercase">Con Error</p></div>
            <div className="bg-gray-50 p-3 rounded-lg text-center"><p className="text-2xl font-black text-gray-700">{mockResult.total}</p><p className="text-[10px] font-bold text-gray-500 uppercase">Total Filas</p></div>
          </div>
          {mockResult.errors > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-bold text-red-700">Errores detectados:</p>
              <p className="text-xs text-red-600">Fila 12: SKU duplicado "REM-OVS-001"</p>
              <p className="text-xs text-red-600">Fila 28: Precio inválido "abc"</p>
              <p className="text-xs text-red-600">Fila 33: Categoría no encontrada "Ropa"</p>
            </div>
          )}
          <div className="flex justify-between pt-3">
            <button className="text-sm font-bold text-gray-500" onClick={() => setStep('map')}>← Corregir</button>
            <button className="bg-green-600 text-white text-sm font-bold px-6 py-2.5 rounded-lg" onClick={() => setStep('result')}>Confirmar Importación →</button>
          </div>
        </div>
      )}

      {step === 'result' && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-black text-gray-900 mb-2">Importación Completada</h3>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mt-6 text-sm">
            <div><p className="text-2xl font-black text-green-600">{mockResult.created}</p><p className="text-[10px] text-gray-500 font-bold uppercase">Creados</p></div>
            <div><p className="text-2xl font-black text-blue-600">{mockResult.updated}</p><p className="text-[10px] text-gray-500 font-bold uppercase">Actualizados</p></div>
            <div><p className="text-2xl font-black text-gray-400">{mockResult.skipped}</p><p className="text-[10px] text-gray-500 font-bold uppercase">Omitidos</p></div>
          </div>
          <button className="mt-6 bg-gray-900 text-white text-sm font-bold px-6 py-2.5 rounded-lg" onClick={() => setStep('upload')}>Nueva Importación</button>
        </div>
      )}
    </div>
  );
}
