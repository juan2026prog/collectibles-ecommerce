import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import WhatsAppFAB from './WhatsAppFAB';

const mocks = vi.hoisted(() => ({ settings: {} as Record<string, string> }));
vi.mock('../hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: mocks.settings }) }));
vi.mock('../contexts/CartContext', () => ({ useCartContext: () => ({ isDrawerOpen: false }) }));
afterEach(cleanup);

it('uses shared cached settings and reacts when WhatsApp is disabled without a separate database read', () => {
  mocks.settings = { social_whatsapp_enabled: 'true', social_whatsapp_url: '+598 (99) 123-456' };
  const element = () => <MemoryRouter><WhatsAppFAB /></MemoryRouter>;
  const { rerender } = render(element());
  expect(screen.getByRole('link', { name: 'Contactar por WhatsApp' })).toHaveAttribute('href', 'https://wa.me/59899123456');

  mocks.settings = { ...mocks.settings, social_whatsapp_enabled: 'false' };
  rerender(element());
  expect(screen.queryByRole('link', { name: 'Contactar por WhatsApp' })).not.toBeInTheDocument();
});
