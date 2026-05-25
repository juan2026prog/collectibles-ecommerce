import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock as ClockIcon } from 'lucide-react';

export interface PreorderItem {
  enabled: boolean;
  image_url: string;
  mobile_image_url?: string;
  title: string;
  subtitle: string;
  badge_text?: string;
  button_text: string;
  link_url: string;
  countdown_date?: string;
  overlay_opacity?: number;
  sort_order: number;
}

interface PreOrdersProps {
  preorders: PreorderItem[];
}

export default function PreOrders({ preorders }: PreOrdersProps) {
  const activePreorders = preorders
    .filter(p => p.enabled !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  if (!activePreorders.length) return null;

  return (
    <section className="relative max-w-[1500px] mx-auto px-6 py-20">
      {/* Ambient glowing light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#f00856]/[.03] blur-[150px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="mb-10 text-center md:text-left">
        <div className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase mb-2">
          Reservas Activas
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
          Preventas Destacadas
        </h2>
      </div>

      {/* Grid: 1-col on mobile, 2 or 3 columns depending on item count */}
      <div className={`grid gap-8 ${
        activePreorders.length === 1 
          ? 'grid-cols-1 max-w-4xl mx-auto' 
          : activePreorders.length === 2 
            ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' 
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      }`}>
        {activePreorders.map((item, idx) => (
          <PreorderCard key={idx} item={item} />
        ))}
      </div>
    </section>
  );
}

function PreorderCard({ item }: { item: PreorderItem }) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!item.countdown_date) return;

    const calculateTime = () => {
      const difference = +new Date(item.countdown_date!) - +new Date();
      if (difference <= 0) {
        setTimeLeft(null);
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [item.countdown_date]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#05070f] aspect-[16/10] md:aspect-[16/11] flex flex-col justify-end group hover:border-[#f00856]/40 transition-all duration-500 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      {/* Background Image */}
      <picture className="absolute inset-0 w-full h-full">
        {item.mobile_image_url && (
          <source media="(max-width: 767px)" srcSet={item.mobile_image_url} />
        )}
        <img
          src={item.image_url}
          alt={item.title}
          loading="lazy"
          className="w-full h-full object-cover object-center opacity-100 group-hover:scale-[1.02] transition-all duration-700 ease-out"
        />
      </picture>

      {/* Overlay gradient */}
      <div 
        className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/60 to-transparent" 
        style={{ opacity: item.overlay_opacity !== undefined && item.overlay_opacity !== null ? item.overlay_opacity : 0.95 }}
      />

      {/* Card Content */}
      <div className="relative z-10 p-6 md:p-8 flex flex-col items-start w-full">
        {/* Badge */}
        {item.badge_text && (
          <span className="text-[8px] md:text-[9px] text-white font-black tracking-widest bg-[#f00856] px-2 py-0.5 rounded-md uppercase mb-3 shadow-[0_0_8px_rgba(240,8,86,0.4)]">
            {item.badge_text}
          </span>
        )}

        <h3 className="text-xl md:text-2xl font-black text-white leading-tight uppercase mb-1 tracking-tight">
          {item.title}
        </h3>
        <p className="text-slate-400 text-xs md:text-sm font-semibold max-w-sm mb-4 leading-normal">
          {item.subtitle}
        </p>

        {/* Countdown Timer Row */}
        {timeLeft && (
          <div className="flex gap-2.5 mb-5 items-center bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2 backdrop-blur-sm">
            <ClockIcon className="w-3.5 h-3.5 text-[#f00856] shrink-0" />
            <div className="flex gap-2">
              <div className="text-center">
                <span className="text-white font-black text-xs md:text-sm">{timeLeft.days}</span>
                <span className="text-[7px] text-slate-500 font-bold uppercase ml-0.5">d</span>
              </div>
              <span className="text-white/20 text-xs">:</span>
              <div className="text-center">
                <span className="text-white font-black text-xs md:text-sm">{timeLeft.hours.toString().padStart(2, '0')}</span>
                <span className="text-[7px] text-slate-500 font-bold uppercase ml-0.5">h</span>
              </div>
              <span className="text-white/20 text-xs">:</span>
              <div className="text-center">
                <span className="text-white font-black text-xs md:text-sm">{timeLeft.minutes.toString().padStart(2, '0')}</span>
                <span className="text-[7px] text-slate-500 font-bold uppercase ml-0.5">m</span>
              </div>
              <span className="text-white/20 text-xs">:</span>
              <div className="text-center">
                <span className="text-white font-black text-xs md:text-sm">{timeLeft.seconds.toString().padStart(2, '0')}</span>
                <span className="text-[7px] text-slate-500 font-bold uppercase ml-0.5">s</span>
              </div>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <Link
          to={item.link_url || '/shop'}
          className="btn-primary py-2.5 px-6 text-xs rounded-full inline-flex items-center group/btn shadow-[0_4px_12px_rgba(240,8,86,0.2)]"
        >
          {item.button_text || 'Reservar ahora'}{' '}
          <ArrowRight className="w-4 h-4 ml-1.5 group-hover/btn:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
