import type { VaultCondition, VaultBoxCondition, VaultStatus } from '../types/index';

export const VAULT_CONDITIONS: Record<VaultCondition, { label: string; description: string; color: string }> = {
  MINT: {
    label: 'Mint / Impecable',
    description: 'Perfecto estado, como salido de fábrica, sin ningún detalle ni marca de uso.',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  },
  NEAR_MINT: {
    label: 'Near Mint / Casi Impecable',
    description: 'Prácticamente perfecto, puede presentar algún detalle microscópico de pintura.',
    color: 'bg-teal-500/10 text-teal-400 border-teal-500/30'
  },
  EXCELLENT: {
    label: 'Excelente',
    description: 'Muy buen estado general, articulaciones firmes, sin roturas ni partes faltantes.',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
  },
  GOOD: {
    label: 'Bueno',
    description: 'Estado aceptable de exhibición, leves marcas de manipulación o paso del tiempo.',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  },
  FAIR: {
    label: 'Regular',
    description: 'Desgaste evidente, articulaciones flojas o decoloración parcial.',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/30'
  },
  POOR: {
    label: 'Pobre',
    description: 'Desgaste severo o faltante de accesorios menores.',
    color: 'bg-red-500/10 text-red-400 border-red-500/30'
  },
  DAMAGED: {
    label: 'Dañado / Para Restaurar',
    description: 'Pieza rota, reparada o con faltantes estructurales.',
    color: 'bg-red-950/40 text-red-500 border-red-800/40'
  }
};

export const VAULT_BOX_CONDITIONS: Record<VaultBoxCondition, { label: string; description: string; color: string }> = {
  SEALED: {
    label: 'Sellada / Factory Sealed',
    description: 'Caja cerrada de fábrica con sellos intactos.',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  },
  OPEN_BOX: {
    label: 'Caja Abierta (Completa)',
    description: 'Caja abierta pero completa con todos sus blisters e instructivos.',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
  },
  DAMAGED_BOX: {
    label: 'Caja con Detalles',
    description: 'Caja con abolladuras, roturas menores o desgaste en esquinas.',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
  },
  NO_BOX: {
    label: 'Sin Caja (Loose)',
    description: 'Se entrega o conserva la figura sin su empaque original.',
    color: 'bg-zinc-800 text-zinc-400 border-zinc-700'
  },
  ACRYLIC_CASE: {
    label: 'En Case Acrílico',
    description: 'Protegida en vitrina o estuche de acrílico personalizado.',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
  }
};

export const VAULT_STATUSES: Record<VaultStatus, { label: string; color: string }> = {
  OWNED: { label: 'En Colección', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  WISHLIST: { label: 'En Wishlist', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  ORDERED: { label: 'Comprado / En Camino', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  PREORDERED: { label: 'Preventa Confirmada', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  WANTED: { label: 'Buscando / Cacería', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  SOLD: { label: 'Vendido', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  TRADED: { label: 'Intercambiado', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
};

export function normalizeCondition(cond: string): VaultCondition {
  const upper = (cond || '').toUpperCase().trim();
  if (upper in VAULT_CONDITIONS) {
    return upper as VaultCondition;
  }
  return 'GOOD';
}

export function normalizeBoxCondition(cond: string): VaultBoxCondition {
  const upper = (cond || '').toUpperCase().trim();
  if (upper in VAULT_BOX_CONDITIONS) {
    return upper as VaultBoxCondition;
  }
  return 'NO_BOX';
}

export function normalizeStatus(status: string): VaultStatus {
  const upper = (status || '').toUpperCase().trim();
  if (upper in VAULT_STATUSES) {
    return upper as VaultStatus;
  }
  return 'OWNED';
}

export function getConditionColor(cond: string): string {
  const norm = normalizeCondition(cond);
  return VAULT_CONDITIONS[norm]?.color || 'bg-zinc-800 text-zinc-400';
}

export function getBoxConditionColor(cond: string): string {
  const norm = normalizeBoxCondition(cond);
  return VAULT_BOX_CONDITIONS[norm]?.color || 'bg-zinc-800 text-zinc-400';
}

export function getStatusColor(status: string): string {
  const norm = normalizeStatus(status);
  return VAULT_STATUSES[norm]?.color || 'bg-zinc-800 text-zinc-400';
}
