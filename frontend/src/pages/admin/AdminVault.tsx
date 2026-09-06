import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Archive, ShieldAlert, CheckCircle, Eye, RefreshCw, BarChart2, Sliders, Save } from 'lucide-react';

export default function AdminVault() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalProfiles: 0,
    publicCollections: 0
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings state (por defecto desactivado)
  const [completionEnabled, setCompletionEnabled] = useState(false);
  const [catalogSource, setCatalogSource] = useState('store_catalog');

  useEffect(() => {
    loadAdminStats();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['vault_completion_enabled', 'vault_catalog_source']);

      if (data) {
        data.forEach(row => {
          if (row.key === 'vault_completion_enabled') {
            setCompletionEnabled(row.value === 'true');
          }
          if (row.key === 'vault_catalog_source') {
            setCatalogSource(row.value || 'store_catalog');
          }
        });
      }
    } catch (err) {
      console.error('Error loading vault settings:', err);
    }
  };

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

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      setSaveSuccess(false);

      await supabase.from('site_settings').upsert([
        { key: 'vault_completion_enabled', value: completionEnabled ? 'true' : 'false' },
        { key: 'vault_catalog_source', value: catalogSource }
      ], { onConflict: 'key' });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving vault settings:', err);
    } finally {
      setSavingSettings(false);
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Panel de Configuración de Completitud & Faltantes */}
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Configuración de % de Completitud y Faltantes</h2>
          </div>
          {saveSuccess && (
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle size={14} /> Guardado con éxito
            </span>
          )}
        </div>

        <div className="space-y-4 text-xs">
          {/* Toggle Activar/Desactivar */}
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
            <div className="space-y-0.5">
              <p className="font-bold text-white text-sm">Cálculo de % de Colección y Detección de Faltantes</p>
              <p className="text-zinc-400 text-xs">
                Calcula el porcentaje de completitud en la vitrina del usuario y sugiere comprar piezas faltantes de la misma wave o franquicia.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={completionEnabled}
                onChange={e => setCompletionEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Selector de Fuente de Datos */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-2">
            <label className="font-bold text-white text-xs uppercase tracking-wider block">
              Fuente de Datos para el Cálculo de Completitud
            </label>
            <p className="text-zinc-400 text-xs mb-3">
              Define contra qué conjunto de datos se compararán las piezas poseídas por el coleccionista.
            </p>
            <select
              value={catalogSource}
              onChange={e => setCatalogSource(e.target.value)}
              className="w-full sm:w-80 bg-zinc-800 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:border-amber-400 outline-none"
            >
              <option value="store_catalog">Catálogo Activo de la Tienda (Por Franquicia/Marca)</option>
              <option value="wave_series">Series y Waves Específicas del Catálogo (wave_name)</option>
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Save size={14} />
              {savingSettings ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
