import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';

export interface BeybladeBanner {
  id?: string;
  badge: string | null;
  title_line1: string | null;
  title_line2: string | null;
  subtitle: string | null;
  cta_primary_text: string | null;
  cta_primary_url: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  image_right_url: string | null;
  country_code: string;
  is_active?: boolean;
}

interface BeybladeHeroBannerProps {
  banner: BeybladeBanner;
  loading?: boolean;
}

export default function BeybladeHeroBanner({ banner, loading = false }: BeybladeHeroBannerProps) {
  if (loading) {
    return (
      <section className="relative min-h-[85vh] w-full bg-black overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-black" />
        <div className="max-w-4xl mx-auto px-6 w-full text-center space-y-6">
          <div className="h-6 w-48 bg-white/5 animate-pulse rounded-full mx-auto" />
          <div className="h-16 w-3/4 bg-white/5 animate-pulse rounded-lg mx-auto" />
          <div className="h-12 w-1/2 bg-white/5 animate-pulse rounded-lg mx-auto" />
          <div className="h-20 w-full bg-white/5 animate-pulse rounded-lg mx-auto" />
          <div className="flex justify-center gap-4">
            <div className="h-12 w-44 bg-white/5 animate-pulse rounded-2xl" />
            <div className="h-12 w-36 bg-white/5 animate-pulse rounded-2xl" />
          </div>
        </div>
      </section>
    );
  }

  const {
    badge,
    title_line1,
    title_line2,
    subtitle,
    cta_primary_text,
    cta_primary_url,
    cta_secondary_text,
    cta_secondary_url,
  } = banner;

  // Helper to split "BEYBLADE X" or other titles to color the "X" pink/magenta
  const formatTitle1 = (text: string | null) => {
    if (!text) return null;
    const upperText = text.toUpperCase();
    if (upperText.endsWith(' X')) {
      const main = text.substring(0, text.length - 2);
      return (
        <>
          <span className="text-[#00e5ff] tracking-tight">{main}</span>
          <span className="text-[#ff0055] tracking-tight ml-2">X</span>
        </>
      );
    }
    return <span className="text-white tracking-tight">{text}</span>;
  };

  return (
    <section className="relative min-h-[90vh] w-full bg-black overflow-hidden flex flex-col items-center justify-center py-20 px-6 select-none">
      
      {/* Background Cyber Glows */}
      <div className="absolute inset-0 bg-black z-0" />
      <div className="absolute left-[15%] top-[25%] w-[450px] h-[450px] bg-[#00e5ff]/[.04] blur-[130px] rounded-full pointer-events-none z-0" />
      <div className="absolute right-[15%] bottom-[25%] w-[450px] h-[450px] bg-[#ff0055]/[.04] blur-[130px] rounded-full pointer-events-none z-0" />
      
      {/* Cyber Grid background */}
      <div className="absolute inset-0 opacity-[0.012] pointer-events-none z-0" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      {/* Main Content Wrapper */}
      <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10 space-y-8">
        
        {/* Badge Capsule */}
        {badge && (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00e5ff]/25 bg-[#00e5ff]/5 text-[#00e5ff] text-[10px] font-black uppercase tracking-[0.22em] shadow-[0_0_15px_rgba(0,229,255,0.08)]">
            <Target className="w-3.5 h-3.5 text-[#00e5ff] shrink-0" />
            <span>{badge}</span>
          </div>
        )}

        {/* Title Group */}
        <div className="space-y-2">
          {title_line1 && (
            <h1 className="text-5xl sm:text-7xl md:text-8xl font-black leading-none uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
              {formatTitle1(title_line1)}
            </h1>
          )}
          
          {title_line2 && (
            <h2 className="text-4xl sm:text-6xl md:text-7xl font-black leading-none uppercase text-[#ff0055] drop-shadow-[0_0_15px_rgba(255,0,85,0.45)] tracking-wide">
              {title_line2}
            </h2>
          )}
        </div>

        {/* Subtitle description */}
        {subtitle && (
          <p className="text-slate-300 text-sm sm:text-base md:text-lg max-w-3xl font-medium leading-relaxed drop-shadow select-text px-4">
            {subtitle}
          </p>
        )}

        {/* Buttons / CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto pt-2">
          {cta_primary_text && (
            <Link
              to={cta_primary_url || '/shop'}
              className="w-full sm:w-auto px-10 py-4.5 bg-[#00e5ff] text-black text-xs sm:text-sm font-black uppercase tracking-widest rounded-2xl shadow-[0_0_25px_rgba(0,229,255,0.35)] hover:shadow-[0_0_35px_rgba(0,229,255,0.55)] hover:bg-[#33ebff] transition-all duration-300 active:scale-95 text-center"
            >
              {cta_primary_text}
            </Link>
          )}

          {cta_secondary_text && (
            <Link
              to={cta_secondary_url || '/shop'}
              className="w-full sm:w-auto px-8 py-4.5 bg-[#0a0f1d]/50 hover:bg-[#121b33]/60 border border-slate-800 hover:border-slate-700 text-white text-xs sm:text-sm font-black uppercase tracking-widest rounded-2xl transition-all duration-300 active:scale-95 text-center"
            >
              {cta_secondary_text}
            </Link>
          )}
        </div>

        {/* Bottom Gear/Dial Element (X-LINE GEAR ACCEL) */}
        <div className="relative w-80 h-80 flex items-center justify-center pt-8">
          
          {/* Cyber Dashboard Background Circles */}
          <div className="absolute w-[240px] h-[240px] rounded-full border border-white/[0.02] border-dashed animate-spin-slow pointer-events-none" />
          <div className="absolute w-[210px] h-[210px] rounded-full border border-[#00e5ff]/5 animate-spin-reverse pointer-events-none" />
          
          {/* Ambient Glow behind the dial */}
          <div className="absolute w-[180px] h-[180px] rounded-full bg-gradient-to-tr from-[#00e5ff]/20 to-[#ff0055]/20 blur-[35px] pointer-events-none" />
          
          {/* Main Dial Body */}
          <div className="relative w-[180px] h-[180px] rounded-full bg-[#05080f] flex flex-col items-center justify-center border-2 border-transparent bg-clip-padding shadow-[inset_0_0_20px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.6)] group cursor-pointer transition-transform duration-500 hover:scale-105">
            
            {/* Split border gradient effect */}
            <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none" />
            <div className="absolute inset-[1px] rounded-full border-2 border-transparent bg-gradient-to-b from-[#00e5ff]/60 via-transparent to-[#ff0055]/60 pointer-events-none opacity-85" />
            
            {/* Top Indicator Line */}
            <div className="absolute top-2 w-1 h-3 rounded-full bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
            
            {/* Bottom Indicator Line */}
            <div className="absolute bottom-2 w-1 h-3 rounded-full bg-[#ff0055] shadow-[0_0_8px_#ff0055]" />
            
            {/* Inside Content */}
            <span className="text-white font-black text-base uppercase tracking-wider mb-0.5">
              X-Line
            </span>
            <span className="text-slate-500 font-bold text-[8px] uppercase tracking-widest">
              Gear Accel
            </span>
          </div>
        </div>

      </div>

      {/* Inline styles for dial and keyframes */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 24s linear infinite;
        }
        .animate-spin-reverse {
          animation: spin-reverse 18s linear infinite;
        }
      `}} />
    </section>
  );
}
