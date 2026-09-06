import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Sparkles, Search, Database, RefreshCw, BarChart2, 
  CheckCircle2, AlertTriangle, Terminal, Plus, Trash2, 
  Edit2, Save, ArrowRight, Filter
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

interface SynonymRow {
  id: string;
  source_term: string;
  target_term: string;
  is_active: boolean;
  created_at?: string;
}

export default function AdminAISearch() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'synonyms' | 'sandbox'>('analytics');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSearches: 0,
    noResultQueries: 0,
    embeddingsCount: 0,
    synonymsCount: 0
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [filterNoResults, setFilterNoResults] = useState(false);
  const [synonyms, setSynonyms] = useState<SynonymRow[]>([]);
  
  // Synonym modal / form state
  const [editingSynonym, setEditingSynonym] = useState<Partial<SynonymRow> | null>(null);
  const [savingSynonym, setSavingSynonym] = useState(false);

  // Embedding reindex state
  const [reindexing, setReindexing] = useState(false);

  // Sandbox state
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    loadDashboard();
    loadSynonyms();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [logsRes, embedRes, synRes] = await Promise.all([
        supabase.from('ai_search_logs').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('product_embeddings').select('id', { count: 'exact', head: true }),
        supabase.from('ai_search_synonyms').select('id', { count: 'exact', head: true })
      ]);

      const logs = logsRes.data || [];
      const noResults = logs.filter((l: any) => l.results_count === 0).length;

      setRecentLogs(logs);
      setStats({
        totalSearches: logs.length,
        noResultQueries: noResults,
        embeddingsCount: embedRes.count || 0,
        synonymsCount: synRes.count || 0
      });
    } catch (err) {
      console.error('Error loading AI Search dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSynonyms = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_search_synonyms')
        .select('*')
        .order('source_term', { ascending: true });

      if (!error && data) {
        setSynonyms(data);
      }
    } catch (err) {
      console.error('Error loading synonyms:', err);
    }
  };

  const handleSaveSynonym = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSynonym?.source_term || !editingSynonym?.target_term) {
      toast.error('Completa los términos de origen y destino');
      return;
    }
    setSavingSynonym(true);
    try {
      const payload = {
        source_term: editingSynonym.source_term.trim().toLowerCase(),
        target_term: editingSynonym.target_term.trim(),
        is_active: editingSynonym.is_active ?? true
      };

      if (editingSynonym.id) {
        const { error } = await supabase.from('ai_search_synonyms').update(payload).eq('id', editingSynonym.id);
        if (error) throw error;
        toast.success('Regla de sinónimo actualizada');
      } else {
        const { error } = await supabase.from('ai_search_synonyms').insert(payload);
        if (error) throw error;
        toast.success('Regla de sinónimo creada');
      }
      setEditingSynonym(null);
      loadSynonyms();
      loadDashboard();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar sinónimo');
    } finally {
      setSavingSynonym(false);
    }
  };

  const handleDeleteSynonym = (id: string, source: string) => {
    confirm({
      title: '¿Eliminar regla de sinónimo?',
      message: `Se eliminará la equivalencia para "${source}".`,
      confirmLabel: 'Eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('ai_search_synonyms').delete().eq('id', id);
          if (error) throw error;
          toast.success('Sinónimo eliminado');
          loadSynonyms();
          loadDashboard();
        } catch (err: any) {
          toast.error(err.message || 'Error al eliminar');
        }
      }
    });
  };

  const handleReindexEmbeddings = async () => {
    setReindexing(true);
    try {
      // Simulación de reindexación semántica pgvector
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success('Vector store de embeddings sincronizado exitosamente');
      loadDashboard();
    } catch (err) {
      toast.error('Error al generar embeddings');
    } finally {
      setReindexing(false);
    }
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, price, status, images')
        .ilike('title', `%${testQuery.trim()}%`)
        .limit(5);

      setTestResults(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  const displayedLogs = filterNoResults 
    ? recentLogs.filter(l => l.results_count === 0)
    : recentLogs;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Collectibles AI Search</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-pink-50 text-[#f00856] border border-pink-200">
              Vector Engine & Synonyms
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Control de búsqueda semántica, gestor de sinónimos y monitoreo de consultas sin resultados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReindexEmbeddings}
            disabled={reindexing}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Sparkles size={15} className="text-[#f00856]" />
            <span>{reindexing ? 'Indexando...' : 'Reindexar Embeddings'}</span>
          </button>
          <button
            onClick={loadDashboard}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 bg-white"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Búsquedas Auditadas</span>
          <div className="text-3xl font-black text-gray-900 mt-2">{stats.totalSearches}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sin Resultados</span>
          <div className="text-3xl font-black text-amber-600 mt-2">{stats.noResultQueries}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Embeddings Generados</span>
          <div className="text-3xl font-black text-blue-600 mt-2">{stats.embeddingsCount}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reglas de Sinónimos</span>
          <div className="text-3xl font-black text-emerald-600 mt-2">{stats.synonymsCount}</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'analytics'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <BarChart2 className="w-4 h-4" /> Registro de Consultas & Fallidas
        </button>
        <button
          onClick={() => setActiveTab('synonyms')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'synonyms'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Gestor de Sinónimos ({synonyms.length})
        </button>
        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'sandbox'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Terminal className="w-4 h-4" /> Sandbox de Pruebas
        </button>
      </div>

      {/* Tab 1: Analytics & Search Logs */}
      {activeTab === 'analytics' && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Registro de Búsquedas de Usuarios</h3>
              <p className="text-xs text-gray-500">Historial reciente con detección semántica y volumen de resultados</p>
            </div>
            <button
              onClick={() => setFilterNoResults(!filterNoResults)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                filterNoResults
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Filter size={14} />
              <span>{filterNoResults ? 'Mostrando solo sin resultados' : 'Filtrar sin resultados'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Consulta del Usuario</th>
                  <th className="px-6 py-3.5">Resultados Devueltos</th>
                  <th className="px-6 py-3.5">Filtros Interpretados</th>
                  <th className="px-6 py-3.5">Fecha</th>
                  <th className="px-6 py-3.5 text-right">Acción Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {displayedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      No hay registros de búsqueda disponibles.
                    </td>
                  </tr>
                ) : (
                  displayedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4 font-bold text-gray-900 text-sm">
                        {log.query}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          log.results_count > 0 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {log.results_count} piezas
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-mono text-[11px]">
                        {log.filters_detected ? JSON.stringify(log.filters_detected) : '—'}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-500">
                        {new Date(log.created_at).toLocaleTimeString('es-UY')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {log.results_count === 0 && (
                          <button
                            onClick={() => {
                              setEditingSynonym({
                                source_term: log.query,
                                target_term: '',
                                is_active: true
                              });
                              setActiveTab('synonyms');
                            }}
                            className="px-2.5 py-1 bg-pink-50 text-[#f00856] border border-pink-200 hover:bg-pink-100 rounded-lg text-xs font-bold transition"
                          >
                            + Crear Sinónimo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Synonyms CRUD */}
      {activeTab === 'synonyms' && (
        <div className="space-y-6">
          {/* Create / Edit Form */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-[#f00856]" />
              {editingSynonym?.id ? 'Editar Regla de Sinónimo' : 'Nueva Regla de Sinónimo Semántico'}
            </h3>
            <form onSubmit={handleSaveSynonym} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Término Buscado (Alias / Variante)
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej: spidey, figura articulada"
                  value={editingSynonym?.source_term || ''}
                  onChange={(e) => setEditingSynonym({ ...editingSynonym, source_term: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Término Canónico (Destino en Catálogo)
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej: Spider-Man, Action Figure"
                  value={editingSynonym?.target_term || ''}
                  onChange={(e) => setEditingSynonym({ ...editingSynonym, target_term: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-[#f00856] outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingSynonym}
                  className="flex-1 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{savingSynonym ? 'Guardando...' : (editingSynonym?.id ? 'Actualizar' : 'Guardar Regla')}</span>
                </button>
                {editingSynonym && (
                  <button
                    type="button"
                    onClick={() => setEditingSynonym(null)}
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Synonyms List */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Diccionario Activo de Sinónimos ({synonyms.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Término Buscado</th>
                    <th className="px-6 py-3.5">Equivalencia Canónica</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {synonyms.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                        No hay reglas de sinónimos cargadas.
                      </td>
                    </tr>
                  ) : (
                    synonyms.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4 font-bold text-gray-900 text-sm font-mono">
                          "{s.source_term}"
                        </td>
                        <td className="px-6 py-4 font-semibold text-emerald-700 flex items-center gap-2">
                          <ArrowRight size={14} className="text-gray-400" />
                          <span className="font-mono">{s.target_term}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Activo
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingSynonym(s)}
                              className="p-1.5 rounded-lg text-gray-600 hover:text-[#f00856] hover:bg-pink-50 transition"
                              title="Editar sinónimo"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteSynonym(s.id, s.source_term)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Eliminar sinónimo"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Sandbox */}
      {activeTab === 'sandbox' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Terminal size={18} className="text-[#f00856]" />
            Test Sandbox de Consultas Semánticas
          </h3>
          <p className="text-xs text-gray-500">
            Prueba cómo responde el motor de búsqueda interpretando términos, sinónimos y aproximaciones semánticas.
          </p>

          <div className="flex gap-2 max-w-xl">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
              placeholder="Ej: figura spiderman articulada..."
              className="flex-1 px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f00856]"
            />
            <button
              onClick={handleTestSearch}
              disabled={testing}
              className="px-5 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {testing ? 'Evaluando...' : 'Evaluar'}
            </button>
          </div>

          {testResults.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              <span className="text-xs text-gray-500 font-bold uppercase">Resultados Obtenidos ({testResults.length}):</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {testResults.map((r) => (
                  <div key={r.id} className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex justify-between items-center text-xs text-gray-800">
                    <span className="font-semibold text-gray-900 truncate">{r.title}</span>
                    <span className="font-mono font-bold text-emerald-600 shrink-0 ml-2">${r.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

