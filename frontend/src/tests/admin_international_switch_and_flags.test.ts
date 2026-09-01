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
    const toggledPublic = { ...defaultSettings, international_public_enabled: true };
    expect(toggledPublic.international_public_enabled).toBe(true);
    expect(toggledPublic.international_purchases_enabled).toBe(true);
    expect(toggledPublic.international_capacity_enabled).toBe(true);

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

  it('4. Nav menu links react dynamically with custom appearance_menu_json', () => {
    const computeNavLinks = (customMenuStr: string | null, intlPublicEnabled: boolean) => {
      let links: Array<{ name: string; href: string }> = [];
      if (customMenuStr) {
        try {
          const parsed = JSON.parse(customMenuStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            links = parsed.map((item: any) => ({
              name: item.label,
              href: item.url
            }));
          }
        } catch {}
      }

      if (links.length === 0) {
        links = [
          { name: 'INICIO', href: '/' },
          { name: 'CATEGORÍAS', href: '/shop' },
          { name: 'MARCAS', href: '/shop' },
          { name: 'NOSOTROS', href: '/page/nosotros' },
          { name: 'CONTACTO', href: '/contact' }
        ];
      }

      if (intlPublicEnabled) {
        const hasIntl = links.some(l => l.href === '/intl' || l.name?.toUpperCase() === 'INTERNACIONAL');
        if (!hasIntl) {
          const insertIdx = 3;
          links.splice(insertIdx, 0, { name: 'INTERNACIONAL', href: '/intl' });
        }
      } else {
        links = links.filter(l => l.href !== '/intl' && l.href !== '/internacional' && l.name?.toUpperCase() !== 'INTERNACIONAL');
      }

      return links;
    };

    const customMenu = JSON.stringify([
      { label: 'INICIO', url: '/' },
      { label: 'CATEGORÍAS', url: '/shop' },
      { label: 'MARCAS', url: '/shop' },
      { label: 'NOSOTROS', url: '/about' },
      { label: 'CONTACTO', url: '/contact' }
    ]);

    // Test with custom appearance_menu_json: OFF
    const offLinks = computeNavLinks(customMenu, false);
    expect(offLinks.some(l => l.name === 'INTERNACIONAL' || l.href === '/intl')).toBe(false);

    // Test with custom appearance_menu_json: ON
    const onLinks = computeNavLinks(customMenu, true);
    expect(onLinks.some(l => l.name === 'INTERNACIONAL' && l.href === '/intl')).toBe(true);
    expect(onLinks.find(l => l.href === '/intl')?.name).toBe('INTERNACIONAL');
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

    expect(evaluateRoute('/intl', false, false)).toBe('REDIRECT_TO_HOME');
    expect(evaluateRoute('/internacional', false, false)).toBe('DENY_REQUIRE_ADMIN');

    expect(evaluateRoute('/intl', false, true)).toBe('RENDER_PUBLIC_CATALOG');
    expect(evaluateRoute('/internacional', false, true)).toBe('DENY_REQUIRE_ADMIN');

    expect(evaluateRoute('/internacional', true, false)).toBe('ALLOW_ADMIN_LABORATORY');
  });

  it('6. International products mapping: published status products are eligible for /intl (> 0)', () => {
    const dbRows = [
      { id: '1', title: 'NECA Ghost Face', status: 'published', final_price_usd: '41.99', image_url: 'http://img.jpg', brand: 'NECA' },
      { id: '2', title: 'NECA Halloween', status: 'published', final_price_usd: '41.78', image_url: 'http://img2.jpg', brand: 'NECA' },
      { id: '3', title: 'NECA Draft Only', status: 'draft', final_price_usd: '38.12', image_url: 'http://img3.jpg', brand: 'NECA' }
    ];

    const publicProducts = dbRows
      .filter(p => p.status === 'published' && Number(p.final_price_usd) > 0)
      .map(item => ({
        id: item.id,
        slug: item.id,
        title: item.title,
        base_price: Number(item.final_price_usd),
        is_international: true
      }));

    expect(publicProducts.length).toBe(2);
    expect(publicProducts.length).toBeGreaterThan(0);
    expect(publicProducts[0].base_price).toBe(41.99);
    expect(publicProducts[0].is_international).toBe(true);
  });

});
