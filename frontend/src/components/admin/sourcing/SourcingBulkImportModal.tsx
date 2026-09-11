import React, { useState } from 'react';
import { 
  X, Download, CheckCircle2, AlertTriangle, ShieldCheck, 
  Layers, AlertCircle, PlusCircle, Check
} from 'lucide-react';
import type { MultiSourceCanonicalProduct } from '../../../services/sourcing/multiSourceSearchService';

interface SourcingBulkImportModalProps {
  selectedProducts: MultiSourceCanonicalProduct[];
  onClose: () => void;
  onConfirmBulkImport: (params: {
    productsToImport: MultiSourceCanonicalProduct[];
    linkExistingOffers: boolean;
  }) => Promise<void>;
}

export const SourcingBulkImportModal: React.FC<SourcingBulkImportModalProps> = ({
  selectedProducts,
  onClose,
  onConfirmBulkImport
}) => {
  const [linkExistingOffers, setLinkExistingOffers] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Clasificación de los seleccionados
  const totalSelected = selectedProducts.length;
  const alreadyInCatalog = selectedProducts.filter(p => p.already_in_catalog);
  const outOfStock = selectedProducts.filter(p => p.stock_verdict === 'OUT_OF_STOCK');
  const needsReview = selectedProducts.filter(p => p.condition_meta.needsReview || p.is_lot);
  const readyToImport = selectedProducts.filter(p => 
    !p.already_in_catalog && 
    p.stock_verdict !== 'OUT_OF_STOCK' && 
    !p.is_lot
  );

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirmBulkImport({
        productsToImport: selectedProducts,
        linkExistingOffers
      });
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <span className="text-[10px] font-black uppercase text-[#f00856] tracking-wider block">
              Sourcing Intelligence · Importación Masiva Segura
            </span>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-[#f00856]" />
              <span>Resumen Previo de Importación Masiva</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjetas Cuantitativas de Auditoría Previa */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-gray-50 border border-gray-200 p-3 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Total Seleccionados</span>
            <span className="font-mono font-black text-xl text-gray-900">{totalSelected}</span>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Listos para Crear</span>
            <span className="font-mono font-black text-xl text-emerald-800">{readyToImport.length}</span>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">Ya en Catálogo</span>
            <span className="font-mono font-black text-xl text-amber-800">{alreadyInCatalog.length}</span>
          </div>

          <div className="bg-purple-50 border border-purple-200 p-3 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-purple-700 block tracking-wider">Requieren Revisión</span>
            <span className="font-mono font-black text-xl text-purple-800">{needsReview.length}</span>
          </div>
        </div>

        {/* Opciones de Tratamiento de Duplicados */}
        {alreadyInCatalog.length > 0 && (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <PlusCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Gestión de Productos Ya Existentes ({alreadyInCatalog.length})</span>
            </div>
            <label className="flex items-start gap-2 text-amber-900 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={linkExistingOffers}
                onChange={(e) => setLinkExistingOffers(e.target.checked)}
                className="rounded border-amber-300 text-emerald-600 focus:ring-emerald-600 w-4 h-4 mt-0.5"
              />
              <span>
                Vincular ofertas a productos existentes en lugar de duplicar fichas en la tienda.
              </span>
            </label>
          </div>
        )}

        {/* Lista Previa de Productos Seleccionados */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
            Detalle de Productos a Procesar ({selectedProducts.length})
          </span>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-2xl divide-y divide-gray-100 text-xs">
            {selectedProducts.map((prod) => (
              <div key={prod.id} className="p-3 flex items-center justify-between gap-3 hover:bg-gray-50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={prod.image_url}
                    alt={prod.title}
                    className="w-8 h-8 rounded-lg object-contain bg-white border border-gray-200 p-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-gray-900 truncate block">{prod.title}</span>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {prod.brand} · {prod.offers.length} oferta(s)
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {prod.already_in_catalog ? (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      Existe en Catálogo
                    </span>
                  ) : prod.is_lot ? (
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                      Lote (Revisar)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      Listo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            onClick={handleConfirm}
            disabled={isProcessing || totalSelected === 0}
            className="px-6 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {isProcessing ? 'Procesando...' : `Confirmar e Importar (${readyToImport.length + (linkExistingOffers ? alreadyInCatalog.length : 0)})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
