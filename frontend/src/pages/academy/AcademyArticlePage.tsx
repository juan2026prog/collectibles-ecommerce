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

