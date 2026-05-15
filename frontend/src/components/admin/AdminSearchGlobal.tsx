import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Users, FileText, ShoppingBag, Settings, X, ArrowRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// AdminSearchGlobal — Ctrl+K / Cmd+K global search
// Usage: <AdminSearchGlobal /> — placed in AdminLayout
// ═══════════════════════════════════════════════════════════

const ADMIN_ROUTES = [
  { path: '/admin', label: 'Dashboard', icon: Settings, keywords: ['inicio', 'dashboard', 'panel'] },
  { path: '/admin/products', label: 'Productos', icon: Package, keywords: ['productos', 'catalogo', 'stock'] },
  { path: '/admin/orders', label: 'Órdenes', icon: ShoppingBag, keywords: ['ordenes', 'pedidos', 'ventas'] },
  { path: '/admin/customers', label: 'Clientes', icon: Users, keywords: ['clientes', 'crm', 'usuarios'] },
  { path: '/admin/categories', label: 'Categorías', icon: FileText, keywords: ['categorias'] },
  { path: '/admin/coupons', label: 'Cupones', icon: FileText, keywords: ['cupones', 'descuentos'] },
  { path: '/admin/banners', label: 'Banners', icon: FileText, keywords: ['banners', 'sliders'] },
  { path: '/admin/brands', label: 'Marcas', icon: FileText, keywords: ['marcas', 'brands'] },
  { path: '/admin/promotions', label: 'Promociones', icon: FileText, keywords: ['promociones', 'ofertas'] },
  { path: '/admin/affiliates', label: 'Afiliados', icon: Users, keywords: ['afiliados', 'referidos'] },
  { path: '/admin/mailing', label: 'Email Marketing', icon: FileText, keywords: ['email', 'mailing', 'newsletters'] },
  { path: '/admin/mercadolibre', label: 'Mercado Libre', icon: FileText, keywords: ['mercadolibre', 'ml', 'sincronizacion'] },
  { path: '/admin/reports', label: 'Reportes', icon: FileText, keywords: ['reportes', 'analytics', 'estadisticas'] },
  { path: '/admin/seo', label: 'SEO', icon: FileText, keywords: ['seo', 'meta', 'google'] },
  { path: '/admin/media', label: 'Media', icon: FileText, keywords: ['media', 'imagenes', 'archivos'] },
  { path: '/admin/settings', label: 'Configuración', icon: Settings, keywords: ['configuracion', 'settings', 'ajustes'] },
  { path: '/admin/users', label: 'Usuarios', icon: Users, keywords: ['usuarios', 'admins'] },
  { path: '/admin/finances', label: 'Finanzas', icon: FileText, keywords: ['finanzas', 'facturacion'] },
  { path: '/admin/logistics', label: 'Logística', icon: FileText, keywords: ['logistica', 'envios', 'shipping'] },
  { path: '/admin/tags', label: 'Etiquetas', icon: FileText, keywords: ['etiquetas', 'tags'] },
];

export default function AdminSearchGlobal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const results = ADMIN_ROUTES.filter(r => {
    const q = query.toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q) || r.keywords.some(k => k.includes(q));
  });

  const handleSelect = useCallback((path: string) => {
    navigate(path);
    setIsOpen(false);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx].path);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9990]" onClick={() => setIsOpen(false)} />
      <div className="fixed inset-x-0 top-[15vh] z-[9991] flex justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar en el admin..."
              className="flex-1 text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">ESC</kbd>
          </div>

          <div className="max-h-[50vh] overflow-y-auto py-2">
            {results.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Sin resultados para "{query}"</p>
            ) : (
              results.map((r, i) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.path}
                    onClick={() => handleSelect(r.path)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                      i === selectedIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 opacity-60" />
                    <span className="text-sm font-medium flex-1">{r.label}</span>
                    {i === selectedIdx && <ArrowRight className="w-4 h-4 opacity-40" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <span>↑↓ para navegar · Enter para seleccionar</span>
            <span>Ctrl+K para abrir</span>
          </div>
        </div>
      </div>
    </>
  );
}
