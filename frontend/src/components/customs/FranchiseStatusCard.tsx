import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Package, TrendingUp, AlertTriangle, RefreshCw, HelpCircle, ArrowRight } from 'lucide-react';
import { CustomsRuleEngine, DEFAULT_UY_2026_RULES } from '../../lib/customs/CustomsRuleEngine';

interface FranchiseStatusCardProps {
  onUpdate?: () => void;
  className?: string;
}

export const FranchiseStatusCard: React.FC<FranchiseStatusCardProps> = ({
  onUpdate,
  className = ''
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shipmentsUsed, setShipmentsUsed] = useState(0);
  const [amountUsed, setAmountUsed] = useState(0);
  const [preferredCourier, setPreferredCourier] = useState('puntomio');

  const ruleEngine = new CustomsRuleEngine();
  const summary = ruleEngine.getSummary({
    usedShipments: shipmentsUsed,
    usedAmountUsd: amountUsed
  });

  useEffect(() => {
    async function loadStatus() {
      if (!user) {
        // Load default mock or stored guest state
        const stored = localStorage.getItem('guest_customs_status_2026');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setShipmentsUsed(parsed.usedShipments || 0);
            setAmountUsed(parsed.usedAmountUsd || 0);
            setPreferredCourier(parsed.preferredCourier || 'puntomio');
          } catch (e) {}
        }
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_customs_usage')
          .select('*')
          .eq('user_id', user.id)
          .eq('year', 2026)
          .maybeSingle();

        if (data) {
          setShipmentsUsed(data.used_shipments || 0);
          setAmountUsed(Number(data.used_amount_usd) || 0);
          setPreferredCourier(data.preferred_courier_code || 'puntomio');
        }
      } catch (err) {
        console.error('Error fetching customs status:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, [user]);

  const handleUpdate = async (newShipments: number, newAmount: number, newCourier?: string) => {
    setShipmentsUsed(newShipments);
    setAmountUsed(newAmount);
    if (newCourier) setPreferredCourier(newCourier);

    if (!user) {
      localStorage.setItem('guest_customs_status_2026', JSON.stringify({
        usedShipments: newShipments,
        usedAmountUsd: newAmount,
        preferredCourier: newCourier || preferredCourier
      }));
      if (onUpdate) onUpdate();
      return;
    }

    try {
      setSaving(true);
      await supabase
        .from('user_customs_usage')
        .upsert({
          user_id: user.id,
          year: 2026,
          used_shipments: newShipments,
          used_amount_usd: newAmount,
          preferred_courier_code: newCourier || preferredCourier,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,year' });

      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error saving customs usage:', err);
    } finally {
      setSaving(false);
    }
  };

  const shipmentPercent = Math.min(100, Math.round((summary.usedShipments / summary.maxShipments) * 100));
  const amountPercent = Math.min(100, Math.round((summary.usedAmountUsd / summary.annualQuotaUsd) * 100));

  if (loading) {
    return (
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 animate-pulse text-zinc-500">
        Cargando estado de franquicias Uruguay 2026...
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-white/10 rounded-2xl p-6 text-white shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">Mi Franquicia Uruguay 2026</h2>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Oficial UY
              </span>
            </div>
            <p className="text-xs text-zinc-400">Control personal del régimen aduanero de encomiendas postales</p>
          </div>
        </div>

        {summary.hasAvailableFranchise ? (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Franquicia Activa
          </span>
        ) : (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Franquicia Agotada
          </span>
        )}
      </div>

      {/* Main Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        {/* Envíos */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Package size={14} className="text-sky-400" />
              Cupos Anuales Utilizados
            </span>
            <span className="text-sm font-black text-white">
              {summary.usedShipments} / {summary.maxShipments}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                shipmentPercent >= 100 ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${shipmentPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-zinc-400 flex justify-between">
            <span>Te restan: <strong className="text-emerald-400">{summary.remainingShipments}</strong> envíos</span>
            <span>Máx. {summary.maxShipments} por año</span>
          </div>
        </div>

        {/* Monto USD */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-emerald-400" />
              Monto Acumulado (USD)
            </span>
            <span className="text-sm font-black text-white">
              USD {summary.usedAmountUsd.toFixed(2)} / ${summary.annualQuotaUsd}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                amountPercent >= 100 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${amountPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-zinc-400 flex justify-between">
            <span>Disponible: <strong className="text-emerald-400">USD {summary.remainingQuotaUsd.toFixed(2)}</strong></span>
            <span>Límite total USD 800</span>
          </div>
        </div>
      </div>

      {/* Manual adjustments / Self-declaration */}
      <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <label className="text-zinc-400 font-medium">Ajustar mis envíos realizados este año:</label>
          <div className="flex items-center gap-1 bg-zinc-800 border border-white/10 rounded-lg p-1">
            {[0, 1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => handleUpdate(n, n * (summary.usedAmountUsd > 0 ? (summary.usedAmountUsd / (summary.usedShipments || 1)) : 100))}
                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                  summary.usedShipments === n 
                    ? 'bg-sky-500 text-white' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-zinc-400 font-medium">Courier Preferido:</label>
          <select
            value={preferredCourier}
            onChange={(e) => handleUpdate(summary.usedShipments, summary.usedAmountUsd, e.target.value)}
            className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
          >
            <option value="puntomio">PuntoMio</option>
            <option value="urubox">Urubox</option>
            <option value="usx_cargo">USX Cargo</option>
          </select>
        </div>
      </div>

      {/* Footer Info Notice */}
      <div className="mt-4 p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-[11px] text-zinc-400 flex items-start gap-2">
        <HelpCircle size={15} className="text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <span>Regulaciones aduaneras 2026: Cada ciudadano uruguayo dispone de hasta 3 compras anuales exentas de tributos (hasta USD 800 en total y máx. 20 kg de peso físico por paquete). No se aplica peso volumétrico. Al superar los cupos, se aplica Régimen Simplificado (60%).</span>
        </div>
      </div>
    </div>
  );
};
