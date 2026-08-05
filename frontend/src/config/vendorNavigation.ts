// Single Source of Truth for Vendor Navigation and Onboarding Configuration

export const SETTINGS_TAB_ALIASES: Record<string, string> = {
  // Profile
  profile: 'profile',
  perfil: 'profile',
  store_profile: 'profile',

  // Billing / Payouts / Cobros
  billing: 'billing',
  cobros: 'billing',
  payments: 'billing',
  payouts: 'billing',
  payout_account: 'billing',

  // Shipping / Envíos / Logística
  shipping: 'shipping',
  logistica: 'shipping',
  envios: 'shipping',
  dispatch: 'shipping',
  dispatch_address: 'shipping',
  shipping_methods: 'shipping',

  // Notifications
  notifications: 'notifications',
  notificaciones: 'notifications',

  // Mercado Libre / Synchronization
  mercadolibre: 'mercadolibre',
  sincronizacion: 'mercadolibre',
  ml: 'mercadolibre',

  // Documents / KYC
  documents: 'documents',
  documentacion: 'documents',
  kyc: 'documents',
  documentation: 'documents',

  // Terms & Conditions
  terms: 'terms',
  terminos: 'terms',
  legal: 'terms'
};

export function normalizeSettingsTab(tab?: string | null): string {
  if (!tab) return 'profile';
  const key = tab.toLowerCase().trim();
  return SETTINGS_TAB_ALIASES[key] || 'profile';
}

export interface VendorOnboardingStepConfig {
  code: string;
  number: number;
  title: string;
  description: string;
  badge: 'Obligatorio' | 'Recomendado' | 'Informativo';
  ctaText: string;
  ctaPath: string;
}

export const VENDOR_ONBOARDING_STEPS_CONFIG: VendorOnboardingStepConfig[] = [
  {
    code: 'store_profile',
    number: 1,
    title: 'Completá los datos de tu tienda',
    description: 'Nombre público, logo, descripción, RUT/Cédula y domicilio fiscal.',
    badge: 'Obligatorio',
    ctaText: 'COMPLETAR DATOS DE LA TIENDA',
    ctaPath: '/vendor?tab=settings&sub=profile'
  },
  {
    code: 'payout_account',
    number: 2,
    title: 'Configurá dónde recibirás tus pagos',
    description: 'Cuenta bancaria para transferencias de liquidación todos los miércoles.',
    badge: 'Obligatorio',
    ctaText: 'CONFIGURAR CUENTA DE COBRO',
    ctaPath: '/vendor?tab=settings&sub=billing'
  },
  {
    code: 'dispatch_address',
    number: 3,
    title: 'Agregá tu dirección de despacho',
    description: 'Dirección física de origen desde donde saldrán tus paquetes.',
    badge: 'Obligatorio',
    ctaText: 'AGREGAR DIRECCIÓN DE DESPACHO',
    ctaPath: '/vendor?tab=settings&sub=shipping&focus=dispatch-address'
  },
  {
    code: 'shipping_methods',
    number: 4,
    title: 'Elegí tus métodos de entrega',
    description: 'Habilitá DAC, SoyDelivery Flex, Distrilogic, Retiro o Envío propio.',
    badge: 'Obligatorio',
    ctaText: 'CONFIGURAR ENVÍOS',
    ctaPath: '/vendor?tab=settings&sub=shipping&focus=shipping-methods'
  },
  {
    code: 'free_shipping_rule',
    number: 5,
    title: 'Revisá la regla de envío gratis',
    description: 'Envío gratis obligatorio desde UYU 1.500 por tienda a cargo del Vendor.',
    badge: 'Obligatorio',
    ctaText: 'REVISAR Y CONFIRMAR',
    ctaPath: 'action:free_shipping_modal'
  },
  {
    code: 'first_product',
    number: 6,
    title: 'Publicá tu primer producto',
    description: 'Cargá título, fotos, precio, stock, dimensiones y peso.',
    badge: 'Obligatorio',
    ctaText: 'PUBLICAR MI PRIMER PRODUCTO',
    ctaPath: '/vendor?tab=products&action=new'
  },
  {
    code: 'sales_workflow',
    number: 7,
    title: 'Revisá cómo funciona una venta',
    description: 'Guía educativa del proceso: pedido, empaque, despacho y liquidación.',
    badge: 'Informativo',
    ctaText: 'VER GUÍA DE VENTA',
    ctaPath: 'action:sales_workflow_modal'
  }
];
