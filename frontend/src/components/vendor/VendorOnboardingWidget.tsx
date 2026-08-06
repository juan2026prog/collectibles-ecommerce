import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Sparkles, ArrowRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export default function VendorOnboardingWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    loadStatus();
  }, [user]);

  async function loadStatus() {
    try {
      const { data } = await supabase.rpc('get_vendor_onboarding_status', {
        p_vendor_id: user!.id
      });
      setStatusData(data);
    } catch (err) {
      console.error('Error loading onboarding widget status:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !statusData) return null;

  const { completedSteps = 0, totalSteps = 7, percentage = 0, status = 'onboarding' } = statusData;

  // Don't render widget if store is fully active and 100% completed
  if (status === 'active' && percentage === 100) return null;

  return (
    <div className="bg-gradient-to-r from-gray-900 via-dark-900 to-gray-900 rounded-3xl p-6 border border-primary-500/30 shadow-xl space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-primary-500/20 text-primary-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-primary-500/40 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary-400" /> Guía Inicial de Tienda
            </span>
            {status === 'pending_review' && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                <Clock className="w-3 h-3 animate-pulse" /> En Revisión por Admin
              </span>
            )}
            {status === 'changes_required' && (
              <span className="bg-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Cambios Solicitados
              </span>
            )}
          </div>
          <h3 className="text-xl font-black text-white">
            Configuración de tienda: <span className="text-primary-400">{completedSteps} de {totalSteps} pasos</span> ({percentage}%)
          </h3>
          <p className="text-xs text-gray-400">
            Completá la configuración obligatoria para habilitar la recepción de pedidos en tu tienda.
          </p>
        </div>

        <button
          onClick={() => navigate('/vendor/onboarding')}
          className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-primary-500/20 flex items-center justify-center gap-2 shrink-0"
        >
          CONTINUAR CONFIGURACIÓN <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden p-0.5 border border-gray-800">
        <div
          className="bg-gradient-to-r from-primary-600 to-pink-500 h-full rounded-full transition-all duration-500 shadow-sm"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
