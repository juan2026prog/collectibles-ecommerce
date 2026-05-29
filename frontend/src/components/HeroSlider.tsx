import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  link_url: string | null;
  badge_text: string | null;
  button_text: string | null;
  secondary_button_text: string | null;
  secondary_button_url: string | null;
  content_position: string | null; // 'top' | 'center' | 'bottom'
  content_align: string | null;    // 'left' | 'center'
  overlay_opacity: number | null;  // 0.0 to 1.0
}

interface HeroSliderProps {
  banners: Banner[];
  loading?: boolean;
}

export default function HeroSlider({ banners, loading = false }: HeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevActiveIndex, setPrevActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const autoplayTimer = useRef<NodeJS.Timeout | null>(null);

  // Filter active banners
  const activeBanners = banners.filter(b => b.image_url);

  // Programmatic image preloading to prevent flickers/flashes during slide transitions
  useEffect(() => {
    if (activeBanners.length === 0) return;
    activeBanners.forEach(banner => {
      const img = new Image();
      img.src = banner.image_url;
      if (banner.mobile_image_url) {
        const mobImg = new Image();
        mobImg.src = banner.mobile_image_url;
      }
    });
  }, [activeBanners]);

  // Track prev index for smooth crossfade blending
  useEffect(() => {
    const prev = activeIndexRef.current;
    if (prev !== activeIndex) {
      setPrevActiveIndex(prev);
      activeIndexRef.current = activeIndex;
    }
  }, [activeIndex]);

  // Reset autoplay timer when index changes
  const startAutoplay = () => {
    if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    if (activeBanners.length <= 1) return;
    
    autoplayTimer.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % activeBanners.length);
    }, 7000); // 7 seconds slow autoplay
  };

  useEffect(() => {
    startAutoplay();
    return () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    };
  }, [activeBanners.length]);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (activeBanners.length <= 1) return;
    setActiveIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
    startAutoplay();
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (activeBanners.length <= 1) return;
    setActiveIndex(prev => (prev + 1) % activeBanners.length);
    startAutoplay();
  };

  const handleDotClick = (index: number) => {
    setActiveIndex(index);
    startAutoplay();
  };

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    
    // Swipe left (next)
    if (diff > 50) {
      handleNext();
    }
    // Swipe right (prev)
    if (diff < -50) {
      handlePrev();
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (loading) {
    // Render a stable dark cinematic background container of exactly the same size without any fake text/buttons
    return (
      <section className="relative h-[80vh] md:h-screen w-full bg-[#05070f] overflow-hidden">
        <div className="absolute inset-0 bg-[#05070f]" />
        <div className="absolute -right-40 -top-40 w-[800px] h-[800px] bg-[#f00856]/[.05] blur-[180px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
      </section>
    );
  }

  // Fallback if no banners are present
  if (activeBanners.length === 0) {
    return (
      <section className="relative h-[80vh] md:h-screen w-full bg-[#05070f] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[#05070f]" />
        <div className="absolute -right-40 -top-40 w-[800px] h-[800px] bg-[#f00856]/[.05] blur-[180px] rounded-full pointer-events-none" />
        <div className="max-w-[1500px] mx-auto px-6 w-full relative z-10 text-center flex flex-col items-center">
          <div className="inline-block px-4 py-1.5 rounded-full border border-[#f00856]/30 bg-[#f00856]/10 text-[#f00856] text-[10px] font-black uppercase tracking-[0.25em] mb-6">
            Collectibles Uruguay
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tighter text-white uppercase max-w-4xl">
            Tu colección comienza <span className="text-[#f00856]">acá</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl mt-6 max-w-lg leading-relaxed font-medium">
            Explorá figuras premium, estatuas de colección y mucho más en nuestra tienda.
          </p>
          <div className="mt-10">
            <Link to="/shop" className="btn-primary px-10 py-5 text-base rounded-full group inline-flex items-center">
              Ver catálogo <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="relative h-[80vh] md:h-screen w-full bg-[#05070f] overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background grid texture & ambient glow (fixed behind all slides) */}
      <div className="absolute inset-0 bg-[#05070f] z-0" />
      <div className="absolute -right-40 -top-40 w-[800px] h-[800px] bg-[#f00856]/[.07] blur-[180px] rounded-full pointer-events-none z-0" />
      <div className="absolute -left-60 bottom-0 w-[500px] h-[500px] bg-[#f00856]/[.04] blur-[140px] rounded-full pointer-events-none z-0" />
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none z-0" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* 1. BACKGROUND IMAGES CROSSFADE */}
      {activeBanners.map((banner, index) => {
        const isCurrent = index === activeIndex;
        const isPrev = index === prevActiveIndex;
        const opacityVal = banner.overlay_opacity !== null ? Number(banner.overlay_opacity) : 0.4;
        const alignCenter = banner.content_align === 'center';
        
        return (
          <div
            key={`bg-${banner.id}`}
            className={`absolute inset-0 ${
              isCurrent 
                ? 'opacity-100 z-10 transition-opacity duration-1000 ease-in-out' 
                : isPrev 
                ? 'opacity-100 z-0' 
                : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            {/* Fullscreen Image with intelligent crop using object-cover */}
            <picture>
              {banner.mobile_image_url && (
                <source media="(max-width: 767px)" srcSet={banner.mobile_image_url} />
              )}
              <img
                src={banner.image_url}
                alt={banner.title || 'Slide'}
                className="absolute inset-0 w-full h-full object-cover object-center transform scale-100 transition-transform duration-[8000ms] ease-out"
                style={{
                  transform: isCurrent ? 'scale(1.05)' : 'scale(1.00)'
                }}
                loading="eager"
                fetchPriority={index === activeIndex ? 'high' : 'low'}
                {...((index === activeIndex) ? { fetchpriority: 'high' } : { fetchpriority: 'low' })}
                decoding="async"
              />
            </picture>

            {/* Custom dark solid overlay */}
            <div 
              className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-500" 
              style={{ opacity: opacityVal }} 
            />

            {/* Cinematic Gradient overlay for text readability */}
            <div 
              className={`absolute inset-0 pointer-events-none z-10 ${
                alignCenter 
                  ? 'bg-gradient-to-t from-black/90 via-black/40 to-black/30' 
                  : 'bg-gradient-to-r from-black/90 via-black/40 to-transparent'
              }`}
            />
          </div>
        );
      })}

      {/* 2. TEXT & CONTENT OVERLAY LAYER (crossfades smoothly without layout recalculation or flickering slide-up text animations) */}
      {activeBanners.map((banner, index) => {
        const isCurrent = index === activeIndex;
        const isPrev = index === prevActiveIndex;
        const alignCenter = banner.content_align === 'center';

        if (!isCurrent && !isPrev) return null;

        return (
          <div
            key={`content-${banner.id}`}
            className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ease-in-out ${
              isCurrent ? 'opacity-100 z-20' : 'opacity-0 z-10'
            }`}
          >
            <div 
              className={`max-w-[1500px] mx-auto px-6 w-full h-full flex ${
                banner.content_position === 'top' 
                  ? 'items-start pt-28 md:pt-36' 
                  : banner.content_position === 'bottom' 
                  ? 'items-end pb-28 md:pb-36' 
                  : 'items-center'
              }`}
            >
              <div 
                className={`w-full max-w-4xl pointer-events-auto ${
                  alignCenter 
                    ? 'text-center mx-auto flex flex-col items-center' 
                    : 'text-left'
                }`}
              >
                {/* Upper Badge */}
                {banner.badge_text && (
                  <div 
                    className="inline-block px-4 py-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 text-primary-500 text-[10px] font-black uppercase tracking-[0.25em] mb-6 shadow-[0_0_15px_rgba(240,8,86,0.15)]"
                  >
                    {banner.badge_text}
                  </div>
                )}

                {/* Main Title */}
                {banner.title && (
                  <h1 
                    className="text-3xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tighter text-white uppercase drop-shadow-md select-text break-words"
                  >
                    {banner.title}
                  </h1>
                )}

                {/* Subtitle */}
                {banner.subtitle && (
                  <p 
                    className="text-slate-300 text-xs sm:text-base md:text-lg lg:text-xl mt-4 sm:mt-6 max-w-2xl font-bold leading-relaxed drop-shadow select-text"
                  >
                    {banner.subtitle}
                  </p>
                )}

                {/* Buttons (CTAs) */}
                <div 
                  className={`flex flex-wrap gap-3 sm:gap-4 mt-6 sm:mt-10 ${
                    alignCenter ? 'justify-center' : 'justify-start'
                  }`}
                >
                  {/* Primary CTA */}
                  {banner.button_text && (
                    <Link 
                      to={banner.link_url || '/shop'} 
                      className="btn-primary px-8 py-4 sm:px-10 sm:py-5 text-sm sm:text-base rounded-full group inline-flex items-center"
                    >
                      {banner.button_text} 
                      <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  )}

                  {/* Secondary CTA */}
                  {banner.secondary_button_text && (
                    <Link 
                      to={banner.secondary_button_url || '/shop'} 
                      className="px-8 py-4 sm:px-10 sm:py-5 text-sm sm:text-base rounded-full border border-white/15 text-white font-black hover:bg-white/5 transition-all inline-flex items-center"
                    >
                      {banner.secondary_button_text}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Touch Swipe Indicator or arrows on Desktop */}
      {activeBanners.length > 1 && (
        <>
          {/* Left Arrow */}
          <button 
            onClick={handlePrev}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full border border-white/10 bg-black/30 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 hover:opacity-100 md:group-hover:opacity-100 md:hover:scale-105 transition-all duration-300 pointer-events-auto cursor-pointer"
            style={{ contentVisibility: 'auto' }}
            aria-label="Anterior"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          {/* Right Arrow */}
          <button 
            onClick={handleNext}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full border border-white/10 bg-black/30 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 hover:opacity-100 md:group-hover:opacity-100 md:hover:scale-105 transition-all duration-300 pointer-events-auto cursor-pointer"
            style={{ contentVisibility: 'auto' }}
            aria-label="Siguiente"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Minimalist Progress Indicators at bottom */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex gap-3">
            {activeBanners.map((_, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={i}
                  onClick={() => handleDotClick(i)}
                  className="group relative py-2 flex items-center justify-center"
                  aria-label={`Ir al slide ${i + 1}`}
                >
                  <span 
                    className={`h-[2px] transition-all duration-500 rounded-full ${
                      isActive 
                        ? 'w-10 bg-[#f00856] shadow-[0_0_8px_#f00856]' 
                        : 'w-4 bg-white/30 group-hover:bg-white/60'
                    }`}
                  />
                  {/* Premium visual timeline effect on active slide */}
                  {isActive && (
                    <span 
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-white rounded-full animate-timeline-progress"
                      style={{ animationDuration: '7000ms' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Component Specific Inline Styles for Keyframe Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes timelineProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-timeline-progress {
          animation: timelineProgress linear forwards;
        }
        .animate-slide-up-fade-1 {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
        }
        .animate-slide-up-fade-2 {
          animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.25s forwards;
        }
        .animate-slide-up-fade-3 {
          animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards;
        }
        .animate-slide-up-fade-4 {
          animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.55s forwards;
        }
      `}} />
    </section>
  );
}
