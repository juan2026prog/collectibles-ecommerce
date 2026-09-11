import React, { useState } from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { 
  GitCommit, Search, CheckCircle2, ShieldCheck, Sparkles, 
  Eye, UploadCloud, ArrowRight, Filter, ChevronRight
} from 'lucide-react';

export type PipelineStage = 
  | 'DISCOVERED' 
  | 'MATCHED' 
  | 'VERIFIED' 
  | 'OPPORTUNITY' 
  | 'REVIEW' 
  | 'APPROVED' 
  | 'PUBLISHED';

interface SourcingPipelineViewProps {
  products: NormalizedProduct[];
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
  onImportProduct: (product: NormalizedProduct) => void;
}

interface StageConfig {
  id: PipelineStage;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: StageConfig[] = [
  {
    id: 'DISCOVERED',
    label: 'DISCOVERED',
    description: 'Productos recién detectados en retailers USA',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Search
  },
  {
    id: 'MATCHED',
    label: 'MATCHED',
    description: 'Deduplicados y vinculados a SKU canónico',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: GitCommit
  },
  {
    id: 'VERIFIED',
    label: 'VERIFIED',
    description: 'Seller Trust y Authenticity Gate aprobados',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: ShieldCheck
  },
  {
    id: 'OPPORTUNITY',
    label: 'OPPORTUNITY',
    description: 'Opportunity Score > 70 & Margen neta > 15%',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Sparkles
  },
  {
    id: 'REVIEW',
    label: 'REVIEW',
    description: 'En revisión manual o verificación de alerta',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: Eye
  },
  {
    id: 'APPROVED',
    label: 'APPROVED',
    description: 'Aprobados para publicación o preventa',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    icon: CheckCircle2
  },
  {
    id: 'PUBLISHED',
    label: 'PUBLISHED',
    description: 'Publicados activamente en catálogo UY',
    color: 'text-[#f00856]',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    icon: UploadCloud
  }
];

export const SourcingPipelineView: React.FC<SourcingPipelineViewProps> = ({
  products,
  onOpenAnalysisModal,
  onImportProduct
}) => {
  const [selectedStage, setSelectedStage] = useState<PipelineStage | 'ALL'>('ALL');

  // Categorize products into stages based on real attributes
  const categorizeProduct = (p: NormalizedProduct): PipelineStage => {
    if (p.catalog_status === 'ALREADY_IN_CATALOG') return 'PUBLISHED';
    if (p.authenticity.status === 'NEEDS_VERIFICATION') return 'REVIEW';
    if (p.opportunity_score >= 80 && p.financials.profit_usd > 0) return 'APPROVED';
    if (p.opportunity_score >= 65) return 'OPPORTUNITY';
    if (p.authenticity.status === 'VERIFIED_OFFICIAL') return 'VERIFIED';
    if (p.catalog_status === 'POSSIBLE_MATCH') return 'MATCHED';
    return 'DISCOVERED';
  };

  const productsWithStage = products.map(p => ({
    ...p,
    pipelineStage: categorizeProduct(p)
  }));

  const getStageCount = (stageId: PipelineStage) => {
    return productsWithStage.filter(p => p.pipelineStage === stageId).length;
  };

  const filteredProducts = selectedStage === 'ALL'
    ? productsWithStage
    : productsWithStage.filter(p => p.pipelineStage === selectedStage);

  return (
    <div className="space-y-6">
      {/* Visual Pipeline Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-[#f00856]" />
              <span>Pipeline del Embudo Comercial de Sourcing</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Estado de avance del catálogo: {products.length} productos distribuidos en {STAGES.length} etapas activas.
            </p>
          </div>

          {selectedStage !== 'ALL' && (
            <button
              onClick={() => setSelectedStage('ALL')}
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Mostrar Todas las Etapas ({products.length})</span>
            </button>
          )}
        </div>

        {/* Horizontal Flow Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {STAGES.map((stage, idx) => {
            const count = getStageCount(stage.id);
            const isSelected = selectedStage === stage.id;
            const Icon = stage.icon;

            return (
              <button
                key={stage.id}
                onClick={() => setSelectedStage(isSelected ? 'ALL' : stage.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? `${stage.bgColor} ${stage.borderColor} ring-2 ring-indigo-500/20 shadow-xs`
                    : 'bg-gray-50/80 hover:bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`p-1.5 rounded-lg ${stage.bgColor} ${stage.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">#{idx + 1}</span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-900 truncate" title={stage.label}>
                    {stage.label}
                  </h4>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className={`text-lg font-extrabold font-mono ${stage.color}`}>
                    {count}
                  </span>
                  {idx < STAGES.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 hidden md:block" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Detail List */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span>Productos en Etapa:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {selectedStage === 'ALL' ? 'Todas las Etapas' : selectedStage} ({filteredProducts.length})
            </span>
          </h4>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <GitCommit className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-xs font-bold text-gray-700">Sin productos en esta etapa del pipeline</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Seleccione otra etapa o explore la terminal comercial.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => {
              const stageConfig = STAGES.find(s => s.id === product.pipelineStage)!;
              const StageIcon = stageConfig.icon;

              return (
                <div
                  key={product.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-14 h-14 object-cover rounded-lg bg-gray-100 border border-gray-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${stageConfig.bgColor} ${stageConfig.color} border ${stageConfig.borderColor}`}>
                            <StageIcon className="w-3 h-3" />
                            <span>{stageConfig.label}</span>
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-gray-900 leading-snug truncate" title={product.title}>
                          {product.title}
                        </h5>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {product.brand} · {product.license}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                      <div>
                        <span className="text-gray-400 block">Costo Puesto UY</span>
                        <strong className="text-gray-900 font-mono font-bold">
                          ${product.financials.real_cost_puesto_usd.toFixed(2)} USD
                        </strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Opportunity Score</span>
                        <strong className="text-emerald-600 font-mono font-bold">
                          {product.opportunity_score}/100
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onOpenAnalysisModal(product)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                    >
                      Analizar Ficha
                    </button>
                    {product.pipelineStage !== 'PUBLISHED' && (
                      <button
                        onClick={() => onImportProduct(product)}
                        className="px-2.5 py-1 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <span>Publicar</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
