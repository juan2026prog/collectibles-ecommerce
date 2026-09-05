import type { ReleasePrecision, ReleaseStatus } from '../types';

export function formatReleaseDatePrecision(
  precision: ReleasePrecision,
  dateStart?: string | null,
  customText?: string | null
): string {
  if (customText && customText.trim()) return customText.trim();
  if (!dateStart) return 'TBA (Por anunciarse)';

  const d = new Date(dateStart);
  if (isNaN(d.getTime())) return 'TBA';

  const year = d.getFullYear();
  const month = d.getMonth(); // 0 to 11

  switch (precision) {
    case 'EXACT_DATE':
      return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' });
    case 'MONTH': {
      const monthName = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }
    case 'QUARTER': {
      const quarter = Math.floor(month / 3) + 1;
      return `Q${quarter} ${year}`;
    }
    case 'HALF_YEAR': {
      const half = month < 6 ? 'H1' : 'H2';
      return `${half} ${year}`;
    }
    case 'YEAR':
      return `${year}`;
    case 'TBA':
    default:
      return 'TBA';
  }
}

export function getStatusBadgeConfig(status: ReleaseStatus): { label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'PREORDER_OPEN':
      return { label: 'Pre-order Abierta', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'PREORDER_SOON':
      return { label: 'Pre-order Próxima', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'ANNOUNCED':
      return { label: 'Anunciado', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' };
    case 'REVEALED':
      return { label: 'Revelado Oficial', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' };
    case 'COMING_SOON':
      return { label: 'Próximamente', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' };
    case 'SHIPPING':
      return { label: 'En Despacho', bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' };
    case 'RELEASED':
      return { label: 'Lanzado al Mercado', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' };
    case 'DELAYED':
      return { label: 'Demorado / Postergado', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' };
    case 'CANCELLED':
      return { label: 'Cancelado', bg: 'bg-zinc-800', text: 'text-zinc-500', border: 'border-zinc-700' };
    case 'SOLD_OUT':
      return { label: 'Agotado en Distribución', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' };
    case 'RESTOCKED':
      return { label: 'Re-stock Confirmado', bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30' };
    case 'RUMORED':
    default:
      return { label: 'Rumor', bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-white/10' };
  }
}
