import React from 'react';
import type { CustomsRule, UserImportDeclaration, UserSavedSimulation, UserImportShipment } from '../../plugins/collector-import-hub/types';
import { 
  ShieldCheck, 
  Calculator, 
  Truck, 
  Bookmark, 
  BookOpen, 
  MessageSquare, 
  Plus, 
  ArrowRight,
  AlertTriangle,
  TrendingDown,
  Sparkles,
  MapPin
} from 'lucide-react';

interface Props {
  rule: CustomsRule;
  declarations: UserImportDeclaration[];
  savedSimulations: UserSavedSimulation[];
  activeShipments: UserImportShipment[];
  onNavigateTab: (tabId: string) => void;
  onOpenDeclareModal: () => void;
  onOpenProfileModal: () => void;
}

export const ImportHubDashboard: React.FC<Props> = ({
  rule,
  declarations,
  savedSimulations,
  activeShipments,
  onNavigateTab,
  onOpenDeclareModal,
  onOpenProfileModal
}) => {
  const currentYear = rule.year || 2026;
  const currentYearDeclarations = declarations.filter(d => d.year === currentYear);
  const usedCount = currentYearDeclarations.length;
  const remainingCount = Math.max(0, rule.max_shipments_per_year - usedCount);
  const usedAmountUsd = currentYearDeclarations.reduce((acc, curr) => acc + curr.product_price_usd, 0);
  const remainingQuotaUsd = Math.max(0, rule.annual_quota_usd - usedAmountUsd);

  return (
    <div className="space-y-8">
      {/* Hero Consultant Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-slate-950 border border-amber-500/30 p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Tu Asistente Personal de Aduana & Couriers
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Collectibles Import Hub
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Monitorea tus 3 franquicias oficiales, calcula el costo total efectivo por kilogramo de tus couriers en Miami y simula tus compras internacionales con certeza aduanera.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigateTab('simulator')}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <Calculator className="w-4 h-4" /> Simular una Importación
            </button>
            <button
              onClick={onOpenDeclareModal}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Declarar Compra Externa
            </button>
            <button
              onClick={onOpenProfileModal}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-xl transition-all border border-amber-500/30 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4" /> Mi Casillero Miami
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Franquicias Card */}
        <div 
          onClick={() => onNavigateTab('franchise')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-5 rounded-2xl cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase">Franquicias {currentYear}</span>
              <ShieldCheck className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white font-mono">
              {remainingCount} <span className="text-sm font-normal text-slate-400">/ {rule.max_shipments_per_year}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>{usedCount} utilizadas</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              Ver detalle <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Cupo Anual Card */}
        <div 
          onClick={() => onNavigateTab('franchise')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-5 rounded-2xl cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase">Saldo de Cupo</span>
              <TrendingDown className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white font-mono">
              ${remainingQuotaUsd.toFixed(0)}{' '}
              <span className="text-sm font-normal text-slate-400">USD</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>De USD {rule.annual_quota_usd} anual</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              Historial <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Simulaciones Card */}
        <div 
          onClick={() => onNavigateTab('simulations')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-5 rounded-2xl cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase">Cotizaciones</span>
              <Bookmark className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white font-mono">
              {savedSimulations.length}{' '}
              <span className="text-sm font-normal text-slate-400">guardadas</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Recalcular precios</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              Abrir <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Envíos en Curso Card */}
        <div 
          onClick={() => onNavigateTab('shipments')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-5 rounded-2xl cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase">Envíos Activos</span>
              <Truck className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white font-mono">
              {activeShipments.length}{' '}
              <span className="text-sm font-normal text-slate-400">en tránsito</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Tracking en vivo</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              Seguimiento <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Feature Cards Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => onNavigateTab('simulator')}
          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-amber-500/50 transition-all space-y-3"
        >
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl w-fit">
            <Calculator className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Simulador Multi-Escenario</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Compara en tiempo real qué courier ofrece el costo más bajo por kilo y cómo optimizar tu franquicia aduanera.
          </p>
        </div>

        <div 
          onClick={() => onNavigateTab('guide')}
          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-amber-500/50 transition-all space-y-3"
        >
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl w-fit">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Guía Oficial de Importación</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Aprende sobre regímenes de aduana, límites de 20 kg físicos, URSEC para figuras electrónicas y valor en aduana.
          </p>
        </div>

        <div 
          onClick={() => onNavigateTab('ai-chat')}
          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-amber-500/50 transition-all space-y-3"
        >
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl w-fit">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Consultor IA Especializado</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Pregúntale en lenguaje natural sobre cualquier estatua, carta o lote para obtener el desglose exacto de importación.
          </p>
        </div>
      </div>
    </div>
  );
};
