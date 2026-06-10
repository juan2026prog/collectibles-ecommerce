/**
 * Formatters globales para normalizar la visualización de datos en toda la plataforma.
 */

export function formatUSD(value: number | string | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return 'USD 0.00';
  return `USD ${Number(value).toFixed(2)}`;
}

export function formatUYU(value: number | string | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '$ 0';
  return `$ ${Math.round(Number(value)).toLocaleString('es-UY')}`;
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) return '0.0%';
  return `${Number(value).toFixed(1)}%`;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return 'Fecha inválida';
  }
}
