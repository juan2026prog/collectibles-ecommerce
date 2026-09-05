import type { AcademyContentStatus } from '../types';

/**
 * Strict Guardrail: AI Generated drafts CANNOT be published automatically.
 * Must transition through editorial review.
 */
export function validatePublishAction(currentStatus: AcademyContentStatus, newStatus: AcademyContentStatus): {
  allowed: boolean;
  error?: string;
} {
  if (newStatus === 'PUBLISHED') {
    if (currentStatus === 'AI_DRAFT') {
      return {
        allowed: false,
        error: 'Prohibida la auto-publicación: Los borradores generados por IA deben pasar a REVIEW y contar con aprobación editorial humana antes de ser publicados.'
      };
    }
  }

  return { allowed: true };
}

export interface GroundedKnowledgeItem {
  type: 'GLOSSARY' | 'SCALE' | 'MATERIAL' | 'GUIDE';
  title: string;
  summary: string;
  url: string;
  keyDetails: string[];
}

/**
 * Canonical collector dictionary used for instant AI grounding without hallucination.
 */
export const COLLECTOR_KNOWLEDGE_BASE: Record<string, GroundedKnowledgeItem> = {
  'chase': {
    type: 'GLOSSARY',
    title: 'Variante Chase',
    summary: 'Una versión alternativa y más escasa producida intencionalmente por el fabricante dentro de la misma caja o wave (frecuentemente proporción 1:6).',
    url: '/academy#glosario',
    keyDetails: ['Ratio común 1:6', 'Sticker dorado/plateado distintivo', 'Mismo molde con acabados glow, metálico o variantes de color']
  },
  'misb': {
    type: 'GLOSSARY',
    title: 'MISB (Mint in Sealed Box)',
    summary: 'Estado de conservación donde la pieza se encuentra en condición impecable y la caja exterior conserva todos sus sellos de fábrica intactos sin haber sido abierta.',
    url: '/academy#glosario',
    keyDetails: ['Sellos de fábrica intactos', 'Caja sin abrir', 'Máximo valor de coleccionismo']
  },
  'moc': {
    type: 'GLOSSARY',
    title: 'MOC (Mint on Card)',
    summary: 'Aplica a figuras presentadas en blíster con cartón trasero donde la burbuja plástica nunca fue despegada ni perforada.',
    url: '/academy#glosario',
    keyDetails: ['Blíster sellado al cartón', 'Sin pliegues ni desgarros', 'Común en figuras 3.75" y retro']
  },
  'bootleg': {
    type: 'GLOSSARY',
    title: 'Bootleg / KO (Knock-off)',
    summary: 'Copias o falsificaciones no autorizadas por los titulares de derechos de autor ni licenciatarios oficiales.',
    url: '/academy#glosario',
    keyDetails: ['Collectibles sólo comercializa productos 100% oficiales y verificados', 'Plásticos de menor densidad y pintura defectuosa', 'Ausencia de sellos holográficos de licencia']
  },
  '1:12': {
    type: 'SCALE',
    title: 'Escala 1:12 (6 pulgadas / ~15-18 cm)',
    summary: 'Una de las escalas más populares en figuras de acción articuladas (1 pulgada de la figura equivale a 12 pulgadas en la realidad). Representa estaturas de 15 a 18 cm.',
    url: '/academy#escalas',
    keyDetails: ['Líneas de referencia: Marvel Legends, S.H.Figuarts, Mezco One:12, NECA 7" (~1:10/1:12)', 'Excelente relación entre detalle, articulación y espacio en vitrina']
  },
  '1:6': {
    type: 'SCALE',
    title: 'Escala 1:6 (12 pulgadas / ~30-32 cm)',
    summary: 'El estándar de alta gama ("Sixth Scale") popularizado por Hot Toys, Sideshow y DAMTOYS. Destaca por ropa de tela real y escultura hiperrealista.',
    url: '/academy#escalas',
    keyDetails: ['Líneas de referencia: Hot Toys Movie Masterpiece, Sideshow Sixth Scale', 'Ropa textil y articulaciones ocultas', 'Altura promedio de 30 a 32 cm']
  },
  '1:4': {
    type: 'SCALE',
    title: 'Escala 1:4 (Quarter Scale / ~45-55 cm)',
    summary: 'Escala premium para estatuas de gran formato y figuras de presencia masiva. Requiere espacio dedicado en vitrinas reforzadas.',
    url: '/academy#escalas',
    keyDetails: ['Líneas de referencia: Sideshow Premium Format, Prime 1 Studio, Queen Studios', 'Materiales habituales: Polystone, resina y tela mixta', 'Altura entre 45 y 60 cm']
  },
  'polystone': {
    type: 'MATERIAL',
    title: 'Polystone (Piedra de polímero)',
    summary: 'Compuesto de resina mezclada con polvo de piedra finamente molido. Proporciona gran peso, textura fría similar a la piedra y máxima retención de detalles escultóricos.',
    url: '/academy#materiales',
    keyDetails: ['Material estándar para estatuas de alta gama', 'Frágil ante caídas o torsión', 'No exponer a luz solar directa continua para preservar los pigmentos']
  },
  'pvc': {
    type: 'MATERIAL',
    title: 'PVC (Policloruro de vinilo)',
    summary: 'Plástico termoplástico versátil, duradero y ligeramente flexible. Es el material más extendido en figuras de acción y figuras estáticas coleccionables.',
    url: '/academy#materiales',
    keyDetails: ['Alta durabilidad y resistencia a impactos', 'Limpieza sencilla con paño de microfibra seco o apenas húmedo', 'Ideal para piezas articuladas y poses dinámicas']
  },
  'franquicia': {
    type: 'GUIDE',
    title: 'Régimen de Franquicia Aduanera Uruguay 2026',
    summary: 'Permite a personas físicas mayores de 18 años ingresar hasta 3 envíos expresos al año de hasta USD 800 de valor factura cada uno con 0% de tributos aduaneros, utilizando peso físico máximo de 20 kg.',
    url: '/page/envios-devoluciones',
    keyDetails: ['Tope 3 envíos anuales por persona', 'Monto máximo acumulado USD 800 al año', 'Peso real máximo 20 kg (sin peso volumétrico)', 'Si se supera cupo o envíos, aplica Régimen Simplificado (60%)']
  }
};

/**
 * Find collector knowledge directly to ground conversational AI queries.
 */
export function queryCollectorKnowledge(text: string): GroundedKnowledgeItem | null {
  const lower = (text || '').toLowerCase();
  for (const [key, item] of Object.entries(COLLECTOR_KNOWLEDGE_BASE)) {
    if (lower.includes(key)) {
      return item;
    }
  }
  return null;
}
