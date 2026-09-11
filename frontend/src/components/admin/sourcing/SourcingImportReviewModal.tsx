import React, { useState } from 'react';
import { 
  X, Download, CheckCircle2, AlertTriangle, ShieldCheck, 
  ExternalLink, Building2, Tag, DollarSign, Layers, PlusCircle
} from 'lucide-react';
import type { MultiSourceCanonicalProduct, MultiSourceOfferDetail } from '../../../services/sourcing/multiSourceSearchService';
import type { CanonicalProductCondition } from '../../../services/sourcing/conditionMapper';
import { CANONICAL_CONDITIONS_META } from '../../../services/sourcing/conditionMapper';

interface SourcingImportReviewModalProps {
  product: MultiSourceCanonicalProduct | null;
  selectedOffer: MultiSourceOfferDetail | null;
  onClose: () => void;
  onConfirmImport: (params: {
    product: MultiSourceCanonicalProduct;
    offer: MultiSourceOfferDetail;
    condition: CanonicalProductCondition;
    actionType: 'NEW_PRODUCT' | 'ADD_OFFER_TO_EXISTING';
  }) => Promise<void>;
}

export const SourcingImportReviewModal: React.FC<SourcingImportReviewModalProps> = ({
  product,
  selectedOffer,
  onClose,
  onConfirmImport
}) => {
  if (!product || !selectedOffer) return null;

  const [condition, setCondition] = useState<CanonicalProductCondition>(selectedOffer.canonical_condition);
  const [isProcessing, setIsProcessing] = useState(false);

  const meta = CANONICAL_CONDITIONS_META[condition];
  const isAlreadyInCatalog = product.already_in_catalog;

  const handleConfirm = async (actionType: 'NEW_PRODUCT' | 'ADD_OFFER_TO_EXISTING') => {
    setIsProcessing(true);
    try {
      await onConfirmImport({
        product,
        offer: selectedOffer,
        condition,
        actionType
      });
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <span className="text-[10px] font-black uppercase text-[#f00856] tracking-wider block">
              Sourcing Intelligence · Paso de Revisión
            </span>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-[#f00856]" />
              <span>Importar Oferta al Catálogo</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificación Crucial: Importar vs Comprar */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">IMPORTAR AL CATÁLOGO ≠ COMPRA AUTOMÁTICA</strong>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Esta acción incorpora el producto al catálogo de Collectibles y guarda la oferta internacional vinculada.
              La compra automática en el retailer (vía Zinc) permanece en sandbox / desactivada.
            </p>
          </div>
        </div>

        {/* ALERTA: Producto Ya Existente en Catálogo */}
        {isAlreadyInCatalog && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2 text-xs text-amber-950">
            <div className="flex items-center gap-2 font-black text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>¡Este producto ya existe en Collectibles!</span>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              Detectamos coincidencia con <strong>"{product.catalog_match_title || product.title}"</strong>.
              Para evitar duplicación de productos en la tienda, te recomendamos incorporar esta oferta como una nueva opción de suministro para el producto canónico existente.
            </p>
          </div>
        )}

        {/* Ficha del Producto e Imagen */}
        <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <img
            src={product.image_url}
            alt={product.title}
            className="w-20 h-20 object-contain rounded-xl bg-white border border-gray-200 p-1 shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="font-bold text-sm text-gray-900 leading-snug">
              {product.title}
            </h4>
            <p className="text-xs text-gray-500 font-medium">
              Marca: <strong>{product.brand}</strong> · Licencia: <strong>{product.license}</strong>
            </p>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-1 flex-wrap">
              {product.upc && <span>UPC: <strong className="font-mono text-gray-700">{product.upc}</strong></span>}
              {product.asin && <span>ASIN: <strong className="font-mono text-gray-700">{product.asin}</strong></span>}
              {product.ebay_item_id && <span>eBay ID: <strong className="font-mono text-gray-700">{product.ebay_item_id}</strong></span>}
            </div>
          </div>
        </div>

        {/* Desglose de Oferta Seleccionada */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
          <div>
            <span className="text-gray-400 font-bold uppercase text-[10px] block">Retailer Origen</span>
            <span className="font-black text-sm uppercase text-indigo-700">{selectedOffer.source}</span>
          </div>
          <div>
            <span className="text-gray-400 font-bold uppercase text-[10px] block">Precio Producto</span>
            <span className="font-mono font-bold text-sm text-gray-900">${selectedOffer.price.toFixed(2)} USD</span>
          </div>
          <div>
            <span className="text-gray-400 font-bold uppercase text-[10px] block">Shipping USA</span>
            <span className="font-mono font-bold text-sm text-gray-900">
              {selectedOffer.domestic_shipping > 0 ? `$${selectedOffer.domestic_shipping.toFixed(2)}` : 'FREE'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 font-bold uppercase text-[10px] block">Costo Puesto UY</span>
            <span className="font-mono font-black text-sm text-emerald-700">
              ${selectedOffer.landed_cost_estimated_usd.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Selector de Condición Canónica Obligatoria (6 estados de DB) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
            Condición Canónica Asignada (CHECK `products.condition`)
          </label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as CanonicalProductCondition)}
            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-[#f00856]"
          >
            <option value="new_sealed">Nuevo Sellado (Fábrica - Embalaje intacto)</option>
            <option value="new_open_box">Nuevo / Open Box (Caja abierta, contenido nuevo)</option>
            <option value="used_complete">Usado Completo (Abierto, con caja original y accesorios)</option>
            <option value="used_incomplete">Usado Incompleto (Con caja, faltan accesorios)</option>
            <option value="loose_complete">Loose Completo (Sin caja original, accesorios completos)</option>
            <option value="loose_incomplete">Loose Incompleto (Sin caja, faltan accesorios)</option>
          </select>
          <p className="text-[11px] text-gray-500">
            {meta.hasBox ? '✓ Conserva empaque o blíster original.' : '⚠ Artículo loose (sin caja exterior original).'}
          </p>
        </div>

        {/* Acciones de Confirmación */}
        <div className="pt-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {isAlreadyInCatalog ? (
            <>
              <button
                onClick={() => handleConfirm('NEW_PRODUCT')}
                disabled={isProcessing}
                className="w-full sm:w-auto px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                title="Crea una entrada independiente de producto en el catálogo"
              >
                Crear Como Producto Nuevo
              </button>

              <button
                onClick={() => handleConfirm('ADD_OFFER_TO_EXISTING')}
                disabled={isProcessing}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Agregar Oferta a Producto Existente</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleConfirm('NEW_PRODUCT')}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Confirmar e Importar al Catálogo</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
