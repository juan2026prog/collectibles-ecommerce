import React, { useState } from 'react';
import type { NormalizedProduct, ColumnDefinition } from '../../../types/sourcing';
import type { SourcingFilterState } from './SourcingFilters';
import { SourcingSearchTerminal } from './SourcingSearchTerminal';
import { SourcingTable } from './SourcingTable';
import { SourcingOpportunityCard } from './SourcingOpportunityCard';
import { SourcingColumnPicker } from './SourcingColumnPicker';
import { SourcingBulkBar } from './SourcingBulkBar';
import { SourcingTableSkeleton, SourcingCardGridSkeleton, SourcingEmptyState } from './SourcingSkeletons';

interface SourcingProductosViewProps {
  products: NormalizedProduct[];
  filteredProducts: NormalizedProduct[];
  loading: boolean;
  filters: SourcingFilterState;
  setFilters: React.Dispatch<React.SetStateAction<SourcingFilterState>>;
  viewMode: 'table' | 'cards';
  setViewMode: React.Dispatch<React.SetStateAction<'table' | 'cards'>>;
  columns: ColumnDefinition[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnDefinition[]>>;
  onSaveColumnPreset: () => void;
  selectedIds: string[];
  watchlistIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  onImportSingle: (product: NormalizedProduct) => void;
  onPublishPreorderSingle: (product: NormalizedProduct) => void;
  onUpdateSalePrice: (productId: string, newPrice: number) => void;
  onSelectSource: (productId: string, offerId: string) => void;
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
  onToggleWatchlist: (product: NormalizedProduct) => void;
  handleBulkImport: () => Promise<void>;
  handleBulkPreorder: () => Promise<void>;
  isProcessingBulk: boolean;
  availableBrands: string[];
}

export const SourcingProductosView: React.FC<SourcingProductosViewProps> = ({
  products,
  filteredProducts,
  loading,
  filters,
  setFilters,
  viewMode,
  setViewMode,
  columns,
  setColumns,
  onSaveColumnPreset,
  selectedIds,
  watchlistIds,
  onToggleSelectAll,
  onToggleSelectOne,
  onImportSingle,
  onPublishPreorderSingle,
  onUpdateSalePrice,
  onSelectSource,
  onOpenAnalysisModal,
  onToggleWatchlist,
  handleBulkImport,
  handleBulkPreorder,
  isProcessingBulk,
  availableBrands
}) => {
  return (
    <div className="space-y-5">
      {/* Terminal Natural Search & Filter Bar */}
      <SourcingSearchTerminal
        filters={filters}
        onChangeFilters={setFilters}
        availableBrands={availableBrands}
        totalResultsCount={products.length}
        filteredResultsCount={filteredProducts.length}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      />

      <div className="flex justify-end">
        <SourcingColumnPicker
          columns={columns}
          onChangeColumns={setColumns}
          onSavePreset={onSaveColumnPreset}
        />
      </div>

      {/* Render Principal: Table vs Cards */}
      {loading ? (
        viewMode === 'table' ? <SourcingTableSkeleton /> : <SourcingCardGridSkeleton />
      ) : filteredProducts.length === 0 ? (
        <SourcingEmptyState
          title="No se encontraron productos en el Catálogo Canónico"
          description="Ningún producto coincide con la combinación actual de búsqueda y filtros."
          actionText="Limpiar Filtros de Búsqueda"
          onAction={() => setFilters({
            searchQuery: '',
            sourceFilter: 'all',
            quickFilter: 'all',
            brandFilter: '',
            minMargin: 0,
            onlyOfficialVerified: false,
            authenticityStatus: 'all'
          })}
        />
      ) : viewMode === 'table' ? (
        <SourcingTable
          products={filteredProducts}
          columns={columns}
          selectedIds={selectedIds}
          onToggleSelectAll={onToggleSelectAll}
          onToggleSelectOne={onToggleSelectOne}
          onImportProduct={onImportSingle}
          onPublishPreorder={onPublishPreorderSingle}
          onUpdateSalePrice={onUpdateSalePrice}
          onSelectSource={onSelectSource}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(prod => (
            <SourcingOpportunityCard
              key={prod.id}
              product={prod}
              isSelected={selectedIds.includes(prod.id)}
              onToggleSelect={() => onToggleSelectOne(prod.id)}
              onOpenAnalysisModal={onOpenAnalysisModal}
              onImportProduct={onImportSingle}
              onPublishPreorder={onPublishPreorderSingle}
              onToggleWatchlist={onToggleWatchlist}
              isInWatchlist={watchlistIds.includes(prod.id)}
            />
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <SourcingBulkBar
        selectedProducts={products.filter(p => selectedIds.includes(p.id))}
        onClearSelection={() => {}}
        onBulkImport={handleBulkImport}
        onBulkPreorder={handleBulkPreorder}
        isProcessing={isProcessingBulk}
      />
    </div>
  );
};
