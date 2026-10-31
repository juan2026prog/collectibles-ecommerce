import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeroSlider from './HeroSlider';

vi.mock('../hooks/useImageProtection', () => ({
  useImageProtection: () => ({ getImageProps: (className: string) => ({ className }) }),
}));

vi.mock('../lib/analyticsTracker', () => ({ trackClarityEvent: vi.fn() }));

type Banner = React.ComponentProps<typeof HeroSlider>['banners'][number];

// D1 and cached banners may omit presentation fields supplied by Supabase.
function banner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'd1-banner',
    title: 'Figuras que cuentan historias.',
    subtitle: null,
    image_url: '/images/banners/vitrina_desktop.png',
    mobile_image_url: null,
    link_url: '/shop',
    cta_text: 'Ver catálogo',
    badge_text: null,
    button_text: null,
    secondary_button_text: null,
    secondary_button_url: null,
    content_position: null,
    content_align: null,
    ...overrides,
  };
}

function slider(banners: Banner[]) {
  return <MemoryRouter><HeroSlider banners={banners} /></MemoryRouter>;
}

describe('HeroSlider image visibility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    ['missing', undefined, '0.25'],
    ['null', null, '0.25'],
    ['NaN', Number.NaN, '0.25'],
    ['infinity', Number.POSITIVE_INFINITY, '0.25'],
    ['negative infinity', Number.NEGATIVE_INFINITY, '0.25'],
    ['empty string', '', '0.25'],
    ['whitespace', '  ', '0.25'],
    ['invalid string', 'invalid', '0.25'],
    ['negative value', -1, '0'],
    ['transparent', 0, '0'],
    ['configured opacity', 0.1, '0.1'],
    ['numeric string', '0.15', '0.15'],
    ['default Supabase opacity', 0.4, '0.25'],
    ['out of range', 2, '0.25'],
  ])('keeps the photograph visible with %s opacity', (_label, value, expected) => {
    const { container } = render(slider([banner({ overlay_opacity: value })]));
    const overlay = container.querySelector<HTMLElement>('.bg-black')!;

    expect(getComputedStyle(overlay).opacity).toBe(expected);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/images/banners/vitrina_desktop.png');
  });

  it('keeps every D1 slide visible after replacing cached banners and advancing the carousel', () => {
    const { container, rerender } = render(slider([banner({ overlay_opacity: 0.1 })]));
    const d1Banners = [banner(), banner({ id: 'second', title: 'Segunda fotografía' })];

    rerender(slider(d1Banners));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    act(() => vi.advanceTimersByTime(7000));

    const overlays = container.querySelectorAll<HTMLElement>('.bg-black');
    expect(overlays).toHaveLength(2);
    overlays.forEach(overlay => expect(getComputedStyle(overlay).opacity).toBe('0.25'));
  });
});
