import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  ArrowLeft, BookOpen, Clock, Tag, ExternalLink, ShoppingCart, 
  ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, Scale, Flame 
} from 'lucide-react';
import SEO from '../../components/SEO';
import { useCartContext } from '../../contexts/CartContext';

interface CuratedGuide {
  title: string;
  slug: string;
  excerpt: string;
  type: string;
  read_time: string;
  featured_image: string;
  key_takeaways: string[];
  sections: Array<{
    heading: string;
    content: string;
    tip?: string;
    warning?: string;
  }>;
  related_search_tag?: string;
}

const CURATED_GUIDES_DATA: Record<string, CuratedGuide> = {
  // ─── ARTÍCULO 1 (original) ──────────────────────────────────────────────────
  'guia-de-escalas-coleccionables': {
    title: 'Guía Definitiva de Escalas: 1:12 vs 1:10 vs 1:6 en Figuras de Acción',
    slug: 'guia-de-escalas-coleccionables',
    excerpt: 'Descubre las diferencias reales de tamaño, articulación y compatibilidad de vitrinas entre marcas líderes como Hot Toys, NECA, Hasbro y MAFEX.',
    type: 'GUÍA TÉCNICA',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&q=80',
    key_takeaways: [
      'La escala 1:12 (6 pulgadas / 15-16 cm) es el estándar internacional más versátil y económico en espacio.',
      'La escala 1:10 (7 pulgadas / 18-19 cm) es la firma de marcas como NECA y McFarlane Toys.',
      'La escala 1:6 (12 pulgadas / 30 cm) ofrece la máxima fidelidad cinematográfica con ropa de tela y metal Diecast.'
    ],
    sections: [
      {
        heading: '1. Escala 1:12 (Six-Inch / 15 a 16.5 cm)',
        content: `Es la escala reina del coleccionismo mundial contemporáneo. Líneas como Medicom MAFEX, Hasbro Marvel Legends & Star Wars Black Series, Bandai S.H. Figuarts y Mezco Toyz One:12 Collective dominan este segmento.
        
Permite exhibir batallones enteros, dioramas urbanos complejos y colecciones de decenas de personajes en estanterías estándar tipo IKEA Billy sin saturar la habitación.`,
        tip: 'Si coleccionas anime y cómics occidentales, 1:12 ofrece la mayor variedad de personajes secundarios y vehículos accesibles.'
      },
      {
        heading: '2. Escala 1:10 (Seven-Inch / 18 a 19 cm)',
        content: `Popularizada principalmente por NECA (Terminator, Alien, Predator, Tortugas Ninja) y McFarlane Toys (DC Multiverse, Spawn). 

Las figuras son sustancialmente más pesadas y robustas. No suelen escalar de forma armónica junto a figuras de 6 pulgadas en la misma repisa, pero destacan fuertemente en exhibiciones individuales o temáticas de cine de terror/acción retro.`,
        warning: 'Evita mezclar figuras 1:10 con 1:12 en la misma línea visual porque los personajes 1:10 se verán desproporcionadamente gigantes.'
      },
      {
        heading: '3. Escala 1:6 (Sixth Scale / 28 a 32 cm)',
        content: `El pináculo del hiper-realismo de museo. Hot Toys, Sideshow Collectibles, Damtoys e InArt lideran esta categoría.

Cada pieza cuenta con esculpidos faciales pintados a mano, ojos móviles independientes (PERS), trajes de tela real cosidos a escala, accesorios en metal fundido y empaques de lujo tipo Art Box.`,
        tip: 'En Uruguay, muchas piezas 1:6 entran dentro del régimen de franquicia aduanera de USD 200 sin impuestos de importación.'
      }
    ],
    related_search_tag: 'figuras'
  },

  // ─── ARTÍCULO 2 (original) ──────────────────────────────────────────────────
  'como-detectar-bootlegs-figuras-originales': {
    title: 'Cómo Detectar Bootlegs y Copias No Oficiales vs Figuras Originales',
    slug: 'como-detectar-bootlegs-figuras-originales',
    excerpt: 'Aprende a identificar sellos holográficos de Toei/Bandai, calidades de pintura defectuosas, números de serie y empaques sospechosos antes de comprar.',
    type: 'AUTENTICIDAD',
    read_time: '8 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&q=80',
    key_takeaways: [
      'Verifica siempre el sello holográfico oficial (Toei Animation cat sticker, Marvel hologram, Funko serial stamp).',
      'Desconfía de cajas sin logotipos oficiales del fabricante (las copias omiten el logo de Bandai o Hot Toys).',
      'El olor a químicos plásticos penetrantes y articulaciones flojas son señales inequívocas de KO (Knock-Off).'
    ],
    sections: [
      {
        heading: '1. La Inspección del Empaque y Sellos Holográficos',
        content: `Los fabricantes legítimos pagan licencias millonarias e incluyen sellos de autenticidad auditados. Por ejemplo:
• Bandai / Tamashii Nations: Sticker holográfico plateado o dorado con el gato de Toei o logo de Bandai Spirits.
• Good Smile Company (Nendoroid / Figma): Relieve en la tipografía y número de figura en el frontal.
• Medicom MAFEX: Holograma en la pestaña superior o trasera.
• NECA: Relieve en las letras del título y código de barras nítido sin difuminados.`,
        warning: 'Las copias chinas suelen reproducir la foto de la caja pero eliminan o alteran el logo de la marca en la esquina superior.'
      },
      {
        heading: '2. Calidad de Pintura y Articulaciones',
        content: `Una figura original tiene degradados de color sutiles, ojos perfectamente alineados por tampografía y articulaciones rígidas pero suaves.

Un bootleg presenta pintura brillante pegajosa, rebabas plásticas sin lijar en las uniones, y articulaciones que se rompen al primer intento de posado.`,
        tip: 'En Collectibles.uy todas las piezas provienen de distribuidores oficiales autorizados con garantía de autenticidad.'
      }
    ],
    related_search_tag: 'original'
  },

  // ─── ARTÍCULO 3 (original) ──────────────────────────────────────────────────
  'pvc-vs-resina-vs-diecast-cuidados': {
    title: 'PVC vs Resina Polystone vs Diecast: Cuidados y Conservación',
    slug: 'pvc-vs-resina-vs-diecast-cuidados',
    excerpt: 'Por qué la resina no tolera caídas, cómo evitar el efecto "sudor plástico" en PVC por calor y la protección anticorrosión en partes metálicas Diecast.',
    type: 'PRESERVACIÓN',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&q=80',
    key_takeaways: [
      'El PVC requiere ventilación y temperaturas menores a 28°C para evitar la migración de plastificantes.',
      'La Resina Polystone es pesada y rígida pero frágil: una caída de 10 cm puede fracturar un brazo.',
      'El Diecast (metal) aporta balance y resistencia, pero no debe exponerse a humedad condensada.'
    ],
    sections: [
      {
        heading: '1. PVC y ABS: El estándar articulado',
        content: `El PVC flexible se utiliza en capas, manos y rostros, mientras que el ABS rígido compone los esqueletos y articulaciones.
        
Para limpiarlo, usa siempre pinceles de pelo de marta o brochas de maquillaje ultra suaves y un paño de microfibra seco. Jamás utilices alcohol isopropílico ni acetona, ya que disuelven la pintura al instante.`,
        warning: 'Nunca guardes figuras de PVC en cajas cerradas dentro de áticos o lugares calurosos. El plastificante se acumulará como una capa pegajosa.'
      },
      {
        heading: '2. Resina Polystone: El arte de las estatuas',
        content: `La resina fría mezclada con polvo de piedra ofrece el máximo nivel de textura y detalle orgánico. No se deforma con el paso de los años, pero no tiene flexibilidad. Mantén siempre las estatuas lejos del borde de mesas y atornilla las bases de apoyo.`
      }
    ],
    related_search_tag: 'estatua'
  },

  // ─── ARTÍCULO 4 (original) ──────────────────────────────────────────────────
  'vitrinas-iluminacion-led-y-control-uv': {
    title: 'Vitrinas para Coleccionistas: Iluminación LED, Polvo y Control UV',
    slug: 'vitrinas-iluminacion-led-y-control-uv',
    excerpt: 'La luz solar directa y las lámparas halógenas amarillean los plásticos. Configura vitrinas con LEDs fríos sin emisión UV y sellos antipolvo.',
    type: 'CONSERVACIÓN',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1200&q=80',
    key_takeaways: [
      'Los rayos UV solares son el enemigo #1 del coleccionismo: degradan el blanco y debilitan los plásticos.',
      'Instala tiras LED de luz neutra (4000K) con cero emisión ultravioleta e infrarroja.',
      'Los burletes de goma EVA o silicona en puertas de vidrio reducen el 95% del ingreso de polvo.'
    ],
    sections: [
      {
        heading: '1. El impacto de la radiación UV en figuras',
        content: `La exposición a ventanas sin láminas UV produce el temido amarillamiento (yellowing) en figuras blancas o de tonos claros (como stormtroopers o trajes espaciales).
        
Si tu habitación recibe luz diurna directa, coloca películas con filtro UV 99% en las ventanas o ubica las vitrinas en esquinas protegidas.`
      },
      {
        heading: '2. Iluminación Recomendada',
        content: `Usa tiras LED de 12V con perfil de aluminio difusor. El perfil disipa el calor lejos del vidrio y la luz difusa evita reflejos molestos en las fotos de tu colección.`
      }
    ],
    related_search_tag: 'coleccion'
  },

  // ─── ARTÍCULO 5 — NUEVO ─────────────────────────────────────────────────────
  'guia-escalas-figuras-coleccion': {
    title: 'Guía de Escalas en Figuras de Colección: de 1:18 a 1:4',
    slug: 'guia-escalas-figuras-coleccion',
    excerpt: 'Aprende qué significan las escalas 1:18, 1:12, 1:10, 1:6 y 1:4, cuánto mide aproximadamente cada figura y cuáles pueden exhibirse juntas.',
    type: 'GUÍA',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    key_takeaways: [
      'La escala indica la proporción entre la figura y el tamaño real del personaje. En 1:6, cada cm de figura equivale a 6 cm reales.',
      'No existe obligación de coleccionar en una sola escala, pero para dioramas coherentes conviene elegir escalas compatibles.',
      'La escala 1:12 es la más popular hoy por su balance entre detalle, articulación y espacio de exhibición.'
    ],
    sections: [
      {
        heading: '¿Qué significa la escala de una figura?',
        content: `Cuando una figura indica que está fabricada en escala 1:6, 1:12 o 1:4, esa relación compara el tamaño de la pieza con el tamaño que tendría el personaje u objeto en la vida real.

Por ejemplo, en una escala 1:6, cada seis centímetros del personaje real se representan aproximadamente con un centímetro en la figura.

Esto permite mantener proporciones similares entre productos de una misma línea.`,
        tip: 'Si un personaje mide 1,80 m en la ficción, en escala 1:6 su figura debería medir aproximadamente 30 cm.'
      },
      {
        heading: 'Escala 1:18 — Altura aprox. 9,5 a 10,5 cm',
        content: `Es una escala históricamente utilizada en figuras pequeñas, vehículos y líneas que necesitan incluir grandes cantidades de personajes ocupando poco espacio.

Es común encontrarla en colecciones vintage y líneas vinculadas a vehículos.

Ideal para:
• Colecciones numerosas
• Dioramas con muchos personajes
• Vehículos a escala
• Espacios reducidos`
      },
      {
        heading: 'Escala 1:12 — Altura aprox. 15 a 18 cm',
        content: `Actualmente es una de las escalas más populares entre las figuras articuladas.

Es habitual en líneas como:
• Marvel Legends
• Mafex
• SH Figuarts
• Algunas líneas de McFarlane

Combina buen nivel de detalle, articulación y un tamaño relativamente fácil de exhibir.`,
        tip: 'Una estantería estándar de 30 cm de fondo puede albergar cómodamente figuras 1:12 con accesorios incluidos.'
      },
      {
        heading: 'Escala 1:10 — Altura aprox. 18 a 22 cm',
        content: `Es muy utilizada en estatuas y piezas destinadas principalmente a exhibición.

Al tener generalmente menos articulaciones que una figura de acción, el fabricante puede concentrarse más en:
• Escultura
• Pintura
• Postura
• Base`,
        warning: 'Mezclar 1:10 con 1:12 en la misma estantería puede generar desproporciones visualmente molestas. Es mejor separarlas por temática.'
      },
      {
        heading: 'Escala 1:6 — Altura aprox. 28 a 32 cm',
        content: `Es uno de los estándares de alta gama.

Marcas como Hot Toys, Sideshow y otras compañías especializadas utilizan esta escala para crear figuras con:
• Ropa de tela real
• Accesorios realistas
• Múltiples manos intercambiables
• Rostros detallados con tecnología PERS
• Cuerpos articulados internos

Es una escala especialmente apreciada para personajes humanos.`
      },
      {
        heading: 'Escala 1:4 — Altura aprox. 45 a 55 cm o más',
        content: `Se utiliza principalmente para grandes estatuas y piezas premium.

Estas figuras generan mucho impacto visual, pero requieren bastante espacio y son considerablemente más pesadas.`,
        warning: 'Una estatua 1:4 puede pesar entre 3 y 8 kg. Asegúrate de que tu estantería o vitrina soporte el peso antes de ubicarla.'
      },
      {
        heading: 'Escala 1:1 — Life-Size (Tamaño Real y Bustos)',
        content: `La cúspide absoluta del coleccionismo de museo. Réplicas a escala real 1:1 de personajes, bustos hiperrealistas (Queen Studios, Infinity Studio, Sideshow) y réplicas de utilería de películas (cascos, armaduras, sables de luz).

Altura y dimensiones:
• Bustos 1:1: 60 a 90 cm de altura
• Figuras completas 1:1: 1,60 a 2,00 m

Suelen incorporar materiales hiperrealistas como silicona médica de grado platino, ojos de prótesis de vidrio y cabello natural insertado mechón por mechón.`,
        tip: 'Las piezas 1:1 son consideradas obras de arte de exhibición central y requieren espacios amplios dedicados o pedestales reforzados.'
      },
      {
        heading: '¿Puedo mezclar escalas?',
        content: `Sí. No existe ninguna regla que obligue a mantener toda una colección dentro de la misma escala.

Sin embargo, si quieres crear un diorama o una escena coherente, conviene utilizar personajes compatibles entre sí.

La regla más importante es simple: colecciona aquello que te guste.`,
        tip: 'Muchos coleccionistas tienen una escala "principal" para personajes y otra escala diferente para estatuas destacadas o piezas especiales.'
      }
    ],
    related_search_tag: 'figuras'
  },

  // ─── ARTÍCULO 6 — NUEVO ─────────────────────────────────────────────────────
  'como-reconocer-figura-original-bootleg': {
    title: 'Cómo Reconocer una Figura Original y Evitar Bootlegs',
    slug: 'como-reconocer-figura-original-bootleg',
    excerpt: 'Aprende a identificar señales comunes de falsificaciones y qué revisar antes de comprar una figura coleccionable.',
    type: 'AUTENTICIDAD',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    key_takeaways: [
      'Un bootleg es una reproducción no autorizada que utiliza diseños y licencias ajenas sin permiso del propietario.',
      'Un precio muy inferior al valor de mercado es la primera señal de alerta a investigar.',
      'Nunca uses una sola señal para determinar autenticidad: analiza caja, pintura, articulaciones y procedencia juntos.'
    ],
    sections: [
      {
        heading: '¿Qué es un bootleg?',
        content: `En coleccionismo se denomina bootleg a una reproducción no autorizada de un producto original.

No debe confundirse con una variante oficial o una reedición.

Un bootleg utiliza normalmente:
• Diseño ajeno
• Personajes licenciados
• Packaging imitado
• Marcas que no le pertenecen

...sin autorización del propietario de la licencia.`
      },
      {
        heading: '1. Revisa el fabricante',
        content: `Antes de comprar, identifica quién fabrica oficialmente la pieza.

Por ejemplo, diferentes propiedades pueden estar licenciadas a fabricantes específicos.

Comprueba:
• Nombre del fabricante
• Línea
• Número de producto
• Versión
• Licencia`,
        tip: 'Busca el fabricante oficial en su sitio web y contrasta el número de producto con la pieza que te ofrecen.'
      },
      {
        heading: '2. Un precio muy bajo es señal de alerta',
        content: `Una diferencia pequeña puede explicarse por promociones o liquidaciones.

Una figura que normalmente vale USD 150 y aparece nueva por USD 30 merece una revisión mucho más profunda.

No significa automáticamente que sea falsa, pero aumenta significativamente el riesgo.`,
        warning: 'Los precios en marketplaces de terceros pueden variar mucho. Siempre compara con el precio oficial o retailers de confianza.'
      },
      {
        heading: '3. Observa la caja',
        content: `Los bootlegs suelen presentar diferencias en:
• Impresión y resolución de imágenes
• Colores
• Tipografía
• Logos y sellos
• Hologramas
• Calidad del cartón

También pueden existir errores ortográficos en el packaging.`
      },
      {
        heading: '4. Mira la calidad del rostro',
        content: `Una de las zonas donde las falsificaciones suelen diferenciarse más es el rostro.

Busca:
• Ojos desalineados
• Pintura irregular o brillosa en exceso
• Piel demasiado brillante
• Detalles poco definidos
• Expresiones diferentes al producto oficial`
      },
      {
        heading: '5. Revisa las articulaciones',
        content: `En figuras articuladas, una falsificación puede presentar:
• Articulaciones extremadamente flojas
• Piezas muy rígidas o frágiles
• Uniones mal terminadas con rebabas
• Diferencias importantes de color entre piezas`,
        warning: 'Las articulaciones de un bootleg suelen romperse en el primer posado. Nunca fuerces una articulación resistente en una figura nueva.'
      },
      {
        heading: '6. Packaging diferente no siempre es falsificación',
        content: `Algunos fabricantes modifican cajas entre regiones o reediciones.

Por eso nunca conviene utilizar una única señal para determinar autenticidad.

Lo mejor es analizar varias características conjuntamente.`,
        tip: 'En Collectibles priorizamos productos originales y oficialmente licenciados. Compra siempre piezas cuya procedencia puedas identificar.'
      }
    ],
    related_search_tag: 'original'
  },

  // ─── ARTÍCULO 7 — NUEVO ─────────────────────────────────────────────────────
  'misb-mib-loose-glosario-coleccionismo': {
    title: 'MISB, MIB, Loose y otros términos que todo coleccionista debe conocer',
    slug: 'misb-mib-loose-glosario-coleccionismo',
    excerpt: '¿MISB? ¿MIB? ¿Loose? Aprende los términos utilizados para describir el estado de figuras y coleccionables.',
    type: 'GLOSARIO',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    key_takeaways: [
      'MISB (Mint in Sealed Box) es el estado más buscado: pieza nueva, caja nunca abierta, con precinto original.',
      'Loose no significa dañado: muchos coleccionistas prefieren comprar piezas loose para exhibirlas directamente.',
      'Chase es una variante más rara distribuida aleatoriamente entre las unidades estándar de una misma producción.'
    ],
    sections: [
      {
        heading: 'MISB — Mint in Sealed Box',
        content: `Significa pieza nueva dentro de una caja que nunca fue abierta.

Normalmente mantiene:
• Sellos originales intactos
• Precintos de fábrica
• Packaging en estado de fábrica

Para determinados coleccionistas, es el estado más buscado y el que generalmente tiene mayor valor de reventa.`
      },
      {
        heading: 'MIB — Mint in Box',
        content: `La pieza está en excelentes condiciones y conserva su caja, aunque ésta puede haber sido abierta.

La diferencia fundamental con MISB es que el packaging ya no permanece necesariamente sellado.`
      },
      {
        heading: 'NIB — New in Box',
        content: `Producto nuevo dentro de su packaging.

Es una expresión frecuente en tiendas y marketplaces. Dependiendo del vendedor puede haber pequeñas diferencias en la utilización del término, por lo que conviene revisar siempre la descripción completa.`,
        tip: 'Cuando compras NIB, confirma si la caja tiene sellos originales o si fue abierta para inspección.'
      },
      {
        heading: 'Loose',
        content: `Una figura loose se vende fuera de su packaging original.

Puede incluir todos los accesorios o solamente algunos.

Ser loose no significa que esté en mal estado. Muchos coleccionistas que exhiben sus figuras fuera de caja prefieren comprar piezas loose a menor precio.`
      },
      {
        heading: 'Complete e Incomplete',
        content: `Complete indica que la pieza conserva todos los componentes originales, incluyendo:
• Accesorios
• Armas o weapons
• Manos intercambiables
• Bases
• Manuales
• Piezas opcionales

Incomplete indica que falta al menos una parte perteneciente originalmente al producto.`,
        warning: 'Siempre consulta qué accesorios incluye originalmente la figura antes de comprar loose. Algunos artículos valen más que la figura misma.'
      },
      {
        heading: 'CIB — Complete in Box',
        content: `Significa que conserva tanto su caja como todos los accesorios principales incluidos originalmente.

Es un término especialmente utilizado en:
• Videojuegos
• Productos vintage
• Juguetes antiguos`
      },
      {
        heading: 'Chase',
        content: `Una variante deliberadamente más rara distribuida entre las unidades estándar.

Puede cambiar:
• Color
• Pose
• Traje
• Accesorio
• Acabado (metalizado, translúcido, etc.)`,
        tip: 'Un Chase puede llegar a valer entre 2 y 10 veces el precio de la versión estándar en el mercado secundario.'
      }
    ],
    related_search_tag: 'coleccion'
  },

  // ─── ARTÍCULO 8 — NUEVO ─────────────────────────────────────────────────────
  'figuras-accion-vs-estatuas': {
    title: 'Figuras de Acción vs Estatuas: ¿Qué Tipo de Colección es para Ti?',
    slug: 'figuras-accion-vs-estatuas',
    excerpt: 'Articulación, tamaño, materiales, precio y espacio: descubre las principales diferencias antes de elegir.',
    type: 'GUÍA',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    key_takeaways: [
      'Las figuras articuladas permiten modificar poses y crear escenas, pero las articulaciones pueden interrumpir la escultura.',
      'Las estatuas ofrecen mayor impacto visual y detalle de escultura, pero son fijas, más pesadas y ocupan más espacio.',
      'Una colección puede combinar perfectamente ambos tipos sin ningún conflicto.'
    ],
    sections: [
      {
        heading: 'No son la misma categoría',
        content: `Aunque ambas representan personajes, las figuras articuladas y las estatuas están pensadas con filosofías diferentes.

Una figura articulada está diseñada para la interacción: cambiar poses, crear escenas, ser manipulada.

Una estatua está diseñada para ser observada: máximo impacto visual en una pose específica y definitiva.`
      },
      {
        heading: 'Figuras de Acción — La articulación como protagonista',
        content: `Su principal característica es la articulación. Permiten modificar:
• Pose
• Brazos y piernas
• Cabeza (multieje)
• Manos intercambiables
• Accesorios

Ventajas:
• Variedad de poses según tu gusto
• Posibilidad de crear escenas y dioramas
• Suelen ocupar menos espacio
• Gran cantidad de personajes disponibles

Desventajas:
• Las articulaciones pueden interrumpir parcialmente la escultura
• Algunas articulaciones se degradan con el tiempo`,
        tip: 'Si disfrutas fotografiando tu colección con poses diferentes, las figuras articuladas te dan mucha más libertad creativa.'
      },
      {
        heading: 'Estatuas — La escultura como protagonista',
        content: `Normalmente presentan una pose fija. Al no necesitar tantas articulaciones, el escultor dispone de mayor libertad para trabajar:
• Anatomía
• Ropa y texturas
• Efectos de movimiento o energía
• Base integrada

Ventajas:
• Alto impacto visual
• Poses más dinámicas y dramáticas
• Escultura altamente detallada
• Presentación premium

Desventajas:
• Mayor tamaño y peso
• Necesitan más espacio de exhibición
• Pueden ser más delicadas`,
        warning: 'Las estatuas de resina son muy frágiles ante impactos. Una caída desde una estantería puede fracturar piezas difíciles de reparar.'
      },
      {
        heading: '¿Cuál conviene elegir?',
        content: `Si disfrutas cambiando poses y construyendo escenas: figuras articuladas.

Si buscas una pieza central con gran impacto visual: estatuas.

Y, por supuesto, una colección puede perfectamente combinar ambas.

Muchos coleccionistas tienen una o dos estatuas como "piezas ancla" de su vitrina, rodeadas de figuras articuladas que complementan la escena.`
      }
    ],
    related_search_tag: 'figuras'
  },

  // ─── ARTÍCULO 9 — NUEVO ─────────────────────────────────────────────────────
  'materiales-figuras-pvc-abs-resina-diecast': {
    title: 'PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados',
    slug: 'materiales-figuras-pvc-abs-resina-diecast',
    excerpt: 'Qué diferencias existen entre PVC, ABS, resina y metal die-cast y por qué afectan peso, detalle y resistencia.',
    type: 'MATERIALES',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    key_takeaways: [
      'PVC y ABS se combinan en casi toda figura articulada: PVC para partes flexibles, ABS para estructura y articulaciones.',
      'La resina permite texturas y detalles únicos pero es frágil: una caída que el PVC tolera puede romper una estatua.',
      'Die-cast no significa que toda la figura sea metálica; generalmente son partes específicas como armaduras o estructuras.'
    ],
    sections: [
      {
        heading: 'PVC — Polychlorure de Vinyle',
        content: `El PVC es uno de los materiales más habituales en figuras.

Permite cierto grado de flexibilidad y resulta apropiado para:
• Ropa exterior (capas, telas)
• Cabellos
• Partes exteriores
• Piezas que requieren algo de movimiento sin articulación

Es relativamente resistente, ligero y permite producir piezas complejas a gran escala a costos accesibles.`,
        tip: 'El PVC puede deformarse levemente con el calor. Mantén tus figuras alejadas de fuentes de calor directo y luz solar por períodos prolongados.'
      },
      {
        heading: 'ABS — Acrilonitrilo Butadieno Estireno',
        content: `El ABS es un plástico más rígido y resistente que el PVC.

Suele utilizarse en:
• Articulaciones y puntos de unión
• Estructuras internas
• Accesorios que requieren precisión dimensional
• Partes que soportan peso o tensión

En una misma figura pueden combinarse PVC y ABS sin problema, aprovechando las ventajas de cada uno.`
      },
      {
        heading: 'Resina',
        content: `La resina es el material frecuente en estatuas de colección premium.

Permite reproducir:
• Texturas orgánicas complejas
• Detalles muy finos de escultura
• Acabados pictóricos con capas de pintura

Es considerablemente más rígida que el PVC y también más frágil.`,
        warning: 'Una caída que una figura de PVC podría resistir sin daños puede fracturar seriamente una estatua de resina. Siempre usa soportes y bases adecuadas.'
      },
      {
        heading: 'Die-Cast — Metal fundido',
        content: `Die-cast hace referencia a piezas metálicas producidas mediante fundición a presión.

Puede aparecer en:
• Armaduras (como Iron Man o Gundams)
• Robots y mechas
• Vehículos a escala
• Estructuras internas de cuerpos articulados

Aporta:
• Peso y densidad real
• Sensación premium al tacto
• Rigidez estructural`,
        tip: 'Las partes die-cast en figuras de Hot Toys o Bandai Metal Build justifican en gran parte el precio premium de estas líneas.'
      },
      {
        heading: '¿Qué material es mejor?',
        content: `No existe uno universalmente superior. Depende del objetivo del producto.

Para una figura muy articulada: PVC + ABS suele ser la combinación ideal.

Para una estatua de alto detalle: resina puede resultar insuperable.

Para robots o vehículos: die-cast puede añadir una sensación especialmente atractiva.

Lo más importante es conocer el material de lo que comprás para darle el cuidado adecuado.`
      }
    ],
    related_search_tag: 'materiales'
  },

  // ─── ARTÍCULO 10 — NUEVO ────────────────────────────────────────────────────
  'como-cuidar-exhibir-figuras-coleccion': {
    title: 'Cómo Cuidar y Exhibir tus Figuras sin Dañarlas',
    slug: 'como-cuidar-exhibir-figuras-coleccion',
    excerpt: 'Luz, polvo, humedad y temperatura: las reglas esenciales para conservar una colección durante años.',
    type: 'CUIDADO',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    key_takeaways: [
      'La radiación solar directa es la principal causa de decoloración y deterioro en figuras de PVC y resina.',
      'El polvo acumulado puede rayar pinturas al limpiarlo incorrectamente: usa brocha suave o aire comprimido.',
      'Las articulaciones bajo tensión prolongada pueden dañarse: cambia poses periódicamente en figuras articuladas.'
    ],
    sections: [
      {
        heading: '1. Evita el sol directo',
        content: `La radiación solar puede provocar:
• Pérdida de color y decoloración
• Amarillamiento del plástico blanco
• Deterioro del packaging y cartón

No es necesario mantener las figuras en la oscuridad. Simplemente evita colocarlas durante horas frente a una ventana con sol directo.`,
        tip: 'Las películas de filtro UV para ventanas son una inversión excelente si tu sala de exhibición recibe luz solar directa.'
      },
      {
        heading: '2. Controla la humedad',
        content: `La humedad excesiva puede afectar especialmente:
• Cajas y packaging de cartón
• Papel de los manuales e inserts
• Adhesivos y stickers
• Piezas metálicas (oxidación)

Un ambiente seco y estable, idealmente entre 40-60% de humedad relativa, generalmente resulta más conveniente.`
      },
      {
        heading: '3. Evita temperaturas extremas',
        content: `El calor excesivo puede deformar algunos plásticos, especialmente en el PVC.

También puede afectar:
• Pegamentos internos
• Capas de pintura
• Componentes de tela en figuras 1:6

La temperatura ideal para almacenamiento es entre 15°C y 25°C.`,
        warning: 'Nunca dejes figuras de PVC en el interior de un auto en verano. Las temperaturas pueden superar los 60°C y deformar piezas permanentemente.'
      },
      {
        heading: '4. Limpia el polvo periódicamente',
        content: `No es necesario desmontar constantemente las figuras.

Puede utilizarse:
• Brocha muy suave de pelo natural
• Aire comprimido manual (tipo pera de fotógrafo)
• Paño de microfibra seco para superficies planas

Evita productos químicos sin conocer previamente su compatibilidad con el material específico.`,
        tip: 'La limpieza con brocha suave cada 2-3 semanas evita la acumulación de polvo que, al limpiarse en capa gruesa, puede rayar la pintura.'
      },
      {
        heading: '5. Cuidado con poses extremas',
        content: `Las figuras articuladas pueden permanecer posadas durante largos períodos, pero determinadas posiciones generan tensión innecesaria.

Especialmente vulnerable:
• Tobillos (soportan todo el peso)
• Rodillas en flexión extrema
• Hombros con brazos extendidos lateralmente
• Piezas de ropa sintética estirada

Cambia las poses ocasionalmente para evitar estrés prolongado en un mismo punto.`
      },
      {
        heading: '6. Utiliza soportes adecuados',
        content: `Para figuras pesadas o poses dinámicas puede utilizarse una base con soporte de vástago.

Una caída desde una estantería puede producir mucho más daño que años de exposición normal.

Verifica siempre la capacidad de peso de tus estanterías antes de instalar estatuas grandes.`,
        warning: 'Una estatua de resina 1:4 puede pesar más de 5 kg. Asegura las estanterías a la pared si almacenas piezas grandes.'
      }
    ],
    related_search_tag: 'coleccion'
  },

  // ─── ARTÍCULO 11 — NUEVO ────────────────────────────────────────────────────
  'edicion-limitada-exclusive-chase-preorder': {
    title: 'Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan Realmente',
    slug: 'edicion-limitada-exclusive-chase-preorder',
    excerpt: 'Aprende la diferencia entre edición limitada, exclusiva, chase, preventa y reedición antes de comprar.',
    type: 'GUÍAS DE COMPRA',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    key_takeaways: [
      'Limited Edition tiene producción restringida; Exclusive se distribuye solo por un canal específico: son cosas distintas.',
      'Un Pre-Order tiene fecha estimada, no garantizada. Retrasos de 6 a 12 meses son frecuentes en coleccionables.',
      'Una reedición no destruye automáticamente el valor: el mercado depende de demanda, condición y rareza del original.'
    ],
    sections: [
      {
        heading: 'Limited Edition — Edición Limitada',
        content: `Una edición limitada tiene una producción restringida a un número determinado de unidades.

En algunos casos el fabricante informa el número exacto (por ejemplo: 1.500 unidades mundiales). En otros simplemente indica que la producción será limitada sin publicar un número.

A menor tiraje y mayor demanda, mayor suele ser el valor de reventa.`,
        tip: 'Antes de comprar una "edición limitada" verifica si el fabricante publicó el número de unidades. Sin ese dato, el límite puede ser muy amplio.'
      },
      {
        heading: 'Exclusive — Exclusiva',
        content: `Una exclusiva puede distribuirse únicamente mediante:
• Una tienda específica (BBTS, Shop.toysrus.com)
• Una convención (SDCC, NYCC, STGCC)
• Una región geográfica
• Un retailer selecto

Que sea exclusiva no significa necesariamente que existan pocas unidades. Una exclusiva de una cadena grande puede tener decenas de miles de unidades.`
      },
      {
        heading: 'Chase — La variante difícil',
        content: `Es una variante más difícil de encontrar incluida aleatoriamente dentro de una producción.

Ejemplo: Una versión estándar puede tener traje azul y su Chase traje rojo metalizado.

La distribución puede ser 1 Chase por cada 6, 12 o 24 unidades estándar según el fabricante.`,
        tip: 'Muchos coleccionistas compran cajas completas de productos con chase para aumentar las probabilidades de encontrarlo.'
      },
      {
        heading: 'Pre-Order — Preventa',
        content: `Una preventa permite reservar un producto antes de que se encuentre disponible para entrega inmediata.

Debe diferenciarse claramente entre:
• Fecha estimada de llegada
• Fecha garantizada de entrega

En coleccionables pueden existir modificaciones de producción, logística y aduanas que alteren los plazos.`,
        warning: 'En coleccionables de importación, los retrasos de 3 a 12 meses respecto a la fecha estimada son muy frecuentes. Planifica tu presupuesto con margen.'
      },
      {
        heading: 'Reissue — Reedición',
        content: `Una reedición vuelve a poner en circulación una pieza publicada anteriormente.

Puede ser:
• Prácticamente idéntica a la original
• Con packaging diferente o actualizado
• Corrigiendo pequeños defectos de la versión anterior
• Con elementos ligeramente modificados`
      },
      {
        heading: '¿Una reedición destruye el valor?',
        content: `No necesariamente.

El valor de un coleccionable depende de muchos factores:
• Demanda del personaje
• Condición de la pieza
• Versión específica
• Rareza y tiraje
• Fabricante
• Estado del mercado

Coleccionar exclusivamente pensando en revalorización implica asumir riesgo. La mejor estrategia sigue siendo comprar lo que genuinamente te gusta.`
      }
    ],
    related_search_tag: 'coleccion'
  },

  // ─── ARTÍCULO 12 — NUEVO ────────────────────────────────────────────────────
  'como-empezar-coleccion-figuras': {
    title: 'Cómo Empezar una Colección sin Comprar Todo lo que Ves',
    slug: 'como-empezar-coleccion-figuras',
    excerpt: 'Una guía práctica para definir tu colección, controlar el presupuesto y evitar compras impulsivas.',
    type: 'INICIO',
    read_time: '8 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    key_takeaways: [
      'Define un criterio claro: personaje, franquicia, escala o fabricante. Una colección con foco tiene más identidad.',
      'Investiga antes de comprar: tamaño real, fabricante, materiales y reseñas de otros coleccionistas.',
      'Aprender a decir "paso" en un lanzamiento es una habilidad tan importante como saber qué comprar.'
    ],
    sections: [
      {
        heading: 'El primer error: querer coleccionar todo',
        content: `Cuando alguien descubre el mundo de las figuras suele encontrarse con miles de productos.

Marvel. DC. Star Wars. Anime. Videojuegos. Películas. Estatuas. Funko. Figuras articuladas. Réplicas. Vehículos.

No necesitas elegir todo. De hecho, intentar coleccionar todo es la forma más rápida de no disfrutar nada.`,
        tip: 'El coleccionismo más satisfactorio suele ser el más curado. Cinco figuras que realmente amas valen más que cincuenta compradas por impulso.'
      },
      {
        heading: 'Paso 1 — Define un criterio',
        content: `Tu colección puede organizarse por:
• Personaje específico (solo Batman)
• Franquicia (todo el MCU)
• Película o arco específico
• Escala (solo 1:6 o solo 1:12)
• Fabricante (solo Hot Toys)
• Época (solo figuras vintage)
• Estilo (solo estatuas)

Un criterio hace que cada nueva pieza tenga sentido dentro del conjunto y le dé identidad a tu colección.`
      },
      {
        heading: 'Paso 2 — Define dónde vas a exhibirla',
        content: `El espacio importa tanto como el presupuesto.

Diez figuras 1:12 pueden caber fácilmente donde solamente entran dos grandes estatuas 1:4.

Antes de comenzar una línea nueva piensa: ¿dónde irá físicamente esta colección?`,
        warning: 'Comprar figuras sin espacio de exhibición genera cajas apiladas en el depósito. Eso no es coleccionar: es acumular.'
      },
      {
        heading: 'Paso 3 — Establece un presupuesto',
        content: `No necesitas comprar cada lanzamiento. Las marcas producen constantemente nuevas piezas.

Define un presupuesto mensual o anual y prioriza.

Una pieza que realmente quieres suele aportar más a una colección que tres compradas únicamente porque estaban en oferta.`
      },
      {
        heading: 'Paso 4 — Investiga antes de comprar',
        content: `Consulta siempre:
• Tamaño real (con accesorios incluidos)
• Escala y fabricante
• Materiales
• Accesorios incluidos
• Versión y región
• Reseñas de otros coleccionistas
• Fotografías reales (no solo promo del fabricante)

Una foto promocional no siempre permite apreciar el tamaño real ni los detalles de pintura.`,
        tip: 'YouTube tiene miles de unboxings detallados de figuras de colección. Ver uno antes de comprar puede ahorrarte decepciones.'
      },
      {
        heading: 'Paso 5 — No tengas miedo de decir "paso"',
        content: `Una de las habilidades más importantes de un coleccionista es aprender a no comprar.

No todo lanzamiento necesita estar en tu estantería. Los fabricantes siempre tendrán nuevas piezas disponibles.

Si una figura no te genera entusiasmo genuino hoy, probablemente tampoco te lo genere dentro de un año.`
      },
      {
        heading: 'Paso 6 — Construye una colección, no un depósito',
        content: `Una colección tiene una idea detrás.

Puede ser enorme o contener solamente diez piezas. Lo importante es que cada producto tenga una razón para estar allí.

Regla final: compra lo que realmente te gustaría seguir teniendo dentro de cinco años. Eso suele ser mucho más útil que perseguir cada lanzamiento nuevo.`
      }
    ],
    related_search_tag: 'figuras'
  },

  // ─── 20 NUEVAS GUÍAS EDITORIALES DE TENDENCIA ─────────────────────────────────
  // SECCIÓN 1: PRIMEROS PASOS
  'el-arte-del-foco-como-elegir-linea-coleccion': {
    title: 'El Arte del Foco: Cómo Elegir una Sola Línea y Dominarla sin Dispersarse',
    slug: 'el-arte-del-foco-como-elegir-linea-coleccion',
    excerpt: 'La dispersión es la enemiga número uno del coleccionista. Descubre cómo definir un foco temático fuerte y dominar una línea con criterio y coherencia visual.',
    type: 'INICIO',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80',
    key_takeaways: [
      'El coleccionismo de impacto se define por lo que decides NO comprar.',
      'Elegir una franquicia o escala ancla evita repisas caóticas tipo bazar.',
      'Tener un presupuesto enfocado permite adquirir piezas de gama alta en lugar de decenas de figuras mediocres.'
    ],
    sections: [
      {
        heading: '1. El Síndrome del Bazar: Por Qué la Dispersión Arruina Colecciones',
        content: `El impulso inicial de todo coleccionista es acumular todo personaje o franquicia que alguna vez despertó nostalgia: un superhéroe por aquí, un auto a escala por allá, un personaje de anime y una nave espacial. Al cabo de dos años, la habitación no parece una galería curada, sino un bazar desordenado donde ninguna pieza tiene protagonismo real.

El coleccionismo maduro entiende que el impacto estético no proviene del volumen, sino de la coherencia temática y cromática de la exhibición.`,
        tip: 'Toma una foto de tu repisa actual. Si una persona ajena al hobby no puede deducir la temática en 3 segundos, necesitas aplicar foco.'
      },
      {
        heading: '2. Definiendo tu Franquicia y Escala Ancla',
        content: `Para dominar una línea, debes seleccionar una escala rectora (por ejemplo, 1:12 para figuras de acción o 1:6 para estatuas/cine) y un universo narrativo claro. Si eliges Batman, decide si tu foco son los cómics clásicos, el universo cinematográfico o una etapa editorial específica. Esta restricción voluntaria filtra el 95% del ruido del mercado.`,
        warning: 'Mezclar escalas dispares en una misma balda (como 1:12 con 1:10) destruye la proporción anatómica y la ilusión de realismo.'
      },
      {
        heading: '3. El Criterio de la Pieza Central (Grail Focus)',
        content: `En lugar de comprar cuatro figuras de gama baja al mes, una estrategia enfocada destina ese mismo capital a conseguir el Santo Grial de la línea: esa pieza definitiva con escultura superior, ropa a medida o esculpido premium que eleva todas las figuras a su alrededor.`,
        tip: 'Menos piezas pero de calidad superior siempre retienen mejor su valor en el mercado secundario.'
      }
    ],
    related_search_tag: 'figuras'
  },
  'completismo-vs-curaduria-coleccionismo': {
    title: 'Completismo vs Curaduría: Por Qué Intentar Tener Todo Arruina el Disfrute',
    slug: 'completismo-vs-curaduria-coleccionismo',
    excerpt: 'El síndrome de la wave completa genera fatiga y repisas saturadas. Aprende a aplicar curaduría estética para que cada figura destaque como una obra de arte.',
    type: 'INICIO',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&q=80',
    key_takeaways: [
      'Completar colecciones por obligación genera fatiga financiera y hastío emocional.',
      'La curaduría convierte una vitrina en una experiencia visual de nivel museo.',
      'El espacio físico libre (espacio negativo) es tan importante como las figuras exhibidas.'
    ],
    sections: [
      {
        heading: '1. La Trampa de la Wave Completa',
        content: `Las compañías fabricantes diseñan olas de productos incluyendo personajes de relleno (los conocidos peg warmers) para obligar a comprar la serie completa y armar una figura extra (BAF). Caer en esta trampa significa gastar dinero en figuras que no te apasionan solo por completar una casilla imaginaria en un checklist.`,
        warning: 'Si compras una figura solo porque viene con la pierna del BAF, evalúa si es más económico adquirir la pieza suelta en el mercado secundario.'
      },
      {
        heading: '2. El Valor del Espacio Negativo',
        content: `En museos y galerías de arte, las obras maestras respiran. Cuando apiñas 40 figuras hombro con hombro, ninguna resalta; los ojos del espectador se saturan y la inversión se diluye visualmente. Dejar aire entre las piezas crea dramatismo, sombras naturales y permite apreciar el esculpido.`,
        tip: 'Aplica la regla de oro: exhibe solo el 60% de tu capacidad de repisa. Rota piezas periódicamente para mantener la frescura de tu colección.'
      },
      {
        heading: '3. Curaduría Emocional: Comprar lo Esencial',
        content: `Pregúntate antes de cada adquisición: ¿Esta pieza cuenta una historia con el resto de mi vitrina? Si la respuesta es una duda tibia, déjala pasar. La curaduría rigurosa es el único antídoto contra el arrepentimiento del comprador.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  'presupuesto-real-coleccionista-costos-ocultos': {
    title: 'Presupuesto Real del Coleccionista: Costo Oculto de Envíos, Aduana y Exhibición',
    slug: 'presupuesto-real-coleccionista-costos-ocultos',
    excerpt: 'El precio de la figura es solo la mitad de la historia. Guía financiera para calcular fletes internacionales, franquicias aduaneras, vitrinas y accesorios.',
    type: 'COMPRA',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80',
    key_takeaways: [
      'El precio de etiqueta (MSRP) representa apenas el 50% al 60% del costo total de tener la pieza en mano.',
      'Fletes volumétricos, impuestos locales y vitrinas deben presupuestarse con antelación.',
      'Tener un fondo de reserva mensual previene desajustes económicos frente a preventas simultáneas.'
    ],
    sections: [
      {
        heading: '1. El Desglose Real de Costos de Importación',
        content: `Al comprar mediante catálogo internacional, entran en juego variables clave: el peso real vs. el peso volumétrico de la caja (cajas de figuras 1:6 con arte collector pesan poco pero ocupan enorme volumen), el costo del flete por kilo o libra, y la tarifa de gestión de courier.`,
        tip: 'Siempre investiga las dimensiones de la caja exterior (brown shipper) antes de estimar el flete; una caja sobredimensionada puede duplicar el costo del envío.'
      },
      {
        heading: '2. Iluminación y Vitrinas: El Costo Invisible de Exhibir',
        content: `Una estatua de USD 500 apoyada en una mesa sin protección se deteriora rápidamente con polvo y rayos solares. Una vitrina hermética de cristal templado, tiras LED de luz fría (que no emiten radiación UV ni calor que degrade el PVC) y bases acrílicas representan entre el 20% y 30% del presupuesto de un coleccionista responsable.`,
        warning: 'Nunca uses luces halógenas o tiras LED cálidas de baja calidad cerca de figuras; el calor constante deforma extremidades finas y reblandece el plástico.'
      },
      {
        heading: '3. Estrategia de Asignación Presupuestaria',
        content: `La regla financiera recomendada para el hobby es el método 60/25/15: 60% para compras directas de figuras, 25% para logística, aranceles y envíos, y 15% para infraestructura de conservación (vitrinas, displays, selladores).`
      }
    ],
    related_search_tag: 'figuras'
  },
  'sindrome-caja-cerrada-open-box-vs-sellado': {
    title: 'El Síndrome de la Caja Cerrada: Debate Definitivo entre Open-Box y Conservación Sellada',
    slug: 'sindrome-caja-cerrada-open-box-vs-sellado',
    excerpt: '¿Disfrutar en vitrina o especular con precintos de fábrica? Análisis imparcial sobre valor de reventa, degradación del plástico en caja y disfrute personal.',
    type: 'INICIO',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80',
    key_takeaways: [
      'Las figuras modernas en empaque hermético sufren exudación de plastificantes si jamás se abren.',
      'El empaque MISB preserva el valor de reventa solo si el cartón se mantiene intacto sin aplastamientos.',
      'El open-box cuidadoso permite disfrutar de la articulación sin perder más del 10% al 15% del valor si conservas blíster y caja perfecta.'
    ],
    sections: [
      {
        heading: '1. La Degradación Química: El Fenómeno del Plástico Pegajoso',
        content: `Muchos coleccionistas creen que guardar una figura sellada dentro de su caja de cartón la mantiene eternamente impecable. Químicamente ocurre lo contrario: los plastificantes (ftalatos) que mantienen flexible el PVC se evaporan con los años. Si la figura está sellada sin circulación de aire, esos gases se condensan en la superficie, dejando la figura grasosa, brillante y pegajosa.`,
        warning: 'Si mantienes figuras MISB por años en climas húmedos o cálidos, los plastificantes atrapados pueden arruinar de forma irreversible la pintura y las capas transparentes.'
      },
      {
        heading: '2. El Valor de Mercado: ¿Realmente se Pierde Tanto al Abrir?',
        content: `En líneas contemporáneas para coleccionistas adultos (como MAFEX, S.H.Figuarts, Hot Toys o Mezco), las cajas vienen diseñadas tipo caja de ventana o clamshell reutilizable. Abrir la figura con bisturí por las pestañas inferiores sin rasgar el cartón y conservarla en vitrina protegida mantiene intacto entre el 85% y 90% de su cotización de reventa.`,
        tip: 'Abre siempre los sellos circulares cortándolos suavemente con una cuchilla fina en lugar de tirar de la cinta adhesiva, para no desgarrar el arte de la caja.'
      },
      {
        heading: '3. El Propósito del Hobby: Coleccionar vs Almacenar Cajas',
        content: `Una colección apilada en cajas marrones en un placard es un inventario, no una colección. Salvo casos muy específicos de tarjetas vintage clásicas, el mayor dividendo del coleccionismo es el disfrute visual diario de ver a tus personajes favoritos posados con maestría.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  // SECCIÓN 2: ESCALAS & TAMAÑOS
  'batalla-escala-1-12-import-japones-vs-retail-americano': {
    title: 'Batalla en Escala 1:12: Diferencias Reales entre Import Japonés y Retail Americano',
    slug: 'batalla-escala-1-12-import-japones-vs-retail-americano',
    excerpt: 'MAFEX y S.H.Figuarts frente a Marvel Legends y DC Multiverse: comparativa milimétrica de articulación, accesorios, escala real y relación calidad-precio.',
    type: 'GUÍA',
    read_time: '8 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&q=80',
    key_takeaways: [
      'Las figuras importadas destacan por ingeniería de doble articulación, manos intercambiables y pintura matizada.',
      'El retail americano ofrece figuras robustas, económicas y de alta durabilidad para manipulación constante.',
      'La escala nominal de 6 pulgadas varía: los imports suelen rondar los 15-15.5 cm mientras que las marcas americanas rozan los 16.5-17 cm.'
    ],
    sections: [
      {
        heading: '1. Ingeniería Articular: Rótulas Complejas vs Pines Clásicos',
        content: `Las marcas de importación utilizan articulaciones esféricas compuestas, hombros con bisagra tipo mariposa oculta y torsos multi-segmentados que permiten poses hiper-dinámicas idénticas a viñetas de manga o cómic. En contraste, el retail masivo tradicionalmente usaba articulaciones con clavijas visibles (pins), aunque recientemente ha migrado a sistemas pinless más limpios pero con menor rango en caderas y cuello.`,
        tip: 'Si buscas recrear poses acrobáticas en el aire (como Spider-Man colgando de una telaraña), un import de alta gama ofrece el rango angular exacto que una figura masiva no puede alcanzar.'
      },
      {
        heading: '2. Accesorios y Presentación',
        content: `Un import típico de USD 80 a 100 incluye 4 a 6 pares de manos, 3 rostros expresivos alternativos, accesorios con pintura detallada y stand articulado transparente. El retail americano suele limitar los extras a un arma básica o una pieza BAF, manteniendo el precio en una franja de USD 25 a 35.`,
        warning: 'Las articulaciones de las figuras de importación son micro-ingeniería delicada; forzarlas en frío sin calentar puede quebrar los pernos con facilidad.'
      },
      {
        heading: '3. Veredicto de Compatibilidad',
        content: `No intentes posar a un Batman de importación junto a un Superman de retail americano sin escalonar la profundidad de la vitrina: la diferencia de volumen corporal y altura romperá la armonía visual de la escena.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'frontera-18-cm-escala-1-10-mcfarlane-neca': {
    title: 'La Frontera de los 18 cm: Por Qué la Escala 1:10 de McFarlane y NECA No Encaja con Todo',
    slug: 'frontera-18-cm-escala-1-10-mcfarlane-neca',
    excerpt: 'Las 7 pulgadas tienen una presencia imponente pero generan pesadillas de escala al mezclarse. Cómo armar repisas armoniosas con escala 1:10.',
    type: 'GUÍA',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    key_takeaways: [
      'Las 7 pulgadas (18 cm) llenan estantes grandes con excelente relación tamaño-precio.',
      'No son compatibles anatómicamente con la escala 1:12 estándar de 15 cm.',
      'NECA domina el cine de terror y clásicos de acción; McFarlane reina en los superhéroes de cómic.'
    ],
    sections: [
      {
        heading: '1. El Encanto de las 7 Pulgadas',
        content: `La escala 1:10 se consolidó como la favorita de quienes desean una presencia imponente en repisa sin pagar el elevado precio ni ocupar el espacio masivo de una estatua 1:6. Por su tamaño, permite esculpir texturas de piel, cuero, tela rasgada y armaduras con un nivel de microdetalle que en 1:12 suele quedar empastado.`,
        tip: 'Las figuras 1:10 de NECA (Alien, Predator, Robocop) lucen espectaculares en dioramas temáticos individuales con iluminación focal.'
      },
      {
        heading: '2. El Problema de Escala Cruzada',
        content: `Un personaje estándar en 1:10 mide entre 18 y 19 cm. Si colocas un Batman de 7 pulgadas al lado de un Iron Man de 6 pulgadas, Batman parecerá un gigante de dos metros y medio de altura. Intentar crear un crossover visual en el mismo estante suele verse poco profesional.`,
        warning: 'Reserva baldas enteras exclusivamente para figuras de 7 pulgadas para evitar el contraste de escala antinatural.'
      },
      {
        heading: '3. Rigidez Articular y Posa Escultórica',
        content: `Tanto NECA como McFarlane priorizan la escultura por sobre la hiper-movilidad. Sus figuras están diseñadas para posas icónicas de museo más que para acrobacias extremas. Manejarlas con esa expectativa garantiza total satisfacción.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'el-salto-a-escala-1-6-requisitos-espacio-vitrinas': {
    title: 'El Salto a 1:6: Requisitos de Espacio, Peso y Soporte Antes de Comprar tu Primera Pieza',
    slug: 'el-salto-a-escala-1-6-requisitos-espacio-vitrinas',
    excerpt: 'Una figura de 30 cm con metal diecast y base dinámica no entra en cualquier estante. Lo que debes preparar en tu habitación antes de recibir tu primer Hot Toys o InArt.',
    type: 'GUÍA',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&q=80',
    key_takeaways: [
      'Las figuras sixth scale requieren estanterías de al menos 38 a 40 cm de altura libre por nivel.',
      'Las figuras Diecast (con aleación metálica) pesan entre 1.5 y 2.5 kg y exigen repisas reforzadas.',
      'La luz solar directa y la humedad no controlada deterioran trajes de cuerina y telas sintéticas rápidamente.'
    ],
    sections: [
      {
        heading: '1. Dimensiones Reales: Más Allá de los 30 cm',
        content: `Aunque la figura de pie mide 30 cm, al montarla en su base de exhibición dinámica, con capa ondeando o portando armas largas, el espacio vertical necesario supera frecuentemente los 38 cm y 30 cm de fondo. Estanterías populares de melamina económica suelen tener espacios fijos de 28 cm que impiden colocar la pieza sin arquearla.`,
        tip: 'Verifica la altura interna útil de tu vitrina antes de presionar el botón de compra; considera vitrinas modulares con baldas ajustables.'
      },
      {
        heading: '2. Peso y Resistencia del Cristal',
        content: `Las piezas de alta gama que incorporan armaduras de aleación de zinc (Diecast) o bases con diorama de resina ejercen una presión puntual elevada. Colocar 4 o 5 figuras Diecast sobre un mismo vidrio de 4 mm sin soportes intermedios puede provocar fatiga de material y roturas catastróficas.`,
        warning: 'Usa estantes de cristal templado de al menos 6 mm de grosor o baldas de madera maciza para exhibir grupos de figuras 1:6.'
      },
      {
        heading: '3. Entorno de Conservación Obligatorio',
        content: `Los trajes a medida y esculturas de cabeza pintadas a mano de 1:6 exigen una vitrina cerrada con burletes anti-polvo. Limpiar el polvo acumulado en telas delicadas con plumeros abrasivos desgasta la textura original.`
      }
    ],
    related_search_tag: 'estatuas'
  },
  'micro-escalas-miniaturas-figuras-1-18-y-1-24': {
    title: 'Micro-Escalas y Miniaturas: Guía para Integrar Figuras 1:18 y 1:24 en tu Repisa',
    slug: 'micro-escalas-miniaturas-figuras-1-18-y-1-24',
    excerpt: 'De Star Wars Vintage Collection a JoyToy Warhammer 40K: el renacimiento de las 3.75 pulgadas y cómo construir dioramas masivos en espacios reducidos.',
    type: 'GUÍA',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=1200&q=80',
    key_takeaways: [
      'La escala 1:18 (3.75 pulgadas / 10 cm) permite construir vehículos a escala y bases enteras sin ocupar una habitación.',
      'Marcas contemporáneas como JoyToy han llevado la articulación y micro-pintura de 1:18 al nivel de figuras de 6 pulgadas.',
      'Ideal para coleccionistas con limitaciones severas de espacio habitacional.'
    ],
    sections: [
      {
        heading: '1. El Renacimiento de las 3.75 Pulgadas',
        content: `Históricamente dominada por figuras clásicas de Star Wars y G.I. Joe con articulación básica de 5 puntos, la micro-escala ha experimentado una revolución técnica. Hoy en día, fabricantes como JoyToy y Hiya Toys fabrican figuras de 10 cm con 25 puntos de articulación, manos intercambiables y pintura con efecto de desgaste militar.`,
        tip: 'La escala 1:18 es perfecta para crear dioramas de hangares de combate o trincheras con múltiples soldados sin requerir muebles especiales.'
      },
      {
        heading: '2. Vehículos a Escala Realista',
        content: `El mayor superpoder de la escala 1:18 es la compatibilidad con vehículos. Un caza espacial o un tanque blindado en escala 1:12 mediría más de un metro y pesaría diez kilos; en 1:18 entra perfectamente en la parte superior de un mueble estándar manteniendo proporciones idénticas a las películas.`,
        warning: 'Debido a la pequeñez de los pines en 1:18, nunca fuerces las articulaciones de codos o muñecas con palanca lateral brusca.'
      },
      {
        heading: '3. Optimización de Espacio',
        content: `En el espacio que ocupa una sola figura 1:6, puedes exhibir un escuadrón completo de 12 tropas 1:18 con sus armamentos y barricadas. Si vives en apartamento, esta escala es la aliada número uno de tu colección.`
      }
    ],
    related_search_tag: 'figuras'
  },
  // SECCIÓN 3: AUTENTICIDAD & FABRICANTES
  'mercado-cabezas-custom-escultura-3d-pintura': {
    title: 'El Mercado de las Cabezas Custom: Escultura 3D, Pintura a Mano y Licencias no Oficiales',
    slug: 'mercado-cabezas-custom-escultura-3d-pintura',
    excerpt: 'El auge del aftermarket artístico: escultores digitales, pintores independientes en Patreon e Instagram, y cómo elevar una figura comercial a nivel de museo.',
    type: 'AUTENTICIDAD',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    key_takeaways: [
      'Las cabezas custom reemplazan esculpidos masivos de fábrica por retratos fotorrealistas únicos.',
      'La combinación de resina fotosensible 8K e impresión 3D ha democratizado el coleccionismo hiper-personalizado.',
      'Saber verificar la reputación del artista y el tipo de anclaje (neck peg) evita incompatibilidades mecánicas.'
    ],
    sections: [
      {
        heading: '1. La Revolución del Headsculpt Independiente',
        content: `Muchas veces una figura comercial posee un cuerpo excelente y ropa bien confeccionada, pero el rostro de producción masiva carece de parecido con el actor o luce inexpresivo por limitaciones de fábrica. Aquí entra el mercado custom: artistas independientes esculpen digitalmente retratos ultra-precisos, los imprimen en resina de alta resolución y los pintan a mano capa por capa.`,
        tip: 'Seguir a pintores profesionales de miniaturas en redes permite acceder a tandas limitadas de cabezas pintadas de altísimo valor coleccionable.'
      },
      {
        heading: '2. Clavijas y Adaptación (Pegs)',
        content: `Cada marca (Hasbro, MAFEX, Mezco, Hot Toys) utiliza clavijas de cuello con diámetros milimétricamente distintos. Al encargar una cabeza custom, consulta si incluye adaptador interno de silicona o si requerirá masilla adhesiva tipo Blu-Tack para ajustarse al cuello de tu figura.`,
        warning: 'Las resinas 3D convencionales son más quebradizas que el PVC comercial; si la cabeza cae al suelo sobre una superficie dura, la nariz o el cabello fino pueden astillarse fácilmente.'
      },
      {
        heading: '3. El Valor Residual de una Figura Personalizada',
        content: `Una figura masiva mejorada con una cabeza custom firmada por un artista reconocido a menudo duplica su cotización entre la comunidad de coleccionistas avanzados.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  'lineas-entrada-vs-alta-gama-fabricantes-coleccionismo': {
    title: 'Líneas de Entrada vs Alta Gama: Bandai Spirits, Good Smile Company y Medicom Explicadas',
    slug: 'lineas-entrada-vs-alta-gama-fabricantes-coleccionismo',
    excerpt: 'Ichibansho vs Figuarts ZERO, Pop Up Parade vs Scale Figures y MAFEX vs Figma: guía de jerarquías para saber exactamente por qué estás pagando.',
    type: 'AUTENTICIDAD',
    read_time: '8 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    key_takeaways: [
      'Las figuras de entrada (premios/prize) usan PVC moldeado en color con sombreados mínimos para mantener precios accesibles.',
      'Las líneas de escala (scale figures) y alta articulación utilizan pintura multicapa aerográfica y materiales de resina/ABS prémium.',
      'Conocer la jerarquía interna de cada fabricante previene pagar sobreprecios por figuras de gama base.'
    ],
    sections: [
      {
        heading: '1. Bandai: De Banpresto Premio a S.H.Figuarts e Ichibansho',
        content: `Bandai Spirits opera múltiples divisiones. Banpresto produce estatuas prize pensadas originalmente para máquinas recreativas y retail accesible; son piezas atractivas pero con costuras de molde visibles y plástico mate sin pintar. En el escalón medio-alto se ubican las Ichibansho (lanzamientos de mayor escala y mejor empaque) y las S.H.Figuarts, que representan su estándar dorado de figuras de acción articuladas.`,
        tip: 'Si buscas fidelidad anatómica y efectos de poder traslúcidos espectaculares, la serie Figuarts ZERO ofrece la mejor relación precio-calidad en estatuas estáticas de anime.'
      },
      {
        heading: '2. Good Smile: Pop Up Parade vs Escalas 1:7 y Figma',
        content: `Good Smile Company revolucionó el mercado con Pop Up Parade: estatuas de USD 35 a 45 con poses estandarizadas y calidad consistente. Sin embargo, no deben confundirse con sus estatuas a escala oficial (1:7 o 1:8), cuyos acabados nacarados, bases complejas y esculpido de cabello transparente justifican cotizaciones superiores a USD 180.`,
        warning: 'No esperes encontrar articulaciones en líneas como Pop Up Parade o Ichibansho; son figuras completamente estáticas orientadas a posa fija.'
      },
      {
        heading: '3. Medicom Toy y MAFEX: El Éxito de la Acción Coleccionable',
        content: `Medicom se enfoca en coleccionistas exigentes mediante su línea MAFEX. Con capas de tela con alambre perimetral maleable, articulaciones ultra-suaves y licencias icónicas de cómics y cine, se posiciona en el segmento más alto de la escala 1:12.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'guerra-titanes-1-6-hot-toys-vs-inart-ingenieria': {
    title: 'Guerra de Titanes 1:6: Ingeniería de Hot Toys frente a la Silicona y Pelo Enraizado de InArt',
    slug: 'guerra-titanes-1-6-hot-toys-vs-inart-ingenieria',
    excerpt: 'La revolución del hiperrealismo: articulaciones magnéticas, trajes a medida y ojos móviles independientes. El cambio de paradigma en el coleccionismo cinematográfico.',
    type: 'AUTENTICIDAD',
    read_time: '9 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    key_takeaways: [
      'Hot Toys ostenta el catálogo más extenso y robustez comprobada en piezas Diecast y licencias cinematográficas.',
      'InArt (Queen Studios) ha elevado el estándar con cabello enraizado de lana de oveja, ojos móviles magnéticos y piel de silicona médica.',
      'La competencia directa ha forzado a toda la industria 1:6 a mejorar sus técnicas de realismo y esculpido.'
    ],
    sections: [
      {
        heading: '1. El Dominio Histórico de Hot Toys',
        content: `Durante más de dos décadas, la firma de Hong Kong ha sido el sinónimo indiscutido de figuras coleccionables de 12 pulgadas. Su catálogo de Marvel, Star Wars y DC definió el mercado, introduciendo armaduras con piezas metálicas Diecast, sistemas de iluminación LED y trajes con patronaje de alta costura a escala reducida.`,
        tip: 'Las figuras Diecast de Hot Toys mantienen un valor de reventa sobresaliente debido a la durabilidad de sus estructuras internas metálicas.'
      },
      {
        heading: '2. La Irrupción de InArt y la Búsqueda del Hiperrealismo',
        content: `InArt entró al mercado apostando por técnicas propias de la escultura de museo: cabello enraizado manualmente con fibras naturales (mohair), ojos con iris de cristal y movimiento independiente regulable mediante joystick magnético trasero, e imanes en las suelas del calzado para eliminar las antiestéticas pinzas de cintura en los stands.`,
        warning: 'Las figuras con cabello enraizado requieren mantenimiento con cera de peinado y tijeras de precisión; no son piezas para manipulación lúdica continua.'
      },
      {
        heading: '3. Cómo Elegir entre Ambas Marcas',
        content: `Si valoras la solidez, la variedad de personajes secundarios y la tranquilidad de una marca consagrada, Hot Toys es la elección segura. Si buscas una pieza de conversación definitiva que parezca literalmente una persona viva en miniatura, InArt marca la vanguardia artística.`
      }
    ],
    related_search_tag: 'estatuas'
  },
  'resinas-estudio-licencia-oficial-vs-garages-custom': {
    title: 'El Universo de las Resinas de Estudio: Licencia Oficial frente a Garages No Autorizados',
    slug: 'resinas-estudio-licencia-oficial-vs-garages-custom',
    excerpt: 'Prime 1 Studio, Tsume y XM Studios frente a los estudios independientes sin licencia. Pros, contras de valor, seguridad en envíos y calidad de fundición.',
    type: 'AUTENTICIDAD',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&q=80',
    key_takeaways: [
      'Las estatuas con licencia oficial ofrecen certificados de autenticidad, control de calidad regulado y garantía contra roturas de fábrica.',
      'Los estudios no oficiales (custom garages) exploran conceptos arriesgados que los titulares de derechos no autorizan, pero carecen de respaldo legal.',
      'El envío internacional de resinas polystone exige cajas de poliestireno de alta densidad debido a la fragilidad inherente del material.'
    ],
    sections: [
      {
        heading: '1. La Garantía de la Licencia Oficial',
        content: `Compañías como Prime 1 Studio, Sideshow Collectibles, Tsume Art y XM Studios trabajan bajo supervisión directa de estudios cinematográficos y editoriales. Cada rostro y proporción debe ser aprobada antes de la producción en masa. Además, vienen acompañadas de placas metálicas numeradas y embalajes diseñados para resistir caídas severas durante el flete marítimo.`,
        tip: 'Las resinas oficiales siempre conservan mayor liquidez en subastas y grupos internacionales de coleccionismo debido a la trazabilidad de su certificado.'
      },
      {
        heading: '2. El Atractivo de los Garages No Oficiales',
        content: `Muchos talleres independientes producen piezas espectaculares de anime o cómics que las marcas tradicionales no fabrican por restricciones de licencia. Ofrecen estéticas alternativas o momentos cumbre de batallas sangrientas. No obstante, existe el riesgo de que el taller cierre antes de entregar preventas o que la calidad de pintura final difiera fuertemente del prototipo 3D digital.`,
        warning: 'Si una resina no oficial llega rota en el correo, la posibilidad de recibir piezas de reemplazo es prácticamente nula, requiriendo restauraciones manuales con cianoacrilato.'
      },
      {
        heading: '3. El Material Polystone: Rigidez y Fragilidad',
        content: `Tanto en resinas oficiales como custom, el material no es plástico PVC flexible, sino resina de poliéster mezclada con polvo mineral (polystone), fría al tacto y muy pesada. Un golpe leve puede quebrar dedos finos o espadas en mil pedazos.`
      }
    ],
    related_search_tag: 'estatuas'
  },
  // SECCIÓN 4: MATERIALES, MANTENIMIENTO & POSA
  'articulaciones-rigidas-clavijas-quebradas-tecnicas-calor': {
    title: 'Articulaciones Rígidas y Clavijas Quebradas: Técnicas Seguras con Calor para No Romper Figuras',
    slug: 'articulaciones-rigidas-clavijas-quebradas-tecnicas-calor',
    excerpt: 'El método del baño de agua caliente a 60°C y el secador de pelo. Cómo aflojar articulaciones duras de fábrica sin blanquear ni quebrar las clavijas de plástico.',
    type: 'CUIDADO',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    key_takeaways: [
      'Jamás fuerces una articulación rígida en frío; el 90% de las clavijas rotas ocurren en los primeros 10 minutos de unboxing.',
      'El calor reblandece temporalmente el plástico exterior (PVC) permitiendo liberar la rótula interna (POM/ABS) sin esfuerzo.',
      'El agua tibia controlada a 60°C es el método más uniforme y seguro para no quemar la pintura.'
    ],
    sections: [
      {
        heading: '1. Por Qué Vienen Rígidas de Fábrica',
        content: `Durante el ensamblaje en fábrica y el enfriamiento tras el moldeo, los excesos de barniz transparente o las tolerancias mecánicas mínimas pueden hacer que el plástico se adhiera entre sí. Si aplicas fuerza bruta en frío, el plástico rígido genera marcas de estrés blanco y la clavija de la muñeca o el tobillo se cercena limpiamente.`,
        warning: 'Nunca hagas palanca con pinzas metálicas sobre una articulación trabada sin haber aplicado calor previo.'
      },
      {
        heading: '2. El Método del Baño de Agua a 60°C',
        content: `Sumerge la extremidad bloqueada en un vaso con agua caliente (no hirviendo; unos 60°C, similar a la temperatura de una infusión de té) durante 40 a 60 segundos. El PVC absorberá el calor, se volverá gomoso y flexible, y podrás mover suavemente la rótula en su eje natural. Una vez enfriado a temperatura ambiente, el plástico recupera su dureza original.`,
        tip: 'Si la figura tiene ropa de tela o partes electrónicas que no pueden mojarse, utiliza un secador de pelo a potencia media a 15 cm de distancia moviéndolo en círculos constantes.'
      },
      {
        heading: '3. Lubricación Preventiva con Silicona',
        content: `Una vez liberada la articulación, una microgota de lubricante 100% de silicona pura aplicada con la punta de un escarbadientes garantizará un giro suave y evitará que vuelva a pegarse en el futuro.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'articulaciones-flojas-devolver-firmeza-rotulas-sin-pegamento': {
    title: 'Articulaciones Flojas y Desgaste: Cómo Devolverle Firmeza a Rótulas y Ball-Joints sin Pegamento',
    slug: 'articulaciones-flojas-devolver-firmeza-rotulas-sin-pegamento',
    excerpt: 'El uso correcto de polímeros acrílicos al agua (Kiki Loose Joints, barniz acrílico brillante) para engrosar rótulas gastadas sin soldar la articulación.',
    type: 'CUIDADO',
    read_time: '5 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    key_takeaways: [
      'El cianoacrilato (pegamento instantáneo) es peligroso porque puede soldar permanentemente la rótula o emanar vapores blancos que arruinen la pintura.',
      'Los polímeros acrílicos base agua aumentan la fricción de forma segura y reversible.',
      'Con paciencia y capas finas se puede restaurar una figura inestable para que vuelva a sostenerse de pie sin caer.'
    ],
    sections: [
      {
        heading: '1. El Peligro del Pegamento Instantáneo',
        content: `El error más habitual entre coleccionistas novatos es aplicar pegamento instantáneo sobre una articulación floja esperando moverla rápidamente antes de que cure. El cianoacrilato emite vapores que generan manchas blancas opacas indelebles (frosting) en el plástico y, si te demoras un segundo, la articulación quedará petrificada para siempre.`,
        warning: 'Jamás apliques pegamentos instantáneos directamente en cavidades articulares cerradas.'
      },
      {
        heading: '2. La Técnica del Barniz Acrílico al Agua',
        content: `El método profesional consiste en utilizar un barniz acrílico poliuretánico al agua o formulaciones especializadas como Kiki Loose Joints. Se aplica una gota con un pincel fino directamente en la holgura del ball-joint y se flexiona la articulación suavemente durante dos minutos.`,
        tip: 'El polímero acrílico crea una micro-película transparente y gomosa que rellena las décimas de milímetro gastadas, devolviendo la fricción perfecta sin riesgo alguno.'
      },
      {
        heading: '3. Reparación de Pines con Cinta de Teflón',
        content: `Para figuras donde la articulación se puede desmontar fácilmente (como muñecas o codos de figuras modulares), envolver la clavija con dos vueltas de cinta de teflón de plomería engrosa el perno de forma 100% limpia, seca y reversible.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'centro-gravedad-balance-posa-dinamica-sin-stands': {
    title: 'Centro de Gravedad y Balance: Principios de Posa Dinámica sin Depender de Stands Visibles',
    slug: 'centro-gravedad-balance-posa-dinamica-sin-stands',
    excerpt: 'Línea de acción, distribución del peso en tobillos y rotación de cadera. Cómo lograr que tus figuras de acción luzcan vivas y cinematográficas en la vitrina.',
    type: 'CUIDADO',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    key_takeaways: [
      'Una figura rígida y recta parece un juguete barato; una postura asimétrica con rotación de torso le da peso y presencia humana.',
      'El secreto del equilibrio reside en la articulación de basculación del tobillo (ankle rocker).',
      'Distribuir el centro de masa sobre la pierna de apoyo permite posas complejas sin soportes plásticos invasivos.'
    ],
    sections: [
      {
        heading: '1. La Línea de Acción y el Contrapposto',
        content: `Los escultores clásicos griegos inventaron el contrapposto: inclinar la cadera en una dirección y los hombros en la opuesta. En tus figuras, nunca dejes los pies alineados paralelos al frente ni los brazos cayendo como estacas. Desplaza el peso hacia una de las piernas, gira levemente la cabeza y torsiona el pecho hacia la línea visual del personaje.`,
        tip: 'Imita tú mismo la pose frente a un espejo durante 5 segundos para sentir dónde recae la gravedad natural del cuerpo antes de posar la figura.'
      },
      {
        heading: '2. El Dominio del Ankle Rocker',
        content: `Para que una figura se sostenga sin caer hacia adelante o hacia atrás, ambas suelas del calzado deben hacer contacto plano y total con la superficie de la repisa. Ajusta primero la inclinación lateral del tobillo: si la suela queda levantada por el borde exterior, la figura resbalará indefectiblemente.`,
        warning: 'Una figura mal balanceada en la repisa superior de una vitrina puede caer derribando en efecto dominó decenas de piezas valiosas.'
      },
      {
        heading: '3. El Truco del Museo: Museum Putty',
        content: `Si deseas exhibir a tus figuras en poses dinámicas al borde de la repisa sin usar brazos de plástico transparentes que arruinen la vista limpia, coloca una pequeña bolita de masilla de museo (Museum Wax o Blu-Tack neutro) bajo la suela del pie de apoyo. Mantiene la figura fijada contra vibraciones cotidianas sin manchar el plástico.`
      }
    ],
    related_search_tag: 'figuras'
  },
  'cuidado-ropa-tela-cuerina-pleather-evitar-cuarteado': {
    title: 'Ropa de Tela y Cuerina (Pleather): Cómo Evitar el Cuarteado y Descascarillado con los Años',
    slug: 'cuidado-ropa-tela-cuerina-pleather-evitar-cuarteado',
    excerpt: 'La hidrólisis en chaquetas de cuerina y trajes de vinilo es la peor pesadilla en escala 1:6. Productos hidratantes (303 Aerospace Protectant) y humedad ideal.',
    type: 'MATERIALES',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1200&q=80',
    key_takeaways: [
      'La cuerina sintética (poliuretano sobre tela) se desintegra por hidrólisis ante excesos o carencias extremas de humedad ambiental.',
      'Mantener figuras en posturas con codos o rodillas flexionadas al 100% agrieta la capa exterior del traje con el tiempo.',
      'Tratamientos periódicos con protectores UV y acondicionadores sin petróleo prolongan la vida útil del material por décadas.'
    ],
    sections: [
      {
        heading: '1. Qué es la Hidrólisis y Por Qué Ocurre',
        content: `La mayoría de los trajes oscuros de superhéroes y chaquetas en escala 1:6 están confeccionados con polipiel o cuerina (pleather). Con el paso de los años, las moléculas de agua del aire reaccionan con la capa de poliuretano, provocando que se vuelva quebradiza, se descascara y se desprenda en diminutas escamas negras.`,
        warning: 'Nunca guardes figuras con trajes de vinilo o cuerina en bolsas de plástico herméticas: la humedad condensada acelera drásticamente la degradación del material.'
      },
      {
        heading: '2. Tratamiento Preventivo con Protectores Especializados',
        content: `El estándar de oro utilizado por museos y coleccionistas avanzados es aplicar un protector de polímeros sintéticos (como 303 Aerospace Protectant) con un hisopo de algodón una vez al año. Este producto no contiene aceites de petróleo dañinos, no deja residuo pegajoso y crea una barrera contra la oxidación y la radiación ultravioleta.`,
        tip: 'Aplica el producto frotando muy suavemente con la yema del dedo cubierta con un guante de nitrilo, retirando cualquier exceso con un paño de microfibra limpio.'
      },
      {
        heading: '3. La Regla de la Posa Neutra para Almacenamiento Prolongado',
        content: `Si vas a dejar una figura en vitrina durante meses sin moverla, evita poses extremas donde la tela de las articulaciones quede estirada a máxima tensión. Regrésala a una pose de museo relajada para no fatigar las fibras elásticas del traje.`
      }
    ],
    related_search_tag: 'estatuas'
  },
  // SECCIÓN 5: GLOSARIO, COMPRA & LOGÍSTICA
  'fomo-aftermarket-reventa-vs-esperar-reissue': {
    title: 'El Fenómeno FOMO y el Aftermarket: Cuándo Pagar Precio de Reventa y Cuándo Esperar un Reissue',
    slug: 'fomo-aftermarket-reventa-vs-esperar-reissue',
    excerpt: 'Psicología del mercado coleccionista: análisis de patrones de reedición de Bandai, MAFEX y Hot Toys para no caer en precios inflados por la histeria.',
    type: 'COMPRA',
    read_time: '7 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    key_takeaways: [
      'El FOMO (miedo a quedarse afuera) es el motor principal que infla los precios del mercado secundario inmediatamente después de un sold out.',
      'El 80% de las figuras populares de marcas líderes reciben reediciones (reissues) o versiones actualizadas en un plazo de 18 a 36 meses.',
      'Pagar sobreprecios de más del 50% rara vez es rentable a largo plazo en figuras de producción masiva moderna.'
    ],
    sections: [
      {
        heading: '1. La Curva de Histeria Post-Lanzamiento',
        content: `Cuando una figura muy esperada se agota en su primera semana de lanzamiento internacional, el aftermarket en grupos y subastas experimenta un pico artificial de euforia. Los revendedores especulan aprovechando la ansiedad de quienes no hicieron pre-orden. Por lo general, este precio pico cae entre un 20% y 30% a los tres meses, cuando la demanda inmediata se estabiliza.`,
        tip: 'Si te perdiste el lanzamiento oficial, espera al menos 90 días antes de buscarla en el mercado secundario; la euforia inicial habrá disminuido.'
      },
      {
        heading: '2. Ciclos de Reedición de las Grandes Marcas',
        content: `Fabricantes líderes siguen una política comercial predecible: cualquier molde de personaje de alta demanda es reeditado periódicamente con mejoras leves de empaque o pintura. Pagar el triple por la primera edición original suele ser una pérdida financiera segura cuando se anuncia el reissue.`,
        warning: 'Diferencia las figuras conmemorativas de eventos exclusivos de las de catálogo regular: las exclusivas de evento casi nunca se reeditan de forma idéntica.'
      },
      {
        heading: '3. Cuándo Sí Vale la Pena Pagar Aftermarket',
        content: `Solo se justifica pagar sobreprecio cuando la licencia ha expirado legalmente (por ejemplo, el fabricante perdió los derechos de la franquicia), cuando la empresa original quebró, o cuando se trata de una tirada limitada numerada de una resina de autor.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  'grading-figuras-accion-afa-cas-certificacion': {
    title: 'Grading en Figuras de Acción: Qué Hacen AFA y CAS y Cuándo Vale la Pena Certificar',
    slug: 'grading-figuras-accion-afa-cas-certificacion',
    excerpt: 'Sub-grados de burbuja, figura y cartón. Cuándo el encapsulado en acrílico agrega valor real de inversión y cuándo es solo un gasto innecesario.',
    type: 'GLOSARIO',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    key_takeaways: [
      'Las compañías certificadoras (AFA, CAS, VGA) evalúan el estado de conservación de una figura sellada y la encapsulan en acrílico con filtro UV.',
      'El sistema de sub-grados analiza por separado el cartón (Cardback), la burbuja (Blister) y la figura física.',
      'Certificar figuras modernas de tirada masiva rara vez recupera el costo del servicio; el grading es rentable casi exclusivamente en piezas vintage clásicas.'
    ],
    sections: [
      {
        heading: '1. Qué es el Grading y Cómo Funciona la Escala',
        content: `El grading es la evaluación profesional e imparcial del estado de conservación de un coleccionable sellado en empaque original. Organismos reconocidos como Action Figure Authority (AFA) o Collector Archive Services (CAS) inspeccionan la pieza bajo lupas de alta definición, asignando un puntaje numérico del 10 al 100 (donde 85 es considerado un estándar excelente de calidad museo).`,
        tip: 'Un sub-grado AFA de C85 B85 F90 indica que la burbuja y el cartón tienen mínimas imperfecciones, pero la figura interna está en estado perfecto.'
      },
      {
        heading: '2. El Encapsulado Inviolable',
        content: `Una vez asignada la calificación, la figura se sella sónicamente dentro de una urna de acrílico resistente a impactos con protección contra rayos ultravioleta. Este encapsulado es definitivo: no se puede abrir sin destruir la caja y el sello holográfico numerado registrado en la base de datos oficial.`,
        warning: 'Nunca envíes a certificar una figura si la burbuja presenta pequeñas rajaduras o abolladuras graves; la calificación caerá drásticamente por debajo de 70, depreciando la pieza.'
      },
      {
        heading: '3. ¿Para Quién Tiene Sentido Económico?',
        content: `El costo de certificar una figura (envío internacional asegurado, arancel de grading y tiempo de espera de meses) ronda los USD 70 a 120 por pieza. Solo tiene sentido comercial en piezas raras de líneas vintage de los años 70 y 80, o figuras variantes con errores de fábrica documentados.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  'preventas-depositos-reserva-ciclo-produccion-retrasos': {
    title: 'Preventas y Depósitos de Reserva: Ciclo de Producción, Retrasos Habituales y Cancelaciones',
    slug: 'preventas-depositos-reserva-ciclo-produccion-retrasos',
    excerpt: 'De la fase de prototipo (grey model) a la aprobación de licencias y el flete marítimo. Guía para entender los tiempos de producción y asegurar tus piezas.',
    type: 'COMPRA',
    read_time: '6 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80',
    key_takeaways: [
      'El ciclo promedio entre el anuncio de una preventa de alta gama y su entrega final oscila entre 9 y 18 meses.',
      'Los depósitos no reembolsables aseguran la cuota asignada por el distribuidor oficial frente a tiradas limitadas.',
      'Aprender a gestionar los retrasos habituales de fabricación evita frustraciones y cancelaciones precipitadas.'
    ],
    sections: [
      {
        heading: '1. El Viaje de una Figura: Del Prototipo a la Caja',
        content: `Cuando una marca abre una preventa, suele exhibir un prototipo pintado a mano que aún debe pasar por varias fases: aprobación legal del licenciante de cine o la editorial, diseño de matrices de inyección de acero, pruebas de seguridad de materiales, producción en masa y pintura por tampografía o aerografía.`,
        tip: 'Recuerda que las imágenes promocionales de preventa suelen llevar la advertencia Prototype shown, final product may vary: el producto final puede diferir ligeramente en tonalidades.'
      },
      {
        heading: '2. Por Qué los Retrasos son la Norma y No la Excepción',
        content: `Factores como congestión portuaria en fletes marítimos, cambios solicitados a última hora para mejorar parecidos faciales, o revisiones de calidad en las telas suelen posponer la fecha estimada de entrega inicial en varios trimestres. Los coleccionistas experimentados asumen estas demoras como parte habitual del hobby.`,
        warning: 'Evita endeudarte en múltiples preventas con fechas de entrega teóricas idénticas; si varias figuras se retrasan y se despachan simultáneamente en el mismo mes, tendrás que afrontar todos los saldos juntos.'
      },
      {
        heading: '3. La Importancia de Reservar con Canales Confiables',
        content: `Reservar con tiendas serias garantiza que tu unidad esté respaldada por cupos oficiales y que, en caso de cancelación del producto por parte del fabricante, tu seña o depósito esté completamente protegido.`
      }
    ],
    related_search_tag: 'coleccionismo'
  },
  'guia-importacion-uruguay-franquicia-usd-200-figuras': {
    title: 'Guía de Importación en Uruguay: Cómo Usar la Franquicia de USD 200 para Coleccionables sin Pagar Recargos',
    slug: 'guia-importacion-uruguay-franquicia-usd-200-figuras',
    excerpt: 'El manual definitivo para coleccionistas uruguayos: reglas de Aduana, facturas comerciales, límite de 3 envíos anuales, peso máximo y cómo evitar retenciones.',
    type: 'COMPRA',
    read_time: '8 min de lectura',
    featured_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80',
    key_takeaways: [
      'La franquicia aduanera en Uruguay permite hasta 3 envíos al año de hasta USD 200 de valor de factura comercial sin pagar aranceles de importación.',
      'El pago debe realizarse obligatoriamente con una tarjeta de crédito o débito internacional emitida a nombre del titular de la compra.',
      'El peso máximo reglamentario por paquete es de 20 kg brutos, suficiente para casi cualquier figura o estatua individual.'
    ],
    sections: [
      {
        heading: '1. Los 4 Pilares Inquebrantables de la Franquicia',
        content: `Para que tu paquete ingrese bajo el régimen simplificado de encomiendas postales internacionales sin pagar el 60% de aranceles de importación general, debes cumplir simultáneamente cuatro condiciones: ser mayor de 18 años, no superar las 3 franquicias por año calendario (de enero a diciembre), que el valor de la factura comercial no exceda los USD 200, y que el medio de pago esté registrado al mismo documento de identidad (Cédula de Identidad uruguaya).`,
        warning: 'Si el total de tu factura supera los USD 200,01 aunque sea por un solo centavo, el paquete pierde el amparo de la franquicia y tributará el régimen general completo.'
      },
      {
        heading: '2. Cómo Calcular el Límite de USD 200: Flete vs Valor de la Figura',
        content: `Bajo la normativa aduanera de courier expreso, los USD 200 se calculan sobre el valor de la mercadería reflejado en la factura comercial emitida por el vendedor. Si compras en un catálogo internacional con envío doméstico dentro del país de origen hacia la casilla del courier, ese flete interno suma al valor de factura. El flete internacional posterior cobrado por tu courier uruguayo no computa para el tope de los USD 200.`,
        tip: 'Descarga siempre el comprobante de pago bancario y la factura detallada con desglose de items apenas realices la transacción, para declararlo con anticipación en el sistema de tu courier.'
      },
      {
        heading: '3. El Reto de las Estatuas de Gran Escala y Soluciones Locales',
        content: `Cuando una estatua o figura 1:6 supera ampliamente los USD 200 (algo habitual en piezas de gama alta como estatuas de estudio o figuras de aleación metálica), recurrir a tiendas especializadas locales que gestionan importaciones corporativas con stock e inventario oficial en Uruguay es la vía más económica, segura y libre de trámites burocráticos.`
      }
    ],
    related_search_tag: 'coleccionismo'
  }

};

export default function AcademyArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<any>(null);
  const [curatedData, setCuratedData] = useState<CuratedGuide | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCartContext();

  useEffect(() => {
    if (slug) {
      loadArticleData(slug);
    }
  }, [slug]);

  const loadArticleData = async (articleSlug: string) => {
    try {
      setLoading(true);
      
      // 1. Check local curated guides
      const curated = CURATED_GUIDES_DATA[articleSlug];
      if (curated) {
        setCuratedData(curated);
      }

      // 2. Fetch from DB
      const { data: dbArticle } = await supabase
        .from('academy_content')
        .select('*')
        .eq('slug', articleSlug)
        .eq('status', 'PUBLISHED')
        .maybeSingle();

      if (dbArticle) {
        setArticle(dbArticle);
      }

      // 3. Load dynamic related products for this guide topic
      const { data: storeProducts } = await supabase
        .from('products')
        .select('id, title, slug, base_price, condition, brand_name, product_images(url, is_primary)')
        .eq('status', 'ACTIVE')
        .limit(4);

      if (storeProducts && storeProducts.length > 0) {
        setRelatedProducts(storeProducts);
      }
    } catch (err) {
      console.error('Error loading academy article:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentTitle = curatedData?.title || article?.title || 'Guía Técnica de Coleccionismo';
  const currentExcerpt = curatedData?.excerpt || article?.excerpt || '';
  const currentImage = curatedData?.featured_image || article?.featured_image || 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&q=80';
  const currentType = curatedData?.type || article?.type || 'GUÍA TÉCNICA';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-medium">Cargando artículo editorial...</p>
      </div>
    );
  }

  if (!curatedData && !article) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white py-24 text-center max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold mb-2">Artículo no encontrado</h2>
        <p className="text-xs text-zinc-400 mb-6">El contenido editorial solicitado no existe o fue archivado.</p>
        <Link 
          to="/academy" 
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition"
        >
          ← Volver a Collector Academy
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white py-8 px-4 sm:px-6 lg:px-8">
      <SEO
        title={`${currentTitle} | Collector Academy`}
        description={currentExcerpt}
      />

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Breadcrumb Navigation */}
        <div>
          <Link 
            to="/academy" 
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-emerald-400 transition"
          >
            <ArrowLeft size={14} />
            <span>Volver a Collector Academy</span>
          </Link>
        </div>

        {/* Hero Header Card */}
        <div className="rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl">
          <div className="w-full h-64 sm:h-80 bg-zinc-950 relative overflow-hidden">
            <img 
              src={currentImage} 
              alt={currentTitle} 
              className="w-full h-full object-cover" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500 text-black font-bold">
                {currentType}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-4 text-xs text-zinc-400 border-b border-zinc-800 pb-4">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <ShieldCheck size={15} /> Editorial Collectibles
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock size={14} /> {curatedData?.read_time || '5 min de lectura'}
              </span>
            </div>

            {currentExcerpt && (
              <p className="text-sm sm:text-base text-zinc-200 font-medium leading-relaxed">
                {currentExcerpt}
              </p>
            )}

            {/* Key Takeaways Box */}
            {curatedData?.key_takeaways && curatedData.key_takeaways.length > 0 && (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sparkles size={16} />
                  <span>Puntos Clave de Esta Guía</span>
                </div>
                <div className="space-y-2">
                  {curatedData.key_takeaways.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Editorial Body Content */}
        <article className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8 leading-relaxed">
          {curatedData?.sections ? (
            curatedData.sections.map((sec, idx) => (
              <section key={idx} className="space-y-4 border-b border-zinc-800/60 pb-8 last:border-b-0 last:pb-0">
                <h2 className="text-xl sm:text-2xl font-black text-white">{sec.heading}</h2>
                <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
                  {sec.content}
                </div>

                {sec.tip && (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-start gap-3">
                    <Sparkles size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-300">
                      <strong className="text-emerald-400 font-bold block mb-0.5">Consejo Experto:</strong>
                      {sec.tip}
                    </div>
                  </div>
                )}

                {sec.warning && (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-amber-500/40 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-zinc-300">
                      <strong className="text-amber-400 font-bold block mb-0.5">Atención Coleccionista:</strong>
                      {sec.warning}
                    </div>
                  </div>
                )}
              </section>
            ))
          ) : (
            <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
              {article?.body}
            </div>
          )}
        </article>

        {/* Dynamic Commercial Section: Store Figures Related to this Article */}
        {relatedProducts.length > 0 && (
          <div className="rounded-3xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/30 p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-amber-400 text-xs font-black uppercase tracking-wider mb-1">
                  <Flame size={15} />
                  <span>Catálogo Oficial Collectibles</span>
                </div>
                <h3 className="text-xl font-black text-white">
                  Figuras en Tienda Relacionadas con esta Guía
                </h3>
                <p className="text-xs text-zinc-400">
                  Aplica los criterios técnicos de esta lectura y descubre piezas auténticas disponibles:
                </p>
              </div>

              <Link
                to="/shop"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 flex-shrink-0 shadow"
              >
                <span>Ver Todo el Catálogo</span>
                <ExternalLink size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((p) => {
                const img = p.product_images?.find((i: any) => i.is_primary)?.url || p.product_images?.[0]?.url;
                return (
                  <div 
                    key={p.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition group shadow-lg"
                  >
                    <div>
                      <div className="w-full aspect-square rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center p-2 mb-2">
                        {img ? (
                          <img src={img} alt={p.title} className="w-full h-full object-contain group-hover:scale-105 transition duration-300" />
                        ) : (
                          <Scale size={24} className="text-zinc-600" />
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {p.brand_name || '100% Original'}
                      </span>
                      <Link 
                        to={`/producto/${p.slug}`}
                        className="font-bold text-xs text-white group-hover:text-amber-400 transition line-clamp-2 mt-2 leading-tight block"
                      >
                        {p.title}
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                      <span className="text-sm font-black text-amber-400">$ {p.base_price}</span>
                      <button
                        onClick={() => addToCart({ id: p.id, title: p.title, price: p.base_price, image: img } as any)}
                        className="p-2 bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition"
                        title="Agregar al carrito"
                      >
                        <ShoppingCart size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4">
          <Link 
            to="/academy" 
            className="text-xs font-bold text-zinc-400 hover:text-white transition flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Explorar más guías en Academy
          </Link>
          <Link 
            to="/compare" 
            className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1"
          >
            <Scale size={14} /> Comparar figuras en el Comparador →
          </Link>
        </div>
      </div>
    </div>
  );
}
