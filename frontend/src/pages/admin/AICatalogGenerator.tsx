import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Sparkles, Loader2, Check, AlertCircle, Wand2, RefreshCw, Copy } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
}

export default function AICatalogGenerator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<Record<string, { title: string; description: string }>>({});
  const [vendorTone, setVendorTone] = useState('Professional and persuasive, focusing on FOMO and rarity');
  const [bulkMode, setBulkMode] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, title, description, short_description')
      .order('created_at', { ascending: false })
      .limit(50);
    setProducts(data || []);
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  }

  async function generateContent(productId: string, rawText: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-catalog-generator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ productId, rawText, vendorTone })
      });
      const result = await response.json();
      if (result.success) {
        return result.optimizedContent;
      }
      throw new Error(result.error);
    } catch (err) {
      console.error('Generation error:', err);
      return null;
    }
  }

  async function generateForSelected() {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    const newResults: Record<string, { title: string; description: string }> = {};

    for (const id of selectedIds) {
      const product = products.find(p => p.id === id);
      if (!product) continue;

      const rawText = product.short_description || product.description || product.title;
      const content = await generateContent(id, rawText);
      
      if (content) {
        newResults[id] = content;
        setResults(prev => ({ ...prev, [id]: content }));
      }
    }

    setGenerating(false);
  }

  async function applyToProduct(productId: string) {
    const result = results[productId];
    if (!result) return;

    await supabase.from('products').update({
      title: result.title,
      description: result.description
    }).eq('id', productId);

    setResults(prev => {
      const { [productId]: _, ...rest } = prev;
      return rest;
    });
    setSelectedIds(prev => prev.filter(id => id !== productId));
  }

  async function applyAll() {
    for (const id of selectedIds) {
      await applyToProduct(id);
    }
    fetchProducts();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-500" />
            AI Catalog Generator
          </h2>
          <p className="text-gray-500 mt-1">Genera títulos y descripciones optimizadas para SEO usando IA.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input 
              type="checkbox" 
              checked={bulkMode}
              onChange={e => setBulkMode(e.target.checked)}
              className="rounded border-gray-300"
            />
            Modo Masivo
          </label>
        </div>
      </div>

      {/* Tone Settings */}
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="font-bold text-lg mb-4">Configuración de Tono</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Tono del Vendedor</label>
            <select 
              className="form-input w-full"
              value={vendorTone}
              onChange={e => setVendorTone(e.target.value)}
            >
              <option value="Professional and persuasive, focusing on FOMO and rarity">Profesional y Persuasivo (FOMO)</option>
              <option value="Friendly and casual, perfect for collectibles community">Amigable y Casual</option>
              <option value="Luxury and premium, targeting high-end collectors">Lujo y Premium</option>
              <option value="Educational and informative">Educativo e Informativo</option>
            </select>
          </div>
          <div className="flex items-end">
            <button 
              onClick={generateForSelected}
              disabled={generating || selectedIds.length === 0}
              className="btn-primary bg-yellow-500 border-yellow-500 hover:bg-yellow-600 text-blue-900 flex items-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generating ? 'Generando...' : `Generar (${selectedIds.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* Results Preview */}
      {Object.keys(results).length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            Contenido Generado ({Object.keys(results).length})
          </h3>
          <div className="flex gap-3 mb-4">
            <button onClick={applyAll} className="btn-primary bg-green-600 border-green-600 hover:bg-green-700">
              Aplicar Todo
            </button>
          </div>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {Object.entries(results).map(([id, content]) => {
              const product = products.find(p => p.id === id);
              return (
                <div key={id} className="bg-white p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-900">{product?.title}</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { navigator.clipboard.writeText(content.description); }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Copiar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => applyToProduct(id)}
                        className="text-sm text-green-600 font-medium hover:underline"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-3">{content.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg">Productos ({products.length})</h3>
          <button onClick={toggleAll} className="text-sm text-primary-600 font-medium hover:underline">
            {selectedIds.length === products.length ? 'Deseleccionar Todo' : 'Seleccionar Todo'}
          </button>
        </div>
        <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
          {products.map(product => (
            <div 
              key={product.id} 
              className={`p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${
                selectedIds.includes(product.id) ? 'bg-primary-50/50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(product.id)}
                onChange={() => toggleSelect(product.id)}
                className="mt-1 rounded border-gray-300"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{product.title}</p>
                <p className="text-sm text-gray-500 line-clamp-1">
                  {product.short_description || product.description || 'Sin descripción'}
                </p>
              </div>
              {results[product.id] && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                  Generado
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
