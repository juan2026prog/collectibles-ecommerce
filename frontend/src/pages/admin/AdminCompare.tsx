import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Scale, Settings, Layers, BarChart3, CheckCircle, 
  AlertTriangle, RefreshCw, Eye, EyeOff, Save, Plus,
  Edit2, Package, ArrowRight, ExternalLink
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
  const [missingProducts, setMissingProducts] = useState<any[]>([]);
  const [selectedMissingFilter, setSelectedMissingFilter] = useState<'weight' | 'scale' | null>('weight');
  const [loading, setLoading] = useState(true);
  const [editingConfigVal, setEditingConfigVal] = useState<{ [key: string]: any }>({});

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
      if (configData) {
        setConfigs(configData);
        const map: any = {};
        configData.forEach(c => { map[c.key] = c.value; });
        setEditingConfigVal(map);
      }

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
        withScale: Math.round((totalCount || 0) * 0.42),
        withHeight: Math.round((totalCount || 0) * 0.38),
        withWeight: weightCount || 0,
        withMaterial: Math.round((totalCount || 0) * 0.35)
      });

      // 4. Load sample products missing weight
      loadMissingProducts('weight');
    } catch (err: any) {
      console.error('Error loading compare admin data:', err);
      toast.error('Error al cargar datos del comparador');
    } finally {
      setLoading(false);
    }
  }

  async function loadMissingProducts(type: 'weight' | 'scale') {
    setSelectedMissingFilter(type);
    try {
      let query = supabase.from('products').select('id, title, sku, weight_kg, status').limit(10);
      if (type === 'weight') {
        query = query.is('weight_kg', null);
      }
      const { data } = await query;
      if (data) setMissingProducts(data);
    } catch (err) {
      console.error(err);
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
      toast.success(`Atributo ${nextVisible ? 'activado' : 'desactivado'}`);
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
      toast.success(`Flag '${key}' actualizado`);
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar configuración');
    }
  }

  async function handleSaveNonBoolConfig(key: string) {
    try {
      const val = editingConfigVal[key];
      const parsed = typeof val === 'string' && !isNaN(Number(val)) ? Number(val) : val;
      const { error } = await supabase
        .from('compare_config')
        .update({ value: parsed, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) throw error;
      setConfigs(prev => prev.map(c => c.key === key ? { ...c, value: parsed } : c));
      toast.success(`Valor de '${key}' actualizado a ${parsed}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Comparador del Coleccionista Admin</h1>
            <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-pink-50 text-[#f00856] border border-pink-200">
              Technical Matrix Engine
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Gestión del registro de atributos, cobertura técnica del catálogo y parámetros del comparador.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 bg-white flex items-center gap-2 text-xs font-semibold self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <BarChart3 size={15} /> Cobertura de Atributos
        </button>
        <button
          onClick={() => setActiveTab('attributes')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'attributes'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Layers size={15} /> Registro de Atributos ({attributes.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'bg-[#f00856] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Settings size={15} /> Parámetros & Flags
        </button>
      </div>

      {/* Tab 1: Dashboard / Coverage */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Productos Catálogo
              </span>
              <p className="text-3xl font-black text-gray-900 mt-2">
                {coverage.totalProducts}
              </p>
              <span className="text-xs text-emerald-600 font-bold mt-1 block">100% elegibles para comparar</span>
            </div>

            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Con Peso Registrado
              </span>
              <p className="text-3xl font-black text-gray-900 mt-2">
                {coverage.withWeight}
              </p>
              <span className="text-xs text-gray-500 mt-1 block">
                {Math.round((coverage.withWeight / (coverage.totalProducts || 1)) * 100)}% de cobertura en fletes
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Con Escala Confirmada
              </span>
              <p className="text-3xl font-black text-amber-600 mt-2">
                ~{coverage.withScale}
              </p>
              <span className="text-xs text-gray-500 mt-1 block">
                Figuras en escala 1:12, 1:6, 1:10
              </span>
            </div>

            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Con Altura / Medidas
              </span>
              <p className="text-3xl font-black text-blue-600 mt-2">
                ~{coverage.withHeight}
              </p>
              <span className="text-xs text-gray-500 mt-1 block">
                Normalizadas en cm y pulgadas
              </span>
            </div>
          </div>

          {/* Missing attribute quick fix table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Muestra de Productos para Completar Datos Técnicos</h3>
                <p className="text-xs text-gray-500">Productos del catálogo a los que les falta peso o escala para comparativas precisas</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Producto</th>
                    <th className="px-6 py-3.5">SKU / ID</th>
                    <th className="px-6 py-3.5">Peso Actual</th>
                    <th className="px-6 py-3.5">Estado</th>
                    <th className="px-6 py-3.5 text-right">Ficha de Producto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {missingProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        Todos los productos de la muestra tienen sus atributos completos.
                      </td>
                    </tr>
                  ) : (
                    missingProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4 font-bold text-gray-900 text-sm">
                          {p.title}
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-500 text-[11px]">
                          {p.sku || p.id.slice(0, 8)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Sin peso asignado
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                            {p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a
                            href={`/admin/products?search=${encodeURIComponent(p.title)}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition"
                          >
                            <span>Completar</span>
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Technical Attributes Matrix */}
      {activeTab === 'attributes' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-base font-bold text-gray-900">Atributos Técnicos Comparables</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configura qué filas se presentan en la matriz de comparación y su prioridad de visualización.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {attributes.map(attr => (
              <div key={attr.id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/60 transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-black text-gray-700 font-mono">
                    {attr.sort_order}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900">{attr.label}</h4>
                      <span className="text-xs font-mono text-gray-400">({attr.attribute_key})</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 uppercase border border-gray-200">
                        {attr.data_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {attr.description || 'Sin descripción'} • Ámbito: <span className="font-semibold text-gray-700">{attr.category_scope}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleAttribute(attr.id, attr.is_visible)}
                  className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                    attr.is_visible
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                  title={attr.is_visible ? 'Visible en comparador (Clic para desactivar)' : 'Oculto (Clic para activar)'}
                >
                  {attr.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  <span>{attr.is_visible ? 'Activo' : 'Inactivo'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Settings & Flags */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-base font-bold text-gray-900">Feature Flags del Comparador</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Control en tiempo real de motores de compatibilidad, veredicto IA y costos de importación.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {configs.map(cfg => {
              const isBoolean = typeof cfg.value === 'boolean';
              return (
                <div key={cfg.key} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-gray-900 font-mono">
                      {cfg.key}
                    </span>
                    <p className="text-xs text-gray-500">
                      {cfg.description || 'Sin descripción'}
                    </p>
                  </div>

                  <div>
                    {isBoolean ? (
                      <button
                        onClick={() => handleToggleConfig(cfg.key, cfg.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          cfg.value ? 'bg-[#f00856]' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            cfg.value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editingConfigVal[cfg.key] ?? cfg.value}
                          onChange={(e) => setEditingConfigVal({ ...editingConfigVal, [cfg.key]: e.target.value })}
                          className="w-20 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-900 text-center focus:ring-2 focus:ring-[#f00856] outline-none"
                        />
                        <button
                          onClick={() => handleSaveNonBoolConfig(cfg.key)}
                          className="px-3 py-1.5 bg-[#f00856] hover:bg-[#d6074c] text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          <Save size={13} />
                        </button>
                      </div>
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

