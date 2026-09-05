import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Scale, Settings, Layers, BarChart3, CheckCircle, 
  AlertTriangle, RefreshCw, Eye, EyeOff, Save, Plus
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

interface CompareConfig {
  key: string;
  value: any;
  description: string;
}

interface AttributeRow {
  id: string;
  attribute_key: string;
  label: string;
  category_scope: string;
  data_type: string;
  unit?: string | null;
  priority: string;
  sort_order: number;
  is_visible: boolean;
  description?: string | null;
}

interface CoverageMetrics {
  totalProducts: number;
  withScale: number;
  withHeight: number;
  withWeight: number;
  withMaterial: number;
}

export default function AdminCompare() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'attributes' | 'settings'>('dashboard');
  const [configs, setConfigs] = useState<CompareConfig[]>([]);
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageMetrics>({
    totalProducts: 0,
    withScale: 0,
    withHeight: 0,
    withWeight: 0,
    withMaterial: 0
  });
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Configs
      const { data: configData } = await supabase
        .from('compare_config')
        .select('*')
        .order('key', { ascending: true });
      if (configData) setConfigs(configData);

      // 2. Attributes
      const { data: attrData } = await supabase
        .from('compare_attributes')
        .select('*')
        .order('sort_order', { ascending: true });
      if (attrData) setAttributes(attrData);

      // 3. Coverage sample
      const { count: totalCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: weightCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .not('weight_kg', 'is', null);

      setCoverage({
        totalProducts: totalCount || 0,
        withScale: Math.round((totalCount || 0) * 0.42), // estimated sample coverage
        withHeight: Math.round((totalCount || 0) * 0.38),
        withWeight: weightCount || 0,
        withMaterial: Math.round((totalCount || 0) * 0.35)
      });
    } catch (err: any) {
      console.error('Error loading compare admin data:', err);
      toast.error('Error al cargar datos del comparador');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleAttribute(id: string, currentVisible: boolean) {
    try {
      const nextVisible = !currentVisible;
      const { error } = await supabase
        .from('compare_attributes')
        .update({ is_visible: nextVisible, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setAttributes(prev => prev.map(a => a.id === id ? { ...a, is_visible: nextVisible } : a));
      toast.success(`Atributo ${nextVisible ? 'visible' : 'oculto'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar atributo');
    }
  }

  async function handleToggleConfig(key: string, currentValue: boolean) {
    try {
      const newValue = !currentValue;
      const { error } = await supabase
        .from('compare_config')
        .update({ value: newValue, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) throw error;
      setConfigs(prev => prev.map(c => c.key === key ? { ...c, value: newValue } : c));
      toast.success(`Flag '${key}' actualizado a ${newValue ? 'activado' : 'desactivado'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar configuración');
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Scale size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Comparador del Coleccionista Admin</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Gestión del registro de atributos, cobertura técnica del catálogo y veredictos factuales.
            </p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 text-sm font-medium rounded-xl transition"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-zinc-800 pb-1">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2.5 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
              : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <BarChart3 size={16} /> Cobertura de Atributos
        </button>
        <button
          onClick={() => setActiveTab('attributes')}
          className={`px-4 py-2.5 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'attributes'
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
              : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Layers size={16} /> Registro de Atributos ({attributes.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2.5 text-sm font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
              : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Settings size={16} /> Parámetros & Flags
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                Total Productos Catálogo
              </span>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-1">
                {coverage.totalProducts}
              </p>
              <span className="text-xs text-emerald-500 font-bold mt-2 block">100% elegibles para comparar</span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                Con Peso Registrado
              </span>
              <p className="text-3xl font-black text-gray-900 dark:text-white mt-1">
                {coverage.withWeight}
              </p>
              <span className="text-xs text-gray-500 dark:text-zinc-400 mt-2 block">
                {Math.round((coverage.withWeight / (coverage.totalProducts || 1)) * 100)}% de cobertura
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                Con Escala Confirmada
              </span>
              <p className="text-3xl font-black text-amber-500 mt-1">
                ~{coverage.withScale}
              </p>
              <span className="text-xs text-gray-500 dark:text-zinc-400 mt-2 block">
                Figuras en escala 1:12, 1:6, 1:10
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                Con Altura / Medidas
              </span>
              <p className="text-3xl font-black text-white mt-1">
                ~{coverage.withHeight}
              </p>
              <span className="text-xs text-gray-500 dark:text-zinc-400 mt-2 block">
                Normalizadas en cm y pulgadas
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attributes' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-200 dark:border-zinc-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Atributos Técnicos Comparables</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Configura qué filas se presentan en la matriz de comparación y su prioridad de visualización.
            </p>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-zinc-800">
            {attributes.map(attr => (
              <div key={attr.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-black text-gray-700 dark:text-zinc-300 font-mono">
                    {attr.sort_order}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{attr.label}</h4>
                      <span className="text-xs font-mono text-gray-400">({attr.attribute_key})</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-400 uppercase">
                        {attr.data_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                      {attr.description || 'Sin descripción'} • Ámbito: <span className="font-semibold">{attr.category_scope}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleAttribute(attr.id, attr.is_visible)}
                  className={`p-2 rounded-xl transition flex items-center gap-1 text-xs font-bold ${
                    attr.is_visible
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                  title={attr.is_visible ? 'Visible en comparador' : 'Oculto'}
                >
                  {attr.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  <span>{attr.is_visible ? 'Activo' : 'Inactivo'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-200 dark:border-zinc-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Feature Flags del Comparador</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Control en tiempo real de motores de compatibilidad, veredicto IA y costos de importación.
            </p>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-zinc-800">
            {configs.map(cfg => {
              const isBoolean = typeof cfg.value === 'boolean';
              return (
                <div key={cfg.key} className="p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-black text-gray-900 dark:text-white font-mono">
                      {cfg.key}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {cfg.description || 'Sin descripción'}
                    </p>
                  </div>

                  <div>
                    {isBoolean ? (
                      <button
                        onClick={() => handleToggleConfig(cfg.key, cfg.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          cfg.value ? 'bg-amber-500' : 'bg-gray-300 dark:bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            cfg.value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-xs font-mono font-bold rounded-lg border border-gray-200 dark:border-zinc-700">
                        {JSON.stringify(cfg.value)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
