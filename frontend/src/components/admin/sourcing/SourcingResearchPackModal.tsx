import React, { useState } from 'react';
import { 
  X, Upload, FileText, Link, Sparkles, AlertCircle, CheckCircle2, 
  Loader2, ArrowRight, ShieldCheck 
} from 'lucide-react';
import type { ResearchPack, ResearchPackStatus } from '../../../types/sourcing';
import { 
  parseResearchPackJson, 
  parseRawUrlsList, 
  parseCsvInput 
} from '../../../services/sourcing/researchPackParser';
import { SAMPLE_MCFARLANE_RESEARCH_PACK } from '../../../data/sampleResearchPacks';

interface SourcingResearchPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPack: (pack: ResearchPack) => Promise<void>;
}

export const SourcingResearchPackModal: React.FC<SourcingResearchPackModalProps> = ({
  isOpen,
  onClose,
  onLoadPack
}) => {
  const [activeTab, setActiveTab] = useState<'sample' | 'json' | 'urls' | 'csv'>('sample');
  const [jsonText, setJsonText] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de carga & progreso
  const [processingStatus, setProcessingStatus] = useState<ResearchPackStatus | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  if (!isOpen) return null;

  const simulateProgressStages = async (pack: ResearchPack) => {
    const stages: ResearchPackStatus[] = [
      'UPLOADED',
      'RESOLVING',
      'NORMALIZING',
      'VERIFYING',
      'PRICING',
      'URUGUAY_CHECK',
      'READY'
    ];

    for (let i = 0; i < stages.length; i++) {
      setProcessingStatus(stages[i]);
      setProgressPercent(Math.round(((i + 1) / stages.length) * 100));
      await new Promise(r => setTimeout(r, 150));
    }

    await onLoadPack(pack);
    setProcessingStatus(null);
    onClose();
  };

  const handleLoadSample = async () => {
    setErrorMsg(null);
    await simulateProgressStages(SAMPLE_MCFARLANE_RESEARCH_PACK);
  };

  const handleLoadJson = async () => {
    setErrorMsg(null);
    if (!jsonText.trim()) {
      setErrorMsg('Pegue el JSON del Research Pack.');
      return;
    }

    const res = parseResearchPackJson(jsonText);
    if (!res.valid) {
      setErrorMsg(res.errors.join('; '));
      return;
    }

    await simulateProgressStages(res.pack);
  };

  const handleLoadUrls = async () => {
    setErrorMsg(null);
    if (!urlsText.trim()) {
      setErrorMsg('Ingrese al menos una URL válida.');
      return;
    }

    const res = parseRawUrlsList(urlsText, titleInput || 'Lista de URLs Importadas');
    if (!res.valid) {
      setErrorMsg(res.errors.join('; '));
      return;
    }

    await simulateProgressStages(res.pack);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (file.name.endsWith('.json')) {
        setJsonText(content);
        setActiveTab('json');
      } else if (file.name.endsWith('.csv')) {
        setCsvText(content);
        setActiveTab('csv');
      }
    };
    reader.readAsText(file);
  };

  const handleLoadCsv = async () => {
    setErrorMsg(null);
    if (!csvText.trim()) {
      setErrorMsg('Pegue el contenido CSV o suba un archivo.');
      return;
    }

    const res = parseCsvInput(csvText, titleInput || 'Importación CSV');
    if (!res.valid) {
      setErrorMsg(res.errors.join('; '));
      return;
    }

    await simulateProgressStages(res.pack);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50/80">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#f00856]" />
              Cargar Investigación de Productos
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cargue listas o Research Packs de ChatGPT, Amazon, Best Buy o eBay sin límites.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={processingStatus !== null}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar Si está procesando */}
        {processingStatus !== null && (
          <div className="p-6 bg-gray-50 border-b border-gray-200 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#f00856] animate-spin mx-auto" />
            <div>
              <span className="font-bold text-sm text-gray-900 block">
                Fase de Procesamiento: {processingStatus}
              </span>
              <span className="text-xs text-gray-500">
                Resolviendo retailers, verificando originalidad y calculando cotizaciones...
              </span>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#f00856] h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Selector de Pestañas */}
        {processingStatus === null && (
          <div>
            <div className="flex border-b border-gray-200 bg-gray-50/60 text-xs">
              <button
                onClick={() => setActiveTab('sample')}
                className={`flex-1 py-3 px-4 font-semibold text-center transition-all ${
                  activeTab === 'sample'
                    ? 'text-[#f00856] border-b-2 border-[#f00856] bg-white font-bold shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                }`}
              >
                ⭐ Pack de Prueba
              </button>

              <button
                onClick={() => setActiveTab('urls')}
                className={`flex-1 py-3 px-4 font-semibold text-center transition-all ${
                  activeTab === 'urls'
                    ? 'text-[#f00856] border-b-2 border-[#f00856] bg-white font-bold shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                }`}
              >
                🔗 Pegar URLs
              </button>

              <button
                onClick={() => setActiveTab('json')}
                className={`flex-1 py-3 px-4 font-semibold text-center transition-all ${
                  activeTab === 'json'
                    ? 'text-[#f00856] border-b-2 border-[#f00856] bg-white font-bold shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                }`}
              >
                📄 JSON Versionado
              </button>

              <button
                onClick={() => setActiveTab('csv')}
                className={`flex-1 py-3 px-4 font-semibold text-center transition-all ${
                  activeTab === 'csv'
                    ? 'text-[#f00856] border-b-2 border-[#f00856] bg-white font-bold shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                }`}
              >
                📊 CSV / Archivo
              </button>
            </div>

            {/* Contenido por Pestaña */}
            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* TAB 1: SAMPLE PACK REPO */}
              {activeTab === 'sample' && (
                <div className="space-y-4 text-xs">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">
                        {SAMPLE_MCFARLANE_RESEARCH_PACK.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                        v{SAMPLE_MCFARLANE_RESEARCH_PACK.schema_version}
                      </span>
                    </div>
                    <p className="text-gray-600">
                      Incluye figuras oficiales de Batman Detective Comics, Spawn Deluxe, Superman y Ghostbusters cruzadas entre Amazon, Best Buy y eBay para demostrar deduplicación y selección de mejor fuente.
                    </p>
                    <div className="flex items-center gap-4 text-gray-700 font-mono text-[11px] pt-1">
                      <span>• {SAMPLE_MCFARLANE_RESEARCH_PACK.items.length} items de prueba</span>
                      <span>• 3 retailers incluidos</span>
                      <span>• Oficialmente licenciados</span>
                    </div>
                  </div>

                  <button
                    onClick={handleLoadSample}
                    className="w-full py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                  >
                    <span>Cargar e Iniciar Sourcing de Prueba</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* TAB 2: PEGAR URLs */}
              {activeTab === 'urls' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block text-gray-700 mb-1 font-semibold">Nombre de la Investigación</label>
                    <input
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Ej. Figuras DC McFarlane Septiembre 2026"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-xs focus:outline-none focus:border-[#f00856] shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 mb-1 font-semibold">
                      Pegar lista de links (Amazon, Best Buy, eBay...)
                    </label>
                    <textarea
                      rows={6}
                      value={urlsText}
                      onChange={(e) => setUrlsText(e.target.value)}
                      placeholder={`https://www.amazon.com/dp/B081VR7Y32\nhttps://www.bestbuy.com/site/.../6412345.p\nhttps://www.ebay.com/itm/324123456789`}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 font-mono text-xs text-gray-900 focus:outline-none focus:border-[#f00856] shadow-xs"
                    />
                    <span className="text-gray-500 text-[11px] mt-1 block">
                      Una URL por línea. El sistema detectará automáticamente el retailer y agrupará duplicados.
                    </span>
                  </div>

                  <button
                    onClick={handleLoadUrls}
                    className="w-full py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                  >
                    <span>Procesar URLs</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* TAB 3: JSON VERSIONADO */}
              {activeTab === 'json' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-gray-700 font-semibold">JSON de ChatGPT Research Pack (Schema v1.0)</label>
                      <label className="text-[#f00856] hover:underline cursor-pointer flex items-center gap-1 font-semibold">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir archivo .json</span>
                        <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                    <textarea
                      rows={7}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      placeholder={`{\n  "schema_version": "1.0",\n  "pack_id": "mcfarlane-2026-09",\n  "title": "McFarlane US",\n  "items": [\n    { "url": "https://...", "brand": "McFarlane Toys", "license": "DC Comics" }\n  ]\n}`}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 font-mono text-xs text-gray-900 focus:outline-none focus:border-[#f00856] shadow-xs"
                    />
                  </div>

                  <button
                    onClick={handleLoadJson}
                    className="w-full py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                  >
                    <span>Validar y Cargar Research Pack</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* TAB 4: CSV / ARCHIVO */}
              {activeTab === 'csv' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-gray-700 font-semibold">Contenido CSV con encabezados (url, brand, license, price...)</label>
                      <label className="text-[#f00856] hover:underline cursor-pointer flex items-center gap-1 font-semibold">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir .csv</span>
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                    <textarea
                      rows={6}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={`url,brand,license,price\nhttps://www.amazon.com/dp/B081VR7Y32,McFarlane Toys,DC Comics,26.00\nhttps://www.bestbuy.com/site/.../6412345.p,McFarlane Toys,DC Comics,24.99`}
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 font-mono text-xs text-gray-900 focus:outline-none focus:border-[#f00856] shadow-xs"
                    />
                  </div>

                  <button
                    onClick={handleLoadCsv}
                    className="w-full py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                  >
                    <span>Importar CSV</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
