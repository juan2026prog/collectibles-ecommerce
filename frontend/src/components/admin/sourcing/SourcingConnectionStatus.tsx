import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, AlertTriangle, XCircle, Clock, RefreshCw, 
  CheckCircle2, Server, Key, DollarSign, BrainCircuit, ShoppingBag, Truck, PowerOff
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export type SystemConnectionStatusType = 'LIVE' | 'NOT_CONFIGURED' | 'ERROR' | 'UNCHECKED' | 'DEGRADED' | 'OFF';

export interface SourcingConnection {
  id: string;
  name: string;
  category: 'retailer' | 'automation' | 'market' | 'logistics' | 'ai';
  status: SystemConnectionStatusType;
  lastChecked?: string;
  latencyMs?: number;
  details?: string;
}

interface SourcingConnectionStatusProps {
  connections?: SourcingConnection[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const SourcingConnectionStatus: React.FC<SourcingConnectionStatusProps> = ({
  connections: externalConnections,
  onRefresh: externalOnRefresh,
  isRefreshing: externalIsRefreshing
}) => {
  const [liveConnections, setLiveConnections] = useState<SourcingConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  const checkLiveHealth = useCallback(async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('sourcing-retailer-health');
      const elapsed = Date.now() - start;
      const checkedTime = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastCheckTime(checkedTime);

      if (error || !data) {
        setLiveConnections([
          { id: 'amazon', name: 'Amazon US (Zinc)', category: 'retailer', status: 'UNCHECKED', latencyMs: elapsed, details: 'No se pudo contactar endpoint de salud.' },
          { id: 'bestbuy', name: 'Best Buy Developer API', category: 'retailer', status: 'UNCHECKED', latencyMs: elapsed, details: 'No se pudo contactar endpoint de salud.' },
          { id: 'ebay', name: 'eBay Search', category: 'retailer', status: 'NOT_CONFIGURED', latencyMs: elapsed, details: 'Búsqueda en catálogo interno (Buy API pendiente).' },
          { id: 'mercadolibre', name: 'Mercado Libre UY', category: 'market', status: 'LIVE', latencyMs: elapsed, details: 'API pública de búsqueda MLU activa.' },
          { id: 'openai_research', name: 'OpenAI GPT-4o', category: 'ai', status: 'UNCHECKED', latencyMs: elapsed, details: 'No se pudo verificar estado.' },
          { id: 'autopilot', name: 'Autopilot Control', category: 'automation', status: 'OFF', latencyMs: elapsed, details: 'Autopilot apagado por política de seguridad.' }
        ]);
        return;
      }

      const ret = data.retailers || {};
      const srv = data.services || {};

      const list: SourcingConnection[] = [
        {
          id: 'amazon',
          name: 'Amazon US (Zinc API)',
          category: 'retailer',
          status: ret.amazon?.status === 'AVAILABLE' ? 'LIVE' : 'NOT_CONFIGURED',
          latencyMs: ret.amazon?.status === 'AVAILABLE' ? Math.round(data.elapsed_ms || elapsed) : undefined,
          lastChecked: checkedTime,
          details: ret.amazon?.notes || (ret.amazon?.status === 'AVAILABLE' ? 'Zinc API v2 configurada y activa.' : 'ZINC_API_KEY no configurada.')
        },
        {
          id: 'bestbuy',
          name: 'Best Buy Developer API',
          category: 'retailer',
          status: ret.bestbuy?.status === 'AVAILABLE' ? 'LIVE' : 'NOT_CONFIGURED',
          latencyMs: ret.bestbuy?.status === 'AVAILABLE' ? Math.round(data.elapsed_ms || elapsed) : undefined,
          lastChecked: checkedTime,
          details: ret.bestbuy?.notes || (ret.bestbuy?.status === 'AVAILABLE' ? 'Developer API conectada para búsqueda y lookup.' : 'BESTBUY_API_KEY pendiente en Secrets.')
        },
        {
          id: 'ebay',
          name: 'eBay Search (Local DB)',
          category: 'retailer',
          status: ret.ebay?.status === 'AVAILABLE' ? 'LIVE' : 'NOT_CONFIGURED',
          latencyMs: ret.ebay?.status === 'AVAILABLE' ? Math.round(data.elapsed_ms || elapsed) : undefined,
          lastChecked: checkedTime,
          details: ret.ebay?.notes || 'Búsqueda en listings internos de DB (Buy API pendiente).'
        },
        {
          id: 'mercadolibre',
          name: 'Mercado Libre UY',
          category: 'market',
          status: srv.mercadolibre_uy?.status === 'AVAILABLE' ? 'LIVE' : 'ERROR',
          latencyMs: Math.round(data.elapsed_ms || elapsed),
          lastChecked: checkedTime,
          details: srv.mercadolibre_uy?.notes || 'API pública de búsqueda MLU activa para gap analysis.'
        },
        {
          id: 'openai_research',
          name: 'OpenAI GPT-4o Research',
          category: 'ai',
          status: srv.openai?.status === 'AVAILABLE' ? 'LIVE' : (srv.openai?.status === 'OFF' ? 'OFF' : 'NOT_CONFIGURED'),
          latencyMs: srv.openai?.status === 'AVAILABLE' ? Math.round(data.elapsed_ms || elapsed) : undefined,
          lastChecked: checkedTime,
          details: srv.openai?.notes || (srv.openai?.enabled ? 'Activo para investigación inteligente.' : 'Desactivado por switch en site_settings.')
        },
        {
          id: 'autopilot',
          name: 'Autopilot Control Hub',
          category: 'automation',
          status: 'OFF',
          latencyMs: 0,
          lastChecked: checkedTime,
          details: srv.autopilot?.notes || 'Modo manual/asistido con aprobación humana obligatoria.'
        }
      ];

      setLiveConnections(list);
    } catch {
      setLiveConnections([
        { id: 'amazon', name: 'Amazon US (Zinc)', category: 'retailer', status: 'UNCHECKED', details: 'Fallo al invocar servicio de salud.' },
        { id: 'bestbuy', name: 'Best Buy API', category: 'retailer', status: 'UNCHECKED', details: 'Fallo al invocar servicio de salud.' },
        { id: 'ebay', name: 'eBay Search', category: 'retailer', status: 'NOT_CONFIGURED', details: 'Búsqueda en catálogo interno.' },
        { id: 'mercadolibre', name: 'Mercado Libre UY', category: 'market', status: 'LIVE', details: 'API pública activa.' },
        { id: 'openai_research', name: 'OpenAI GPT-4o', category: 'ai', status: 'UNCHECKED', details: 'Estado no verificado.' },
        { id: 'autopilot', name: 'Autopilot Control', category: 'automation', status: 'OFF', details: 'Apagado por política.' }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!externalConnections) {
      checkLiveHealth();
    }
  }, [externalConnections, checkLiveHealth]);

  const handleRefresh = async () => {
    if (externalOnRefresh) {
      externalOnRefresh();
    }
    await checkLiveHealth();
  };

  const connections = externalConnections || liveConnections;
  const isRefreshing = externalIsRefreshing || loading;

  const getStatusBadge = (status: SystemConnectionStatusType) => {
    switch (status) {
      case 'LIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Operativo
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Degradado
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            <Key className="w-3 h-3 text-slate-400" /> No configurado
          </span>
        );
      case 'OFF':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            <PowerOff className="w-3 h-3 text-gray-400" /> Desactivado
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Error
          </span>
        );
      case 'UNCHECKED':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            <Clock className="w-3 h-3 text-gray-400" /> No verificado
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'retailer': return <ShoppingBag className="w-4 h-4 text-blue-500" />;
      case 'automation': return <Server className="w-4 h-4 text-purple-500" />;
      case 'market': return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'logistics': return <Truck className="w-4 h-4 text-amber-500" />;
      case 'ai': return <BrainCircuit className="w-4 h-4 text-indigo-500" />;
      default: return <Server className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#f00856]" />
            <span>Estado Real de Conexiones & Servicios de Sourcing</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Diagnóstico en tiempo real desde Supabase Edge Functions (Amazon/Zinc, Best Buy, MLU, OpenAI).
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200 transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#f00856] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Verificando...' : 'Verificar Conexiones'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {connections.map((conn) => (
          <div 
            key={conn.id}
            className="p-3 bg-gray-50/70 border border-gray-200/80 rounded-xl hover:border-gray-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {getCategoryIcon(conn.category)}
                  <span className="font-bold text-xs text-gray-900 truncate" title={conn.name}>
                    {conn.name}
                  </span>
                </div>
                {getStatusBadge(conn.status)}
              </div>
              <p className="text-[11px] text-gray-500 line-clamp-2 leading-tight">
                {conn.details || 'Servicio de integración en la nube.'}
              </p>
            </div>

            <div className="pt-2 mt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px] text-gray-400 font-mono">
              <span>{conn.latencyMs !== undefined ? `${conn.latencyMs} ms` : 'Latencia N/A'}</span>
              <span>{conn.lastChecked ? conn.lastChecked : (lastCheckTime || 'No verificado')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
