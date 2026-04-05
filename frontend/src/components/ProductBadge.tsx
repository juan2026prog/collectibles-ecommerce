import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface BadgeData {
  id: string;
  label: string;
  bg_color: string;
  text_color: string;
  custom_image?: string;
  color?: string;
  config?: any;
}

const DEFAULT_BADGES: Record<string, BadgeData> = {
  hot: { id: 'hot', label: 'HOT', color: 'bg-rose-500/90 text-white', bg_color: '#ef4444', text_color: '#ffffff', config: { position: 'top-left', size: 'medium' } },
  new: { id: 'new', label: 'NEW', color: 'bg-emerald-500/90 text-white', bg_color: '#22c55e', text_color: '#ffffff', config: { position: 'top-left', size: 'medium' } },
  sale: { id: 'sale', label: 'SALE', color: 'bg-blue-500/90 text-white', bg_color: '#3b82f6', text_color: '#ffffff', config: { position: 'top-left', size: 'medium' } },
  preorder: { id: 'preorder', label: 'PRE-ORDER', color: 'bg-orange-500/90 text-white', bg_color: '#f97316', text_color: '#ffffff', config: { position: 'top-left', size: 'medium' } },
  soldout: { id: 'soldout', label: 'SOLD OUT', color: 'bg-gray-500/90 text-white', bg_color: '#6b7280', text_color: '#ffffff', config: { position: 'top-left', size: 'medium' } }
};

let cachedBadges: Record<string, BadgeData> | null = null;
let badgesPromise: Promise<Record<string, BadgeData>> | null = null;

export function parseBadgeConfig(custom_image: string | undefined | null) {
  if (!custom_image) return null;
  if (custom_image.startsWith('{')) {
    try {
      return JSON.parse(custom_image);
    } catch {
      return { url: custom_image, position: 'top-left', size: 'medium' };
    }
  }
  return { url: custom_image, position: 'top-left', size: 'medium' };
}

export function ProductBadge({ 
  badgeId, // can be a comma separated string now!
  compareAtPrice, 
  basePrice,
  className = "" // No longer needed for absolute positioning if we use inset-0, but kept for compatibility
}: { 
  badgeId?: string | null; 
  compareAtPrice?: number | null; 
  basePrice?: number;
  className?: string; // We'll ignore the position classes passed from outside if doing inset-0
}) {
  const [allBadges, setAllBadges] = useState<Record<string, BadgeData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!badgeId) {
      setLoading(false);
      return;
    }

    if (!cachedBadges) {
      if (!badgesPromise) {
        badgesPromise = supabase.from('badges').select('*').then(({ data }) => {
          const map: Record<string, BadgeData> = { ...DEFAULT_BADGES };
          if (data) {
            data.forEach((b: any) => {
              const id = b.slug || b.id;
              map[id] = {
                id,
                label: b.label,
                bg_color: b.bg_color,
                text_color: b.text_color,
                custom_image: b.custom_image,
                config: parseBadgeConfig(b.custom_image)
              };
            });
          }
          cachedBadges = map;
          return map;
        });
      }
      badgesPromise.then(map => {
        setAllBadges(map);
        setLoading(false);
      });
    } else {
      setAllBadges(cachedBadges);
      setLoading(false);
    }
  }, [badgeId]);

  if (!badgeId || loading) return null;

  const badgeIds = badgeId.split(',').map(s => s.trim()).filter(Boolean);
  const activeBadges = badgeIds.map(id => allBadges[id] || DEFAULT_BADGES[id]).filter(Boolean);

  if (activeBadges.length === 0) return null;

  // Filter out expired tracking
  const now = new Date();
  const validBadges = activeBadges.filter(b => {
    if (!b.config) return true;
    if (b.config.start_date && new Date(b.config.start_date) > now) return false;
    if (b.config.end_date && new Date(b.config.end_date) < now) return false;
    // active flag could also be respected here if available
    return true;
  });

  if (validBadges.length === 0) return null;

  const topLeft = validBadges.filter(b => (b.config?.position || 'top-left') === 'top-left');
  const topRight = validBadges.filter(b => b.config?.position === 'top-right');

  const renderBadge = (b: BadgeData, index: number) => {
    let label = b.label || '';
    if (b.id === 'sale' && compareAtPrice && basePrice) {
      label = `${Math.round((1 - basePrice / compareAtPrice) * 100)}% OFF`;
    }

    const conf = b.config || {};
    const sizeMap = {
      small: 'w-[60px] md:w-[80px] h-auto',
      medium: 'w-[70px] md:w-[100px] h-auto',
      large: 'w-[80px] md:w-[120px] h-auto'
    };
    const sizeClass = sizeMap[(conf.size as keyof typeof sizeMap) || 'medium'];

    if (conf.url) {
      return (
        <img 
          key={`${b.id}-${index}`}
          src={conf.url} 
          alt={label || 'Badge'} 
          className={`${sizeClass} object-contain drop-shadow-md pointer-events-none`}
        />
      );
    }

    // Fallback for legacy text labels without image
    return (
      <span 
        key={`${b.id}-${index}`}
        className={`px-2 py-1 text-[10px] md:text-xs font-black uppercase tracking-wider rounded-lg shadow-sm backdrop-blur-md pointer-events-none ${b.color || ''}`}
        style={!b.color ? { backgroundColor: b.bg_color, color: b.text_color } : undefined}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="absolute inset-0 p-3 pointer-events-none flex justify-between items-start z-10 overflow-hidden rounded-inherit">
      <div className="flex flex-col gap-1.5 pointer-events-auto">
        {topLeft.map(renderBadge)}
      </div>
      <div className="flex flex-col gap-1.5 pointer-events-auto items-end">
        {topRight.map(renderBadge)}
      </div>
    </div>
  );
}
