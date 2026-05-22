import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface MiniBannerProps {
  image_url: string;
  mobile_image_url?: string;
  title: string;
  subtitle?: string;
  badge_text?: string;
  button_text?: string;
  link_url?: string;
  overlay_opacity?: number;
  text_align?: 'left' | 'center';
}

export default function MiniBannerCard({
  image_url,
  mobile_image_url,
  title,
  subtitle,
  badge_text,
  button_text,
  link_url,
  overlay_opacity = 0.4,
  text_align = 'left',
}: MiniBannerProps) {
  const alignCenter = text_align === 'center';

  const content = (
    <div className="group relative aspect-[4/3] md:aspect-[16/7] w-full rounded-2xl overflow-hidden border border-white/10 bg-[#05070f]">
      {/* Background image with hover scale */}
      <picture>
        {mobile_image_url && (
          <source media="(max-width: 767px)" srcSet={mobile_image_url} />
        )}
        <img
          src={image_url}
          alt={title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </picture>

      {/* Dark solid overlay */}
      <div
        className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-500 group-hover:opacity-[0.25]"
        style={{ opacity: overlay_opacity }}
      />

      {/* Cinematic gradient overlay from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none transition-opacity duration-500 group-hover:from-black/80" />

      {/* Subtle ambient glow */}
      <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-[#f00856]/[.06] blur-[100px] rounded-full pointer-events-none" />

      {/* Badge pill — top-left */}
      {badge_text && (
        <div className="absolute top-4 left-4 z-20">
          <span className="inline-block px-3 py-1 rounded-full bg-[#f00856] text-white text-[10px] font-black uppercase tracking-widest shadow-[0_0_12px_rgba(240,8,86,0.3)]">
            {badge_text}
          </span>
        </div>
      )}

      {/* Text content — bottom */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 p-5 md:p-8 flex flex-col gap-2 ${
          alignCenter ? 'items-center text-center' : 'items-start text-left'
        }`}
      >
        <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase leading-tight tracking-tight drop-shadow-lg">
          {title}
        </h3>

        {subtitle && (
          <p className="text-slate-200 text-sm md:text-base font-medium leading-relaxed drop-shadow max-w-lg">
            {subtitle}
          </p>
        )}

        {button_text && (
          <span className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 bg-[#f00856] text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-[#f00856]/20 group-hover:shadow-[#f00856]/40 transition-all duration-300">
            {button_text}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </span>
        )}
      </div>
    </div>
  );

  // Wrap in Link if link_url is provided
  if (link_url) {
    return (
      <Link to={link_url} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f00856]/50 rounded-2xl">
        {content}
      </Link>
    );
  }

  return content;
}
