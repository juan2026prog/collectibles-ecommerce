import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { FALLBACK_IMAGE, getImageSources, resolveImage, markBrokenImageUrl, type ImageSizeVariant } from '../lib/imageUtils';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src?: string | null;
  fallbackUrls?: string[];
  variant?: ImageSizeVariant;
  priority?: 'viewport' | 'high' | 'lazy';
}

/** Decide priority from actual layout before assigning src; native lazy loading handles scrolling. */
export function ResponsiveImage({ src, fallbackUrls = [], variant = 'card', priority = 'viewport', sizes,
  onError, ...props }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [, retry] = useState(0);
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    setVisible(Boolean(rect && rect.top < window.innerHeight && rect.bottom > 0
      && rect.left < window.innerWidth && rect.right > 0));
  }, [src]);
  const original = [src, ...fallbackUrls].find(url => url && resolveImage(url, 'raw') !== FALLBACK_IMAGE) || FALLBACK_IMAGE;
  const sources = getImageSources(original, variant);
  const ready = priority !== 'viewport' || visible !== null;
  const eager = priority === 'high' || (priority === 'viewport' && visible);
  return <img {...props} ref={ref} width={sources.width} height={sources.height}
    src={ready ? sources.src : undefined} srcSet={ready ? sources.srcSet : undefined}
    sizes={sizes || '(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 240px'}
    loading={eager ? 'eager' : 'lazy'} decoding="async"
    fetchPriority={priority === 'high' ? 'high' : eager ? 'auto' : 'low'}
    onError={event => {
      const failed = event.currentTarget.currentSrc || event.currentTarget.src;
      if (failed.startsWith('data:')) return;
      markBrokenImageUrl(failed);
      retry(value => value + 1);
      onError?.(event);
    }} />;
}
