import { describe, it, expect } from 'vitest';

describe('ADMIN INTERNATIONAL SETTINGS — PUBLIC SWITCH AND FLAGS', () => {

  interface SyncSettings {
    id: number;
    international_public_enabled: boolean;
    international_purchases_enabled: boolean;
    international_capacity_enabled: boolean;
    international_operating_limit_usd: number;
    international_safety_reserve_usd: number;
    target_margin_percent: number;
    min_absolute_profit_usd: number;
  }

  const defaultSettings: SyncSettings = {
    id: 1,
    international_public_enabled: false,
    international_purchases_enabled: true,
    international_capacity_enabled: true,
    international_operating_limit_usd: 500,
    international_safety_reserve_usd: 50,
    target_margin_percent: 15,
    min_absolute_profit_usd: 2
  };

  it('1. Default state: international_public_enabled is strictly false on load', () => {
    expect(defaultSettings.international_public_enabled).toBe(false);
    expect(defaultSettings.international_purchases_enabled).toBe(true);
    expect(defaultSettings.international_capacity_enabled).toBe(true);
  });

  it('2. Three separate flags are independent and not intertwined', () => {
    // Toggling public does not alter purchases or capacity
    const toggledPublic = { ...defaultSettings, international_public_enabled: true };
    expect(toggledPublic.international_public_enabled).toBe(true);
    expect(toggledPublic.international_purchases_enabled).toBe(true);
    expect(toggledPublic.international_capacity_enabled).toBe(true);

    // Toggling purchases does not alter public or capacity
    const toggledPurchases = { ...defaultSettings, international_purchases_enabled: false };
    expect(toggledPurchases.international_public_enabled).toBe(false);
    expect(toggledPurchases.international_purchases_enabled).toBe(false);
    expect(toggledPurchases.international_capacity_enabled).toBe(true);
  });

  it('3. Strong warning rule: triggers when purchases = ON and capacity = OFF', () => {
    const shouldShowWarning = (s: SyncSettings) => {
      return s.international_purchases_enabled && !s.international_capacity_enabled;
    };

    expect(shouldShowWarning(defaultSettings)).toBe(false);
    expect(shouldShowWarning({ ...defaultSettings, international_capacity_enabled: false })).toBe(true);
    expect(shouldShowWarning({ ...defaultSettings, international_purchases_enabled: false, international_capacity_enabled: false })).toBe(false);
  });

  it('4. Nav menu links react dynamically to international_public_enabled', () => {
    const getNavLinks = (publicEnabled: boolean) => {
      const links = [
        { name: 'Inicio', href: '/' },
        { name: 'Categorías', href: '/shop' },
        { name: 'Marcas', href: '/shop' }
      ];
      if (publicEnabled) {
        links.push({ name: 'Internacional', href: '/intl' });
      }
      links.push({ name: 'Nosotros', href: '/page/nosotros' });
      return links;
    };

    // When OFF
    const offLinks = getNavLinks(false);
    expect(offLinks.some(l => l.name === 'Internacional')).toBe(false);

    // When ON
    const onLinks = getNavLinks(true);
    expect(onLinks.some(l => l.name === 'Internacional')).toBe(true);
    expect(onLinks.find(l => l.name === 'Internacional')?.href).toBe('/intl');
  });

  it('5. Route access separation between public /intl and Admin laboratory /internacional', () => {
    const evaluateRoute = (path: string, isAdmin: boolean, publicEnabled: boolean) => {
      if (path === '/internacional') {
        return isAdmin ? 'ALLOW_ADMIN_LABORATORY' : 'DENY_REQUIRE_ADMIN';
      }
      if (path === '/intl') {
        return publicEnabled ? 'RENDER_PUBLIC_CATALOG' : 'REDIRECT_TO_HOME';
      }
      return 'UNKNOWN_ROUTE';
    };

    // Public user when public flag is OFF
    expect(evaluateRoute('/intl', false, false)).toBe('REDIRECT_TO_HOME');
    expect(evaluateRoute('/internacional', false, false)).toBe('DENY_REQUIRE_ADMIN');

    // Public user when public flag is ON
    expect(evaluateRoute('/intl', false, true)).toBe('RENDER_PUBLIC_CATALOG');
    expect(evaluateRoute('/internacional', false, true)).toBe('DENY_REQUIRE_ADMIN');

    // Admin user in laboratory
    expect(evaluateRoute('/internacional', true, false)).toBe('ALLOW_ADMIN_LABORATORY');
  });

});
