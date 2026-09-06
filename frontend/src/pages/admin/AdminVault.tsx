import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Archive, ShieldAlert, CheckCircle, Eye, RefreshCw, 
  BarChart2, Sliders, Save, Users, ExternalLink, Lock, 
  Globe, Trash2, Award
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

interface PublicCollectionRow {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  user_id: string;
  created_at: string;
  user_profile?: {
    handle?: string;
    display_name?: string;
  };
}

export default function AdminVault() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalProfiles: 0,
    publicCollections: 0
  });
  const [collections, setCollections] = useState<PublicCollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings state (por defecto desactivado)
  const [completionEnabled, setCompletionEnabled] = useState(false);
  const [catalogSource, setCatalogSource] = useState('store_catalog');

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    loadAdminStats();
    loadSettings();
    loadCollections();
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

  const loadCollections = async () => {
    try {
      const { data, error } = await supabase
        .from('vault_collections')
        .select(`
          id,
          name,
          slug,
          visibility,
          user_id,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setCollections(data);
      }
    } catch (err) {
      console.error('Error loading vault collections:', err);
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
      toast.success('Configuración de My Vault guardada');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving vault settings:', err);
      toast.error('Error al guardar configuración');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleCollectionVisibility = async (id: string, currentVis: string) => {
    const nextVis = currentVis === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    try {
      const { error } = await supabase
        .from('vault_collections')
        .update({ visibility: nextVis })
        .eq('id', id);

      if (error) throw error;
      toast.success(`Vitrina configurada como ${nextVis === 'PUBLIC' ? 'Pública' : 'Privada'}`);
      loadCollections();
      loadAdminStats();
    } catch (err) {
      toast.error('Error al cambiar visibilidad');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Administración de My Vault</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Collector Vault
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Supervisión de métricas de colecciones, moderación de vitrinas públicas y algoritmos de completitud.
          </p>
        </div>
        <button
          onClick={() => { loadAdminStats(); loadCollections(); }}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 bg-white flex items-center gap-2 text-xs font-semibold"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Piezas Registradas</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Archive size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mt-2">{stats.totalItems}</div>
          <span className="text-[11px] text-gray-400 mt-1 block">En bóvedas privadas y públicas</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Coleccionistas con Perfil</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Users size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 mt-2">{stats.totalProfiles}</div>
          <span className="text-[11px] text-gray-400 mt-1 block">Perfiles de coleccionista activos</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vitrinas Públicas</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Globe size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 mt-2">{stats.publicCollections}</div>
          <span className="text-[11px] text-gray-400 mt-1 block">Indexables y compartibles</span>
        </div>
      </div>

      {/* Moderación de Vitrinas Públicas */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Vitrinas & Colecciones Recientes</h2>
            <p className="text-xs text-gray-500">Supervisa las vitrinas creadas por los usuarios para moderar contenidos</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Nombre de Vitrina</th>
                <th className="px-6 py-3.5">Identificador / Slug</th>
                <th className="px-6 py-3.5">Estado de Visibilidad</th>
                <th className="px-6 py-3.5">Fecha Creación</th>
                <th className="px-6 py-3.5 text-right">Moderación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    No hay colecciones creadas todavía.
                  </td>
                </tr>
              ) : (
                collections.map((col) => (
                  <tr key={col.id} className="hover:bg-gray-50/70 transition">
                    <td className="px-6 py-4 font-bold text-gray-900 text-sm">
                      {col.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-500 text-[11px]">
                      /{col.slug}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        col.visibility === 'PUBLIC'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {col.visibility === 'PUBLIC' ? <Globe size={12} /> : <Lock size={12} />}
                        {col.visibility === 'PUBLIC' ? 'Pública' : 'Privada'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-500">
                      {new Date(col.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleCollectionVisibility(col.id, col.visibility)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                            col.visibility === 'PUBLIC'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {col.visibility === 'PUBLIC' ? 'Hacer Privada' : 'Hacer Pública'}
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

      {/* Panel de Configuración de Completitud & Faltantes */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-gray-900">Configuración de % de Completitud y Faltantes</h2>
          </div>
          {saveSuccess && (
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle size={14} /> Guardado con éxito
            </span>
          )}
        </div>

        <div className="space-y-4 text-xs">
          {/* Toggle Activar/Desactivar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50/80 border border-gray-200 rounded-xl gap-4">
            <div className="space-y-1">
              <p className="font-bold text-gray-900 text-sm">Cálculo de % de Colección y Detección de Faltantes</p>
              <p className="text-gray-500 text-xs">
                Calcula el porcentaje de completitud en la vitrina del usuario y sugiere comprar piezas faltantes de la misma wave o franquicia.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={completionEnabled}
                onChange={e => setCompletionEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#f00856]"></div>
            </label>
          </div>

          {/* Selector de Fuente de Datos */}
          <div className="p-4 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
            <label className="font-bold text-gray-900 text-xs uppercase tracking-wider block">
              Fuente de Datos para el Cálculo de Completitud
            </label>
            <p className="text-gray-500 text-xs mb-3">
              Define contra qué conjunto de datos se compararán las piezas poseídas por el coleccionista.
            </p>
            <select
              value={catalogSource}
              onChange={e => setCatalogSource(e.target.value)}
              className="w-full sm:w-96 bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-semibold focus:ring-2 focus:ring-[#f00856] outline-none"
            >
              <option value="store_catalog">Catálogo Activo de la Tienda (Por Franquicia/Marca)</option>
              <option value="wave_series">Series y Waves Específicas del Catálogo (wave_name)</option>
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-5 py-2.5 bg-[#f00856] hover:bg-[#d6074c] text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save size={15} />
              <span>{savingSettings ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

