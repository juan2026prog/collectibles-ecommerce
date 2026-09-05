import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Sparkles, Search, Database, RefreshCw, BarChart2, CheckCircle2, AlertTriangle, Terminal } from 'lucide-react';

export default function AdminAISearch() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSearches: 0,
    noResultQueries: 0,
    embeddingsCount: 0,
    synonymsCount: 0
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [logsRes, embedRes, synRes] = await Promise.all([
        supabase.from('ai_search_logs').select('*').order('created_at', { ascending: false }).limit(20),
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

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, price, status')
        .ilike('title', `%${testQuery.trim()}%`)
        .limit(5);

      setTestResults(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">Collectibles AI Search</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
              Active Engine
            </span>
          </div>
          <p className="text-xs text-zinc-400">Control de búsqueda semántica, sinónimos y vector store pgvector</p>
        </div>
        <button
          onClick={loadDashboard}
          className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Búsquedas Auditadas</span>
          <div className="text-2xl font-black text-white mt-1">{stats.totalSearches}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Sin Resultados</span>
          <div className="text-2xl font-black text-amber-400 mt-1">{stats.noResultQueries}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Embeddings Generados</span>
          <div className="text-2xl font-black text-sky-400 mt-1">{stats.embeddingsCount}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Reglas de Sinónimos</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{stats.synonymsCount}</div>
        </div>
      </div>

      {/* Test Sandbox */}
      <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Terminal size={16} className="text-primary-400" />
          Test Sandbox de Consultas Semánticas
        </h3>
        <div className="flex gap-2 max-w-xl">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Ej: figura spiderman articulada..."
            className="flex-1 px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={handleTestSearch}
            disabled={testing}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
          >
            {testing ? 'Probando...' : 'Evaluar'}
          </button>
        </div>

        {testResults.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
            <span className="text-[11px] text-zinc-400 font-bold uppercase">Resultados ({testResults.length}):</span>
            {testResults.map((r) => (
              <div key={r.id} className="p-2 rounded bg-white/[0.02] border border-white/5 flex justify-between text-xs text-zinc-300">
                <span>{r.title}</span>
                <span className="font-mono text-emerald-400">${r.price}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Logs Table */}
      <div className="bg-zinc-900/80 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 size={16} className="text-sky-400" />
            Registro Reciente de Búsquedas
          </h3>
          <span className="text-xs text-zinc-400">Últimas 20 consultas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.02] text-zinc-400 border-b border-white/5 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-5 py-3">Consulta</th>
                <th className="px-5 py-3">Resultados</th>
                <th className="px-5 py-3">Filtros Interpretados</th>
                <th className="px-5 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-zinc-300">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-zinc-500">
                    No hay registros de búsqueda aún.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.01]">
                    <td className="px-5 py-3 font-medium text-white">{log.query}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.results_count > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {log.results_count} piezas
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-400 font-mono text-[11px]">
                      {log.filters_detected ? JSON.stringify(log.filters_detected) : '-'}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(log.created_at).toLocaleTimeString('es-UY')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
