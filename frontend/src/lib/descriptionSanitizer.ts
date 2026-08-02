/**
 * Sanitizer for imported product descriptions to strip legacy Mercado Libre shipping text
 * without altering or corrupting valid product details.
 */

export function sanitizeProductDescription(rawDescription?: string | null): string {
  if (!rawDescription) return '';

  let sanitized = rawDescription;

  // Split into paragraphs / lines or block patterns
  // Remove known Mercado Libre legacy shipping blocks
  
  // Pattern 1: ENVIOS: MERCADOENVIOS: ... CADETERIA PERSONALIZADA: ...
  sanitized = sanitized.replace(
    /ENVIOS:\s*MERCADOENVIOS:[\s\S]*?(?:CADETERIA PERSONALIZADA:[\s\S]*?(?=\n\s*\n|$)|(?=\n\s*\n|$))/gi,
    ''
  );

  // Pattern 2: Standalone MERCADOENVIOS blocks
  sanitized = sanitized.replace(
    /MERCADOENVIOS:[\s\S]*?(?:Las políticas de mercado libre[\s\S]*?(?=\n\s*\n|$)|(?=\n\s*\n|$))/gi,
    ''
  );

  // Pattern 3: Standalone CADETERIA PERSONALIZADA blocks
  sanitized = sanitized.replace(
    /CADETERIA PERSONALIZADA:[\s\S]*?(?:RETIRA EN DOMICILIO DEL VENDEDOR[\s\S]*?(?=\n\s*\n|$)|(?=\n\s*\n|$))/gi,
    ''
  );

  // Specific phrases removal if any remain
  const phrasesToRemove = [
    /Las políticas de mercado libre no permiten modificar o cambiar datos del comprador, después que dé comprar\./gi,
    /Para utilizar éste servicio, cuando dé comprar, debe elegir RETIRA EN DOMICILIO DEL VENDEDOR, así coordinamos nosotros el envío\./gi,
    /Usted podrá hacer el seguimiento del envío desde su compra\./gi,
    /El tiempo de demora en la entrega es responsabilidad de la empresa asignada por Mercadoenvios\./gi,
    /RETIRA EN DOMICILIO DEL VENDEDOR/gi,
    /MERCADOENVIOS:/gi,
    /Mercado Envíos/gi,
    /Mercadoenvios/gi
  ];

  for (const phrase of phrasesToRemove) {
    sanitized = sanitized.replace(phrase, '');
  }

  // Clean up excess empty lines or consecutive newlines
  sanitized = sanitized
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (trimmed === 'ENVIOS:' || trimmed === 'ENVIOS' || trimmed === 'ENVÍOS:') return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitized;
}
