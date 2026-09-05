import React, { useState, useMemo } from 'react';
import type { NormalizedProduct, ColumnDefinition } from '../../../types/sourcing';
import { SourcingTableRow } from './SourcingTableRow';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface SourcingTableProps {
  products: NormalizedProduct[];
  columns: ColumnDefinition[];
  selectedIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  onImportProduct: (product: NormalizedProduct) => void;
  onPublishPreorder: (product: NormalizedProduct) => void;
  onUpdateSalePrice: (productId: string, newPrice: number) => void;
  onSelectSource: (productId: string, offerId: string) => void;
  onRefreshLiveCheck?: (product: NormalizedProduct) => void;
}

export const SourcingTable: React.FC<SourcingTableProps> = ({
  products,
  columns,
  selectedIds,
  onToggleSelectAll,
  onToggleSelectOne,
  onImportProduct,
  onPublishPreorder,
  onUpdateSalePrice,
  onSelectSource,
  onRefreshLiveCheck
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<string>('default');
  const [sortAsc, setSortAsc] = useState(false);

  // Sorting
  const sortedProducts = useMemo(() => {
    if (sortBy === 'default') return products;

    return [...products].sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortBy === 'cost_puesto') {
        valA = a.financials.real_cost_puesto_usd;
        valB = b.financials.real_cost_puesto_usd;
      } else if (sortBy === 'sale_price') {
        valA = a.financials.current_sale_price_usd;
        valB = b.financials.current_sale_price_usd;
      } else if (sortBy === 'margin') {
        valA = a.financials.margin_percent;
        valB = b.financials.margin_percent;
      } else if (sortBy === 'ml_uruguay') {
        valA = a.uruguay_market.min_price_usd || 0;
        valB = b.uruguay_market.min_price_usd || 0;
      } else if (sortBy === 'difference') {
        valA = a.uruguay_market.comparison_diff_percent || 0;
        valB = b.uruguay_market.comparison_diff_percent || 0;
      } else if (sortBy === 'opportunity_score') {
        valA = a.opportunity_score;
        valB = b.opportunity_score;
      }

      return sortAsc ? valA - valB : valB - valA;
    });
  }, [products, sortBy, sortAsc]);

  // Pagination for high performance (handles 100 to 3000+ products seamlessly)
  const totalPages = Math.ceil(sortedProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, currentPage, pageSize]);

  const handleSort = (colId: string) => {
    if (sortBy === colId) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(colId);
      setSortAsc(false);
    }
  };

  const isAllSelected = paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.includes(p.id));

  return (
    <div className="bg-dark-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-dark-950/60 text-[11px] font-bold text-gray-400 uppercase tracking-wider select-none">
              {columns.filter(c => c.visible).map(col => {
                if (col.id === 'select') {
                  return (
                    <th key={col.id} className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={onToggleSelectAll}
                        className="rounded border-gray-600 bg-dark-800 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 cursor-pointer"
                      />
                    </th>
                  );
                }

                const isSortable = ['cost_puesto', 'sale_price', 'margin', 'ml_uruguay', 'difference', 'opportunity_score'].includes(col.id);

                return (
                  <th
                    key={col.id}
                    onClick={() => isSortable && handleSort(col.id)}
                    className={`py-3 px-3 whitespace-nowrap ${
                      isSortable ? 'cursor-pointer hover:text-white transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      {isSortable && <ArrowUpDown className="w-3 h-3 text-gray-500" />}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map(product => (
                <SourcingTableRow
                  key={product.id}
                  product={product}
                  columns={columns}
                  isSelected={selectedIds.includes(product.id)}
                  onToggleSelect={() => onToggleSelectOne(product.id)}
                  onImportProduct={onImportProduct}
                  onPublishPreorder={onPublishPreorder}
                  onUpdateSalePrice={onUpdateSalePrice}
                  onSelectSource={onSelectSource}
                  onRefreshLiveCheck={onRefreshLiveCheck}
                />
              ))
            ) : (
              <tr>
                <td colSpan={columns.filter(c => c.visible).length} className="py-16 text-center text-gray-400 text-sm">
                  No se encontraron productos con los criterios seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barra inferior de paginación */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-white/10 bg-dark-950/40 text-xs text-gray-400 gap-3">
        <div className="flex items-center gap-2">
          <span>Filas por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-dark-800 border border-white/10 rounded px-2 py-1 text-white text-xs"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
          </select>
          <span className="text-gray-500">
            Mostrando {sortedProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedProducts.length)} de {sortedProducts.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-30 text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-white px-2">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-30 text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
