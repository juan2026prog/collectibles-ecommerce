import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResponsiveImage } from '../components/ResponsiveImage';
import { extractCandidateImages, getImageSources, getProductImage, sortProductImages } from '../lib/imageUtils';
import { registerMediaVariants } from '../lib/mediaVariants';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('Product image selection and responsive delivery', () => {
  it('honors primary, order zero, stable ties, both relation names and deduplication', () => {
    const images = [{id:'c',url:'https://img/c.png',sort_order:0},
      {id:'b',url:'https://img/b.png',sort_order:9,is_primary:true},
      {id:'a',url:'https://img/a.png',sort_order:0},
      {id:'d',url:'https://img/c.png',sort_order:1}];
    expect(sortProductImages(images).map(i => i.id)).toEqual(['b','a','c','d']);
    expect(sortProductImages([...images].reverse())).toEqual(sortProductImages(images));
    expect(extractCandidateImages({image_url:'https://img/stale.png',images,product_images:images})).toEqual([
      'https://img/b.png','https://img/a.png','https://img/c.png','https://img/stale.png']);
    expect(getProductImage({product_images:images}, 'raw')).toBe('https://img/b.png');
  });
  it('uses only published variants, preserves originals and bounds srcset by use', () => {
    const original = 'https://img/responsive.png';
    registerMediaVariants([{original_url:original,width:1200,height:900,original_bytes:100000,
      variants:{thumbnail:{url:'https://img/160.webp',width:160,height:120,bytes:1000},
        card:{url:'https://img/320.webp',width:320,height:240,bytes:3000},
        'card-2x':{url:'https://img/640.webp',width:640,height:480,bytes:6000},
        detail:{url:'https://img/960.webp',width:960,height:720,bytes:12000}}}]);
    expect(getImageSources(original).src).toBe('https://img/320.webp');
    expect(getImageSources(original).srcSet).toContain('640w');
    expect(getImageSources(original).srcSet).not.toContain('960w');
    expect(getImageSources(original,'raw').src).toBe(original);
    expect(getImageSources('https://img/unmigrated.png').srcSet).toBeUndefined();
  });
  it('falls back from a missing derivative to original, then next photo without a loop', () => {
    const original='https://img/failing-original.png';
    registerMediaVariants([{original_url:original,width:500,height:500,original_bytes:9000,
      variants:{card:{url:'https://img/failing-card.webp',width:320,height:320,bytes:1000}}}]);
    render(<ResponsiveImage src={original} fallbackUrls={['https://img/alternative.png']} priority="high" alt="fallback sequence" />);
    const image=screen.getByAltText('fallback sequence');
    expect(image.getAttribute('src')).toBe('https://img/failing-card.webp');
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(original);
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('https://img/alternative.png');
  });
  it.each([['visible',20,'eager','auto'],['below fold',2000,'lazy','low']] as const)
  ('measures %s placement before choosing loading priority', (_, top, loading, priority) => {
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({top,bottom:top+200,left:0,right:200,width:200,height:200,x:0,y:top,toJSON(){}});
    render(<ResponsiveImage src={'https://img/'+top+'.png'} alt="viewport" />);
    const image=screen.getByAltText('viewport');
    expect(image.getAttribute('loading')).toBe(loading);
    expect(image.getAttribute('fetchpriority')).toBe(priority);
  });
});
