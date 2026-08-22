import { useState, useMemo, useEffect, useRef } from 'react';
import { Download, X, FileSpreadsheet, FileCode, CheckSquare, Square, RefreshCw, Layers, Filter, Search } from 'lucide-react';
import { getMasterFields } from '../../lib/productFieldRegistry';
import { triggerProductsDownload } from '../../lib/bulkExportUtils';
import type { ExportProductItem } from '../../lib/bulkExportUtils';
import type { ProductFilterState } from '../../lib/productFilterTypes';
import { createDefaultProductFilters } from '../../lib/productFilterTypes';
import { fetchExportProductsCount, fetchExportProductsData } from '../../lib/exportProductsEngine';
import type { ExportScope } from '../../lib/exportProductsEngine';
import { supabase } from '../../lib/supabase';

export interface ExportModalProps {
  onClose: () => void;
  initialFilters?: ProductFilterState;
  selectedProductIds?: string[];
  userRole?: 'admin' | 'vendor';
  vendorId?: string | null;
  allProducts?: ExportProductItem[];
  filteredProducts?: ExportProductItem[];
}

export default function ExportModal({
  onClose,
  initialFilters,
  selectedProductIds = [],
  userRole = 'admin',
  vendorId = null,
  allProducts,
  filteredProducts
}: ExportModalProps) {
  const masterFields = useMemo(() => getMasterFields(userRole).filter(f => f.exportable), [userRole]);

  // Master field default keys ordered by `order`
  const defaultKeys = useMemo(() => {
    return masterFields.map(f => f.key);
  }, [masterFields]);

  const [selectedKeys, setSelectedKeys] = useState<string[]>(defaultKeys);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  
  // Scope state
  const hasInitialSelected = selectedProductIds.length > 0;
  const [scope, setScope] = useState<ExportScope>(hasInitialSelected ? 'selected' : 'filtered');

  // Filters state (isolated copy for modal)
  const [exportFilters, setExportFilters] = useState<ProductFilterState>(() => 
    createDefaultProductFilters(initialFilters)
  );

  // Metadata lists for dropdown filters in modal
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<{ id: string; store_name: string }[]>([]);

  // Individual counts for dropdown labels
  const [allCount, setAllCount] = useState<number>(allProducts ? allProducts.length : 0);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [scopeCount, setScopeCount] = useState<number>(0);
  const [isCalculatingCount, setIsCalculatingCount] = useState<boolean>(true);

  // Export progress states
  const [exporting, setExporting] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');

  const countRequestId = useRef<number>(0);

  // Fetch filter metadata options on mount
  useEffect(() => {
    async function loadMetadata() {
      const [{ data: cats }, { data: brs }, { data: vds }] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('vendors').select('id, store_name').order('store_name')
      ]);
      setCategories(cats || []);
      setBrands(brs || []);
      setVendors(vds || []);
    }
    loadMetadata();
  }, []);

  // Calculate real counts for 'all', 'filtered', and selected scope
  useEffect(() => {
    let isSubscribed = true;
    const reqId = ++countRequestId.current;

    async function calculateCounts() {
      setIsCalculatingCount(true);

      const [totalCatalog, totalFiltered, currentScopeTotal] = await Promise.all([
        fetchExportProductsCount({
          scope: 'all',
          filters: createDefaultProductFilters(),
          userRole,
          vendorId
        }),
        fetchExportProductsCount({
          scope: 'filtered',
          filters: exportFilters,
          userRole,
          vendorId
        }),
        fetchExportProductsCount({
          scope,
          filters: exportFilters,
          selectedIds: selectedProductIds,
          userRole,
          vendorId
        })
      ]);

      if (isSubscribed && reqId === countRequestId.current) {
        setAllCount(totalCatalog);
        setFilteredCount(totalFiltered);
        setScopeCount(currentScopeTotal);
        setIsCalculatingCount(false);
      }
    }

    const timer = setTimeout(calculateCounts, 150);
    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [scope, exportFilters, selectedProductIds, userRole, vendorId]);

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const updated = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      return masterFields.map(f => f.key).filter(k => updated.includes(k));
    });
  };

  const selectAll = () => {
    setSelectedKeys(masterFields.map(f => f.key));
  };

  const selectNone = () => {
    setSelectedKeys([]);
  };

  const resetDefault = () => {
    setSelectedKeys(defaultKeys);
  };

  const handleFilterChange = (key: keyof ProductFilterState, value: string) => {
    setExportFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      alert('Debes seleccionar al menos una columna para exportar.');
      return;
    }
    if (scopeCount === 0) {
      alert('No hay productos en la selección actual para exportar.');
      return;
    }

    setExporting(true);
    setProgressMsg('Iniciando exportación...');

    try {
      // Execute batched retrieval of products
      const productsToExport = await fetchExportProductsData(
        {
          scope,
          filters: exportFilters,
          selectedIds: selectedProductIds,
          userRole,
          vendorId
        },
        (_fetched, _total, message) => {
          setProgressMsg(message);
        }
      );

      if (productsToExport.length === 0) {
        alert('No se encontraron productos para exportar.');
        setExporting(false);
        return;
      }

      setProgressMsg(format === 'xlsx' ? 'Generando archivo Excel (.xlsx)...' : 'Generando archivo CSV (UTF-8)...');

      await new Promise(r => setTimeout(r, 100));

      await triggerProductsDownload(
        productsToExport,
        selectedKeys,
        format,
        userRole,
        'Productos_Collectibles'
      );

      onClose();
    } catch (err: any) {
      console.error('[ExportModal handleExport Error]', err);
      alert('Error al exportar productos: ' + (err.message || err));
    } finally {
      setExporting(false);
      setProgressMsg('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/70 z-50 backdrop-blur-sm" onClick={!exporting ? onClose : undefined} />
      <div className="fixed inset-0 m-auto w-full max-w-3xl h-fit max-h-[90vh] bg-white z-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">Exportación Masiva de Productos</h2>
              <p className="text-xs text-slate-500 font-medium">Configura el formato, productos y columnas oficiales a exportar</p>
            </div>
          </div>
          {!exporting && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          
          {/* Formato y Alcance Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Formato selector */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">1. Formato de Archivo</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setFormat('xlsx')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    format === 'xlsx'
                      ? 'border-emerald-500 bg-emerald-50/40 text-emerald-800 font-bold shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                  <span className="text-xs">Excel (.XLSX)</span>
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setFormat('csv')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    format === 'csv'
                      ? 'border-blue-500 bg-blue-50/40 text-blue-800 font-bold shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <FileCode className="w-6 h-6 text-blue-600" />
                  <span className="text-xs">CSV (UTF-8)</span>
                </button>
              </div>
            </div>

            {/* Scope selector */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">2. Productos a Exportar</label>
              <select
                value={scope}
                disabled={exporting}
                onChange={(e: any) => setScope(e.target.value as ExportScope)}
                className="w-full text-sm font-semibold border border-slate-200 rounded-xl p-3 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="all">Todos los productos ({isCalculatingCount && allCount === 0 ? '...' : allCount})</option>
                <option value="filtered">Resultados filtrados ({isCalculatingCount ? '...' : filteredCount})</option>
                <option value="selected" disabled={selectedProductIds.length === 0}>
                  Productos seleccionados ({selectedProductIds.length})
                </option>
                <option value="published">Sólo Publicados / Activos</option>
                <option value="draft">Sólo Borradores</option>
                <option value="archived">Sólo Archivados / Inactivos</option>
                <option value="out_of_stock">Sólo Agotados (Stock 0)</option>
              </select>
              
              <div className="text-xs text-slate-600 font-medium flex items-center justify-between pt-1">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  Se exportarán <strong>{isCalculatingCount ? '...' : scopeCount}</strong> productos en total.
                </span>
                {isCalculatingCount && (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                )}
              </div>
            </div>

          </div>

          {/* Filtros de Exportación */}
          <div className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-600" /> Filtros de Exportación
              </label>
              <button
                type="button"
                onClick={() => setExportFilters(createDefaultProductFilters())}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Limpiar filtros
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Search query */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar (Título, SKU)..."
                  value={exportFilters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Categoría */}
              <select
                value={exportFilters.categoryId}
                onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                className="text-xs border border-slate-200 rounded-xl p-2 bg-white focus:outline-none focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Marca */}
              <select
                value={exportFilters.brandId}
                onChange={(e) => handleFilterChange('brandId', e.target.value)}
                className="text-xs border border-slate-200 rounded-xl p-2 bg-white focus:outline-none focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
              >
                <option value="">Todas las marcas</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              {/* Vendedor (Admin only) */}
              {userRole === 'admin' && (
                <select
                  value={exportFilters.vendorId}
                  onChange={(e) => handleFilterChange('vendorId', e.target.value)}
                  className="text-xs border border-slate-200 rounded-xl p-2 bg-white focus:outline-none focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
                >
                  <option value="all">Todos los vendedores</option>
                  <option value="platform">Solo Collectibles</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.store_name}</option>
                  ))}
                </select>
              )}

              {/* Tipo MBE */}
              <select
                value={exportFilters.mbeType}
                onChange={(e) => handleFilterChange('mbeType', e.target.value)}
                className="text-xs border border-slate-200 rounded-xl p-2 bg-white focus:outline-none focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
              >
                <option value="">Tipo MBE: Todos</option>
                <option value="mbe_pak">MBE PAK</option>
                <option value="mbe_caja">MBE Caja</option>
                <option value="unclassified">Sin definir</option>
              </select>

              {/* Estado AR */}
              <select
                value={exportFilters.argentinaStatus}
                onChange={(e) => handleFilterChange('argentinaStatus', e.target.value)}
                className="text-xs border border-slate-200 rounded-xl p-2 bg-white focus:outline-none focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
              >
                <option value="">Estado AR: Todos</option>
                <option value="auto">Envío automático</option>
                <option value="quote">Requiere cotización</option>
              </select>
            </div>
          </div>

          {/* Selección de Columnas */}
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">3. Selección de Columnas</h3>
                <p className="text-xs text-slate-500 font-medium">El orden de las columnas es fijo y oficial de Collectibles.uy</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={selectAll}
                  className="text-xs px-2.5 py-1.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Seleccionar todas
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={selectNone}
                  className="text-xs px-2.5 py-1.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-slate-400" /> Quitar todas
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={resetDefault}
                  className="text-xs px-2.5 py-1.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Restablecer
                </button>
              </div>
            </div>

            {/* Column Counter */}
            <div className="flex justify-between items-center bg-white p-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold">
              <span className="text-slate-600">Columnas activas:</span>
              <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                {selectedKeys.length} de {masterFields.length} columnas seleccionadas
              </span>
            </div>

            {/* Column Checkboxes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
              {masterFields.map(field => {
                const isSelected = selectedKeys.includes(field.key);
                return (
                  <label
                    key={field.key}
                    onClick={() => !exporting && toggleKey(field.key)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all text-xs font-semibold ${
                      isSelected
                        ? 'border-emerald-400 bg-white text-slate-800 shadow-sm'
                        : 'border-slate-200 bg-slate-100/50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={exporting}
                      onChange={() => {}}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0 pointer-events-none"
                    />
                    <span className="truncate">{field.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Warning banner when count is 0 */}
          {!isCalculatingCount && scopeCount === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-semibold flex items-center gap-2">
              <span className="font-bold">Nota:</span> No hay productos que coincidan con los criterios seleccionados.
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            {exporting && (
              <span className="text-xs font-bold text-emerald-700 animate-pulse">
                {progressMsg}
              </span>
            )}

            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || isCalculatingCount || scopeCount === 0 || selectedKeys.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs py-2.5 px-6 font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {exporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Preparando exportación...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> GENERAR Y DESCARGAR ({scopeCount})
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
