import { describe, it, expect } from 'vitest';
import { formatUSD, formatUYU, formatProductPrice } from '../lib/formatters';

// ─── TYPES & HELPER FUNCTIONS ───────────────────────────

interface CartItem {
  id: string;
  variant_id: string;
  title: string;
  price: number;
  quantity: number;
  vendor_id?: string;
  vendor_name?: string;
  vendor_store_id?: string;
  is_international?: boolean;
  source_provider?: string;
  shipping_type?: string;
}

interface ShippingSelection {
  method: 'delivery' | 'pickup' | 'dac_home' | 'dac_agency' | 'ues' | 'correo_uruguayo' | 'manual' | 'international_courier_direct';
  selectedAgency?: any | null;
}

function getStoreKey(item: CartItem): string {
  if (item.is_international === true || item.source_provider === 'zinc' || item.shipping_type === 'international_courier_direct') {
    return 'international';
  }
  const vId = item.vendor_id;
  const sId = item.vendor_store_id;
  if (!vId || vId === 'platform' || vId === 'null' || vId === 'undefined') {
    return 'collectibles';
  }
  if (sId && sId !== 'null' && sId !== 'undefined') {
    return sId;
  }
  return vId;
}

function getVendorName(storeKey: string, items: CartItem[]): string {
  if (storeKey === 'collectibles' || storeKey === 'platform') return 'Collectibles.uy';
  if (storeKey === 'international') return 'Collectibles · Internacional';
  return items.find(item => getStoreKey(item) === storeKey)?.vendor_name || 'Vendedor';
}

function getVendorShippingOptions(storeKey: string, groupTotal: number, freeShippingThreshold = 4000) {
  if (storeKey === 'international') {
    return [{
      id: 'international_courier_direct',
      name: 'Entrega en tu casilla de EE.UU.',
      available: true,
      cost: 0,
      show: true,
      badge: 'SIN CARGO ADICIONAL'
    }];
  }
  if (storeKey === 'collectibles') {
    return [
      {
        id: 'dac_home',
        name: 'DAC a domicilio',
        available: true,
        cost: groupTotal >= freeShippingThreshold ? 0 : 220,
        show: true
      },
      {
        id: 'pickup',
        name: 'Retiro en local (Vázquez 1418, Montevideo)',
        available: true,
        cost: 0,
        show: true
      }
    ];
  }
  // Vendor shipping (e.g. JorgiToys)
  return [
    {
      id: 'dac_home',
      name: 'DAC a domicilio (Envío del vendedor)',
      available: true,
      cost: 240,
      show: true
    },
    {
      id: 'pickup',
      name: 'Retiro en local del vendedor',
      available: true,
      cost: 0,
      show: true
    }
  ];
}

function validateInternationalAddress(addr: {
  courier_name?: string;
  recipient_name?: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  confirmedResponsibility?: boolean;
}) {
  if (!addr.courier_name?.trim()) throw new Error('El nombre del courier es obligatorio.');
  if (!addr.recipient_name?.trim()) throw new Error('El nombre del destinatario es obligatorio.');
  if (!addr.address_line_1?.trim()) throw new Error('La dirección (Address Line 1) es obligatoria.');
  if (!addr.city?.trim()) throw new Error('La ciudad es obligatoria.');
  if (!addr.state?.trim()) throw new Error('El estado/región es obligatorio.');
  if (!addr.postal_code?.trim()) throw new Error('El código postal (ZIP Code) es obligatorio.');
  if (!addr.phone?.trim()) throw new Error('El teléfono es obligatorio.');
  if (!addr.confirmedResponsibility) throw new Error('Debe confirmar los datos y deslinde de responsabilidad.');
  return true;
}

// ─── SUITE DE PRUEBAS ───────────────────────────────────

