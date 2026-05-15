import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';

export default function VImports() {
  const [step, setStep] = useState<'upload' | 'map' | 'validate' | 'result'>('upload');
  const mockResult = { total: 48, valid: 42, errors: 3, created: 35, updated: 7, skipped: 3 };

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Data Ingestion</div>
           <h2 className="text-5xl font-black text-white">Importaciones CSV / XML</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Carga masiva de catálogo y actualización de inventario global</p>
        </div>
      </div>

      {/* Steps Indicators */}
      <div className="flex bg-white/5 border border-white/10 p-2 rounded-full backdrop-blur-md shadow-2xl overflow-hidden">
        {['upload', 'map', 'validate', 'result'].map((s, i) => (
          <button key={s} onClick={() => setStep(s as any)} 
            className={`flex-1 py-5 text-[11px] font-black uppercase tracking-[0.3em] transition-all rounded-full ${step === s ? 'bg-white text-black shadow-2xl scale-[1.02]' : 'text-slate-600 border-transparent hover:text-white hover:bg-white/5'}`}>
            <span className={`mr-3 font-mono ${step === s ? 'text-[#f00856]' : 'opacity-40'}`}>0{i + 1}</span> 
            {s === 'upload' ? 'Upload' : s === 'map' ? 'Mapping' : s === 'validate' ? 'Validate' : 'Result'}
          </button>
        ))}
      </div>

      {step === 'upload' && (
        <div className="space-y-8">
          <div className="glass border-2 border-dashed border-white/10 rounded-[3.5rem] p-24 text-center hover:border-[#f00856]/50 transition-all cursor-pointer group relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[#f00856]/[0.01] group-hover:bg-[#f00856]/[0.03] transition-colors"></div>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" style={{ backgroundImage: 'radial-gradient(#f00856 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>
            <div className="relative z-10">
              <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-10 group-hover:scale-110 group-hover:bg-[#f00856]/10 transition-all border border-white/5 group-hover:border-[#f00856]/30 shadow-xl">
                <Upload className="w-10 h-10 text-slate-500 group-hover:text-[#f00856] transition-colors" />
              </div>
              <p className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Arrastrá tu archivo acá</p>
              <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.4em] mb-12">CSV, XML · Máximo 10MB · Hasta 10,000 filas</p>
              <button className="bg-white text-black text-[12px] font-black uppercase tracking-widest px-14 py-6 rounded-full hover:bg-[#f00856] hover:text-white transition-all shadow-2xl active:scale-95">
                 Seleccionar Archivo
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-6">
            <button className="flex-1 soft border border-white/10 text-white text-[12px] font-black uppercase tracking-widest px-10 py-6 rounded-3xl hover:bg-white/10 transition-all flex items-center justify-center gap-4 shadow-xl">
               <Download className="w-5 h-5 text-[#f00856]" /> Template CSV
            </button>
            <button className="flex-1 soft border border-white/10 text-white text-[12px] font-black uppercase tracking-widest px-10 py-6 rounded-3xl hover:bg-white/10 transition-all flex items-center justify-center gap-4 shadow-xl">
               <Download className="w-5 h-5 text-[#f00856]" /> Template XML
            </button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="glass rounded-[3rem] border border-white/10 p-12 md:p-20 space-y-16 shadow-2xl">
          <div className="flex justify-between items-center border-b border-white/5 pb-12">
             <div className="flex items-center gap-8">
                <div className="w-16 h-16 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-[0_0_30px_rgba(240,8,86,0.1)]">
                   <FileSpreadsheet className="w-8 h-8 text-[#f00856]" />
                </div>
                <div>
                   <h3 className="text-3xl font-black text-white uppercase tracking-widest">Columna Mapping Protocol</h3>
                   <p className="text-[12px] text-slate-600 font-black uppercase tracking-[0.3em] mt-3">Asociación de campos de origen con el esquema de la plataforma</p>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {['nombre', 'sku', 'precio', 'stock', 'categoría', 'descripción', 'marca', 'peso', 'imágenes'].map(field => (
              <div key={field} className="flex flex-col md:flex-row md:items-center gap-8 p-8 soft rounded-3xl border border-white/5 hover:border-[#f00856]/30 transition-all group">
                <div className="md:w-64">
                   <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest group-hover:text-white transition-colors">{field}</span>
                   <p className="text-[9px] text-slate-700 font-black uppercase mt-1">Required internal field</p>
                </div>
                <div className="hidden md:flex text-slate-800 font-black text-xl group-hover:text-[#f00856] group-hover:scale-125 transition-all">→</div>
                <div className="relative flex-1">
                  <select className="w-full bg-black/40 border border-white/10 text-white p-5 pr-12 rounded-2xl text-[12px] font-black uppercase tracking-widest outline-none focus:border-[#f00856] focus:ring-4 focus:ring-[#f00856]/10 transition-all appearance-none cursor-pointer group-hover:border-white/20 shadow-inner">
                    <option className="bg-[#0a0c14]">Seleccionar columna de origen...</option>
                    <option className="bg-[#0a0c14]">Columna A ({field})</option>
                    <option className="bg-[#0a0c14]">Columna B</option>
                    <option className="bg-[#0a0c14]">Columna C</option>
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 font-black group-hover:text-white transition-colors">↓</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-16 border-t border-white/5">
            <button className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em] hover:text-[#f00856] transition-all active:scale-95 px-8" onClick={() => setStep('upload')}>
               [← ABORT MISSION]
            </button>
            <button className="bg-[#f00856] text-white text-[12px] font-black uppercase tracking-widest px-14 py-6 rounded-full hover:bg-[#ff2c68] transition-all shadow-[0_0_40px_rgba(240,8,86,0.4)] active:scale-[0.98] border border-white/10" onClick={() => setStep('validate')}>
               VALIDAR ESQUEMA →
            </button>
          </div>
        </div>
      )}

      {step === 'validate' && (
        <div className="glass rounded-[3rem] border border-white/10 p-12 md:p-20 space-y-16 shadow-2xl">
          <div className="flex items-center gap-8 mb-4">
             <div className="w-16 h-16 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-[0_0_30px_rgba(240,8,86,0.1)]">
                <CheckCircle className="w-8 h-8 text-[#f00856]" />
             </div>
             <h3 className="text-3xl font-black text-white uppercase tracking-widest">Previsualización & Validación Integradora</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[2.5rem] p-12 text-center group hover:bg-emerald-500/10 transition-all shadow-xl">
               <p className="text-6xl font-black text-emerald-500 mb-4 group-hover:scale-110 transition-transform">{mockResult.valid}</p>
               <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em]">Entidades Válidas</p>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-[2.5rem] p-12 text-center group hover:bg-red-500/10 transition-all shadow-xl">
               <p className="text-6xl font-black text-red-500 mb-4 group-hover:scale-110 transition-transform">{mockResult.errors}</p>
               <p className="text-[11px] font-black text-red-500 uppercase tracking-[0.3em]">Anomalías Críticas</p>
            </div>
            <div className="soft rounded-[2.5rem] p-12 text-center group hover:bg-white/[0.04] transition-all shadow-xl border border-white/5">
               <p className="text-6xl font-black text-white mb-4 group-hover:scale-110 transition-transform">{mockResult.total}</p>
               <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Registros</p>
            </div>
          </div>

          {mockResult.errors > 0 && (
            <div className="soft border border-red-500/30 bg-red-500/5 rounded-[2.5rem] p-12 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                 <AlertTriangle className="w-32 h-32 text-red-500 -rotate-12" />
              </div>
              <div className="flex items-center gap-6 text-red-500 font-black uppercase tracking-[0.4em] text-[12px] relative z-10">
                 <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                    <AlertTriangle className="w-5 h-5" />
                 </div> 
                 REPORTE DE ERRORES CRÍTICOS:
              </div>
              <div className="space-y-4 relative z-10">
                 <div className="bg-black/40 p-5 rounded-2xl border-l-8 border-red-500 shadow-xl group/err hover:bg-black/60 transition-all">
                    <p className="text-[12px] text-red-400 font-black uppercase tracking-widest">Fila 12: SKU duplicado "REM-OVS-001"</p>
                 </div>
                 <div className="bg-black/40 p-5 rounded-2xl border-l-8 border-red-500 shadow-xl group/err hover:bg-black/60 transition-all">
                    <p className="text-[12px] text-red-400 font-black uppercase tracking-widest">Fila 28: Precio inválido "abc"</p>
                 </div>
                 <div className="bg-black/40 p-5 rounded-2xl border-l-8 border-red-500 shadow-xl group/err hover:bg-black/60 transition-all">
                    <p className="text-[12px] text-red-400 font-black uppercase tracking-widest">Fila 33: Categoría no encontrada "Ropa"</p>
                 </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-16 border-t border-white/5">
            <button className="text-[11px] font-black text-slate-600 uppercase tracking-[0.5em] hover:text-white transition-all active:scale-95 px-8" onClick={() => setStep('map')}>
               [← CORREGIR MAPEO]
            </button>
            <button className="bg-emerald-500 text-white text-[12px] font-black uppercase tracking-widest px-14 py-6 rounded-full hover:bg-emerald-600 transition-all shadow-[0_0_40px_rgba(16,185,129,0.4)] active:scale-[0.98] border border-white/10" onClick={() => setStep('result')}>
               CONFIRMAR INGESTA →
            </button>
          </div>
        </div>
      )}

      {step === 'result' && (
        <div className="glass rounded-[3.5rem] border border-emerald-500/20 bg-emerald-500/5 p-20 md:p-32 text-center animation-fade-in shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '60px 60px' }}></div>
          <div className="relative z-10">
            <div className="w-32 h-32 bg-emerald-500 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-14 shadow-[0_0_80px_rgba(16,185,129,0.5)] animate-in zoom-in duration-500">
               <CheckCircle className="w-16 h-16" />
            </div>
            <h3 className="text-6xl font-black text-white mb-6 uppercase tracking-tighter">Ingesta Finalizada</h3>
            <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.6em] mb-20">Protocolo de importación completado con éxito</p>
            
            <div className="grid grid-cols-3 gap-10 max-w-2xl mx-auto mb-24">
              <div className="p-10 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 shadow-2xl hover:scale-105 transition-transform group">
                 <p className="text-5xl font-black text-emerald-500 mb-4 group-hover:animate-pulse">{mockResult.created}</p>
                 <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em]">Creados</p>
              </div>
              <div className="p-10 rounded-[2rem] border border-blue-500/20 bg-blue-500/10 shadow-2xl hover:scale-105 transition-transform group">
                 <p className="text-5xl font-black text-blue-500 mb-4 group-hover:animate-pulse">{mockResult.updated}</p>
                 <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em]">Actualizados</p>
              </div>
              <div className="p-10 rounded-[2rem] soft border border-white/10 shadow-2xl hover:scale-105 transition-transform group">
                 <p className="text-5xl font-black text-slate-600 mb-4 group-hover:animate-pulse">{mockResult.skipped}</p>
                 <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.2em]">Omitidos</p>
              </div>
            </div>

            <button className="bg-white text-black text-[12px] font-black uppercase tracking-widest px-16 py-7 rounded-full hover:bg-[#f00856] hover:text-white transition-all shadow-[0_40px_80px_rgba(0,0,0,0.5)] active:scale-[0.98]" onClick={() => setStep('upload')}>
               NUEVO PROCESO DE INGESTA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
