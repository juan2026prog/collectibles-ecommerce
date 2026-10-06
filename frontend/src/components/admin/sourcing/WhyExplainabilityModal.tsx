import React, { useState, useEffect } from 'react';
import { 
  X, HelpCircle, CheckCircle2, ShieldAlert, ShieldCheck, Sparkles, 
  ExternalLink, Layers, TrendingUp, DollarSign, Database, ImageOff, Globe, Target, BarChart2
} from 'lucide-react';
import type { SourcingProductCandidate } from '../../../types/sourcingIntelligence';

interface WhyExplainabilityModalProps {
  candidate: SourcingProductCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onSendToImport: (candidate: SourcingProductCandidate) => void;
}

export const WhyExplainabilityModal: React.FC<WhyExplainabilityModalProps> = ({
  candidate,
  isOpen,
  onClose,
  onSendToImport
}) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [candidate?.image_url]);

  if (!isOpen || !candidate) return null;

  const why = candidate.why_explanation || {} as any;
  const breakdown = why.scoring_breakdown || null;
  const isEarlyOpportunity = why.opportunity_type === 'EARLY_MARKET_OPPORTUNITY';

  const hasValidImage = Boolean(
    candidate.image_url &&
    typeof candidate.image_url === 'string' &&
    candidate.image_url.startsWith('http') &&
    !candidate.image_url.includes('unsplash.com') &&
    !imgError
  );

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Observado recientemente';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return 'Observado recientemente';
      return d.toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return 'Observado recientemente';
    }
  };

  const rawSources = why.evidence_sources || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
        
        {/* CABECERA */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#f00856] text-white shadow-xs">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                ¿Por qué Collectibles recomienda este producto?
              </h3>
              <p className="text-xs text-slate-400">
                Auditoría y desglose de evidencia explicable ({candidate.country_code || 'UY'})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="p-6 overflow-y-auto space-y-5 text-gray-800">
          
          {/* RESUMEN DE PRODUCTO */}
          <div className="flex gap-4 items-center bg-gray-50 border border-gray-200/80 p-4 rounded-2xl">
            <div className="w-16 h-16 rounded-xl bg-white border border-gray-200 shrink-0 flex items-center justify-center overflow-hidden">
              {hasValidImage ? (
                <img
                  src={candidate.image_url!}
                  alt={candidate.title}
                  className="w-full h-full object-contain p-1"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400 text-[9px] text-center p-1 font-medium">
                  <ImageOff className="w-4 h-4 mb-0.5 text-gray-300" />
                  <span>Sin imagen</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase text-[#f00856] tracking-wider">
                  {candidate.brand} {candidate.franchise ? `· ${candidate.franchise}` : ''}
                </span>
                {isEarlyOpportunity && (
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-md border border-emerald-300">
                    🎯 Oportunidad Temprana
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-gray-900 truncate mt-0.5">
                {candidate.title}
              </h4>
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                <span>Estado: <strong className="text-gray-900">{candidate.status}</strong></span>
                <span>Origen: <strong className="text-gray-900">{candidate.retailer_source.toUpperCase()}</strong></span>
                <span>Score: <strong className="text-indigo-600">{candidate.opportunity_score}/100</strong></span>
              </div>
            </div>
          </div>

          {/* ESTADO COMERCIAL & READINESS */}
          <div className={`p-4 rounded-2xl border space-y-2 ${
            candidate.commercial_readiness === 'READY'
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : candidate.commercial_readiness === 'PARTIAL'
                ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Estado de Madurez Comercial:</span>
              </span>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${
                candidate.commercial_readiness === 'READY'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : candidate.commercial_readiness === 'PARTIAL'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-200 text-slate-700 border-slate-300'
              }`}>
                {candidate.commercial_readiness || 'PARTIAL'}
              </span>
            </div>
            {why.commercial_status && (
              <p className="text-xs font-semibold leading-relaxed">
                {why.commercial_status}
              </p>
            )}
            {why.commercial_missing_reasons && why.commercial_missing_reasons.length > 0 && (
              <ul className="text-[11px] space-y-0.5 list-disc list-inside text-gray-700 mt-1 font-medium">
                {why.commercial_missing_reasons.map((reason: string, idx: number) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            )}
          </div>

          {/* DESGLOSE DETERMINÍSTICO DE FACTORES (SI EXISTE) */}
          {breakdown && (
            <div className="space-y-2">
              <h5 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Desglose de Scoring Determinístico (Total: {candidate.opportunity_score}/100)</span>
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(breakdown).map(([name, factor]: [string, any]) => (
                  <div key={name} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">{name}</div>
                    <div className="text-sm font-black">{factor.points}/{factor.max}</div>
                    <p className="text-xs">{factor.reason}</p>
                    {factor.evidence?.map((ev: any, index: number) => ev.source_url ? <a key={index} href={ev.source_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 block">{ev.source || 'Fuente'} · {ev.status}</a> : null)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DRIVERS Y EXPLICACIÓN DATA-DRIVEN */}
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-gray-400">
              Pilares de la recomendación:
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                <span className="text-[11px] font-extrabold text-emerald-800 uppercase flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Demanda & Mercado ({candidate.country_code || 'UY'})</span>
                </span>
                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                  {why.local_demand_summary || 'Evaluado frente a demanda potencial y ausencia de competencia en plaza.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1">
                <span className="text-[11px] font-extrabold text-blue-800 uppercase flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Diferencial de Precios & Margen</span>
                </span>
                <p className="text-xs text-blue-950 font-medium leading-relaxed">
                  {why.market_differential || (
                    candidate.pricing?.estimated_margin_percent !== null && candidate.pricing?.estimated_margin_percent !== undefined
                      ? `Landed cost estimado en USD ${candidate.pricing?.landed_cost_estimated_usd ?? 'No calculable'} con margen proyectado de ${candidate.pricing?.estimated_margin_percent}%.`
                      : `Landed cost estimado en USD ${candidate.pricing?.landed_cost_estimated_usd ?? 'No calculable'}. Margen y PVP pendientes de cotización o referencia en plaza local.`
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
                <span className="text-[11px] font-extrabold text-amber-800 uppercase flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tracción Global & Lanzamiento</span>
                </span>
                <p className="text-xs text-amber-950 font-medium leading-relaxed">
                  {why.global_momentum || why.stock_verdict || 'Confirmado en catálogo internacional y distribuidores oficiales.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-1">
                <span className="text-[11px] font-extrabold text-purple-800 uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Gap de Oferta Local</span>
                </span>
                <p className="text-xs text-purple-950 font-medium leading-relaxed">
                  {why.local_supply_gap || why.internal_signals || 'Presencia local no verificada.'}
                </p>
              </div>
            </div>
          </div>

          <div className="text-xs space-y-2">
            <p><strong>Confianza: {candidate.confidence_level || 'UNKNOWN'}</strong> — {why.confidence_reason || 'Evidencia pendiente'}</p>
            <div className="border rounded-xl p-3 space-y-1">
              {Object.entries(candidate.provenance || {}).map(([field, datum]) => <p key={field}><strong>{field}</strong>: {datum.status} · {datum.value == null ? 'No disponible' : String(datum.value)} {datum.verification ? '· ' + datum.verification : ''}</p>)}
            </div>
          </div>

          {/* TABLA DE EVIDENCIAS Y FUENTES AUDITADAS */}
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-gray-400">
              Fuentes y Evidencias Observables:
            </h5>
            <div className="border border-gray-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold">
                  <tr>
                    <th className="p-2.5 pl-3">Fuente</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Confianza</th>
                    <th className="p-2.5 pr-3">Fecha de Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {rawSources.map((ev: any, i: number) => {
                    const sourceName = ev.title || ev.name || ev.domain || ev.url || 'Fuente Oficial';
                    const sourceType = ev.type || ev.source_type || 'WEB_SEARCH';
                    const confidence = ev.confidence ?? null;
                    const dateStr = formatDate(ev.date || ev.observed_at || candidate.created_at);

                    return (
                      <tr key={i} className="hover:bg-gray-50/80">
                        <td className="p-2.5 pl-3 font-bold text-gray-900 max-w-[200px] truncate" title={sourceName}>
                          {ev.url ? (
                            <a href={ev.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">
                              <span className="truncate">{sourceName}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            sourceName
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[10px] font-bold uppercase">
                            {sourceType}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="text-emerald-600 font-bold">{confidence === null ? 'No verificado' : confidence + '%'}</span>
                        </td>
                        <td className="p-2.5 pr-3 text-gray-400 text-[11px]">
                          {dateStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5 text-[11px] text-gray-500">
            <Database className="w-4 h-4 text-gray-400 shrink-0" />
            <span>
              <strong>Gobernanza de Datos:</strong> Todas las métricas numéricas y costos son calculados determinísticamente por el motor de Collectibles. OpenAI se utiliza únicamente para sintetizar explicaciones sobre evidencia real.
            </span>
          </div>
        </div>

        {/* PIE DEL MODAL */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-white transition cursor-pointer"
          >
            Cerrar
          </button>

          <button
            onClick={() => {
              onSendToImport(candidate);
              onClose();
            }}
            className="px-5 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Enviar a Productos para Importar</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
