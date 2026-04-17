import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, ToggleLeft, ToggleRight, Settings, Store, Truck, Palette, LayoutTemplate, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, FileText, Share2, Link as LinkIcon, ImageIcon, CreditCard, ShieldCheck, Sparkles, Brain, Zap, Search as SearchIcon, Tag } from 'lucide-react';
import { MediaPickerModal } from '../../components/MediaPickerModal';

function MenuEditor({ title, description, initialJson, onSave }: any) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(initialJson || '[]')); } catch { setItems([]); }
  }, [initialJson]);

  const updateItem = (i: number, field: string, val: string) => {
    const n = [...items]; n[i][field] = val; setItems(n);
  };
  const updateSub = (i: number, j: number, field: string, val: string) => {
    const n = [...items]; n[i].subItems[j][field] = val; setItems(n);
  };

  const addItem = () => setItems([...items, { label: 'Nuevo Enlace', url: '/', subItems: [] }]);
  const addSub = (i: number) => {
    const n = [...items]; 
    if (!n[i].subItems) n[i].subItems = [];
    n[i].subItems.push({ label: 'Sub-enlace', url: '/' });
    setItems(n);
  };

  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const removeSub = (i: number, j: number) => {
    const n = [...items]; n[i].subItems = n[i].subItems.filter((_: any, idx: number) => idx !== j); setItems(n);
  };

  const move = (i: number, dir: number) => {
    const n = [...items];
    if (i + dir < 0 || i + dir >= n.length) return;
    [n[i], n[i+dir]] = [n[i+dir], n[i]];
    setItems(n);
  };
  const moveSub = (i: number, j: number, dir: number) => {
    const n = [...items];
    const s = n[i].subItems;
    if (j + dir < 0 || j + dir >= s.length) return;
    [s[j], s[j+dir]] = [s[j+dir], s[j]];
    setItems(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm">
        <div>
          <h4 className="font-bold text-gray-800">{title}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <button onClick={addItem} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 bg-white"><Plus className="w-3.5 h-3.5" /> Agregar Elemento</button>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
             <div className="flex items-center gap-2 bg-gray-50 p-2.5 border-b border-gray-100">
                <div className="flex flex-col gap-0.5">
                   <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                   <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                </div>
                <div className="w-6 flex items-center justify-center cursor-grab text-gray-300 hover:text-gray-500"><GripVertical className="w-4 h-4" /></div>
                
                <div className="flex-1 grid grid-cols-2 gap-3">
                   <input className="form-input text-sm px-3 py-1.5 font-bold text-gray-800 border-gray-200 bg-white shadow-none focus:bg-white" value={item.label} onChange={e => updateItem(i, 'label', e.target.value)} placeholder="Nombre (ej. Inicio)" />
                   <input className="form-input text-sm px-3 py-1.5 font-mono text-blue-600 border-gray-200 bg-white shadow-none focus:bg-white" value={item.url} onChange={e => updateItem(i, 'url', e.target.value)} placeholder="URL (ej. /)" />
                </div>
                
                <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
                   <button onClick={() => addSub(i)} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded" title="Añadir Sub-menú Desplegable"><Plus className="w-4 h-4" /></button>
                   <button onClick={() => remove(i)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                </div>
             </div>
             
             {/* Render subitems */}
             {item.subItems && item.subItems.length > 0 && (
                <div className="p-3 bg-white pl-12 space-y-2 relative">
                   <div className="absolute left-7 top-0 bottom-6 w-px bg-gray-200" />
                   {item.subItems.map((sub: any, j: number) => (
                      <div key={j} className="flex items-center gap-2 relative group hover:bg-gray-50 bg-white p-1 rounded transition-colors">
                         <div className="absolute -left-5 top-1/2 w-4 h-px bg-gray-200" />
                         <div className="flex flex-col gap-0">
                            <button onClick={() => moveSub(i, j, -1)} disabled={j === 0} className="text-gray-300 hover:text-gray-800 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                            <button onClick={() => moveSub(i, j, 1)} disabled={j === item.subItems.length - 1} className="text-gray-300 hover:text-gray-800 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                         </div>
                         <div className="flex-1 grid grid-cols-2 gap-2">
                            <input className="form-input text-xs px-2 py-1.5 border-gray-200 focus:bg-white" value={sub.label} onChange={e => updateSub(i, j, 'label', e.target.value)} placeholder="Sub-etiqueta" />
                            <input className="form-input text-xs px-2 py-1.5 font-mono text-blue-600 border-gray-200 focus:bg-white" value={sub.url} onChange={e => updateSub(i, j, 'url', e.target.value)} placeholder="/ruta" />
                         </div>
                         <button onClick={() => removeSub(i, j)} className="p-1 text-red-300 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                      </div>
                   ))}
                </div>
             )}
          </div>
        ))}
        {items.length === 0 && (
           <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
              <p className="text-sm text-gray-500">Este menú está vacío actualmente.</p>
              <button onClick={addItem} className="text-primary-600 font-bold text-sm mt-2 hover:underline">Añadir el primer elemento</button>
           </div>
        )}
      </div>
      
      <button onClick={() => onSave(JSON.stringify(items))} className="w-full btn-primary py-2 shadow-[0_4px_14px_rgba(37,99,235,0.2)] flex justify-center gap-2 hover:translate-y-px mt-4">
        <Save className="w-4 h-4" /> Guardar Menú
      </button>
    </div>
  );
}

