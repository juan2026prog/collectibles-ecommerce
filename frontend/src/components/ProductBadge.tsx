import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface BadgeData {
  id: string;
  label: string;
  bg_color: string;
  text_color: string;
  custom_image?: string;
  color?: string; // Fallback classes for defaults
}

const DEFAULT_BADGES: Record<string, BadgeData> = {
  hot: { id: 'hot', label: 'HOT', color: 'bg-rose-500/90 text-white', bg_color: '#ef4444', text_color: '#ffffff' },
  new: { id: 'new', label: 'NEW', color: 'bg-emerald-500/90 text-white', bg_color: '#22c55e', text_color: '#ffffff' },
  sale: { id: 'sale', label: 'SALE', color: 'bg-blue-500/90 text-white', bg_color: '#3b82f6', text_color: '#ffffff' },
  preorder: { id: 'preorder', label: 'PRE-ORDER', color: 'bg-orange-500/90 text-white', bg_color: '#f97316', text_color: '#ffffff' },
  soldout: { id: 'soldout', label: 'SOLD OUT', color: 'bg-gray-500/90 text-white', bg_color: '#6b7280', text_color: '#ffffff' }
};

let cachedBadges: Record<string, BadgeData> | null = null;
let badgesPromise: Promise<Record<string, BadgeData>> | null = null;

export function ProductBadge({ 
  badgeId, 
  compareAtPrice, 
  basePrice,
  className = "absolute top-2 right-2 px-2 py-1 text-xs font-bold rounded-lg uppercase tracking-wider backdrop-blur-sm shadow-lg"
}: { 
  badgeId?: string | null; 
  compareAtPrice?: number | null; 
  basePrice?: number;
  className?: string;
}) {
  const [badgeData, setBadgeData] = useState<BadgeData | null>(() => {
    if (!badgeId) return null;
    return cachedBadges?.[badgeId] || DEFAULT_BADGES[badgeId] || null;
  });

  useEffect(() => {
    if (!badgeId || DEFAULT_BADGES[badgeId]) return;

    if (!cachedBadges) {
      if (!badgesPromise) {
        badgesPromise = supabase.from('badges').select('*').then(({ data }) => {
          const map: Record<string, BadgeData> = {};
          if (data) {
            data.forEach((b: any) => {
              map[b.id] = {
                id: b.id,
                label: b.label,
                bg_color: b.bg_color,
                text_color: b.text_color,
                custom_image: b.custom_image,
              };
            });
          }
          cachedBadges = map;
          return map;
        });
      }
      badgesPromise.then(map => {
        if (map[badgeId]) setBadgeData(map[badgeId]);
      });
    } else {
      if (cachedBadges[badgeId]) setBadgeData(cachedBadges[badgeId]);
    }
  }, [badgeId]);

  if (!badgeId || !badgeData) return null;

  let label = badgeData.label;
  if (badgeId === 'sale' && compareAtPrice && basePrice) {
    label = `${Math.round((1 - basePrice / compareAtPrice) * 100)}% OFF`;
  }

  const hasImage = !!badgeData.custom_image;

  let style: React.CSSProperties = {
    backgroundColor: badgeData.bg_color,
    color: badgeData.text_color
  };

  if (hasImage) {
    style = {
      backgroundImage: `url(${badgeData.custom_image})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundColor: badgeData.bg_color || 'transparent',
      color: badgeData.text_color,
      minHeight: label ? 'auto' : '24px',
      minWidth: label ? 'auto' : '24px'
    };
  }

  return (
    <span 
      className={`${className} ${badgeData.color || ''}`}
      style={!badgeData.color ? style : undefined}
    >
      {label}
    </span>
  );
}
