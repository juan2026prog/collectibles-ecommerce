import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, Trash2, Copy, FileIcon, ImageIcon, ExternalLink, RefreshCw, AlertCircle, Folder, ChevronRight, FolderPlus } from 'lucide-react';

export default function AdminMedia() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BUCKET_NAME = 'public-assets';

  useEffect(() => {
    fetchMedia(currentPath);
  }, [currentPath]);

  async function fetchMedia(path: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw error;
      
      // Filter out root placeholder
      setFiles((data || []).filter(f => f.name !== '.emptyFolderPlaceholder'));
    } catch (err: any) {
      console.error(err);
      setError(`Error al cargar medios: ${err.message}.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFolder() {
    const folderName = prompt('Nombre de la nueva carpeta (sin espacios ni caracteres raros):');
    if (!folderName) return;
    
    const sanitized = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folderPath = currentPath ? `${currentPath}${sanitized}` : sanitized;
    const placeholderPath = `${folderPath}/.emptyFolderPlaceholder`;

    setUploading(true);
    const emptyFile = new File([''], '.emptyFolderPlaceholder', { type: 'text/plain' });
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(placeholderPath, emptyFile);
    setUploading(false);

    if (error) {
      setError(`Error creando carpeta: ${error.message}`);
    } else {
      fetchMedia(currentPath);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    setError(null);
    const filesArray = Array.from(e.target.files);
    
    for (const file of filesArray) {
      try {
        const fileExt = file.name.split('.').pop();
        const rawName = file.name.replace(`.${fileExt}`, '');
        const sanitizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${Date.now()}-${sanitizedName}.${fileExt}`;
        const fullPath = currentPath ? `${currentPath}${fileName}` : fileName;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fullPath, file, { cacheControl: '3600', upsert: false });
          
        if (uploadError) throw uploadError;
      } catch (err: any) {
        console.error("Upload error:", err);
        setError(`Error subiendo ${file.name}: ${err.message}`);
      }
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchMedia(currentPath);
  }

  async function handleDelete(fileName: string, isFolder: boolean) {
    const targetPath = currentPath ? `${currentPath}${fileName}` : fileName;
    
    const msg = isFolder ? `¿Eliminar la carpeta "${fileName}" y su contenido vacío?` : `¿Eliminar permanentemente el archivo "${fileName}"?`;
    
    if (!confirm(msg)) return;
    
    try {
      const pathsToDelete = isFolder ? [`${targetPath}/.emptyFolderPlaceholder`] : [targetPath];
      
      const { error } = await supabase.storage.from(BUCKET_NAME).remove(pathsToDelete);
      if (error) throw error;
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar: ${err.message}`);
    }
  }

  function getFileUrl(fileName: string) {
    const fullPath = currentPath ? `${currentPath}${fileName}` : fileName;
    return supabase.storage.from(BUCKET_NAME).getPublicUrl(fullPath).data.publicUrl;
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
          {/* Breadcrumbs */}
          <div className="flex items-center text-sm font-medium text-gray-500 mt-2">
             <button onClick={() => setCurrentPath('')} className="hover:text-primary-600 transition-colors">Inicio</button>
             {currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                const targetPath = arr.slice(0, i + 1).join('/') + '/';
                return (
                  <div key={i} className="flex items-center">
                    <ChevronRight className="w-3 h-3 mx-1" />
                    <button onClick={() => setCurrentPath(targetPath)} className="hover:text-primary-600 transition-colors">
                      {part}
                    </button>
                  </div>
                );
             })}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => fetchMedia(currentPath)} className="btn-secondary px-3" title="Recargar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button onClick={handleCreateFolder} className="btn-secondary flex items-center gap-2">
            <FolderPlus className="w-4 h-4" /> Nueva Carpeta
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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm min-h-[400px] p-4">
        {loading && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-4" />
            <p>Cargando biblioteca...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Folder className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Carpeta Vacía</h3>
            <p className="text-gray-500 mt-1 max-w-sm">No hay archivos en esta ubicación. Sube uno o crea una carpeta nueva.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {files.map(file => {
              const isFolder = !file.id; // Supabase return id: null for folders
              
              if (isFolder) {
                 return (
                    <div key={file.name} className="group relative border border-gray-200 rounded-xl flex flex-col items-center justify-center p-4 hover:border-primary-400 hover:shadow-md transition-all bg-white aspect-square">
                       <button onClick={() => setCurrentPath(currentPath + file.name + '/')} className="w-full h-full flex flex-col items-center justify-center">
                          <Folder className="w-12 h-12 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-gray-700 truncate w-full text-center">{file.name}</span>
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); handleDelete(file.name, true); }} className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white/80 backdrop-blur rounded-md transition-all">
                         <Trash2 className="w-3 h-3" />
                       </button>
                    </div>
                 );
              }

              const url = getFileUrl(file.name);
              const img = isImage(file.name);
              
              return (
                <div key={file.id} className="group relative border border-gray-200 rounded-xl flex flex-col items-center justify-center p-2 hover:border-primary-400 hover:shadow-md transition-all bg-white aspect-square overflow-hidden">
                  
                  {/* Vista Previa */}
                  <div className="w-full h-full flex items-center justify-center p-2 mb-6 bg-gray-50/50 rounded-lg">
                    {img ? (
                       <img src={url} alt={file.name} className="w-full h-full object-contain filter group-hover:brightness-95 transition-all mix-blend-multiply" />
                    ) : (
                       <FileIcon className="w-10 h-10 text-gray-300" />
                    )}
                  </div>
                  
                  {/* Detalles Archivo */}
                  <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-2 py-1 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-600 truncate mr-2" title={file.name}>{file.name}</p>
                    <div className="flex gap-1 shrink-0 bg-white">
                      <button onClick={() => window.open(url, '_blank')} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Abrir">
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleCopy(url)} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Copiar URL">
                        <Copy className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(file.name, false)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                        <Trash2 className="w-3 h-3" />
                      </button>
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
