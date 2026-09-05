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
