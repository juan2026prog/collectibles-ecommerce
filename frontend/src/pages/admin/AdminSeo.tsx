import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Globe, Save, RefreshCw, FileText, Code, ExternalLink, CheckCircle2 } from 'lucide-react';

export default function AdminSeo() {
  const [products, setProducts] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'global' | 'products' | 'pages' | 'sitemap'>('global');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: s }, { data: prods }, { data: pgs }] = await Promise.all([
      supabase.from('site_settings').select('*'),
      supabase.from('products').select('id, title, slug, meta_title, meta_description, status').order('title').limit(50),
      supabase.from('pages').select('id, title, slug, meta_title, meta_description, status').order('title'),
    ]);
    const settingsMap: Record<string, string> = {};
    (s || []).forEach(item => { settingsMap[item.key] = item.value || ''; });
    setSettings(settingsMap);
    setProducts(prods || []);
    setPages(pgs || []);
    setLoading(false);
  }

  async function saveSetting(key: string, value: string) {
    await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function updateProductSeo(id: string, field: string, value: string) {
    await supabase.from('products').update({ [field]: value }).eq('id', id);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  async function updatePageSeo(id: string, field: string, value: string) {
    await supabase.from('pages').update({ [field]: value }).eq('id', id);
    setPages(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function generateSitemap() {
    const baseUrl = settings['seo_site_url'] || 'https://collectibles.uy';
    const urls = [
      `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>`,
      `  <url><loc>${baseUrl}/shop</loc><priority>0.9</priority></url>`,
      ...products.filter(p => p.status === 'active').map(p => `  <url><loc>${baseUrl}/p/${p.slug}</loc><priority>0.8</priority></url>`),
      ...pages.filter(p => p.status === 'published').map(p => `  <url><loc>${baseUrl}/page/${p.slug}</loc><priority>0.6</priority></url>`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sitemap.xml'; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-center py-12 text-gray-400 animate-pulse">Cargando SEO...</div>;

  const seoScore = () => {
    let score = 0, total = 0;
    // Check global settings
    if (settings['seo_site_title']) score++; total++;
    if (settings['seo_site_description']) score++; total++;
    if (settings['seo_site_url']) score++; total++;
    // Check products have meta
    products.forEach(p => { if (p.meta_title) score++; if (p.meta_description) score++; total += 2; });
    pages.forEach(p => { if (p.meta_title) score++; if (p.meta_description) score++; total += 2; });
    return total > 0 ? Math.round((score / total) * 100) : 0;
  };

  const score = seoScore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Search className="w-6 h-6 text-primary-600" /> SEO & Metadatos</h2>
          <p className="text-sm text-gray-500 mt-1">Optimiza cada página, producto y metadato para motores de búsqueda</p>
        </div>
        <div className="flex gap-2 items-center">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <div className={`px-4 py-2 rounded-xl font-black text-sm ${score >= 75 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            SEO Score: {score}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'global', label: 'Global', icon: Globe },
          { key: 'products', label: `Productos (${products.length})`, icon: FileText },
          { key: 'pages', label: `Páginas (${pages.length})`, icon: FileText },
          { key: 'sitemap', label: 'Sitemap', icon: Code },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors ${tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Global SEO */}
      {tab === 'global' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 max-w-2xl shadow-sm">
          <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2"><Globe className="w-5 h-5 text-blue-600" /> Metadatos Globales</h3>
          {[
            { key: 'ai_seo_enabled', label: 'Habilitar Auto-Generación AI (Gemini) en Productos Nuevos', placeholder: 'true o false (por defecto: false)', type: 'boolean' },
            { key: 'seo_site_title', label: 'Título del Sitio (Title Tag)', placeholder: 'Collectibles - Premium Collectibles Store' },
            { key: 'seo_site_description', label: 'Descripción del Sitio (Meta Description)', placeholder: 'Tienda de coleccionables premium. Funko Pop, figuras, manga y más.', textarea: true },
            { key: 'seo_site_url', label: 'URL Canónica del Sitio', placeholder: 'https://collectibles.uy' },
            { key: 'seo_og_image', label: 'Imagen Open Graph (og:image)', placeholder: 'https://collectibles.uy/og-image.jpg' },
            { key: 'seo_google_verification', label: 'Google Verification Code', placeholder: 'google-site-verification=...' },
            { key: 'seo_robots_txt', label: 'Robots.txt personalizado', placeholder: 'User-agent: *\nAllow: /', textarea: true },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{field.label}</label>
              {field.type === 'boolean' ? (
                 <select className="form-input w-full text-sm font-bold"
                   value={settings[field.key] || 'false'}
                   onChange={e => setSettings({ ...settings, [field.key]: e.target.value })}
                   onBlur={e => saveSetting(field.key, e.target.value)}>
                   <option value="true">Activado (Consume API)</option>
                   <option value="false">Desactivado (Manual)</option>
                 </select>
              ) : field.textarea ? (
                <textarea rows={3} className="form-input w-full font-mono text-xs"
                  value={settings[field.key] || ''} onChange={e => setSettings({ ...settings, [field.key]: e.target.value })}
                  onBlur={() => saveSetting(field.key, settings[field.key] || '')} placeholder={field.placeholder} />
              ) : (
                <input className="form-input w-full"
                  value={settings[field.key] || ''} onChange={e => setSettings({ ...settings, [field.key]: e.target.value })}
                  onBlur={() => saveSetting(field.key, settings[field.key] || '')} placeholder={field.placeholder} />
              )}
            </div>
          ))}

          {/* Schema.org Preview */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Schema.org JSON-LD Preview</h4>
            <pre className="text-xs font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap">{JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Store",
              "name": settings['seo_site_title'] || settings['store_name'] || 'Collectibles',
              "description": settings['seo_site_description'] || '',
              "url": settings['seo_site_url'] || '',
              "image": settings['seo_og_image'] || '',
            }, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Products SEO */}
      {tab === 'products' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Producto</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Meta Title</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Meta Description</th>
                  <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3">
                      <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{p.title}</p>
                      <p className="text-xs text-gray-400 font-mono">/p/{p.slug}</p>
                    </td>
                    <td className="px-6 py-3">
                      <input className="form-input text-xs w-full min-w-[200px]" value={p.meta_title || ''} placeholder={p.title}
                        onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, meta_title: e.target.value } : x))}
                        onBlur={e => updateProductSeo(p.id, 'meta_title', e.target.value)} />
                    </td>
                    <td className="px-6 py-3">
                      <input className="form-input text-xs w-full min-w-[250px]" value={p.meta_description || ''} placeholder="Descripción corta para buscadores..."
                        onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, meta_description: e.target.value } : x))}
                        onBlur={e => updateProductSeo(p.id, 'meta_description', e.target.value)} />
                    </td>
                    <td className="px-6 py-3 text-center">
                      {(p.meta_title && p.meta_description) ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">Incompleto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pages SEO */}
      {tab === 'pages' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {pages.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No hay páginas estáticas creadas aún.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Página</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Meta Title</th>
                    <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Meta Description</th>
                    <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pages.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3">
                        <p className="text-sm font-bold text-gray-900">{p.title}</p>
                        <p className="text-xs text-gray-400 font-mono">/page/{p.slug}</p>
                      </td>
                      <td className="px-6 py-3">
                        <input className="form-input text-xs w-full min-w-[200px]" value={p.meta_title || ''} placeholder={p.title}
                          onChange={e => setPages(prev => prev.map(x => x.id === p.id ? { ...x, meta_title: e.target.value } : x))}
                          onBlur={e => updatePageSeo(p.id, 'meta_title', e.target.value)} />
                      </td>
                      <td className="px-6 py-3">
                        <input className="form-input text-xs w-full min-w-[250px]" value={p.meta_description || ''} placeholder="Descripción..."
                          onChange={e => setPages(prev => prev.map(x => x.id === p.id ? { ...x, meta_description: e.target.value } : x))}
                          onBlur={e => updatePageSeo(p.id, 'meta_description', e.target.value)} />
                      </td>
                      <td className="px-6 py-3 text-center">
                        {(p.meta_title && p.meta_description) ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">Incompleto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sitemap */}
      {tab === 'sitemap' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-2xl space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Code className="w-5 h-5 text-gray-600" /> Generador de Sitemap XML</h3>
          <p className="text-sm text-gray-500">Genera un archivo sitemap.xml con todas las URLs activas de tu tienda para enviar a Google Search Console.</p>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-700">
              <strong>{products.filter(p => p.status === 'active').length}</strong> productos activos + 
              <strong> {pages.filter(p => p.status === 'published').length}</strong> páginas publicadas + 
              <strong> 2</strong> rutas fijas (Home, Shop)
            </p>
          </div>
          <button onClick={generateSitemap} className="btn-primary flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Descargar sitemap.xml
          </button>
        </div>
      )}
    </div>
  );
}
