import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { RefreshCw, ImageIcon, FileIcon, X, Folder, ChevronRight, Upload, Check, Square, FolderPlus, Edit, Move, Trash2, Search } from 'lucide-react';
import { useToast } from './admin/Toast';
import { useConfirmModal } from './admin/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  multiple?: boolean;
  onMultipleSelect?: (urls: string[]) => void;
  rootPath?: string;
}

export function MediaPickerModal({ isOpen, onClose, onSelect, multiple = true, onMultipleSelect, rootPath }: MediaPickerModalProps) {
  const { user, profile } = useAuth();
  
  const rootPathPrefix = rootPath !== undefined 
    ? rootPath 
    : (user && profile?.is_vendor && !profile?.is_admin) 
      ? `vendors/${user.id}/` 
      : '';

  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { confirm, prompt } = useConfirmModal();
  
  const BUCKET_NAME = 'public-assets';

  useEffect(() => {
    if (isOpen) {
      fetchMedia(currentPath);
      setSelectedFiles(new Set());
      setSearchQuery('');
    }
  }, [isOpen, currentPath]);

  async function fetchMedia(path: string) {
    setLoading(true);
    setFiles([]); // Clear list to prevent double clicks on stale cards
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(rootPathPrefix + path, {
        limit: 500,
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
    const fullPath = rootPathPrefix + (currentPath ? `${currentPath}${fileName}` : fileName);
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
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(Array.from(e.dataTransfer.files));
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      await uploadFiles(selectedFiles);
    }
  }

  async function uploadFiles(filesToUpload: File[], destPath?: string) {
    setUploading(true);
    const targetPath = destPath !== undefined ? destPath : currentPath;
    try {
      for (const file of filesToUpload) {
        const fileExt = file.name.split('.').pop();
        const rawName = file.name.replace(`.${fileExt}`, '');
        const sanitizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${Date.now()}-${sanitizedName}.${fileExt}`;
        const filePath = rootPathPrefix + targetPath + fileName;
        
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
      }
      fetchMedia(currentPath);
      toast.success('Carga completada');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Error al subir archivos: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDragStart(e: React.DragEvent, itemName: string, isFolder: boolean) {
    e.dataTransfer.setData('itemName', itemName);
    e.dataTransfer.setData('isFolder', isFolder ? 'true' : 'false');
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleFolderDrop(e: React.DragEvent, targetFolderName: string) {
    e.preventDefault();
    setDragOverFolder(null);
    
    // Check if dropping local files from computer into a folder card
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const targetFolder = currentPath ? `${currentPath}${targetFolderName}/` : `${targetFolderName}/`;
      await uploadFiles(Array.from(e.dataTransfer.files), targetFolder);
      return;
    }

    const itemName = e.dataTransfer.getData('itemName');
    const isFolderStr = e.dataTransfer.getData('isFolder');
    if (!itemName) return;
    
    const isFolder = isFolderStr === 'true';
    if (isFolder && itemName === targetFolderName) {
      toast.error('No puedes mover una carpeta dentro de sí misma');
      return;
    }
    
    const cleanTarget = currentPath ? `${currentPath}${targetFolderName}/` : `${targetFolderName}/`;
    const fromPath = currentPath ? `${currentPath}${itemName}` : itemName;
    const toPath = cleanTarget + itemName;
    
    setLoading(true);
    try {
      if (isFolder) {
        await moveFolderRecursive(rootPathPrefix + fromPath + '/', rootPathPrefix + toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(rootPathPrefix + fromPath, rootPathPrefix + toPath);
        if (error) throw error;
        await updateDbReferences(rootPathPrefix + fromPath, rootPathPrefix + toPath);
      }
      toast.success(isFolder ? 'Carpeta movida con éxito' : 'Archivo movido con éxito');
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al mover: ' + err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleCreateFolder() {
    const folderName = await prompt('Nombre de la nueva carpeta (sin espacios ni caracteres raros):');
    if (!folderName) return;
    
    const sanitized = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folderPath = currentPath ? `${currentPath}${sanitized}` : sanitized;
    const placeholderPath = `${rootPathPrefix}${folderPath}/.emptyFolderPlaceholder`;

    setUploading(true);
    try {
      const emptyFile = new File([''], '.emptyFolderPlaceholder', { type: 'text/plain' });
      const { error } = await supabase.storage.from(BUCKET_NAME).upload(placeholderPath, emptyFile);
      if (error) throw error;
      toast.success('Carpeta creada');
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al crear carpeta: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileName: string, isFolder: boolean) {
    const targetPath = currentPath ? `${currentPath}${fileName}` : fileName;
    
    const msg = isFolder 
      ? `¿Eliminar la carpeta "${fileName}" y todo su contenido?` 
      : `¿Eliminar permanentemente el archivo "${fileName}"?`;
    
    if (!(await confirm(msg, { danger: true }))) return;
    
    setLoading(true);
    try {
      if (isFolder) {
        await deleteFolderRecursive(rootPathPrefix + targetPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).remove([rootPathPrefix + targetPath]);
        if (error) throw error;
      }
      fetchMedia(currentPath);
      toast.success(isFolder ? 'Carpeta eliminada' : 'Archivo eliminado');
    } catch (err: any) {
      console.error(err);
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteFolderRecursive(folderPath: string) {
    const { data: filesList, error } = await supabase.storage.from(BUCKET_NAME).list(folderPath, { limit: 1000 });
    if (error) throw error;
    
    if (filesList && filesList.length > 0) {
      const filesToDelete: string[] = [];
      const subFolders: string[] = [];
      
      for (const item of filesList) {
        if (!item.id) {
          subFolders.push(folderPath + item.name + '/');
        } else {
          filesToDelete.push(folderPath + item.name);
        }
      }
      
      for (const sub of subFolders) {
        await deleteFolderRecursive(sub);
      }
      
      if (filesToDelete.length > 0) {
        const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
        if (removeError) throw removeError;
      }
    }
    await supabase.storage.from(BUCKET_NAME).remove([folderPath + '.emptyFolderPlaceholder']).catch(() => {});
  }

  async function updateDbReferences(fromPath: string, toPath: string) {
    const oldUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(fromPath).data.publicUrl;
    const newUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(toPath).data.publicUrl;
    
    if (oldUrl === newUrl) return;

    try {
      await Promise.all([
        supabase.from('product_images').update({ url: newUrl }).eq('url', oldUrl),
        supabase.from('banners').update({ image_url: newUrl }).eq('image_url', oldUrl),
        supabase.from('banners').update({ mobile_image_url: newUrl }).eq('mobile_image_url', oldUrl),
        supabase.from('categories').update({ image_url: newUrl }).eq('image_url', oldUrl),
        supabase.from('brands').update({ logo_url: newUrl }).eq('logo_url', oldUrl),
        supabase.from('badges').update({ custom_image: newUrl }).eq('custom_image', oldUrl),
        supabase.from('promo_materials').update({ image_url: newUrl }).eq('image_url', oldUrl),
        supabase.from('products').update({ print_file_url: newUrl }).eq('print_file_url', oldUrl),
        supabase.from('products').update({ mockup_file_url: newUrl }).eq('mockup_file_url', oldUrl)
      ]);
    } catch (err) {
      console.error('Error updating DB references for move:', err);
    }
  }

  async function handleRename(fileName: string, isFolder: boolean) {
    const oldName = fileName;
    const newName = await prompt(`Cambiar nombre de ${isFolder ? 'la carpeta' : 'el archivo'}:`, oldName);
    if (!newName || newName === oldName) return;
    
    const fileExt = isFolder ? '' : '.' + oldName.split('.').pop();
    const cleanNewName = isFolder 
      ? newName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      : newName.replace(fileExt, '').toLowerCase().replace(/[^a-z0-9]/g, '-') + fileExt;

    const fromPath = currentPath ? `${currentPath}${oldName}` : oldName;
    const toPath = currentPath ? `${currentPath}${cleanNewName}` : cleanNewName;
    
    setLoading(true);
    try {
      if (isFolder) {
        await moveFolderRecursive(rootPathPrefix + fromPath + '/', rootPathPrefix + toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(rootPathPrefix + fromPath, rootPathPrefix + toPath);
        if (error) throw error;
        await updateDbReferences(rootPathPrefix + fromPath, rootPathPrefix + toPath);
      }
      toast.success(isFolder ? 'Carpeta renombrada' : 'Archivo renombrado');
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al renombrar: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function moveFolderRecursive(fromFolder: string, toFolder: string) {
    const { data: filesList, error } = await supabase.storage.from(BUCKET_NAME).list(fromFolder, { limit: 1000 });
    if (error) throw error;
    
    if (filesList) {
      for (const item of filesList) {
        if (!item.id) {
          await moveFolderRecursive(fromFolder + item.name + '/', toFolder + item.name + '/');
        } else {
          const fromFile = fromFolder + item.name;
          const toFile = toFolder + item.name;
          const { error: moveError } = await supabase.storage.from(BUCKET_NAME).move(fromFile, toFile);
          if (moveError) throw moveError;
          await updateDbReferences(fromFile, toFile);
        }
      }
    }
    await supabase.storage.from(BUCKET_NAME).move(fromFolder + '.emptyFolderPlaceholder', toFolder + '.emptyFolderPlaceholder').catch(() => {});
  }

  async function handleMove(fileName: string, isFolder: boolean) {
    const targetFolder = await prompt(
      `Mover ${isFolder ? 'la carpeta' : 'el archivo'} a la carpeta de destino (ej: banners, o dejar vacío para la raíz):`,
      currentPath
    );
    if (targetFolder === null) return;
    
    let cleanTarget = targetFolder.trim().replace(/^\//, '');
    if (cleanTarget && !cleanTarget.endsWith('/')) {
      cleanTarget += '/';
    }
    
    if (cleanTarget === currentPath) return;
    
    const fromPath = currentPath ? `${currentPath}${fileName}` : fileName;
    const toPath = cleanTarget ? `${cleanTarget}${fileName}` : fileName;
    
    setLoading(true);
    try {
      if (isFolder) {
        await moveFolderRecursive(rootPathPrefix + fromPath + '/', rootPathPrefix + toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(rootPathPrefix + fromPath, rootPathPrefix + toPath);
        if (error) throw error;
        await updateDbReferences(rootPathPrefix + fromPath, rootPathPrefix + toPath);
      }
      toast.success(isFolder ? 'Carpeta movida con éxito' : 'Archivo movido con éxito');
      fetchMedia(currentPath);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al mover: ' + err.message);
    } finally {
      setLoading(false);
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white  shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex flex-col sm:flex-row sm:items-center gap-2">
              <span>Biblioteca de Medios</span>
              <div className="flex items-center text-sm font-medium text-slate-400 bg-white/5 px-2 py-1 ">
                <button 
                  disabled={loading}
                  onClick={() => !loading && setCurrentPath('')} 
                  className="hover:text-primary-600 transition-colors disabled:opacity-50"
                >
                  Inicio
                </button>
                {currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                   const targetPath = arr.slice(0, i + 1).join('/') + '/';
                   return (
                     <div key={i} className="flex items-center">
                       <ChevronRight className="w-3 h-3 mx-1" />
                       <button 
                         disabled={loading}
                         onClick={() => !loading && setCurrentPath(targetPath)} 
                         className="hover:text-primary-600 transition-colors disabled:opacity-50"
                       >
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
              <span className="text-sm text-slate-400 bg-primary-500/10 px-3 py-1 ">
                {selectedFiles.size} seleccionado(s)
              </span>
            )}
            <button onClick={handleCreateFolder} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-500/10  transition-colors" title="Crear carpeta">
              <FolderPlus className="w-5 h-5" />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-500/10  transition-colors" title="Subir archivos">
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
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white/5">
          {/* Drag & Drop Zone */}
          <div 
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mb-4 border-2 border-dashed  p-4 text-center transition-colors ${
              isDragging ? 'border-primary-500 bg-primary-500/10' : 'border-gray-300 hover:border-white/30'
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-primary-600">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Subiendo archivos...</span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                <span className="font-medium text-primary-600">Arrastra y suelta</span> archivos aquí, o 
                <button onClick={() => fileInputRef.current?.click()} className="text-primary-600 hover:underline ml-1">selecciona</button>
              </p>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-4 bg-gray-50 border border-gray-200 p-3 rounded-xl">
            <div className="relative max-w-md bg-white rounded-lg">
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input w-full pl-9 pr-9 py-1.5 border-gray-300 rounded-lg text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p>Cargando medios...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
               <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
               <p>No hay archivos en esta carpeta.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {(() => {
                const filtered = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
                if (filtered.length === 0 && searchQuery) {
                  return (
                    <div className="col-span-full py-12 text-center text-gray-400 text-sm">
                      Ningún archivo o carpeta coincide con "{searchQuery}"
                    </div>
                  );
                }
                return filtered.map(file => {
                  const isFolder = !file.id;
                  
                  if (isFolder) {
                    const isDragTarget = dragOverFolder === file.name;
                    return (
                      <div 
                        key={file.name} 
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, file.name, true)}
                        onDragOver={(e) => { e.preventDefault(); setDragOverFolder(file.name); }}
                        onDragLeave={() => setDragOverFolder(null)}
                        onDrop={(e) => handleFolderDrop(e, file.name)}
                        className={`group relative border rounded-xl flex flex-col items-center justify-center p-4 transition-all bg-white aspect-square cursor-grab active:cursor-grabbing ${
                          isDragTarget 
                            ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 shadow-md' 
                            : 'border-gray-200 hover:border-primary-400 hover:shadow-md'
                        }`}
                      >
                        <button 
                          disabled={loading}
                          onClick={() => !loading && setCurrentPath(currentPath + file.name + '/')}
                          className="w-full h-full flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Folder className="w-10 h-10 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-gray-700 truncate w-full text-center">{file.name}</span>
                        </button>
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all bg-white/80 p-0.5 rounded shadow">
                          <button onClick={(e) => { e.stopPropagation(); handleRename(file.name, true); }} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100" title="Renombrar">
                            <Edit className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleMove(file.name, true); }} className="p-1 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100" title="Mover">
                            <Move className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(file.name, true); }} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100" title="Eliminar">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const url = getFileUrl(file.name);
                  const img = isImage(file.name);
                  const isSelected = selectedFiles.has(url);
                  
                  return (
                    <div 
                      key={file.id} 
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, file.name, false)}
                      className={`group relative bg-white border-2 overflow-hidden transition-all shadow-sm aspect-square cursor-grab active:cursor-grabbing ${
                        isSelected ? 'border-primary-500 ring-2 ring-primary-500 ring-offset-2' : 'border-gray-200 hover:border-primary-400 hover:shadow-md'
                      }`}
                    >
                      <button 
                        onClick={(e) => handleFileClick(file, e)}
                        className="w-full h-full flex items-center justify-center p-2 pb-6 bg-gray-50/50"
                      >
                         {img ? (
                            <img src={url} alt={file.name} className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform" />
                         ) : (
                            <FileIcon className="w-8 h-8 text-slate-400" />
                         )}
                      </button>
                      
                      {multiple && (
                        <div 
                          onClick={(e) => { e.stopPropagation(); handleFileClick(file, e); }}
                          className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      
                      <div className="absolute inset-x-0 bottom-0 bg-white/95 border-t border-gray-100 px-1.5 py-0.5 flex items-center justify-between">
                        <p className="text-[9px] font-bold text-gray-500 truncate mr-1" title={file.name}>{file.name}</p>
                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white">
                          <button onClick={(e) => { e.stopPropagation(); handleRename(file.name, false); }} className="p-0.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100" title="Renombrar">
                            <Edit className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleMove(file.name, false); }} className="p-0.5 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100" title="Mover">
                            <Move className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(file.name, false); }} className="p-0.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100" title="Eliminar">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        {multiple && (
          <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
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
