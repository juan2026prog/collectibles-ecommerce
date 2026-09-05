import type { ComparedProduct, CompatibilityResult, CompatibilityStatus } from '../types/index';
import { normalizeScale } from './normalizationEngine';

/**
 * Evaluates scale, height and display compatibility between compared figures.
 */
export function evaluateCollectorCompatibility(products: ComparedProduct[]): CompatibilityResult {
  if (!products || products.length < 2) {
    return {
      status: 'UNKNOWN',
      label: 'Requiere al menos 2 figuras',
      reason: 'Selecciona al menos dos piezas para evaluar su compatibilidad en vitrina o diorama.',
      details: []
    };
  }

  const scales: { id: string; title: string; scale: string | null; heightCm: number | null }[] = products.map(p => {
    const s = normalizeScale(p.normalized_attributes?.scale?.raw) || 
              normalizeScale(p.title) || 
              normalizeScale(p.metadata?.scale);
    const h = p.normalized_attributes?.height?.numeric_value || null;
    return {
      id: p.id,
      title: p.title,
      scale: s,
      heightCm: h
    };
  });

  const knownScales = scales.filter(s => s.scale !== null);

  // If no scales known, check heights
  if (knownScales.length === 0) {
    const knownHeights = scales.filter(s => s.heightCm !== null);
    if (knownHeights.length >= 2) {
      const minH = Math.min(...knownHeights.map(s => s.heightCm!));
      const maxH = Math.max(...knownHeights.map(s => s.heightCm!));
      const diff = maxH - minH;

      if (diff <= 3) {
        return {
          status: 'APPROXIMATELY_COMPATIBLE',
          label: 'Altura Similar',
          reason: `Las figuras tienen alturas muy próximas (${minH} cm y ${maxH} cm). Pueden exhibirse juntas de forma armónica.`,
          details: [`Diferencia de altura: ${diff.toFixed(1)} cm.`]
        };
      } else if (diff > 10) {
        return {
          status: 'NOT_RECOMMENDED',
          label: 'Diferencia Notoria de Tamaño',
          reason: `Existe una diferencia considerable de altura (${minH} cm frente a ${maxH} cm), sugiriendo escalas distintas.`,
          details: [`Diferencia de altura: ${diff.toFixed(1)} cm.`]
        };
      }
    }

    return {
      status: 'UNKNOWN',
      label: 'Escalas no informadas',
      reason: 'No hay información confirmada de escala en las especificaciones para validar compatibilidad.',
      details: ['Revisa la descripción del fabricante para verificar proporciones.']
    };
  }

  // Check if all known scales are identical
  const uniqueScales = Array.from(new Set(knownScales.map(s => s.scale)));

  if (uniqueScales.length === 1 && knownScales.length === products.length) {
    const sc = uniqueScales[0];
    return {
      status: 'COMPATIBLE',
      label: `Compatible (Misma Escala ${sc})`,
      reason: `Todas las piezas están diseñadas en escala ${sc}. Perfectas para dioramas, estanterías conjuntas y posabilidad proporcional.`,
      details: [`Escala confirmada: ${sc} en todos los modelos.`]
    };
  }

  // If multiple scales exist
  if (uniqueScales.length > 1) {
    // Check if scales are close (e.g. 1:10 and 1:12 can be approximately compatible depending on character)
    const is10and12 = uniqueScales.includes('1:10') && uniqueScales.includes('1:12') && uniqueScales.length === 2;
    if (is10and12) {
      return {
        status: 'APPROXIMATELY_COMPATIBLE',
        label: 'Escala Aproximada (1:10 vs 1:12)',
        reason: 'Las escalas 1:10 (aprox. 18-20 cm) y 1:12 (aprox. 15-18 cm) pueden diferir levemente en proporciones corporales.',
        details: ['Pueden lucir bien si representan personajes con diferencia de contextura física o colocadas en planos distintos.']
      };
    }

    return {
      status: 'NOT_RECOMMENDED',
      label: 'Escalas Incompatibles',
      reason: `Las figuras pertenecen a escalas marcadamente diferentes (${uniqueScales.join(', ')}). No se recomienda exhibirlas una al lado de la otra en la misma escena.`,
      details: uniqueScales.map(s => `Piezas en escala ${s}`)
    };
  }

  // Partial scales known
  return {
    status: 'APPROXIMATELY_COMPATIBLE',
    label: `Escala Parcial (${uniqueScales[0]})`,
    reason: `Al menos una de las piezas tiene confirmada la escala ${uniqueScales[0]}, pero otras no especifican su proporción exacta.`,
    details: ['Verifica la altura en centímetros para contrastar proporciones.']
  };
}
