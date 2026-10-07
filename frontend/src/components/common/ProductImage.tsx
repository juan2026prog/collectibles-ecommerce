import React, { useState, useEffect, useMemo } from 'react';
import { FALLBACK_IMAGE, resolveImage, markBrokenImageUrl, isBrokenImageUrl } from '../../lib/imageUtils';
import { ImageOff } from 'lucide-react';

export interface ProductImageProps {
  src?: string | null;
  alternativeUrls?: string[];
  alt?: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: 'square' | 'video' | 'auto';
  showMissingBadge?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'full';
  onStatusChange?: (status: 'loading' | 'loaded' | 'error' | 'empty') => void;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alternativeUrls = [],
  alt = 'Producto',
  className = 'w-full h-full object-contain',
  containerClassName = '',
  aspectRatio = 'square',
  showMissingBadge = false,
  size = 'md',
  onStatusChange
}) => {
  // Extract and deduplicate valid candidates
  const candidateUrls = useMemo(() => {
    const list: string[] = [];
    const add = (u: any) => {
      if (typeof u === 'string') {
        const trimmed = u.trim();
        if (
          trimmed && 
          !trimmed.includes('via.placeholder.com') && 
          !trimmed.startsWith('data:image/svg+xml') && 
          !isBrokenImageUrl(trimmed) &&
          !list.includes(trimmed)
        ) {
          list.push(trimmed);
        }
      }
    };

    add(src);
    alternativeUrls.forEach(add);
    return list;
  }, [src, alternativeUrls]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset when source changes
  useEffect(() => {
    setCurrentIndex(0);
    setHasError(candidateUrls.length === 0);
    setIsLoaded(false);
    if (candidateUrls.length === 0) {
      onStatusChange?.('empty');
    } else {
      onStatusChange?.('loading');
    }
  }, [candidateUrls]);

  const currentUrl = candidateUrls[currentIndex] ? resolveImage(candidateUrls[currentIndex]) : null;

  const handleError = () => {
    // Record current failing URL in cache to prevent repeated 404 network requests
    const failingCandidate = candidateUrls[currentIndex];
    if (failingCandidate) {
      markBrokenImageUrl(failingCandidate);
    }

    if (currentIndex + 1 < candidateUrls.length) {
      // Try next alternative URL
      setCurrentIndex(prev => prev + 1);
    } else {
      // All candidate URLs failed
      setHasError(true);
      onStatusChange?.('error');
    }
  };

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    onStatusChange?.('loaded');
  };

  const sizeClasses = {
    xs: 'w-8 h-8 text-[9px]',
    sm: 'w-12 h-12 text-[10px]',
    md: 'w-16 h-16 text-xs',
    lg: 'w-24 h-24 text-xs',
    full: 'w-full h-full text-xs'
  }[size];

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: ''
  }[aspectRatio];

  if (hasError || !currentUrl) {
    return (
      <div 
        className={`relative flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-lg p-1 text-slate-400 select-none overflow-hidden ${sizeClasses} ${aspectClasses} ${containerClassName}`}
        title="Sin imagen disponible"
      >
        <ImageOff className="w-4 h-4 opacity-50 text-slate-400 shrink-0 mb-0.5" />
        <span className="text-[9px] font-semibold text-slate-400 tracking-tight leading-none text-center">
          SIN IMAGEN
        </span>
        {showMissingBadge && (
          <span className="absolute bottom-0.5 inset-x-0.5 py-0.5 bg-amber-500/10 text-amber-700 text-[8px] font-bold text-center rounded">
            REVISAR
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center bg-white border border-slate-100 rounded-lg overflow-hidden ${aspectClasses} ${containerClassName}`}>
      <img
        src={currentUrl}
        alt={alt}
        className={`${className} transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
      />
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-slate-100 animate-pulse flex items-center justify-center">
          <div className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
};