function HomeLayoutEditor({ title, description, initialJson, onSave }: any) {
  const defaultBlocks = [
    { id: 'hero', label: 'Hero Banner Principal', visible: true },
    { id: 'bento', label: 'Categorías Destacadas (Bento)', visible: true },
    { id: 'collections', label: 'Grupos/Colecciones', visible: true },
    { id: 'trending', label: 'Novedades y Más Vendidos', visible: true },
    { id: 'brands', label: 'Carrusel de Marcas', visible: true }
  ];
  const [blocks, setBlocks] = useState<any[]>([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(initialJson);
      if (Array.isArray(parsed) && parsed.length > 0) setBlocks(parsed);
      else setBlocks(defaultBlocks);
    } catch {
      setBlocks(defaultBlocks);
    }
  }, [initialJson]);

  const toggleVisible = (i: number) => {
    const n = [...blocks]; n[i].visible = !n[i].visible; setBlocks(n);
  };

  const move = (i: number, dir: number) => {
    const n = [...blocks];
    if (i + dir < 0 || i + dir >= n.length) return;
    [n[i], n[i+dir]] = [n[i+dir], n[i]];
    setBlocks(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
        <div>
          <h4 className="font-bold text-gray-800">{title}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <div key={b.id} className={`flex items-center gap-3 bg-white border rounded-lg p-3 transition-colors ${!b.visible ? 'opacity-50 border-gray-100 bg-gray-50' : 'border-gray-200 shadow-sm hover:border-primary-400'}`}>
             <div className="flex flex-col gap-0.5">
               <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
               <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
             </div>
             <GripVertical className="w-4 h-4 text-gray-300" />
             <span className="flex-1 font-bold text-sm text-gray-800">{b.label}</span>
             <button onClick={() => toggleVisible(i)} className="pr-2">
               {b.visible ? <ToggleRight className="w-8 h-8 text-primary-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
             </button>
          </div>
        ))}
      </div>
      <button onClick={() => onSave(JSON.stringify(blocks))} className="w-full btn-primary py-2 flex justify-center gap-2 mt-4"><Save className="w-4 h-4" /> Guardar Layout</button>
    </div>
  );
}

import { useSearchParams } from 'react-router-dom';