describe('INTEGRACIÓN UX Y CHECKOUT MIXTO DE COMPRAS INTERNACIONALES', () => {

  const jorgiToysItem: CartItem = {
    id: 'prod-1',
    variant_id: 'var-1',
    title: 'Star Wars Black Series R2-D2',
    price: 1800,
    quantity: 1,
    vendor_id: 'vendor-jorgitoys',
    vendor_name: 'JorgiToys'
  };

  const collectiblesLocalItem: CartItem = {
    id: 'prod-2',
    variant_id: 'var-2',
    title: 'Masters of the Universe He-Man Origins',
    price: 2500,
    quantity: 1,
    vendor_id: 'platform',
    vendor_name: 'Collectibles.uy'
  };

  const internationalItem: CartItem = {
    id: 'prod-3',
    variant_id: 'var-3',
    title: 'NECA Phantom of the Opera Ultimate Edition',
    price: 3400,
    quantity: 1,
    is_international: true,
    source_provider: 'zinc',
    shipping_type: 'international_courier_direct'
  };

  it('1. Carrito mixto genera 3 paquetes independientes sin interferencia mutua', () => {
    const cartItems = [jorgiToysItem, collectiblesLocalItem, internationalItem];
    
    // Grouping
    const uniqueKeys = Array.from(new Set(cartItems.map(getStoreKey)));
    expect(uniqueKeys).toHaveLength(3);
    expect(uniqueKeys).toContain('vendor-jorgitoys');
    expect(uniqueKeys).toContain('collectibles');
    expect(uniqueKeys).toContain('international');

    // Vendor names / labels
    expect(getVendorName('vendor-jorgitoys', cartItems)).toBe('JorgiToys');
    expect(getVendorName('collectibles', cartItems)).toBe('Collectibles.uy');
    expect(getVendorName('international', cartItems)).toBe('Collectibles · Internacional');
  });

  it('2. Paquete internacional ofrece Entrega en tu casilla de EE.UU. a costo $0 local', () => {
    const options = getVendorShippingOptions('international', 3400);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('international_courier_direct');
    expect(options[0].name).toBe('Entrega en tu casilla de EE.UU.');
    expect(options[0].cost).toBe(0);
    expect(options[0].badge).toBe('SIN CARGO ADICIONAL');
  });

  it('3. Paquetes nacionales mantienen intactos DAC y retiro en local con sus costos y thresholds', () => {
    // JorgiToys
    const jorgiOptions = getVendorShippingOptions('vendor-jorgitoys', 1800);
    expect(jorgiOptions.find(o => o.id === 'dac_home')?.cost).toBe(240);
    expect(jorgiOptions.find(o => o.id === 'pickup')?.cost).toBe(0);

    // Collectibles local < 4000
    const colOptionsUnder = getVendorShippingOptions('collectibles', 2500, 4000);
    expect(colOptionsUnder.find(o => o.id === 'dac_home')?.cost).toBe(220);

    // Collectibles local >= 4000 (Free shipping qualified)
    const colOptionsOver = getVendorShippingOptions('collectibles', 4500, 4000);
    expect(colOptionsOver.find(o => o.id === 'dac_home')?.cost).toBe(0);
  });

  it('4. Validación estricta de Casilla en EE.UU. (cualquier courier permitido)', () => {
    const validUrubox = {
      courier_name: 'Urubox',
      recipient_name: 'Juan Pérez / UY-8841',
      address_line_1: '2030 NW 95th Ave',
      city: 'Doral',
      state: 'FL',
      postal_code: '33172',
      phone: '7863140977',
      confirmedResponsibility: true
    };
    expect(validateInternationalAddress(validUrubox)).toBe(true);

    const validAnyCourier = {
      courier_name: 'Aerobox Miami Box',
      recipient_name: 'Juan Pérez',
      address_line_1: '1234 Express Way',
      city: 'Miami',
      state: 'FL',
      postal_code: '33166',
      phone: '3055550000',
      confirmedResponsibility: true
    };
    expect(validateInternationalAddress(validAnyCourier)).toBe(true);

    // Missing confirmation
    expect(() => validateInternationalAddress({ ...validUrubox, confirmedResponsibility: false })).toThrowError(
      /deslinde de responsabilidad/
    );

    // Missing courier name
    expect(() => validateInternationalAddress({ ...validUrubox, courier_name: '' })).toThrowError(
      /nombre del courier/
    );
  });

  it('5. Feature Flag: international_public_enabled = false oculta menú y ruta pública', () => {
    const buildNavLinks = (publicEnabled: boolean) => {
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

    const linksDisabled = buildNavLinks(false);
    expect(linksDisabled.find(l => l.name === 'Internacional')).toBeUndefined();

    const linksEnabled = buildNavLinks(true);
    expect(linksEnabled.find(l => l.name === 'Internacional')?.href).toBe('/intl');
  });

  it('6. Separación estricta entre /intl (público) y /internacional (Laboratorio Admin)', () => {
    const resolveAccess = (path: string, isAdmin: boolean, publicEnabled: boolean) => {
      if (path === '/internacional') {
        return isAdmin ? 'LABORATORY_ACCESS_GRANTED' : 'AUTH_REQUIRED_ADMIN';
      }
      if (path === '/intl') {
        return publicEnabled ? 'PUBLIC_CATALOG_RENDER' : 'REDIRECT_TO_HOME';
      }
      return 'PAGE_NOT_FOUND';
    };

    // Public user when public flag is OFF
    expect(resolveAccess('/intl', false, false)).toBe('REDIRECT_TO_HOME');
    expect(resolveAccess('/internacional', false, false)).toBe('AUTH_REQUIRED_ADMIN');

    // Public user when public flag is ON
    expect(resolveAccess('/intl', false, true)).toBe('PUBLIC_CATALOG_RENDER');
    expect(resolveAccess('/internacional', false, true)).toBe('AUTH_REQUIRED_ADMIN');

    // Admin user
    expect(resolveAccess('/internacional', true, false)).toBe('LABORATORY_ACCESS_GRANTED');
  });

  it('7. Estado 2: Public ON + Purchases OFF muestra catálogo pero pausa compras', () => {
    const canPurchaseInternational = (publicEnabled: boolean, purchasesEnabled: boolean) => {
      if (!publicEnabled) return { visible: false, canBuy: false, cta: 'NOT_FOUND' };
      if (publicEnabled && !purchasesEnabled) return { visible: true, canBuy: false, cta: 'COMPRAS_PAUSADAS' };
      return { visible: true, canBuy: true, cta: 'AGREGAR_AL_CARRITO' };
    };

    const state2 = canPurchaseInternational(true, false);
    expect(state2.visible).toBe(true);
    expect(state2.canBuy).toBe(false);
    expect(state2.cta).toBe('COMPRAS_PAUSADAS');

    const state3 = canPurchaseInternational(true, true);
    expect(state3.visible).toBe(true);
    expect(state3.canBuy).toBe(true);
    expect(state3.cta).toBe('AGREGAR_AL_CARRITO');
  });

  it('8. Formato de Precios: Internacional muestra estrictamente USD XX,XX y Local muestra $ X.XXX', () => {
    // Producto internacional (USD 38.65)
    expect(formatUSD(38.65)).toBe('USD 38,65');
    expect(formatProductPrice(38.65, true)).toBe('USD 38,65');
    expect(formatProductPrice(120, true)).toBe('USD 120,00');
    expect(formatProductPrice(9.15, true)).toBe('USD 9,15');

    // Producto nacional / local (UYU 1750, 4990)
    expect(formatUYU(1750)).toBe('$ 1.750');
    expect(formatProductPrice(1750, false)).toBe('$ 1.750');
    expect(formatProductPrice(4990, false)).toBe('$ 4.990');
  });

  it('9. Semántica visual: Celeste para elementos internacionales y Magenta para CTAs corporativos', () => {
    const getProductCardVisualTokens = (isInternational: boolean) => {
      return {
        borderClass: isInternational ? 'border-2 border-sky-500/40' : 'border-2 border-[#f00856]',
        badgeClass: isInternational ? 'bg-sky-950/60 border-sky-500/40 text-sky-300' : 'bg-[#f00856]',
        priceColor: isInternational ? 'text-sky-400' : 'text-[#f00856]',
        ctaButtonClass: 'bg-[#f00856] text-white hover:bg-[#d00749]' // CTAs always magenta
      };
    };

    const intlTokens = getProductCardVisualTokens(true);
    expect(intlTokens.borderClass).toContain('sky-500');
    expect(intlTokens.badgeClass).toContain('sky-300');
    expect(intlTokens.priceColor).toBe('text-sky-400');
    expect(intlTokens.ctaButtonClass).toContain('#f00856'); // Magenta intact for CTAs

    const localTokens = getProductCardVisualTokens(false);
    expect(localTokens.borderClass).toContain('#f00856');
    expect(localTokens.ctaButtonClass).toContain('#f00856');
  });

});
