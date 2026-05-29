import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, Trash2, Copy, FileIcon, ImageIcon, ExternalLink, RefreshCw, AlertCircle, Folder, ChevronRight, FolderPlus, Edit, Move, Search, X } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminMedia() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { confirm, prompt } = useConfirmModal();

  const BUCKET_NAME = 'public-assets';
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMedia(currentPath);
    setSearchQuery('');
  }, [currentPath]);

  async function fetchMedia(path: string) {
    setLoading(true);
    setError(null);
    setFiles([]); // Clear list to prevent double clicks on stale cards
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).list(path, {
        limit: 500,
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
    const folderName = await prompt('Nombre de la nueva carpeta (sin espacios ni caracteres raros):');
    if (!folderName) return;
    
    const sanitized = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folderPath = currentPath ? `${currentPath}${sanitized}` : sanitized;
    const placeholderPath = `${folderPath}/.emptyFolderPlaceholder`;

    setUploading(true);
    const emptyFile = new File([''], '.emptyFolderPlaceholder', { type: 'text/plain' });
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(placeholderPath, emptyFile);
    setUploading(false);

    if (error) {
      toast.error('Error creando la carpeta: ' + error.message);
    } else {
      fetchMedia(currentPath);
      toast.success('Carpeta creada');
    }
  }

  async function uploadFiles(filesArray: File[], destPath?: string) {
    setUploading(true);
    setError(null);
    
    const targetPath = destPath !== undefined ? destPath : currentPath;
    
    for (const file of filesArray) {
      try {
        const fileExt = file.name.split('.').pop();
        const rawName = file.name.replace(`.${fileExt}`, '');
        const sanitizedName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${Date.now()}-${sanitizedName}.${fileExt}`;
        const fullPath = targetPath ? `${targetPath}${fileName}` : fileName;

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
    toast.success('Carga completada');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    await uploadFiles(Array.from(e.target.files));
  }

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
        await moveFolderRecursive(fromPath + '/', toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(fromPath, toPath);
        if (error) throw error;
        await updateDbReferences(fromPath, toPath);
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



  async function handleDelete(fileName: string, isFolder: boolean) {
    const targetPath = currentPath ? `${currentPath}${fileName}` : fileName;
    
    const msg = isFolder 
      ? `¿Eliminar la carpeta "${fileName}" y todo su contenido?` 
      : `¿Eliminar permanentemente el archivo "${fileName}"?`;
    
    if (!(await confirm(msg, { danger: true }))) return;
    
    setLoading(true);
    try {
      if (isFolder) {
        await deleteFolderRecursive(targetPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).remove([targetPath]);
        if (error) throw error;
      }
      fetchMedia(currentPath);
      toast.success(isFolder ? 'Carpeta eliminada' : 'Archivo eliminado');
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar: ${err.message}`);
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
        await moveFolderRecursive(fromPath + '/', toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(fromPath, toPath);
        if (error) throw error;
        await updateDbReferences(fromPath, toPath);
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
        await moveFolderRecursive(fromPath + '/', toPath + '/');
      } else {
        const { error } = await supabase.storage.from(BUCKET_NAME).move(fromPath, toPath);
        if (error) throw error;
        await updateDbReferences(fromPath, toPath);
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


  function getFileUrl(fileName: string) {
    const fullPath = currentPath ? `${currentPath}${fileName}` : fileName;
    return supabase.storage.from(BUCKET_NAME).getPublicUrl(fullPath).data.publicUrl;
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada al portapapeles');
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

      {/* Search Bar */}
      <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Buscar archivos o carpetas por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input w-full pl-10 pr-10 py-2 border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div 
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed p-6 text-center transition-all rounded-xl shadow-sm ${
          isDragging ? 'border-primary-500 bg-primary-50/50 scale-[1.01]' : 'border-gray-200 bg-white hover:border-primary-400'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-primary-600 font-medium">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Subiendo archivos...</span>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-primary-600">Arrastra y suelta</span> archivos aquí, o 
            <button onClick={() => fileInputRef.current?.click()} className="text-primary-600 hover:underline ml-1 font-semibold">selecciona desde tu equipo</button>
          </p>
        )}
      </div>

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
            {(() => {
              const filtered = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
              if (filtered.length === 0 && searchQuery) {
                return (
                  <div className="col-span-full py-12 text-center text-gray-400">
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
                            <Folder className="w-12 h-12 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-gray-700 truncate w-full text-center">{file.name}</span>
                         </button>
                         <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                           <button onClick={(e) => { e.stopPropagation(); handleRename(file.name, true); }} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 bg-white shadow border border-gray-200 rounded-md" title="Renombrar">
                             <Edit className="w-3.5 h-3.5" />
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); handleMove(file.name, true); }} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 bg-white shadow border border-gray-200 rounded-md" title="Mover">
                             <Move className="w-3.5 h-3.5" />
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); handleDelete(file.name, true); }} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white shadow border border-gray-200 rounded-md" title="Eliminar">
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                         </div>
                      </div>
                   );
                }

                const url = getFileUrl(file.name);
                const img = isImage(file.name);
                
                return (
                  <div 
                    key={file.id} 
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, file.name, false)}
                    className="group relative border border-gray-200 rounded-xl flex flex-col items-center justify-center p-2 hover:border-primary-400 hover:shadow-md transition-all bg-white aspect-square overflow-hidden cursor-grab active:cursor-grabbing"
                  >
                    
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
                        <button onClick={() => handleRename(file.name, false)} className="p-1 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded" title="Renombrar">
                          <Edit className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleMove(file.name, false)} className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Mover">
                          <Move className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDelete(file.name, false)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                          <Trash2 className="w-3 h-3" />
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
    </div>
  );
}
