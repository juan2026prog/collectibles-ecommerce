import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useImageProtection } from '../../hooks/useImageProtection';

export interface FeaturedDrop {
  enabled: boolean;
  image_url: string;
  mobile_image_url?: string;
  title: string;
  subtitle: string;
  badge_text?: string;
  button_text: string;
  link_url: string;
  overlay_opacity?: number;
  sort_order: number;
}

interface FeaturedDropsProps {
  drops: FeaturedDrop[];
}

export default function FeaturedDrops({ drops }: FeaturedDropsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const { getImageProps } = useImageProtection({ isProduct: false });

  const activeDrops = drops
    .filter(d => d.enabled !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const updateArrows = () => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setShowLeft(scrollLeft > 10);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('scroll', updateArrows);
      // Run once on mount / update
      updateArrows();
    }
    return () => el?.removeEventListener('scroll', updateArrows);
  }, [activeDrops.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const scrollAmount = 624; // Card width + gap
    containerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (!activeDrops.length) return null;

  return (
    <section className="relative max-w-[1500px] mx-auto px-6 py-20 overflow-hidden">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
            Selección Especial
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
            Universos Destacados
          </h2>
        </div>

        <Link to="/licencias" className="hidden md:inline-flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white uppercase tracking-wider">
          Ver todos <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Same visual footprint as Categorías destacadas: 2 columns mobile, 3 desktop. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-5">
        {activeDrops.map((drop, i) => (
          <Link
            key={i}
            to={drop.link_url || '/shop'}
            className="relative flex flex-col justify-end min-h-[220px] md:min-h-[330px] overflow-hidden border border-white/10 bg-black/40 group hover:border-[#f00856]/40 transition-all duration-500 select-none shadow-[0_4px_30px_rgba(0,0,0,0.4)]"
          >
            {/* Background Image with mobile picture support */}
            <picture className="absolute inset-0 w-full h-full">
              {drop.mobile_image_url && (
                <source
                  media="(max-width: 767px)"
                  srcSet={drop.mobile_image_url}
                />
              )}
              <img
                src={drop.image_url}
                alt={drop.title}
                loading="lazy"
                {...getImageProps("w-full h-full object-cover object-center opacity-100 group-hover:scale-[1.03] transition-all duration-700 ease-out")}
              />
            </picture>

            {/* Cinematic dark gradients & glowing highlights */}
            <div 
              className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-black/20 to-transparent" 
              style={{ opacity: drop.overlay_opacity !== undefined && drop.overlay_opacity !== null ? drop.overlay_opacity : 0.90 }}
            />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#f00856]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            {/* Content Area */}
            <div className="relative z-10 p-6 md:p-8 flex flex-col items-start">
              {drop.badge_text && (
                <span className="text-[8px] md:text-[9px] text-[#f00856] font-black tracking-[0.2em] bg-[#f00856]/10 border border-[#f00856]/20 px-2 py-0.5 rounded-full uppercase mb-2">
                  {drop.badge_text}
                </span>
              )}
              <h3 className="text-xl md:text-2xl font-black text-white leading-tight uppercase mb-1 tracking-tight">
                {drop.title}
              </h3>
              <p className="text-white text-xs md:text-sm font-semibold max-w-sm mb-4 leading-normal">
                {drop.subtitle}
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-black text-white group-hover:text-[#f00856] transition-colors uppercase tracking-wider">
                {drop.button_text || 'Ver universo'} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
