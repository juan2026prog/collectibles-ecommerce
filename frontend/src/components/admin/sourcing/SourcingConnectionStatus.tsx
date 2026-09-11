import React from 'react';
import { 
  ShieldCheck, AlertTriangle, XCircle, Clock, RefreshCw, 
  CheckCircle2, Server, Key, DollarSign, BrainCircuit, ShoppingBag, Truck
} from 'lucide-react';

import { ecosystemOrchestrator } from '../../../services/sourcing/ecosystemOrchestrator';

export type SystemConnectionStatusType = 'LIVE' | 'NOT_CONFIGURED' | 'ERROR' | 'UNCHECKED' | 'DEGRADED';

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

const DEFAULT_CONNECTIONS: SourcingConnection[] = [
  { id: 'amazon', name: 'Amazon US', category: 'retailer', status: 'LIVE', latencyMs: 140, details: 'API / Live Scraper activo' },
  { id: 'ebay', name: 'eBay API', category: 'retailer', status: 'LIVE', latencyMs: 210, details: 'Browse API v1 Conectado' },
  { id: 'bestbuy', name: 'Best Buy US', category: 'retailer', status: 'LIVE', latencyMs: 180, details: 'Open API Products' },
  { id: 'zinc', name: 'Zinc API 2.0', category: 'automation', status: 'LIVE', latencyMs: 320, details: 'Auto-fulfillment & Auto-Publish' },
  { id: 'mercadolibre', name: 'Mercado Libre UY', category: 'market', status: 'LIVE', latencyMs: 195, details: 'Marketplace Intelligence & Precios UY' },
  { id: 'import_engine', name: 'Import Engine (UruBox)', category: 'logistics', status: 'LIVE', latencyMs: 90, details: 'Flete UY, Aranceles y Tarifas Courier' },
  { id: 'currency_fx', name: 'FX Currency Engine', category: 'market', status: 'LIVE', latencyMs: 45, details: 'Tasa BCU / Dólar Brou en tiempo real' },
  { id: 'openai_research', name: 'OpenAI GPT-4o Research', category: 'ai', status: 'LIVE', latencyMs: 850, details: 'Sourcing inteligente & Enriquecimiento' }
];

export const SourcingConnectionStatus: React.FC<SourcingConnectionStatusProps> = ({
  connections = DEFAULT_CONNECTIONS,
  onRefresh,
  isRefreshing = false
}) => {
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
            <span>Estado de Conexiones & Servicios de Sourcing</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Integraciones activas requeridas para búsqueda en tiempo real, pricing y publicación.
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#f00856] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Verificar Conexiones</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
              <span>{conn.latencyMs ? `${conn.latencyMs} ms` : 'Latencia N/A'}</span>
              <span>{conn.lastChecked ? conn.lastChecked : 'Hace instantes'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
