import React, { useState } from 'react';
import { X, Sparkles, Loader2, AlertCircle, CheckCircle2, ArrowRight, BrainCircuit, Globe, Info } from 'lucide-react';
import type { ResearchPack } from '../../../types/sourcing';
import type { OpenAIResearchType } from '../../../services/sourcing/openaiResearchService';
import { executeOpenAIResearch } from '../../../services/sourcing/openaiResearchService';

interface SourcingOpenAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPack: (pack: ResearchPack) => Promise<void>;
}

const RESEARCH_TYPE_OPTIONS: { label: string; value: OpenAIResearchType; emoji: string }[] = [
  { label: 'Manual', value: 'MANUAL', emoji: '✏️' },
  { label: 'Trending', value: 'TRENDING', emoji: '🔥' },
  { label: 'Nuevo Lanzamiento', value: 'NEW_RELEASE', emoji: '🆕' },
  { label: 'Preventa', value: 'PREORDER', emoji: '⏳' },
  { label: 'Clásico/Evergreen', value: 'EVERGREEN', emoji: '🌿' },
  { label: 'Retro/Nostálgico', value: 'RETRO', emoji: '📼' },
  { label: 'Vacío en Catálogo', value: 'CATALOG_GAP', emoji: '📦' },
];

export const SourcingOpenAIModal: React.FC<SourcingOpenAIModalProps> = ({
  isOpen,
  onClose,
  onLoadPack,
}) => {
  const [query, setQuery] = useState('');
  const [researchType, setResearchType] = useState<OpenAIResearchType>('MANUAL');
  const [webSearch, setWebSearch] = useState(false);
  const [maxResults, setMaxResults] = useState(100);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: string;
    items_found: number;
    items_valid: number;
    items_invalid: number;
    estimated_cost_usd: number;
    total_tokens: number;
    pack: ResearchPack;
  } | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setQuery('');
    setResearchType('MANUAL');
    setWebSearch(false);
    setMaxResults(100);
    setErrorMsg(null);
    setResult(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setErrorMsg('Ingresá qué querés buscar.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    setResult(null);

    const res = await executeOpenAIResearch({
      query: query.trim(),
      research_type: researchType,
      max_results: maxResults,
    });

    setLoading(false);

    if (!res.success) {
      const statusMessages: Record<string, string> = {
        FEATURE_DISABLED: 'OpenAI Research está desactivado. Activalo en Configuración → Internacional.',
        PENDING_CREDENTIAL: 'OPENAI_API_KEY no configurada en Supabase Secrets.',
        RATE_LIMITED: 'Límite diario de búsquedas alcanzado. Intentá mañana.',
        BUDGET_EXCEEDED: 'Presupuesto diario de OpenAI alcanzado.',
        FORBIDDEN: 'No tenés permisos de administrador.',
        MODEL_UNAVAILABLE: 'El modelo OpenAI seleccionado no está disponible.',
        FAILED: res.error || 'Error inesperado. Revisá la consola.',
      };
      setErrorMsg(statusMessages[res.status] || res.error || 'Error inesperado.');
      return;
    }

    if (res.pack) {
      setResult({
        status: res.status,
        items_found: res.items_found ?? 0,
        items_valid: res.items_valid ?? 0,
        items_invalid: res.items_invalid ?? 0,
        estimated_cost_usd: res.usage?.estimated_cost_usd ?? 0,
        total_tokens: res.usage?.total_tokens ?? 0,
        pack: res.pack,
      });
    }
  };

  const handleUsePack = async () => {
    if (!result?.pack) return;
    setLoading(true);
    await onLoadPack(result.pack);
    setLoading(false);
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/80">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#f00856]" />
              Investigar con OpenAI
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Generá un Research Pack de productos originales y licenciados con IA.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Error */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className={`p-4 rounded-xl border text-xs space-y-2 ${
              result.status === 'PARTIAL'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className={`w-4 h-4 ${result.status === 'PARTIAL' ? 'text-amber-500' : 'text-emerald-600'}`} />
                {result.items_valid} candidatos encontrados
                {result.items_invalid > 0 && (
                  <span className="text-amber-600 font-normal">· {result.items_invalid} inválidos descartados</span>
                )}
              </div>
              <div className="text-gray-500 font-mono">
                {result.total_tokens.toLocaleString()} tokens
                · ~\${result.estimated_cost_usd.toFixed(4)} USD
              </div>
              <div className="text-gray-500">
                Los resultados pasarán por el pipeline completo: Live Check → Autenticidad → Precios → MLU.
                No se importa nada automáticamente.
              </div>
            </div>
          )}

          {/* Form — hidden when showing result */}
          {!result && (
            <>
              {/* Query textarea */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  ¿Qué querés buscar?
                </label>
                <textarea
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  placeholder="Ej: Figuras de Batman oficiales McFarlane DC Comics, escala 7 pulgadas"
                  className="w-full bg-white border border-gray-300 rounded-lg p-3 text-xs text-gray-900 focus:outline-none focus:border-[#f00856] shadow-xs resize-none"
                />
              </div>

              {/* Type chips */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de investigación</label>
                <div className="flex flex-wrap gap-1.5">
                  {RESEARCH_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setResearchType(opt.value)}
                      disabled={loading}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        researchType === opt.value
                          ? 'bg-[#f00856] text-white border-[#f00856]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-gray-700">Máx. productos:</label>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    step={10}
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                    disabled={loading}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-[#f00856]"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                    disabled={loading}
                    className="rounded"
                  />
                  <Globe className="w-3.5 h-3.5 text-gray-500" />
                  <span className="font-semibold text-gray-700">Web Research</span>
                </label>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                <span>
                  Solo se devuelven productos originales y oficialmente licenciados. Todos pasan por Authenticity Gate y Live Check antes de poder importarse.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          {result ? (
            <>
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex-1 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-xs hover:bg-gray-50 transition-colors"
              >
                Nueva búsqueda
              </button>
              <button
                onClick={handleUsePack}
                disabled={loading}
                className="flex-1 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Ver en Sourcing</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-xs hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="flex-1 py-2.5 bg-[#f00856] hover:bg-[#d0074a] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Investigando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Investigar con OpenAI</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