// ═══ AI Usage Stats Component ═══
function AiUsageStats({ period }: { period: string }) {
  const [stats, setStats] = useState<{ tool_key: string; total_tokens: number; total_cost: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [period]);

  async function fetchStats() {
    setLoading(true);
    let query = supabase
      .from('ai_usage_log')
      .select('tool_key, tokens_used, estimated_cost, created_at');

    if (period !== 'all') {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));
      query = query.gte('created_at', daysAgo.toISOString());
    }

    const { data } = await query;
    
    // Aggregate by tool_key
    const grouped: Record<string, { total_tokens: number; total_cost: number; count: number }> = {};
    (data || []).forEach(row => {
      if (!grouped[row.tool_key]) grouped[row.tool_key] = { total_tokens: 0, total_cost: 0, count: 0 };
      grouped[row.tool_key].total_tokens += row.tokens_used || 0;
      grouped[row.tool_key].total_cost += parseFloat(String(row.estimated_cost)) || 0;
      grouped[row.tool_key].count += 1;
    });

    setStats(Object.entries(grouped).map(([tool_key, v]) => ({ tool_key, ...v })));
    setLoading(false);
  }

  const totalTokens = stats.reduce((s, r) => s + r.total_tokens, 0);
  const totalCost = stats.reduce((s, r) => s + r.total_cost, 0);
  const totalCalls = stats.reduce((s, r) => s + r.count, 0);

  const toolLabels: Record<string, { label: string; color: string }> = {
    'ai_category_matching': { label: 'Category Matching', color: 'bg-amber-500' },
    'ai_catalog_generator': { label: 'Catalog Generator', color: 'bg-purple-500' },
    'ai_seo': { label: 'Auto-SEO', color: 'bg-green-500' },
    'ai_description_improver': { label: 'Descripción IA', color: 'bg-blue-500' },
    'generate_content': { label: 'Generador Contenido', color: 'bg-pink-500' },
  };

  const maxTokens = Math.max(...stats.map(s => s.total_tokens), 1);

  if (loading) {
    return <div className="p-8 text-center text-gray-400 animate-pulse text-sm">Cargando estadísticas...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Tokens Usados</p>
          <p className="text-3xl font-black text-amber-900 tracking-tight">{totalTokens.toLocaleString()}</p>
          <p className="text-xs text-amber-600 mt-1">{totalCalls} llamadas a la API</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Costo Estimado</p>
          <p className="text-3xl font-black text-green-900 tracking-tight">${totalCost.toFixed(4)}</p>
          <p className="text-xs text-green-600 mt-1">USD (Gemini Flash pricing)</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl p-5 border border-indigo-100">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Promedio/Llamada</p>
          <p className="text-3xl font-black text-indigo-900 tracking-tight">{totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0}</p>
          <p className="text-xs text-indigo-600 mt-1">tokens promedio</p>
        </div>
      </div>

      {/* Per-tool breakdown */}
      {stats.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Desglose por Herramienta</h4>
          {stats.sort((a, b) => b.total_tokens - a.total_tokens).map(s => {
            const info = toolLabels[s.tool_key] || { label: s.tool_key, color: 'bg-gray-500' };
            const pct = (s.total_tokens / maxTokens) * 100;
            return (
              <div key={s.tool_key} className="group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${info.color}`} />
                    <span className="text-sm font-bold text-gray-800">{info.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{s.count} calls</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-gray-700">{s.total_tokens.toLocaleString()} tokens</span>
                    <span className="text-gray-400">${s.total_cost.toFixed(4)}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${info.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Zap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">Sin datos de uso en este período</p>
          <p className="text-xs text-gray-400 mt-1">Las estadísticas aparecerán cuando las herramientas de IA se utilicen.</p>
        </div>
      )}

      {/* Pricing Info */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
        <p className="text-[11px] text-gray-500">
          <strong>Referencia de precios:</strong> Gemini 2.0 Flash — Input: $0.10/1M tokens · Output: $0.40/1M tokens. 
          Los costos mostrados son estimaciones basadas en un promedio de tokens por llamada.
        </p>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as any) || 'general';
  
  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };
  
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState<false | 'logo'>(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [{ data: s }, { data: t }, { data: sh }] = await Promise.all([
      supabase.from('site_settings').select('*'),
      supabase.from('feature_toggles').select('*').order('id'),
      supabase.from('shipping_rules').select('*').order('zone'),
    ]);
    const settingsMap: Record<string, string> = {};
    (s || []).forEach(item => { settingsMap[item.key] = item.value || ''; });
    setSettings(settingsMap);
    setToggles(t || []);
    setShipping(sh || []);
    setLoading(false);
  }

  async function saveSetting(key: string, value: string) {
    if (!key) return; // Prevent empty keys
    await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleModule(id: string, current: boolean) {
    await supabase.from('feature_toggles').update({ is_enabled: !current, updated_at: new Date().toISOString() }).eq('id', id);
    setToggles(prev => prev.map(t => t.id === id ? { ...t, is_enabled: !current } : t));
  }

  if (loading) return <div className="text-center py-12 text-gray-400 animate-pulse">Cargando configuración...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold dark:text-white">Configuración Global</h2>
        {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1 shadow-sm"><Save className="w-4 h-4"/> Guardado</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {[
          { key: 'general', label: 'General', icon: Store },
          { key: 'appearance', label: 'Theme Builder', icon: LayoutTemplate },
          { key: 'payments', label: 'Pagos', icon: CreditCard },
          { key: 'modules', label: 'Modulos Activos', icon: Settings },
          { key: 'shipping', label: 'Envios', icon: Truck },
          { key: 'social', label: 'Redes Sociales', icon: Share2 },
          { key: 'ai', label: 'Asistencia IA', icon: Sparkles },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${
              currentTab === t.key ? 'bg-white shadow-sm text-gray-900 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {currentTab === 'general' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 max-w-2xl shadow-sm">
          <h3 className="font-bold text-lg border-b pb-2">Datos de la Tienda</h3>
          {[
            { key: 'store_name', label: 'Nombre de la Tienda' },
            { key: 'store_tagline', label: 'Slogan / Tagline' },
            { key: 'currency', label: 'Moneda (Codigo)' },
            { key: 'currency_symbol', label: 'Símbolo Moneda' },
            { key: 'free_shipping_threshold', label: 'Monto Envio Gratis ($)' },
            { key: 'default_shipping_rate', label: 'Tarifa Envio Base ($)' },
          ].map(field => (
            <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <label className="sm:w-60 text-sm font-bold text-gray-700 flex-shrink-0">{field.label}</label>
              <input
                className="form-input flex-1"
                value={settings[field.key] || ''}
                onChange={e => setSettings({ ...settings, [field.key]: e.target.value })}
                onBlur={() => saveSetting(field.key, settings[field.key] || '')}
              />
            </div>
          ))}
        </div>
      )}

      {/* Appearance Settings */}
      {currentTab === 'appearance' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-blue-600" /> Identidad Visual</h3>
               <div className="space-y-6">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Logo Principal de la Tienda</label>
                   <div className="flex flex-col md:flex-row gap-6 mt-4">
                      <div className="w-full md:w-64 h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center overflow-hidden group relative">
                        {settings['appearance_logo'] ? (
                          <>
                            <img src={settings['appearance_logo']} className="max-w-[80%] max-h-[80%] object-contain" />
                            <div className="absolute inset-0 bg-dark-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                               <button onClick={() => setShowMediaPicker('logo')} className="text-white text-xs font-bold bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-md">Cambiar Logo</button>
                            </div>
                          </>
                        ) : (
                          <button onClick={() => setShowMediaPicker('logo')} className="flex flex-col items-center gap-2 text-gray-400 hover:text-blue-500">
                             <Plus className="w-8 h-8" />
                             <span className="text-[10px] uppercase font-black tracking-widest">Subir Logo</span>
                          </button>
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                         <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 mb-1">💡 Recomendaciones de Diseño</h4>
                            <ul className="text-[11px] text-blue-800 space-y-1 opacity-80">
                               <li>⬢ <b>Tamaño óptimo:</b> 512 x 128 px (Relación 4:1)</li>
                               <li>⬢ <b>Formato ideal:</b> PNG transparente o SVG</li>
                               <li>⬢ <b>Resolución:</b> 72 DPI (Web) o 144 DPI (Retina)</li>
                               <li>⬢ <b>Contraste:</b> Asegúrate que sea legible sobre fondos claros.</li>
                            </ul>
                         </div>
                         <input 
                           className="form-input w-full text-xs font-mono" 
                           placeholder="URL directa del logo (https://...)" 
                           value={settings['appearance_logo'] || ''} 
                           onChange={e => setSettings({ ...settings, appearance_logo: e.target.value })} 
                           onBlur={() => saveSetting('appearance_logo', settings['appearance_logo'] || '')} 
                         />
                      </div>
                   </div>
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2"><Palette className="w-5 h-5 text-pink-600" /> Esquema de Colores (Theme)</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Color Principal Global</label>
                   <p className="text-xs text-gray-500 mb-2">Se generarán 10 sombras automáticamente para botones, estilos, fondos activos, etc.</p>
                   <input type="color" className="p-1 h-12 w-full block bg-white border border-gray-200 cursor-pointer rounded-lg" value={settings['theme_color_primary'] || '#e74268'} onChange={e => setSettings({ ...settings, theme_color_primary: e.target.value })} onBlur={() => saveSetting('theme_color_primary', settings['theme_color_primary'] || '#e74268')} />
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2"><Palette className="w-5 h-5 text-purple-600" /> Franja Superior (Announcement)</h3>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Texto de la Franja</label>
                   <input className="form-input w-full" value={settings['appearance_announcement_text'] || ''} onChange={e => setSettings({ ...settings, appearance_announcement_text: e.target.value })} onBlur={() => saveSetting('appearance_announcement_text', settings['appearance_announcement_text'] || '')} placeholder="Envíos gratis sobre $4000..." />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Color de Fondo (Bg)</label>
                     <input type="color" className="p-1 h-10 w-full block bg-white border border-gray-200 cursor-pointer rounded-lg" value={settings['appearance_announcement_bg'] || '#000000'} onChange={e => setSettings({ ...settings, appearance_announcement_bg: e.target.value })} onBlur={() => saveSetting('appearance_announcement_bg', settings['appearance_announcement_bg'] || '#000000')} />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Color de Texto</label>
                     <input type="color" className="p-1 h-10 w-full block bg-white border border-gray-200 cursor-pointer rounded-lg" value={settings['appearance_announcement_color'] || '#ffffff'} onChange={e => setSettings({ ...settings, appearance_announcement_color: e.target.value })} onBlur={() => saveSetting('appearance_announcement_color', settings['appearance_announcement_color'] || '#ffffff')} />
                   </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">¿Animación Marquee?</label>
                     <select className="form-input w-full" value={settings['appearance_announcement_marquee'] || 'true'} onChange={e => { setSettings({ ...settings, appearance_announcement_marquee: e.target.value }); saveSetting('appearance_announcement_marquee', e.target.value); }}>
                        <option value="true">Desplazamiento Dinámico</option>
                        <option value="false">Texto Estático</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Velocidad (Segundos)</label>
                     <input type="number" className="form-input w-full" value={settings['appearance_announcement_speed'] || '20'} onChange={e => setSettings({ ...settings, appearance_announcement_speed: e.target.value })} onBlur={() => saveSetting('appearance_announcement_speed', settings['appearance_announcement_speed'] || '20')} placeholder="20" />
                   </div>
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2"><LayoutTemplate className="w-5 h-5 text-gray-600" /> Recursos Globales</h3>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">URL del Favicon (.ico o .png)</label>
                   <div className="flex gap-3">
                     <div className="w-10 h-10 bg-gray-100 border rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                       {settings['appearance_favicon'] ? <img src={settings['appearance_favicon']} className="w-6 h-6 object-contain" /> : <Palette className="w-4 h-4 text-gray-400" />}
                     </div>
                     <input className="form-input flex-1" placeholder="https://..." value={settings['appearance_favicon'] || ''} onChange={e => setSettings({ ...settings, appearance_favicon: e.target.value })} onBlur={() => saveSetting('appearance_favicon', settings['appearance_favicon'] || '')} />
                   </div>
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Inyecciones en &lt;head&gt; (Scripts Personalizados)</label>
                   <textarea rows={3} className="form-input font-mono text-xs w-full" placeholder="<!-- Meta tags o scripts -->" value={settings['appearance_head_code'] || ''} onChange={e => setSettings({ ...settings, appearance_head_code: e.target.value })} onBlur={() => saveSetting('appearance_head_code', settings['appearance_head_code'] || '')} />
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">Meta Ads Pixel ID <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] uppercase font-black">Marketing</span></label>
                   <input className="form-input font-mono text-sm w-full" placeholder="1234567890123456" value={settings['meta_pixel_id'] || ''} onChange={e => setSettings({ ...settings, meta_pixel_id: e.target.value })} onBlur={() => saveSetting('meta_pixel_id', settings['meta_pixel_id'] || '')} />
                   <p className="text-xs text-gray-500 mt-1">Ingresa únicamente los números del Pixel. Nosotros inyectaremos todo el código oficial de seguimiento (PageViews, View Content, y AddToCart).</p>
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
               <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> Widgets del Footer</h3>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">HTML Personalizado (Mapas, Sellos, Textos)</label>
                   <textarea rows={5} className="form-input font-mono text-xs w-full bg-indigo-50/30" placeholder="<iframe src='https://maps.google.com...'></iframe>" value={settings['appearance_footer_html'] || ''} onChange={e => setSettings({ ...settings, appearance_footer_html: e.target.value })} onBlur={() => saveSetting('appearance_footer_html', settings['appearance_footer_html'] || '')} />
                   <p className="text-xs text-gray-500 mt-1">Soporta HTML completo, iFrames de mapas y etiquetas de estilo.</p>
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Texto de Copyright Inferior</label>
                   <input className="form-input w-full" value={settings['appearance_footer_text'] || ''} onChange={e => setSettings({ ...settings, appearance_footer_text: e.target.value })} onBlur={() => saveSetting('appearance_footer_text', settings['appearance_footer_text'] || '')} placeholder="© 2026 Collectibles..." />
                 </div>
               </div>
            </div>
          </div>

          <div className="space-y-8">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm h-fit">
                <h3 className="font-bold text-lg border-b pb-4 mb-4 flex items-center gap-2"><LayoutTemplate className="w-5 h-5 text-blue-600" /> Constructor de Layout de Página (Home)</h3>
                <p className="text-sm text-gray-500 mb-6">Arrastra y suelta para reorganizar el orden en el que se muestran los bloques de la página de inicio. Oculta los que no necesites visualizar actualmente.</p>
                <HomeLayoutEditor 
                  title="Bloques Estructurales"
                  description="Pre-visualización de módulos"
                  initialJson={settings['appearance_home_layout_json']}
                  onSave={(val: string) => saveSetting('appearance_home_layout_json', val)}
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm h-fit">
                <h3 className="font-bold text-lg border-b pb-4 mb-6 flex items-center gap-2"><LayoutTemplate className="w-5 h-5 text-indigo-600" /> Editor Visual de Menús</h3>
                
                <div className="space-y-8">
                   <MenuEditor 
                     title="Menú de Navegación (Header)"
                     description="Enlaces principales. Soporta sub-elementos (desplegables)."
                     initialJson={settings['appearance_menu_json']}
                     onSave={(val: string) => saveSetting('appearance_menu_json', val)}
                   />

                   <div className="border-t border-gray-100 pt-8">
                     <MenuEditor 
                       title="Menú Secundario (Footer)"
                       description="Enlaces de pie de página para políticas, documentación, o categorías."
                       initialJson={settings['appearance_footer_menu_json']}
                       onSave={(val: string) => saveSetting('appearance_footer_menu_json', val)}
                     />
                   </div>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* Payment Gateways Settings */}
      {currentTab === 'payments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                 <div className="flex items-center justify-between border-b pb-4 mb-6">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-blue-50 rounded-lg">
                          <CreditCard className="w-5 h-5 text-blue-600" />
                       </div>
                       <div>
                          <h3 className="font-black text-dark-900">dLocal GO</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Pasarela Latam</p>
                       </div>
                    </div>
                    <button onClick={() => {
                        const next = settings['payments_dlocal_go_enabled'] !== 'true';
                        saveSetting('payments_dlocal_go_enabled', String(next));
                    }}>
                       {settings['payments_dlocal_go_enabled'] === 'true' 
                        ? <ToggleRight className="w-10 h-10 text-blue-600" /> 
                        : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                    </button>
                 </div>

                 <div className="space-y-4">
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">API Key / Public Key</label>
                       <input className="form-input w-full font-mono text-xs" value={settings['payments_dlocal_go_api_key'] || ''} onChange={e => setSettings({ ...settings, payments_dlocal_go_api_key: e.target.value })} onBlur={() => saveSetting('payments_dlocal_go_api_key', settings['payments_dlocal_go_api_key'] || '')} placeholder="pk_..." />
                    </div>
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Secret Key</label>
                       <input type="password" sx={{WebkitTextSecurity: 'disc'}} className="form-input w-full font-mono text-xs" value={settings['payments_dlocal_go_secret_key'] || ''} onChange={e => setSettings({ ...settings, payments_dlocal_go_secret_key: e.target.value })} onBlur={() => saveSetting('payments_dlocal_go_secret_key', settings['payments_dlocal_go_secret_key'] || '')} placeholder="sk_..." />
                    </div>
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">SmartFields API Key</label>
                       <input className="form-input w-full font-mono text-xs" value={settings['payments_dlocal_go_smartfields_key'] || ''} onChange={e => setSettings({ ...settings, payments_dlocal_go_smartfields_key: e.target.value })} onBlur={() => saveSetting('payments_dlocal_go_smartfields_key', settings['payments_dlocal_go_smartfields_key'] || '')} placeholder="652d..." />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${settings['payments_dlocal_go_sandbox'] === 'true' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                          <span className="text-xs font-bold text-gray-700">Entorno de Pruebas (Sandbox)</span>
                       </div>
                       <button onClick={() => {
                          const next = settings['payments_dlocal_go_sandbox'] !== 'true';
                          saveSetting('payments_dlocal_go_sandbox', String(next));
                       }}>
                          {settings['payments_dlocal_go_sandbox'] === 'true' ? <ToggleRight className="w-8 h-8 text-orange-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                       </button>
                    </div>
                 </div>
              </div>

              {/* CARD MERCADO PAGO */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                 <div className="flex items-center justify-between border-b pb-4 mb-6">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-sky-50 rounded-lg">
                          <CreditCard className="w-5 h-5 text-sky-600" />
                       </div>
                       <div>
                          <h3 className="font-black text-dark-900 flex items-center gap-2">Mercado Pago <span className="bg-sky-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-black">v2</span></h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Checkout API — Uruguay</p>
                       </div>
                    </div>
                    <button onClick={() => {
                        const next = settings['payments_mercadopago_enabled'] !== 'true';
                        saveSetting('payments_mercadopago_enabled', String(next));
                    }}>
                       {settings['payments_mercadopago_enabled'] === 'true' 
                        ? <ToggleRight className="w-10 h-10 text-sky-600" /> 
                        : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                    </button>
                 </div>

                 <div className="space-y-4">
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Access Token</label>
                       <input type="password" sx={{WebkitTextSecurity: 'disc'}} className="form-input w-full font-mono text-xs" value={settings['payments_mercadopago_access_token'] || ''} onChange={e => setSettings({ ...settings, payments_mercadopago_access_token: e.target.value })} onBlur={() => saveSetting('payments_mercadopago_access_token', settings['payments_mercadopago_access_token'] || '')} placeholder="APP_USR-..." />
                       <p className="text-[10px] text-gray-400 mt-1">Obtenlo en <a href="https://www.mercadopago.com.uy/developers/panel/app" target="_blank" className="text-sky-600 underline">Mercado Pago Developers</a>. Usá un token TEST- para sandbox.</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${(settings['payments_mercadopago_access_token'] || '').startsWith('TEST-') ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                          <span className="text-xs font-bold text-gray-700">
                            {(settings['payments_mercadopago_access_token'] || '').startsWith('TEST-') ? 'Modo Sandbox (Test)' : 'Modo Producción'}
                          </span>
                       </div>
                       <span className="text-[10px] text-gray-400 font-bold">Detectado automáticamente por el token</span>
                    </div>
                 </div>
              </div>

              <div className="bg-blue-600 rounded-xl p-6 text-white shadow-xl shadow-blue-200">
                 <h4 className="font-black text-lg flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5" />
                    Transacciones Seguras
                 </h4>
                 <p className="text-xs text-blue-100 leading-relaxed font-medium">Todas las conexiones con las pasarelas se realizan mediante HTTPS y cifrado de extremo a extremo. Asegúrate de nunca compartir tus llaves secretas.</p>
              </div>
           </div>

           <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                 <div className="flex items-center justify-between border-b pb-4 mb-6">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-indigo-50 rounded-lg">
                          <CreditCard className="w-5 h-5 text-indigo-600" />
                       </div>
                       <div>
                          <h3 className="font-black text-dark-900">PayPal Express</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Global Checkout</p>
                       </div>
                    </div>
                    <button onClick={() => {
                        const next = settings['payments_paypal_enabled'] !== 'true';
                        saveSetting('payments_paypal_enabled', String(next));
                    }}>
                       {settings['payments_paypal_enabled'] === 'true' 
                        ? <ToggleRight className="w-10 h-10 text-indigo-600" /> 
                        : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                    </button>
                 </div>

                 <div className="space-y-4">
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Client ID</label>
                       <input className="form-input w-full font-mono text-xs" value={settings['payments_paypal_client_id'] || ''} onChange={e => setSettings({ ...settings, payments_paypal_client_id: e.target.value })} onBlur={() => saveSetting('payments_paypal_client_id', settings['payments_paypal_client_id'] || '')} placeholder="Ady..." />
                    </div>
                    <div>
                       <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Secret Key</label>
                       <input type="password" sx={{WebkitTextSecurity: 'disc'}} className="form-input w-full font-mono text-xs" value={settings['payments_paypal_secret_key'] || ''} onChange={e => setSettings({ ...settings, payments_paypal_secret_key: e.target.value })} onBlur={() => saveSetting('payments_paypal_secret_key', settings['payments_paypal_secret_key'] || '')} placeholder="EKj..." />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${settings['payments_paypal_sandbox'] === 'true' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                          <span className="text-xs font-bold text-gray-700">Entorno de Pruebas (Sandbox)</span>
                       </div>
                       <button onClick={() => {
                          const next = settings['payments_paypal_sandbox'] !== 'true';
                          saveSetting('payments_paypal_sandbox', String(next));
                       }}>
                          {settings['payments_paypal_sandbox'] === 'true' ? <ToggleRight className="w-8 h-8 text-orange-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
      
      {/* Modules Settings */}
      {currentTab === 'modules' && (
        <div className="space-y-3 max-w-2xl">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4">
             <h4 className="font-bold text-blue-900">Controladores de Arquitectura Modular</h4>
             <p className="text-sm text-blue-700 mt-1">Apaga o enciende secciones completas de la plataforma. Los cambios tienen efecto inmediato en la carga de vistas.</p>
          </div>
          {toggles.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
              <div>
                <h4 className="font-bold text-gray-900">{t.name}</h4>
                <p className="text-sm text-gray-500">{t.description}</p>
              </div>
              <button onClick={() => toggleModule(t.id, t.is_enabled)} className="p-1 hover:scale-105 transition-transform">
                {t.is_enabled
                  ? <ToggleRight className="w-10 h-10 text-green-500 drop-shadow-sm" />
                  : <ToggleLeft className="w-10 h-10 text-gray-300" />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shipping Rules */}
      {currentTab === 'shipping' && (
        <div className="space-y-6 max-w-3xl">
          {/* SoyDelivery Integration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
             <div className="flex items-center justify-between border-b pb-4 mb-6">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-purple-50 rounded-lg">
                      <Truck className="w-5 h-5 text-purple-600" />
                   </div>
                   <div>
                      <h3 className="font-black text-dark-900 flex items-center gap-2">SoyDelivery <span className="bg-purple-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-black">API v2</span></h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Logística Urbana</p>
                   </div>
                </div>
                <button onClick={() => {
                    const next = settings['shipping_soydelivery_enabled'] !== 'true';
                    saveSetting('shipping_soydelivery_enabled', String(next));
                }}>
                   {settings['shipping_soydelivery_enabled'] === 'true' 
                    ? <ToggleRight className="w-10 h-10 text-purple-600" /> 
                    : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                </button>
             </div>

             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">API Id</label>
                     <input className="form-input w-full font-mono text-xs" value={settings['shipping_soydelivery_api_id'] || ''} onChange={e => setSettings({ ...settings, shipping_soydelivery_api_id: e.target.value })} onBlur={() => saveSetting('shipping_soydelivery_api_id', settings['shipping_soydelivery_api_id'] || '')} placeholder="2659..." />
                  </div>
                  <div>
                     <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">API Key</label>
                     <input type="password" sx={{WebkitTextSecurity: 'disc'}} className="form-input w-full font-mono text-xs" value={settings['shipping_soydelivery_api_key'] || ''} onChange={e => setSettings({ ...settings, shipping_soydelivery_api_key: e.target.value })} onBlur={() => saveSetting('shipping_soydelivery_api_key', settings['shipping_soydelivery_api_key'] || '')} placeholder="8IZpb..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Negocio ID</label>
                     <input className="form-input w-full font-mono text-xs" value={settings['shipping_soydelivery_negocio_id'] || ''} onChange={e => setSettings({ ...settings, shipping_soydelivery_negocio_id: e.target.value })} onBlur={() => saveSetting('shipping_soydelivery_negocio_id', settings['shipping_soydelivery_negocio_id'] || '')} placeholder="1950..." />
                  </div>
                  <div>
                     <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Negocio Clave</label>
                     <input type="password" sx={{WebkitTextSecurity: 'disc'}} className="form-input w-full font-mono text-xs" value={settings['shipping_soydelivery_negocio_clave'] || ''} onChange={e => setSettings({ ...settings, shipping_soydelivery_negocio_clave: e.target.value })} onBlur={() => saveSetting('shipping_soydelivery_negocio_clave', settings['shipping_soydelivery_negocio_clave'] || '')} placeholder="1234..." />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between mt-4">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${settings['shipping_soydelivery_sandbox'] === 'true' ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                      <span className="text-xs font-bold text-gray-700">Entorno de Pruebas (Testing)</span>
                   </div>
                   <button onClick={() => {
                      const next = settings['shipping_soydelivery_sandbox'] !== 'true';
                      saveSetting('shipping_soydelivery_sandbox', String(next));
                   }}>
                      {settings['shipping_soydelivery_sandbox'] === 'true' ? <ToggleRight className="w-8 h-8 text-orange-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                   </button>
                </div>
             </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-gray-50">
               <h3 className="font-bold text-gray-900">Zonas de Envío Logístico Estáticas</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Zona</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Tarifa</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Gratis superando</th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shipping.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 capitalize">{s.name}</td>
                    <td className="px-6 py-4 text-sm font-black text-blue-600">${s.rate}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{s.free_above ? `$${s.free_above}` : '—'}</td>
                    <td className="px-6 py-4"><span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${s.is_active ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>{s.is_active ? 'Activa' : 'Inactiva'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Social Media Links */}
      {currentTab === 'social' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-3xl shadow-sm">
           <h3 className="font-bold text-lg border-b pb-4 mb-6 flex items-center gap-2">
             <Share2 className="w-5 h-5 text-indigo-600" /> Presencia en Redes Sociales
           </h3>
           <p className="text-sm text-gray-500 mb-6">Activa y vincula las plataformas donde los clientes puedan encontrarte. Si una red está desactivada, no se mostrará en los banners ni en el pie de página de la tienda.</p>
           
           <div className="space-y-4">
             {[
                { key: 'instagram', label: 'Instagram', prefix: 'instagram.com/', placeholder: 'usuario' },
                { key: 'facebook', label: 'Facebook', prefix: 'facebook.com/', placeholder: 'usuario' },
                { key: 'tiktok', label: 'TikTok', prefix: 'tiktok.com/@', placeholder: 'usuario' },
                { key: 'whatsapp', label: 'WhatsApp', prefix: 'wa.me/', placeholder: '59800000000' },
                { key: 'youtube', label: 'YouTube', prefix: 'youtube.com/c/', placeholder: 'usuario' },
                { key: 'x', label: 'X (Twitter)', prefix: 'x.com/', placeholder: 'usuario' }
             ].map(social => {
                const isActive = settings[`social_${social.key}_enabled`] === 'true';
                const url = settings[`social_${social.key}_url`] || '';
                return (
                  <div key={social.key} className={`border border-gray-200 rounded-xl p-4 transition-all ${isActive ? 'bg-indigo-50/30' : 'bg-gray-50/50'}`}>
                    <div className="flex items-center gap-4">
                      <button onClick={() => {
                        const next = !isActive;
                        setSettings({ ...settings, [`social_${social.key}_enabled`]: String(next) });
                        saveSetting(`social_${social.key}_enabled`, String(next));
                      }} className="flex-shrink-0 hover:scale-105 transition-transform">
                        {isActive 
                          ? <ToggleRight className="w-10 h-10 text-indigo-500" /> 
                          : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                      </button>
                      <div className="w-32 flex-shrink-0">
                         <span className={`font-bold ${isActive ? 'text-indigo-900' : 'text-gray-500'}`}>{social.label}</span>
                      </div>
                       <div className={`flex items-center w-full bg-white border border-gray-200 rounded-lg overflow-hidden ${!isActive ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}>
                           <div className="bg-gray-50 px-3 py-2 border-r border-gray-200 text-xs font-mono text-gray-500 flex-shrink-0">
                               https://{social.prefix}
                           </div>
                           <input 
                               disabled={!isActive}
                               className={`flex-1 min-w-0 border-none outline-none focus:ring-0 text-sm px-3 py-2 bg-transparent`}
                               placeholder={social.placeholder}
                               value={url}
                               onChange={e => setSettings({ ...settings, [`social_${social.key}_url`]: e.target.value })}
                               onBlur={() => saveSetting(`social_${social.key}_url`, url)}
                           />
                       </div>
                    </div>
                  </div>
                );
             })}
           </div>
        </div>
      )}

      {/* AI Assistance Panel */}
      {currentTab === 'ai' && (
        <div className="space-y-8 max-w-4xl">
          <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-2xl shadow-purple-200 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
             <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
             <div className="relative z-10">
               <div className="flex items-center gap-3 mb-3">
                 <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm"><Brain className="w-7 h-7" /></div>
                 <div>
                   <h3 className="font-black text-2xl tracking-tight">Centro de Asistencia IA</h3>
                   <p className="text-purple-200 text-sm font-medium">Gestiona todas las herramientas inteligentes de la plataforma</p>
                 </div>
               </div>
               <p className="text-sm text-purple-100 leading-relaxed max-w-2xl mt-4">Activa o desactiva las funcionalidades de IA que consumen tokens de API (Google Gemini). Cada herramienta puede controlarse independientemente.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { key: 'ai_category_matching_enabled', title: 'Category Matching Engine', badge: 'Import', color: 'amber', icon: Tag, desc: 'Al importar desde Mercado Libre, la IA clasifica el producto en la categoría interna más adecuada.', hint: 'Enviamos título + categorías a Gemini para clasificación automática.', cost: '~1 token/producto' },
              { key: 'ai_catalog_generator_enabled', title: 'AI Catalog Generator', badge: 'Contenido', color: 'purple', icon: Sparkles, desc: 'Genera títulos y descripciones optimizadas para ventas y SEO en lote.', hint: 'Acceso: Productos → AI Catalog Generator o botón "Mejorar con IA".', cost: '~2-5 tokens/producto' },
              { key: 'ai_seo_enabled', title: 'Auto-SEO con IA', badge: 'SEO', color: 'green', icon: SearchIcon, desc: 'Genera meta títulos y descripciones para Google al crear o editar productos.', hint: 'Sincronizado con SEO → Metadatos Globales.', cost: '~1 token/producto' },
              { key: 'ai_description_improver_enabled', title: 'Mejorar Descripción con IA', badge: 'Editor', color: 'blue', icon: FileText, desc: 'Botón "Mejorar con IA" en el editor de producto. Reescribe con tono profesional.', hint: 'Productos → Editar → Botón ✦ Mejorar con IA.', cost: '~3-5 tokens/mejora' },
            ].map(tool => (
              <div key={tool.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 bg-${tool.color}-50 rounded-xl`}><tool.icon className={`w-5 h-5 text-${tool.color}-600`} /></div>
                      <div>
                        <h4 className="font-black text-gray-900">{tool.title}</h4>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-${tool.color}-100 text-${tool.color}-700`}>{tool.badge}</span>
                      </div>
                    </div>
                    <button onClick={() => { const next = settings[tool.key] !== 'true'; saveSetting(tool.key, String(next)); }}>
                      {settings[tool.key] === 'true' ? <ToggleRight className={`w-10 h-10 text-${tool.color}-500`} /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{tool.desc}</p>
                  <div className={`mt-4 p-3 bg-${tool.color}-50 rounded-lg border border-${tool.color}-100`}>
                    <p className={`text-[11px] text-${tool.color}-800 font-medium`}>{tool.hint}</p>
                  </div>
                </div>
                <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-400 flex items-center gap-1.5"><Zap className="w-3 h-3" /> Consumo: {tool.cost}</div>
              </div>
            ))}
          </div>
          {/* API Key Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="font-bold text-lg flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-indigo-600" /> Configuración de API</h3>
              <p className="text-sm text-gray-500">Configura tu clave de Google Gemini para habilitar todas las herramientas de IA.</p>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Google Gemini API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={settings['_show_api_key'] === 'true' ? 'text' : 'password'}
                      className="form-input w-full font-mono text-sm pr-20"
                      placeholder="AIza..."
                      value={settings['gemini_api_key_display'] || ''}
                      onChange={e => setSettings({ ...settings, gemini_api_key_display: e.target.value })}
                      onBlur={e => { if (e.target.value) saveSetting('gemini_api_key_display', e.target.value); }}
                    />
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, _show_api_key: prev._show_api_key === 'true' ? 'false' : 'true' }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1 rounded"
                    >
                      {settings['_show_api_key'] === 'true' ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      const key = settings['gemini_api_key_display'];
                      if (!key) { alert('Ingresa una API Key'); return; }
                      try {
                        const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                        if (testRes.ok) {
                          saveSetting('gemini_api_key_display', key);
                          saveSetting('gemini_api_key_status', 'active');
                          alert('✅ API Key válida y guardada');
                        } else {
                          saveSetting('gemini_api_key_status', 'invalid');
                          alert('❌ API Key inválida. Verifica la clave.');
                        }
                      } catch { alert('Error al verificar la clave'); }
                    }}
                    className="btn-primary bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-sm px-4 whitespace-nowrap"
                  >
                    Verificar y Guardar
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Esta clave se usa localmente para verificar. La clave de producción se configura en Supabase → Edge Functions → Secrets como <code className="bg-gray-100 px-1 rounded">GEMINI_API_KEY</code>.</p>
              </div>

              {/* Status */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${settings['gemini_api_key_status'] === 'active' ? 'bg-green-50 border-green-200' : settings['gemini_api_key_status'] === 'invalid' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-3 h-3 rounded-full ${settings['gemini_api_key_status'] === 'active' ? 'bg-green-500 animate-pulse' : settings['gemini_api_key_status'] === 'invalid' ? 'bg-red-500' : 'bg-gray-300'}`} />
                <div>
                  <p className={`text-sm font-bold ${settings['gemini_api_key_status'] === 'active' ? 'text-green-800' : settings['gemini_api_key_status'] === 'invalid' ? 'text-red-800' : 'text-gray-600'}`}>
                    {settings['gemini_api_key_status'] === 'active' ? 'API Activa ✓' : settings['gemini_api_key_status'] === 'invalid' ? 'API Key Inválida' : 'No configurada'}
                  </p>
                  <p className="text-xs text-gray-500">Modelo: Gemini 2.0 Flash · Proveedor: Google AI</p>
                </div>
              </div>
            </div>
          </div>

          {/* Token Usage & Cost Tracker */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Uso de Tokens y Costos</h3>
                <p className="text-sm text-gray-500 mt-0.5">Seguimiento del consumo de IA en la plataforma</p>
              </div>
              <select
                className="form-input text-sm font-bold w-auto"
                value={settings['_ai_usage_period'] || '30'}
                onChange={e => setSettings(prev => ({ ...prev, _ai_usage_period: e.target.value }))}
              >
                <option value="1">Hoy</option>
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="all">Todo el historial</option>
              </select>
            </div>
            <AiUsageStats period={settings['_ai_usage_period'] || '30'} />
          </div>
        </div>
      )}
      <MediaPickerModal 
        isOpen={showMediaPicker !== false}
        onClose={() => setShowMediaPicker(false)}
        onSelect={(url) => {
          if (showMediaPicker === "logo") {
            saveSetting("appearance_logo", url);
          }
          setShowMediaPicker(false);
        }}
      />
    </div>
  );
}
