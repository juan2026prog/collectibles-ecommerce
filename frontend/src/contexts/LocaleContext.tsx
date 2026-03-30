import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type Language = 'es' | 'en';
type Currency = 'UYU' | 'USD' | 'ARS';

interface LocaleContextProps {
  language: Language;
  currency: Currency;
  setLanguage: (lang: Language) => void;
  setCurrency: (curr: Currency) => void;
  formatPrice: (amount: number) => string;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextProps | undefined>(undefined);

// Simple dictionary for now
const i18n: Record<Language, Record<string, string>> = {
  es: {
    // Nav
    'nav.home': 'INICIO',
    'nav.categories': 'CATEGORÍAS',
    'nav.brands': 'MARCAS',
    'nav.about': 'NOSOTROS',
    'nav.contact': 'CONTACTO',
    'nav.blog': 'BLOG',
    'nav.search': 'Buscar...',
    // Hero
    'hero.title': 'TU COLECCIÓN EMPIEZA AQUÍ',
    'hero.subtitle': 'Explora miles de Funko POPs, figuras de acción, juguetes y coleccionables premium.',
    'hero.cta': 'COMPRAR AHORA',
    'hero.cta.secondary': 'VER CATÁLOGO',
    // Shop
    'shop.title': 'Tienda',
    'shop.filters': 'Filtros',
    'shop.sort': 'Ordenar por',
    'shop.results': 'resultados',
    'shop.empty': 'No se encontraron productos',
    'shop.search': 'Buscar productos...',
    'shop.addToCart': 'Agregar al Carrito',
    'shop.outOfStock': 'Sin stock',
    'shop.viewProduct': 'Ver producto',
    // Product
    'product.newBadge': 'NUEVO',
    'product.saleBadge': 'OFERTA',
    'product.qty': 'Cantidad',
    'product.inStock': 'En stock',
    'product.sku': 'SKU',
    // Cart
    'cart.title': 'Tu Carrito',
    'cart.empty': 'Tu carrito está vacío',
    'cart.subtotal': 'Subtotal',
    'cart.shipping': 'Envío',
    'cart.freeShipping': 'Envío gratis',
    'cart.total': 'Total',
    'cart.checkout': 'Ir al Pago',
    'cart.continue': 'Seguir comprando',
    // Checkout
    'checkout.title': 'Finalizar Compra',
    'checkout.shipping': 'Datos de Envío',
    'checkout.payment': 'Método de Pago',
    'checkout.coupon': 'Cupón de descuento',
    'checkout.applyCoupon': 'Aplicar',
    'checkout.placeOrder': 'Confirmar Orden',
    'checkout.firstName': 'Nombre',
    'checkout.lastName': 'Apellido',
    'checkout.email': 'Email',
    'checkout.phone': 'Teléfono',
    'checkout.street': 'Dirección',
    'checkout.city': 'Ciudad',
    // Account
    'account.title': 'Mi Cuenta',
    'account.orders': 'Mis Pedidos',
    'account.profile': 'Perfil',
    'account.signOut': 'Cerrar Sesión',
    'account.signIn': 'Iniciar Sesión',
    'account.register': 'Crear Cuenta',
    // Footer
    'footer.freeShipping': 'Envío Gratis',
    'footer.freeShipping.sub': 'Desde $4000',
    'footer.securePayment': 'Pago Seguro',
    'footer.securePayment.sub': 'Encriptación SSL',
    'footer.returns': 'Cambios Fáciles',
    'footer.returns.sub': '14 días de plazo',
    'footer.support': 'Soporte 24/7',
    'footer.support.sub': 'Asistencia Local',
    // Home
    'hero.badge': 'Colección Exclusiva',
    'home.categories': 'Explorar Categorías',
    'home.categories.sub': 'Encuentra exactamente lo que buscas para tu colección.',
    'home.mostPopular': 'Más Popular',
    'home.viewCollection': 'Ver colección',
    'home.featured': 'Destacados',
    'home.featured.sub': 'Los productos más queridos de nuestra tienda.',
    'home.newArrivals': 'Nuevos Lanzamientos',
    'home.newArrivals.sub': 'Los últimos coleccionables recién llegados.',
    'home.viewAll': 'Ver todos',
    'home.brands': 'Tus marcas de siempre',
    // Locale
    'locale.language': 'Idioma',
    'locale.currency': 'Moneda',
    'locale.saved': 'Cambios guardados automáticamente',
  },
  en: {
    // Nav
    'nav.home': 'HOME',
    'nav.categories': 'CATEGORIES',
    'nav.brands': 'BRANDS',
    'nav.about': 'ABOUT US',
    'nav.contact': 'CONTACT',
    'nav.blog': 'BLOG',
    'nav.search': 'Search...',
    // Hero
    'hero.title': 'YOUR COLLECTION STARTS HERE',
    'hero.subtitle': 'Explore thousands of Funko POPs, action figures, toys, and premium collectibles.',
    'hero.cta': 'SHOP NOW',
    'hero.cta.secondary': 'VIEW CATALOG',
    // Shop
    'shop.title': 'Shop',
    'shop.filters': 'Filters',
    'shop.sort': 'Sort by',
    'shop.results': 'results',
    'shop.empty': 'No products found',
    'shop.search': 'Search products...',
    'shop.addToCart': 'Add to Cart',
    'shop.outOfStock': 'Out of Stock',
    'shop.viewProduct': 'View product',
    // Product
    'product.newBadge': 'NEW',
    'product.saleBadge': 'SALE',
    'product.qty': 'Quantity',
    'product.inStock': 'In stock',
    'product.sku': 'SKU',
    // Cart
    'cart.title': 'Your Cart',
    'cart.empty': 'Your cart is empty',
    'cart.subtotal': 'Subtotal',
    'cart.shipping': 'Shipping',
    'cart.freeShipping': 'Free shipping',
    'cart.total': 'Total',
    'cart.checkout': 'Proceed to Checkout',
    'cart.continue': 'Continue Shopping',
    // Checkout
    'checkout.title': 'Checkout',
    'checkout.shipping': 'Shipping Information',
    'checkout.payment': 'Payment Method',
    'checkout.coupon': 'Discount Coupon',
    'checkout.applyCoupon': 'Apply',
    'checkout.placeOrder': 'Place Order',
    'checkout.firstName': 'First Name',
    'checkout.lastName': 'Last Name',
    'checkout.email': 'Email',
    'checkout.phone': 'Phone',
    'checkout.street': 'Address',
    'checkout.city': 'City',
    // Account
    'account.title': 'My Account',
    'account.orders': 'My Orders',
    'account.profile': 'Profile',
    'account.signOut': 'Sign Out',
    'account.signIn': 'Sign In',
    'account.register': 'Create Account',
    // Footer
    'footer.freeShipping': 'Free Shipping',
    'footer.freeShipping.sub': 'On orders over $40',
    'footer.securePayment': 'Secure Payment',
    'footer.securePayment.sub': '256-bit SSL encryption',
    'footer.returns': 'Easy Returns',
    'footer.returns.sub': '14-day return policy',
    'footer.support': '24/7 Support',
    'footer.support.sub': 'Local Customer Service',
    // Home
    'hero.badge': 'Exclusive Collection',
    'home.categories': 'Browse Categories',
    'home.categories.sub': 'Find exactly what you need for your collection.',
    'home.mostPopular': 'Most Popular',
    'home.viewCollection': 'View collection',
    'home.featured': 'Featured',
    'home.featured.sub': 'Our most loved products.',
    'home.newArrivals': 'New Arrivals',
    'home.newArrivals.sub': 'The latest collectibles just arrived.',
    'home.viewAll': 'View all',
    'home.brands': 'Your favorite brands',
    // Locale
    'locale.language': 'Language',
    'locale.currency': 'Currency',
    'locale.saved': 'Changes saved automatically',
  }
};


// ─── Exchange Rates ──────────────────────────────────────────────────────────
// Base currency is UYU (Peso Uruguayo).
// All product prices in the database are stored in UYU.
// Rates are fetched live from the open exchangerate.host API (no key needed).
// Fallback rates are used if the API is down.
//
// To update rates manually:
//   UYU: 1 (always 1 - base)
//   USD: 1 UYU costs ~0.025 USD  (1 / 40 UYU per dollar)
//   ARS: 1 UYU costs ~25 ARS     (1000 ARS per 40 UYU = 25:1)
//
// ⚠️ These are DISPLAY ONLY. All transactions are processed in UYU.
const FALLBACK_RATES: Record<Currency, number> = {
  UYU: 1,
  USD: 1 / 42,    // ≈ $42 UYU per USD
  ARS: 25,        // ≈ 25 ARS per UYU
};


export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('preferred_language') as Language) || 'es';
  });
  const [currency, setCurrencyState] = useState<Currency>(() => {
    return (localStorage.getItem('preferred_currency') as Currency) || 'UYU';
  });

  // Live exchange rates — cached in localStorage for 1 hour
  const [rates, setRates] = useState<Record<Currency, number>>(FALLBACK_RATES);

  useEffect(() => {
    const CACHE_KEY = 'exchange_rates_cache';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setRates(data);
          return;
        }
      } catch {}
    }

    // Free API — no key needed, base = USD, we need UYU base
    fetch('https://api.exchangerate.host/latest?base=UYU&symbols=USD,ARS')
      .then(r => r.json())
      .then(json => {
        if (json?.rates) {
          const liveRates: Record<Currency, number> = {
            UYU: 1,
            USD: json.rates.USD || FALLBACK_RATES.USD,
            ARS: json.rates.ARS || FALLBACK_RATES.ARS,
          };
          setRates(liveRates);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: liveRates }));
        }
      })
      .catch(() => {
        // API unavailable — keep fallback rates silently
        console.log('Exchange rate API unavailable, using fallback rates');
      });
  }, []);

  useEffect(() => {
    // Sync with DB if logged in
    if (user) {
      supabase.from('profiles').select('preferred_language, preferred_currency').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            if (data.preferred_language) {
              setLanguageState(data.preferred_language as Language);
              localStorage.setItem('preferred_language', data.preferred_language);
            }
            if (data.preferred_currency) {
              setCurrencyState(data.preferred_currency as Currency);
              localStorage.setItem('preferred_currency', data.preferred_currency);
            }
          }
        });
    }
  }, [user]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('preferred_language', lang);
    if (user) {
      await supabase.from('profiles').update({ preferred_language: lang }).eq('id', user.id);
    }
  };

  const setCurrency = async (curr: Currency) => {
    setCurrencyState(curr);
    localStorage.setItem('preferred_currency', curr);
    if (user) {
      await supabase.from('profiles').update({ preferred_currency: curr }).eq('id', user.id);
    }
  };

  const formatPrice = (amount: number) => {
    // Base amount is always UYU internally. Convert using live rates.
    const converted = amount * rates[currency];
    return new Intl.NumberFormat(language === 'es' ? 'es-UY' : 'en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: currency === 'UYU' ? 0 : 2
    }).format(converted);
  };

  const t = (key: string) => {
    return i18n[language][key] || key;
  };

  return (
    <LocaleContext.Provider value={{ language, currency, setLanguage, setCurrency, formatPrice, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}
