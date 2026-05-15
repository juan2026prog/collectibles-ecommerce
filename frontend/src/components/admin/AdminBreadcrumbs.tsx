import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// AdminBreadcrumbs — automatic breadcrumb navigation
// Usage:
//   <AdminBreadcrumbs /> // auto-detects path
//   <AdminBreadcrumbs items={[{label: 'Pedidos', href: '/admin/orders'}, {label: '#ABC123'}]} />
// ═══════════════════════════════════════════════════════════

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  'admin': 'Admin',
  'products': 'Productos',
  'orders': 'Órdenes',
  'customers': 'Clientes',
  'categories': 'Categorías',
  'coupons': 'Cupones',
  'banners': 'Banners',
  'brands': 'Marcas',
  'groups': 'Grupos',
  'badges': 'Insignias',
  'promotions': 'Promociones',
  'affiliates': 'Afiliados',
  'mailing': 'Email Marketing',
  'mercadolibre': 'Mercado Libre',
  'reports': 'Reportes',
  'seo': 'SEO',
  'media': 'Media',
  'settings': 'Configuración',
  'users': 'Usuarios',
  'finances': 'Finanzas',
  'logistics': 'Logística',
  'artists': 'Artistas',
  'tags': 'Etiquetas',
  'pages': 'Páginas',
};

export default function AdminBreadcrumbs({ items }: { items?: BreadcrumbItem[] }) {
  const location = useLocation();

  const crumbs: BreadcrumbItem[] = items || (() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const result: BreadcrumbItem[] = [];
    let path = '';
    
    for (const segment of segments) {
      path += `/${segment}`;
      result.push({
        label: ROUTE_LABELS[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
        href: path,
      });
    }
    return result;
  })();

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-4" aria-label="Breadcrumb">
      <Link to="/admin" className="hover:text-gray-600 transition-colors p-1">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.slice(1).map((crumb, i) => {
        const isLast = i === crumbs.length - 2;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-gray-300" />
            {isLast || !crumb.href ? (
              <span className="text-gray-700 font-bold">{crumb.label}</span>
            ) : (
              <Link to={crumb.href} className="hover:text-gray-600 transition-colors">
                {crumb.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
