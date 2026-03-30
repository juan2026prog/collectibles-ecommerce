import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ImageIcon, FileIcon, X, Folder, ChevronRight, Upload } from 'lucide-react';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function MediaPickerModal({ isOpen, onClose, onSelect }: MediaPickerModalProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  
  const BUCKET_NAME = 'public-assets';

  useEffect(() => {
    if (isOpen) {
      fetchMedia(currentPath);
    }
  }, [isOpen, currentPath]);

  async function fetchMedia(path: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw error;
      setFiles((data || []).filter(f => f.name !== '.emptyFolderPlaceholder'));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getFileUrl(fileName: string) {
    const fullPath = currentPath ? `${currentPath}${fileName}` : fileName;
    return supabase.storage.from(BUCKET_NAME).getPublicUrl(fullPath).data.publicUrl;
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex flex-col sm:flex-row sm:items-center gap-2">
              <span>Biblioteca de Medios</span>
              <div className="flex items-center text-sm font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
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
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p>Cargando medios...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
               <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
               <p>No hay archivos en esta carpeta.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {files.map(file => {
                const isFolder = !file.id; // Supabase returns id: null for folders
                
                if (isFolder) {
                  return (
                    <button 
                      key={file.name} 
                      onClick={() => setCurrentPath(currentPath + file.name + '/')}
                      className="group bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center hover:border-primary-400 hover:shadow-md transition-all aspect-square"
                    >
                      <Folder className="w-12 h-12 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-gray-700 truncate w-full text-center">{file.name}</span>
                    </button>
                  );
                }

                const url = getFileUrl(file.name);
                const img = isImage(file.name);
                
                return (
                  <button 
                    key={file.id} 
                    onClick={() => { onSelect(url); onClose(); }}
                    className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-primary-400 hover:shadow-md transition-all shadow-sm aspect-square relative"
                  >
                    <div className="w-full h-full flex items-center justify-center bg-gray-50 p-2">
                       {img ? (
                          <img src={url} alt={file.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform" />
                       ) : (
                          <FileIcon className="w-10 h-10 text-gray-300" />
                       )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur-sm px-2 py-1 border-t border-gray-100">
                      <p className="text-[10px] font-bold text-gray-600 truncate text-left">{file.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
