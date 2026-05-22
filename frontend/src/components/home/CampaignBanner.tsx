import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface CampaignSlide {
  image_url: string;
  mobile_image_url?: string;
}

interface CampaignBannerProps {
  campaign_tag?: string;
  title: string;
  subtitle?: string;
  cta_text?: string;
  cta_link?: string;
  background_mode?: 'gradient' | 'image';
  overlay_opacity?: number;
  text_align?: 'left' | 'center';
  slides: CampaignSlide[];
  autoplay?: boolean;
  autoplay_interval?: number;
}

export default function CampaignBanner({
  campaign_tag,
  title,
  subtitle,
  cta_text,
  cta_link,
  background_mode = 'gradient',
  overlay_opacity = 0.4,
  text_align = 'left',
  slides,
  autoplay = true,
  autoplay_interval = 5000,
}: CampaignBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSlides = slides.length > 0;
  const isSlider = slides.length > 1;
  const alignCenter = text_align === 'center';

  // Autoplay logic (mirrors HeroSlider pattern)
  const startAutoplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isSlider || !autoplay) return;

    timerRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % slides.length);
    }, autoplay_interval);
  };

  useEffect(() => {
    startAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, autoplay, autoplay_interval]);

  const handleDotClick = (index: number) => {
    setActiveIndex(index);
    startAutoplay();
  };

  return (
    <section className="relative w-full rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-br from-[#05070f] to-[#1a0510]">
      {/* Ambient glow blobs */}
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-[#f00856]/[.06] blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-[400px] h-[400px] bg-[#f00856]/[.04] blur-[120px] rounded-full pointer-events-none" />

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Layout container: 2-column on lg+, stacked on mobile */}
      <div
        className={`relative z-10 grid gap-8 md:gap-10 p-6 md:p-10 lg:p-14 ${
          hasSlides
            ? 'lg:grid-cols-2 items-center'
            : 'grid-cols-1'
        }`}
      >
        {/* ── Text Column ── */}
        <div
          className={`flex flex-col gap-5 ${
            alignCenter && !hasSlides
              ? 'items-center text-center'
              : 'items-start text-left'
          } ${hasSlides ? 'order-2 lg:order-1' : ''}`}
        >
          {/* Campaign tag */}
          {campaign_tag && (
            <span className="text-[10px] text-[#f00856] font-black tracking-[0.3em] uppercase">
              {campaign_tag}
            </span>
          )}

          {/* Title */}
          <h2 className="text-3xl md:text-5xl font-black text-white leading-[0.95] tracking-tight uppercase">
            {title}
          </h2>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-lg font-medium">
              {subtitle}
            </p>
          )}

          {/* CTA */}
          {cta_text && (
            <div className="mt-2">
              <Link
                to={cta_link || '/shop'}
                className="btn-primary px-8 py-4 text-sm rounded-full group inline-flex items-center"
              >
                {cta_text}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          )}
        </div>

        {/* ── Image / Slider Column ── */}
        {hasSlides && (
          <div
            className={`relative order-1 lg:order-2 ${
              alignCenter ? 'mx-auto' : ''
            }`}
          >
            {/* Image container */}
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-white/10 bg-black/30">
              {slides.map((slide, index) => {
                const isCurrent = index === activeIndex;
                return (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                      isCurrent ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    <picture>
                      {slide.mobile_image_url && (
                        <source
                          media="(max-width: 767px)"
                          srcSet={slide.mobile_image_url}
                        />
                      )}
                      <img
                        src={slide.image_url}
                        alt={`${title} — ${index + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover object-center"
                      />
                    </picture>

                    {/* Optional image overlay when background_mode is 'image' */}
                    {background_mode === 'image' && (
                      <div
                        className="absolute inset-0 bg-black pointer-events-none"
                        style={{ opacity: overlay_opacity }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Dot indicators — bottom-right */}
              {isSlider && (
                <div className="absolute bottom-3 right-3 z-20 flex gap-2">
                  {slides.map((_, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={i}
                        onClick={() => handleDotClick(i)}
                        className="p-1 flex items-center justify-center"
                        aria-label={`Ir a imagen ${i + 1}`}
                      >
                        <span
                          className={`block rounded-full transition-all duration-400 ${
                            isActive
                              ? 'w-5 h-1.5 bg-[#f00856] shadow-[0_0_8px_#f00856]'
                              : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
