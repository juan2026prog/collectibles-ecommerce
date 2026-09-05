import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Archive, ShieldAlert, CheckCircle, Eye, RefreshCw, BarChart2 } from 'lucide-react';

export default function AdminVault() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalProfiles: 0,
    publicCollections: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminStats();
  }, []);

  const loadAdminStats = async () => {
    try {
      setLoading(true);
      const [itemsRes, profRes, colRes] = await Promise.all([
        supabase.from('vault_items').select('id', { count: 'exact', head: true }),
        supabase.from('vault_user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('vault_collections').select('id', { count: 'exact', head: true }).eq('visibility', 'PUBLIC')
      ]);

      setStats({
        totalItems: itemsRes.count || 0,
        totalProfiles: profRes.count || 0,
        publicCollections: colRes.count || 0
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">Administración de My Vault</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Collector Vault
            </span>
          </div>
          <p className="text-xs text-zinc-400">Supervisión de métricas de colecciones, moderación y vitrinas públicas</p>
        </div>
        <button
          onClick={loadAdminStats}
          className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Piezas Registradas</span>
          <div className="text-2xl font-black text-white mt-1">{stats.totalItems}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Coleccionistas con Perfil</span>
          <div className="text-2xl font-black text-amber-400 mt-1">{stats.totalProfiles}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
          <span className="text-xs text-zinc-400 font-medium">Vitrinas Públicas</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{stats.publicCollections}</div>
        </div>
      </div>
    </div>
  );
}
