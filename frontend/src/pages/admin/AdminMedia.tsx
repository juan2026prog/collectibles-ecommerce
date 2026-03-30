import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, Trash2, Copy, FileIcon, ImageIcon, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

export default function AdminMedia() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consider "public-assets" as the main bucket for logos/banners
  const BUCKET_NAME = 'public-assets';

  useEffect(() => {
    fetchMedia();
  }, []);

  async function fetchMedia() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list('', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error) throw error;
      
      // Keep only actual files (filter out empty folder placeholders)
      setFiles((data || []).filter(f => f.name !== '.emptyFolderPlaceholder'));
    } catch (err: any) {
      console.error(err);
      setError(`Error al cargar medios: ${err.message}. Asegúrate de que el bucket "${BUCKET_NAME}" exista y sea público.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    setError(null);
    const filesArray = Array.from(e.target.files);
    
    for (const file of filesArray) {
      try {
        // Sanitize file name to prevent issues
        const fileExt = file.name.split('.').pop();
        const rawName = file.name.replace(`.${fileExt}`, '');
        const sanitizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${Date.now()}-${sanitizedName}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, file, { cacheControl: '3600', upsert: false });
          
        if (uploadError) throw uploadError;
      } catch (err: any) {
        console.error("Upload error:", err);
        setError(`Error subiendo ${file.name}: ${err.message}`);
      }
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchMedia();
  }

  async function handleDelete(fileName: string) {
    if (!confirm(`¿Eliminar permanentemente el archivo "${fileName}"?`)) return;
    
    try {
      const { error } = await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      if (error) throw error;
      fetchMedia();
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar: ${err.message}`);
    }
  }

  function getFileUrl(fileName: string) {
    return supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName).data.publicUrl;
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    alert('¡URL copiada al portapapeles!');
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            Medios y Archivos
          </h2>
          <p className="text-sm text-gray-500 mt-1">Sube logotipos de marcas, banners y recursos estáticos.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={fetchMedia} className="btn-secondary px-3" title="Recargar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload} 
            className="hidden" 
            multiple 
            accept="image/*,.pdf" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploading}
            className="btn-primary flex items-center gap-2 shadow-md"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo...' : 'Subir Archivos'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm min-h-[400px]">
        {loading && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-4" />
            <p>Cargando biblioteca...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Biblioteca Vacía</h3>
            <p className="text-gray-500 mt-1 max-w-sm">No hay archivos en el bucket "{BUCKET_NAME}". Sube tu primer archivo usando el botón superior.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0 border-t border-l border-gray-100">
            {files.map(file => {
              const url = getFileUrl(file.name);
              const img = isImage(file.name);
              
              return (
                <div key={file.id} className="group relative aspect-square border-r border-b border-gray-100 flex flex-col items-center justify-center p-4 hover:bg-gray-50 bg-white transition-colors">
                  
                  {/* Vista Previa */}
                  <div className="w-full h-full flex items-center justify-center p-2 mb-6">
                    {img ? (
                       <img src={url} alt={file.name} className="w-full h-full object-contain filter group-hover:brightness-95 transition-all" />
                    ) : (
                       <FileIcon className="w-12 h-12 text-blue-300" />
                    )}
                  </div>
                  
                  {/* Detalles Archivo */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] font-bold text-gray-800 truncate mb-1" title={file.name}>{file.name}</p>
                    <div className="flex items-center justify-between">
                       <span className="text-[9px] text-gray-500 font-mono">{(file.metadata?.size / 1024).toFixed(1)} KB</span>
                       
                       <div className="flex gap-1">
                         <button onClick={() => window.open(url, '_blank')} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Abrir">
                           <ExternalLink className="w-3.5 h-3.5" />
                         </button>
                         <button onClick={() => handleCopy(url)} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Copiar URL">
                           <Copy className="w-3.5 h-3.5" />
                         </button>
                         <button onClick={() => handleDelete(file.name)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                       </div>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
