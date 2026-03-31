import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ImageIcon, FileIcon, X, Folder, ChevronRight, Upload, Check, Square, FolderPlus } from 'lucide-react';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  multiple?: boolean;
  onMultipleSelect?: (urls: string[]) => void;
}

export function MediaPickerModal({ isOpen, onClose, onSelect, multiple = false, onMultipleSelect }: MediaPickerModalProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const BUCKET_NAME = 'public-assets';

  useEffect(() => {
    if (isOpen) {
      fetchMedia(currentPath);
      setSelectedFiles(new Set());
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

  // Drag & Drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await uploadFiles(droppedFiles);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      await uploadFiles(selectedFiles);
    }
  }

  async function uploadFiles(filesToUpload: File[]) {
    setUploading(true);
    try {
      for (const file of filesToUpload) {
        const filePath = currentPath + file.name;
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, { upsert: true });
        if (error) throw error;
      }
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Error uploading files: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateFolder() {
    const folderName = prompt('Nombre de la nueva carpeta:');
    if (!folderName) return;
    
    try {
      await supabase.storage.from(BUCKET_NAME).upload(currentPath + folderName + '/.emptyFolderPlaceholder', new Blob([]));
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
    }
  }

  function handleFileClick(file: any, e?: React.MouseEvent) {
    const url = getFileUrl(file.name);
    
    if (multiple && onMultipleSelect) {
      const newSelected = new Set(selectedFiles);
      
      if (e?.shiftKey && lastSelected) {
        const fileUrls = files.filter(f => f.id).map(f => getFileUrl(f.name));
        const lastIdx = fileUrls.indexOf(lastSelected);
        const currentIdx = fileUrls.indexOf(url);
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        for (let i = start; i <= end; i++) {
          newSelected.add(fileUrls[i]);
        }
      } else if (e?.ctrlKey || e?.metaKey) {
        if (newSelected.has(url)) {
          newSelected.delete(url);
        } else {
          newSelected.add(url);
        }
      } else {
        newSelected.clear();
        newSelected.add(url);
      }
      
      setSelectedFiles(newSelected);
      setLastSelected(url);
    } else {
      onSelect(url);
      onClose();
    }
  }

  function handleConfirmSelection() {
    if (onMultipleSelect && selectedFiles.size > 0) {
      onMultipleSelect(Array.from(selectedFiles));
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
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
          <div className="flex items-center gap-2">
            {multiple && selectedFiles.size > 0 && (
              <span className="text-sm text-gray-500 bg-primary-50 px-3 py-1 rounded-lg">
                {selectedFiles.size} seleccionado(s)
              </span>
            )}
            <button onClick={handleCreateFolder} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Crear carpeta">
              <FolderPlus className="w-5 h-5" />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Subir archivos">
              <Upload className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {/* Drag & Drop Zone */}
          <div 
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mb-4 border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
              isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-primary-600">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Subiendo archivos...</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                <span className="font-medium text-primary-600">Arrastra y suelta</span> archivos aquí, o 
                <button onClick={() => fileInputRef.current?.click()} className="text-primary-600 hover:underline ml-1">selecciona</button>
              </p>
            )}
          </div>

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
                const isFolder = !file.id;
                
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
                const isSelected = selectedFiles.has(url);
                
                return (
                  <button 
                    key={file.id} 
                    onClick={(e) => handleFileClick(file, e)}
                    className={`group bg-white border-2 rounded-xl overflow-hidden transition-all shadow-sm aspect-square relative ${
                      isSelected ? 'border-primary-500 ring-2 ring-primary-500 ring-offset-2' : 'border-gray-200 hover:border-primary-400 hover:shadow-md'
                    }`}
                  >
                    {multiple && (
                      <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                    )}
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

        {/* Footer with Actions */}
        {multiple && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button 
              onClick={handleConfirmSelection} 
              disabled={selectedFiles.size === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Seleccionar {selectedFiles.size > 0 && `(${selectedFiles.size})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
