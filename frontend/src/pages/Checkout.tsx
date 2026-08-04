import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronDown, Truck, Store, Tag, Sparkles, X, Home, Ticket, Share2, Clock, AlertCircle, MapPin, Building2, Search, Check, Trash2, Plus, Minus, XCircle, RefreshCcw } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { createCheckoutOrder, getPublicPaymentProviders, startCheckoutPayment, type PublicPaymentProvider } from '../lib/payments';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS, calculateShipping, isLocationInSoyDeliveryZone, isSoyDeliveryAvailableForVendor } from '../utils/uruguayLocations';
import { getProductImage, resolveImage } from '../lib/imageUtils';
import { usePromotions, evaluateItemDiscount, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { trackGA4Event, trackClarityEvent, mapCartItemsToGA4 } from '../lib/analyticsTracker';
import { resolveCartItemPrice } from '../lib/priceResolver';
import { generateMetaEventId, trackInitiateCheckout, trackAddPaymentInfo } from '../lib/meta/metaPixel';
import { calculateUruboxEstimate, getEstimatedWeightKg } from '../lib/urubox';
import CheckoutStepper from '../components/checkout/CheckoutStepper';
import CheckoutSectionHeader from '../components/checkout/CheckoutSectionHeader';
import PackageCard from '../components/checkout/PackageCard';
import PaymentMethodCard from '../components/checkout/PaymentMethodCard';
import ShipmentSummary from '../components/checkout/ShipmentSummary';

const PROVINCIAS_ARGENTINA = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán"
].sort();

function normalizeLocation(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function validateUruguayanCI(ci: string): boolean {
  if (!ci) return false;
  const cleanCI = ci.replace(/[^\d]/g, '');
  if (cleanCI.length < 7 || cleanCI.length > 8) {
    return false;
  }
  const padded = cleanCI.padStart(8, '0');
  const factors = [2, 9, 8, 7, 6, 3, 4];
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += parseInt(padded[i], 10) * factors[i];
  }
  const remainder = sum % 10;
  const checkDigit = (10 - remainder) % 10;
  return checkDigit === parseInt(padded[7], 10);
}


function findClosestLocation(locationName: string, list: string[]): string {
  if (!locationName) return '';
  const normalizedInput = normalizeLocation(locationName).toLowerCase();
  
  // 1. Try exact normalized match
  const directMatch = list.find(item => normalizeLocation(item).toLowerCase() === normalizedInput);
  if (directMatch) return directMatch;
  
  // 2. Try substring match
  const substringMatch = list.find(item => {
    const normalizedItem = normalizeLocation(item).toLowerCase();
    return normalizedItem.includes(normalizedInput) || normalizedInput.includes(normalizedItem);
  });
  if (substringMatch) return substringMatch;
  
  return '';
}


const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  OCA: { bg: '#E31937', text: '#fff' },
  'OCA Blue': { bg: '#1A73E8', text: '#fff' },
  'Mi Dinero': { bg: '#00B140', text: '#fff' },
  Visa: { bg: '#1A1F71', text: '#fff' },
  Mastercard: { bg: '#EB001B', text: '#fff' },
  'American Express': { bg: '#006FCF', text: '#fff' },
  Santander: { bg: '#EC0000', text: '#fff' },
  BBVA: { bg: '#004481', text: '#fff' },
  Itau: { bg: '#FF6600', text: '#fff' },
  BROU: { bg: '#003366', text: '#fff' },
  Scotiabank: { bg: '#D92231', text: '#fff' },
  Prex: { bg: '#6C2DC7', text: '#fff' },
  Anda: { bg: '#FF8C00', text: '#fff' },
  Cabal: { bg: '#004D40', text: '#fff' },
  Creditel: { bg: '#8B0000', text: '#fff' },
  PassCard: { bg: '#2E7D32', text: '#fff' },
  Lider: { bg: '#F4511E', text: '#fff' },
};

interface BankPromo {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number;
  bank_name: string;
  min_purchase: number;
  max_discount: number;
  promo_label: string;
  starts_at: string | null;
  ends_at: string | null;
}

export default function Checkout() {
  const { items, total, addItem, updateQuantity, removeItem } = useCartContext();
  const { settings, loaded: settingsLoaded } = useSiteSettings();
  const freeShippingThreshold = Number(settings['free_shipping_threshold'] || 4000);
  const { formatCurrencyPrice, selectedCurrency, setSelectedCurrency } = useCurrency();
  const { user } = useAuth();

  const [form, setForm] = useState({
    email: user?.email || '',
    first_name: '',
    last_name: '',
    phone: '',
    street: '',
    apartment: '',
    city: 'Montevideo',
    department: 'Montevideo',
    barrio: '',
    reference: '',
    postal_code: '',
    country: 'Uruguay',
    ci: '',
    recipient_type: 'person',
    dni: '',
    cuit: '',
    razon_social: '',
    street_number: '',
    consent: false,
  });
  const [internationalShippingRate, setInternationalShippingRate] = useState<number>(1500);

  // Switch to USD for Argentina if setting is active
  useEffect(() => {
    if (form.country === 'Argentina' && settings['international_usd_mode'] === 'true') {
      if (selectedCurrency !== 'USD') {
        setSelectedCurrency('USD');
      }
    }
  }, [form.country, settings, selectedCurrency]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const initiateCheckoutTrackedRef = useRef(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'dlocalgo' | 'paypal' | 'handy'>('mercadopago');
  const prevPaymentMethodRef = useRef(paymentMethod);
  useEffect(() => {
    if (paymentMethod && paymentMethod !== prevPaymentMethodRef.current) {
      trackClarityEvent('payment_method_selected');
      prevPaymentMethodRef.current = paymentMethod;
    }
  }, [paymentMethod]);

  // IP Geolocation Check on Mount (Run once per session, with 2.5s network timeout protection)
  useEffect(() => {
    const sessionGeoIP = sessionStorage.getItem("geoip_detected");
    if (sessionGeoIP) return;

    async function detectCountry() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      try {
        const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        
        sessionStorage.setItem("geoip_detected", "true");

        if (data && (data.country_code === "AR" || data.country === "Argentina")) {
          console.log("[GeoIP] Argentina detected via IP.");
          const hasSetManual = localStorage.getItem("user_selected_country");
          if (!hasSetManual) {
            setForm(prev => ({
              ...prev,
              country: "Argentina",
              department: "Buenos Aires",
              city: "",
              barrio: "",
            }));
          }
        }
      } catch (err) {
        console.warn("[GeoIP] Detection error or timeout:", err);
        sessionStorage.setItem("geoip_detected", "true"); // Prevent infinite retry loops on failure
      }
    }
    detectCountry();
  }, []);

  // Save manual country choices
  useEffect(() => {
    if (form.country) {
      localStorage.setItem("user_selected_country", form.country);
    }
  }, [form.country]);
  const [shippingMethod, setShippingMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [publicPaymentProviders, setPublicPaymentProviders] = useState<PublicPaymentProvider[]>([]);
  const [bankPromos, setBankPromos] = useState<BankPromo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<BankPromo | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<any>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const [internationalCourier, setInternationalCourier] = useState<string>('urubox');
  const [couriersList, setCouriersList] = useState<any[]>([]);
  const [courierSuite, setCourierSuite] = useState('');
  const [courierAddress, setCourierAddress] = useState('');
  
  const [savedIntlAddresses, setSavedIntlAddresses] = useState<any[]>([]);
  const [selectedIntlAddressId, setSelectedIntlAddressId] = useState<string | 'new'>('new');
  const [intlForm, setIntlForm] = useState({
    courier_name: '',
    recipient_name: '',
    customer_code: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'United States',
    phone: '',
    instructions: ''
  });
  const [saveIntlAddress, setSaveIntlAddress] = useState(false);
  const [confirmCopyAddress, setConfirmCopyAddress] = useState(false);

  // Calculated dynamically after form and shippingMethod states are declared

  const { promotions } = usePromotions();
  
  let autoDiscountAmount = 0;
  let eligibleBankSubtotal = 0;
  items.forEach(item => {
    const detail = evaluateItemDiscountDetailed(item as any, promotions);
    autoDiscountAmount += detail.discount;
    
    // Check if the item is eligible for bank promos (not strictly excluded here because we'll check exclusions later,
    // but we CAN check if a non-stackable auto promo applied)
    if (!detail.nonStackableApplied) {
       eligibleBankSubtotal += (item.price * item.quantity);
    }
  });

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) {
      setCouponError('Ingresá un código de cupón');
      setCouponSuccess(null);
      return;
    }

    setCouponLoading(true);
    setCouponError(null);
    setCouponSuccess(null);

    try {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponInput.trim().toUpperCase())
        .single();

      if (error || !coupon) {
        setCouponError('Cupón inválido');
        setCouponCode('');
        setActiveCoupon(null);
        return;
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        setCouponError('El cupón ha expirado');
        setCouponCode('');
        setActiveCoupon(null);
        return;
      }

      setCouponCode(coupon.code);
      setActiveCoupon(coupon);
      setCouponSuccess(`Cupón '${coupon.code}' aplicado correctamente`);
    } catch (err) {
      console.error(err);
      setCouponError('Error al aplicar el cupón');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponInput('');
    setActiveCoupon(null);
    setCouponError(null);
    setCouponSuccess(null);
  };
  const [affiliateCode, setAffiliateCode] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<number>(-1);
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const submitLockRef = useRef(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const [dacShippingCost, setDacShippingCost] = useState<number | null>(null);
  const [vendorShippingCosts, setVendorShippingCosts] = useState<Record<string, number>>({});
  const [dacShippingLoading, setDacShippingLoading] = useState(false);
  const [dacShippingError, setDacShippingError] = useState<string | null>(null);
  
  type DacCalculationStatus = 'idle' | 'missing_data' | 'loading' | 'success' | 'error';
  const [dacCalculationStatus, setDacCalculationStatus] = useState<DacCalculationStatus>('idle');
  const [recalculateTrigger, setRecalculateTrigger] = useState(0);
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<'delivery' | 'pickup' | 'dac' | 'dac_home' | 'dac_agency'>('delivery');
  const [detectedKOficina, setDetectedKOficina] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [finalTotal, setFinalTotal] = useState(0);

  const [vendorsData, setVendorsData] = useState<Record<string, {
    id: string;
    vendor_id?: string;
    vendor_store_id?: string;
    shipping_settings?: any;
    default_address?: { department: string; city: string; address: string; phone?: string } | null;
  }>>({});
  const [globalProviders, setGlobalProviders] = useState<Record<string, boolean>>({ dac: true, ues: false, soydelivery: false });
  const [subordersShipping, setSubordersShipping] = useState<Record<string, {
    method: 'delivery' | 'pickup' | 'dac_home' | 'dac_agency' | 'ues' | 'correo_uruguayo' | 'manual' | 'international_courier_direct';
    selectedAgency?: any | null;
  }>>({});

  const getStoreKey = (item: any): string => {
    if (item.is_international === true) {
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
  };

  const getVendorName = (storeKey: string) => {
    if (storeKey === 'collectibles' || storeKey === 'platform') return 'Collectibles.uy';
    if (storeKey === 'international') return 'Importación Amazon USA';
    return items.find(item => getStoreKey(item) === storeKey)?.vendor_name || 'Vendedor';
  };

  const getVendorShippingOptions = (storeKey: string, groupTotal: number) => {
    if (storeKey === 'international') {
      return [{
        id: 'international_courier_direct',
        name: 'Entrega en tu courier de Miami',
        available: true,
        cost: 0,
        show: true
      }];
    }
    const v = vendorsData[storeKey];
    const options: Array<{
      id: string;
      name: string;
      available: boolean;
      cost?: number;
      reason?: string;
      show: boolean;
    }> = [];

    if (form.country === 'Argentina') {
      return [{
        id: 'manual',
        name: 'Envío Internacional (MBE)',
        available: true,
        cost: internationalShippingRate,
        show: true
      }];
    }

    if (!v) return options;

    const isPlatform = storeKey === 'collectibles' || storeKey === 'platform';
    const s = v.shipping_settings || {};
    const defaultAddr = v.default_address;
    const isMontevideo = form.department === 'Montevideo';
    const resolvedCityForShipping = form.department === 'Montevideo' ? form.barrio : form.city;

    const vendorFreeShippingActive = !!s.free_shipping?.active;
    const vendorMinAmount = Number(s.free_shipping?.min_amount || 0);
    const isVendorFreeShipping = vendorFreeShippingActive && vendorMinAmount > 0 && groupTotal >= vendorMinAmount;
    const isFreeForThisGroup = (total >= freeShippingThreshold) || isVendorFreeShipping;

    // 1. Pickup
    const pickupActive = isPlatform ? true : !!s.pickup?.active;
    const pickupAddress = s.pickup?.address?.trim() || defaultAddr?.address?.trim();
    if (pickupActive) {
      if (!pickupAddress) {
        options.push({
          id: 'pickup',
          name: 'Retiro en local',
          available: false,
          reason: 'Retiro no disponible: el vendedor no configuró dirección.',
          show: true
        });
      } else {
        options.push({
          id: 'pickup',
          name: 'Retiro en local',
          available: true,
          cost: 0,
          show: true
        });
      }
    } else {
      options.push({
        id: 'pickup',
        name: 'Retiro en local',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    // 2. SoyDelivery
    const sdActive = isPlatform ? true : !!s.soydelivery?.active;
    const sdGlobalActive = !!globalProviders['soydelivery'];
    if (sdActive && sdGlobalActive) {
      const cov = isSoyDeliveryAvailableForVendor(
        defaultAddr,
        { department: form.department, city: resolvedCityForShipping }
      );
      if (!isMontevideo || !cov.available) {
        options.push({
          id: 'soydelivery',
          name: 'Soy Delivery / Flex',
          available: false,
          reason: 'SoyDelivery no disponible para esta dirección.',
          show: true
        });
      } else {
        options.push({
          id: 'soydelivery',
          name: 'Soy Delivery',
          available: true,
          cost: isFreeForThisGroup ? 0 : calculateShipping(resolvedCityForShipping, form.department, groupTotal, freeShippingThreshold),
          show: true
        });
      }
    } else {
      options.push({
        id: 'soydelivery',
        name: 'Soy Delivery',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    // 3. DAC
    const dacActive = isPlatform ? true : !!s.dac?.active;
    const dacGlobalActive = !!globalProviders['dac'];
    if (dacActive && dacGlobalActive) {
      const isDacCalculable = form.department && (isMontevideo ? form.barrio !== '' : !!form.city);
      
      // DAC Home option
      if (!isDacCalculable) {
        options.push({
          id: 'dac_home',
          name: 'DAC a domicilio',
          available: false,
          reason: 'Falta dirección o ciudad de destino.',
          show: true
        });
      } else if (dacShippingError && !vendorShippingCosts[storeKey] && subordersShipping[storeKey]?.method === 'dac_home') {
        options.push({
          id: 'dac_home',
          name: 'DAC a domicilio',
          available: false,
          reason: dacShippingError || 'No pudimos calcular el costo de envío.',
          show: true
        });
      } else {
        options.push({
          id: 'dac_home',
          name: 'DAC a domicilio',
          available: true,
          cost: vendorShippingCosts[storeKey] ?? 180,
          show: true
        });
      }

      // DAC Agency option (only for Interior)
      if (!isMontevideo) {
        const suborderSel = subordersShipping[storeKey];
        const suborderAgency = suborderSel?.selectedAgency || selectedAgency;
        if (!suborderAgency) {
          options.push({
            id: 'dac_agency',
            name: 'Retiro en agencia DAC',
            available: false,
            reason: 'Falta seleccionar agencia de destino.',
            show: true
          });
        } else if (dacShippingError && !vendorShippingCosts[storeKey] && subordersShipping[storeKey]?.method === 'dac_agency') {
          options.push({
            id: 'dac_agency',
            name: 'Retiro en agencia DAC',
            available: false,
            reason: dacShippingError || 'No pudimos calcular el costo de envío.',
            show: true
          });
        } else {
          options.push({
            id: 'dac_agency',
            name: 'Retiro en agencia DAC',
            available: true,
            cost: vendorShippingCosts[storeKey] ?? 180,
            show: true
          });
        }
      }
    } else {
      options.push({
        id: 'dac_home',
        name: 'DAC a domicilio',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
      options.push({
        id: 'dac_agency',
        name: 'Retiro en agencia DAC',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    // 4. UES
    const uesActive = isPlatform ? false : !!s.ues?.active;
    const uesGlobalActive = !!globalProviders['ues'];
    if (uesActive && uesGlobalActive) {
      options.push({
        id: 'ues',
        name: 'UES',
        available: true,
        cost: (isFreeForThisGroup ? 0 : 220),
        show: true
      });
    } else {
      options.push({
        id: 'ues',
        name: 'UES',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    // 5. Correo Uruguayo
    const correoActive = isPlatform ? false : !!s.correo_uruguayo?.active;
    const correoGlobalActive = !!globalProviders['correo_uruguayo'];
    if (correoActive && correoGlobalActive) {
      options.push({
        id: 'correo_uruguayo',
        name: 'Correo Uruguayo',
        available: true,
        cost: (isFreeForThisGroup ? 0 : 180),
        show: true
      });
    } else {
      options.push({
        id: 'correo_uruguayo',
        name: 'Correo Uruguayo',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    // 6. Manual
    const manualActive = isPlatform ? false : !!s.manual?.active;
    const fixedCost = s.manual?.fixed_cost !== undefined && s.manual?.fixed_cost !== null && s.manual?.fixed_cost !== ''
      ? Number(s.manual.fixed_cost)
      : (s.manual?.fixed_price !== undefined && s.manual?.fixed_price !== null && s.manual?.fixed_price !== '' ? Number(s.manual.fixed_price) : null);
    const hasFixed = fixedCost !== null && !isNaN(fixedCost);
    const hasCoordinar = JSON.stringify(s.manual || {}).toLowerCase().includes('coordinar') || String(s.manual?.fixed_cost || '').toLowerCase().includes('coordinar') || String(s.manual?.fixed_price || '').toLowerCase().includes('coordinar');
    
    if (manualActive && (hasFixed || hasCoordinar)) {
      options.push({
        id: 'manual',
        name: s.manual?.method_name || 'Envío manual / propio',
        available: true,
        cost: isFreeForThisGroup ? 0 : (hasFixed ? fixedCost : 0),
        reason: hasCoordinar && !hasFixed ? 'A coordinar con el vendedor' : undefined,
        show: true
      });
    } else {
      options.push({
        id: 'manual',
        name: 'Envío manual / propio',
        available: false,
        reason: 'No habilitado por el vendedor.',
        show: false
      });
    }

    return options;
  };

  const uniqueStoreKeys = Array.from(new Set(items.map(item => getStoreKey(item))));

  const cannotPickupVendors = uniqueStoreKeys.filter(storeKey => {
    if (storeKey === 'collectibles' || storeKey === 'platform') return false;
    const v = vendorsData[storeKey];
    if (!v) return false;
    return !v.shipping_settings?.pickup?.active;
  });

  const pickupActiveButNoAddressVendors = uniqueStoreKeys.filter(storeKey => {
    if (storeKey === 'collectibles' || storeKey === 'platform') return false;
    const v = vendorsData[storeKey];
    if (!v) return false;
    if (!v.shipping_settings?.pickup?.active) return false;
    const hasAddress = v.shipping_settings?.pickup?.address?.trim() || v.default_address;
    return !hasAddress;
  });

  const hasPickupError = cannotPickupVendors.length > 0 || pickupActiveButNoAddressVendors.length > 0;

  useEffect(() => {
    if (!items.length) return;
    
    async function loadVendorsShippingInfo() {
      const loaded: Record<string, any> = {};
      
      // Load global active status of delivery providers
      try {
        const { data: provs } = await supabase
          .from('shipping_providers')
          .select('code, is_active, status');
        if (provs) {
          const mapped: Record<string, boolean> = {};
          provs.forEach(p => {
            mapped[p.code] = p.is_active && p.status === 'active';
          });
          setGlobalProviders(prev => ({ ...prev, ...mapped }));
        }
      } catch (err) {
        console.error("Error loading delivery providers:", err);
      }
      
      for (const item of items) {
        const storeKey = getStoreKey(item);
        if (loaded[storeKey]) continue;

        if (storeKey === 'collectibles' || storeKey === 'platform') {
          loaded[storeKey] = {
            id: 'collectibles',
            vendor_id: 'collectibles',
            shipping_settings: { soydelivery: { active: true }, dac: { active: true } },
            promotions_opt_in: false,
            default_address: {
              department: 'Montevideo',
              city: 'Montevideo',
              address: 'Vázquez 1418'
            }
          };
          loaded['platform'] = loaded[storeKey];
          continue;
        }

        try {
          const vendorId = item.vendor_id;
          const vendorStoreId = item.vendor_store_id;

          // 1. Fetch vendor shipping settings safely (guard against null/undefined)
          let vendor = null;
          if (vendorId && vendorId !== 'null' && vendorId !== 'undefined' && vendorId !== 'platform') {
            const { data } = await supabase
              .from('vendors')
              .select('id, shipping_settings, promotions_opt_in')
              .eq('id', vendorId)
              .maybeSingle();
            vendor = data;
          }

          // 2. Fetch dispatch address safely
          let dispatchAddress = null;
          if (vendorStoreId && vendorStoreId !== 'null' && vendorStoreId !== 'undefined') {
            const { data: storeAddr } = await supabase
              .from('vendor_dispatch_addresses')
              .select('department, city, address, phone')
              .eq('vendor_store_id', vendorStoreId)
              .eq('is_default', true)
              .maybeSingle();
            dispatchAddress = storeAddr;
          }

          if (!dispatchAddress && vendorId && vendorId !== 'null' && vendorId !== 'undefined' && vendorId !== 'platform') {
            const { data: defaultAddr } = await supabase
              .from('vendor_dispatch_addresses')
              .select('department, city, address, phone')
              .eq('vendor_id', vendorId)
              .eq('is_default', true)
              .maybeSingle();
            dispatchAddress = defaultAddr;
          }

          loaded[storeKey] = {
            id: storeKey,
            vendor_id: vendorId,
            vendor_store_id: vendorStoreId,
            shipping_settings: vendor?.shipping_settings || {},
            promotions_opt_in: vendor?.promotions_opt_in || false,
            default_address: dispatchAddress || null
          };
        } catch (e) {
          console.error(`Error loading shipping info for storeKey ${storeKey}:`, e);
        }
      }
      
      setVendorsData(loaded);
    }
    
    loadVendorsShippingInfo();
  }, [items]);

  useEffect(() => {
    const fetchCouriers = async () => {
      try {
        const { data, error } = await supabase
          .from('international_couriers')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (data) {
          setCouriersList(data);
        }
      } catch (err) {
        console.error("Error loading international couriers:", err);
      }
    };
    fetchCouriers();
  }, []);

  useEffect(() => {
    if (Object.keys(vendorsData).length === 0) return;
    
    setSubordersShipping(prev => {
      const updated = { ...prev };
      let changed = false;

      uniqueStoreKeys.forEach(storeKey => {
        if (!updated[storeKey]) {
          const v = vendorsData[storeKey];
          const isCollectiblesGroup = storeKey === 'collectibles' || storeKey === 'platform';
          
          let defaultMethod: any = 'dac_home';
          
          if (storeKey === 'international') {
            defaultMethod = 'international_courier_direct';
          } else if (isCollectiblesGroup) {
            defaultMethod = form.department === 'Montevideo' ? 'pickup' : 'dac_home';
          } else {
            const settings = v?.shipping_settings || {};
            if (settings.pickup?.active) {
              defaultMethod = 'pickup';
            } else if (settings.dac?.active) {
              defaultMethod = 'dac_home';
            } else if (settings.ues?.active) {
              defaultMethod = 'ues';
            } else if (settings.correo_uruguayo?.active) {
              defaultMethod = 'correo_uruguayo';
            } else if (settings.manual?.active) {
              defaultMethod = 'manual';
            } else if (settings.soydelivery?.active) {
              defaultMethod = 'delivery';
            }
          }

          updated[storeKey] = {
            method: defaultMethod,
            selectedAgency: null
          };
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [vendorsData, uniqueStoreKeys, form.department]);

  // Destination type based on shipping form in Uruguay
  let destinationType = 'no_local_delivery';
  if (shippingMethod === 'delivery') {
    if (form.department === 'Montevideo') {
      destinationType = 'montevideo';
    } else {
      destinationType = 'interior_agency';
    }
  }

  // Calculate total weight of international products
  const totalIntlWeightKg = items.reduce((sum, item) => {
    if (!item.is_international) return sum;
    const itemWeight = item.weight_kg || getEstimatedWeightKg(item.category_name);
    return sum + (itemWeight * item.quantity);
  }, 0);

  const uruboxEstimateResult = calculateUruboxEstimate({
    weight_kg: totalIntlWeightKg,
    destination_type: destinationType
  });
  const uruboxTotalEstimate = uruboxEstimateResult.total_urubox_usd;

  // DAC Multimodal state
  const [dacDeliveryMode, setDacDeliveryMode] = useState<'dac_home' | 'dac_agency'>('dac_home');
  const [dacAgencies, setDacAgencies] = useState<any[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<any | null>(null);
  const [agencySearchTerm, setAgencySearchTerm] = useState('');

  const isDacAgencyMode = form.department !== 'Montevideo' && dacDeliveryMode === 'dac_agency';

  useEffect(() => {
    if (shippingMethod === 'pickup' && hasPickupError) {
      setShippingMethod('delivery');
    }
  }, [hasPickupError, shippingMethod]);

  // Synchronize selectedShippingMethod
  useEffect(() => {
    if (shippingMethod === 'pickup') {
      setSelectedShippingMethod('pickup');
    } else if (form.department === 'Montevideo') {
      setSelectedShippingMethod('delivery');
    } else {
      setSelectedShippingMethod(dacDeliveryMode);
    }
  }, [shippingMethod, form.department, dacDeliveryMode]);

  // Load DAC agencies when department changes (non-Montevideo)
  useEffect(() => {
    if (form.department === 'Montevideo' || !form.department || shippingMethod === 'pickup') {
      setDacAgencies([]);
      setSelectedAgency(null);
      return;
    }

    async function loadAgencies() {
      try {
        const { data, error } = await supabase
          .from('dac_offices')
          .select('*')
          .eq('is_active', true)
          .eq('supports_pickup', true)
          .ilike('department', form.department.trim())
          .order('office_name', { ascending: true });
        if (error) throw error;
        setDacAgencies(data || []);
      } catch (err) {
        console.error('[Checkout] Error loading DAC agencies:', err);
        setDacAgencies([]);
      }
    }
    loadAgencies();
  }, [form.department, shippingMethod]);

  // Debug log for department
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[Checkout Debug] Department elegido:", form.department);
    }
  }, [form.department]);

  // Debug log for shipping method
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[Checkout Debug] Shipping method detectado (selectedShippingMethod):", selectedShippingMethod);
    }
  }, [selectedShippingMethod]);

  const hasAnyDelivery = uniqueStoreKeys.some(key => {
    const sel = subordersShipping[key];
    return sel && !['pickup', 'international_courier_direct'].includes(sel.method);
  });

  const hasAnyDac = uniqueStoreKeys.some(key => {
    const sel = subordersShipping[key];
    return sel && (sel.method === 'dac_home' || sel.method === 'dac_agency');
  });

  const hasAnyHomeDelivery = uniqueStoreKeys.some(key => {
    const sel = subordersShipping[key];
    return sel && !['pickup', 'dac_agency', 'international_courier_direct'].includes(sel.method);
  });

  // Reset DAC cost/error when changing delivery mode or shipping method
  useEffect(() => {
    setDacShippingCost(null);
    setDacShippingError(null);
    setDetectedKOficina(null);
    setVendorShippingCosts({});
  }, [subordersShipping]);

  useEffect(() => {
    async function loadIntlRate() {
      try {
        const { data } = await supabase
          .from('shipping_rules')
          .select('rate')
          .eq('zone', 'international')
          .eq('is_active', true)
          .maybeSingle();
        if (data && data.rate) {
          setInternationalShippingRate(Number(data.rate));
        }
      } catch (err) {
        console.error("Error loading international shipping rate:", err);
      }
    }
    loadIntlRate();
  }, []);

  const resolvedCityForShipping = form.department === 'Montevideo' ? form.barrio : form.city;
  const isMontevideo = form.department === 'Montevideo';

  useEffect(() => {
    if (form.country === 'Argentina') {
      const isFreeShipping = total >= freeShippingThreshold;
      const rate = isFreeShipping ? 0 : internationalShippingRate;
      let totalCost = 0;
      const costsByVendor: Record<string, number> = {};
      uniqueStoreKeys.forEach(key => {
        costsByVendor[key] = rate;
        totalCost += rate;
      });
      setVendorShippingCosts(costsByVendor);
      setDacShippingCost(totalCost);
      setDacCalculationStatus('success');
      setDacShippingError(null);
      return;
    }

    if (!hasAnyDelivery || !form.department) {
      setDacShippingCost(null);
      setDacShippingError(null);
      setDetectedKOficina(null);
      setVendorShippingCosts({});
      setDacCalculationStatus('idle');
      return;
    }

    // Check if any suborder is loading / missing data
    // If a suborder is 'dac_agency' but has no selected agency, we cannot calculate
    let missingAgency = false;
    uniqueStoreKeys.forEach(key => {
      const sel = subordersShipping[key];
      if (sel && sel.method === 'dac_agency' && !sel.selectedAgency) {
        missingAgency = true;
      }
    });

    if (missingAgency) {
      setDacShippingCost(null);
      setDacShippingError(null);
      setDetectedKOficina(null);
      setVendorShippingCosts({});
      setDacCalculationStatus('missing_data');
      return;
    }

    if (isMontevideo) {
      if (form.barrio === '') {
        setDacShippingCost(null);
        setDacShippingError(null);
        setDetectedKOficina(null);
        setVendorShippingCosts({});
        setDacCalculationStatus('missing_data');
        return;
      }
    } else {
      if (!form.city) {
        setDacShippingCost(null);
        setDacShippingError(null);
        setDetectedKOficina(null);
        setVendorShippingCosts({});
        setDacCalculationStatus('missing_data');
        return;
      }
    }

    const isFreeShipping = total >= freeShippingThreshold;
    let active = true;
    const controller = new AbortController();

    async function fetchDacCost() {
      setDacShippingLoading(true);
      setDacShippingError(null);
      setDacCalculationStatus('loading');

      trackGA4Event('shipping_calculation_started', {
        department: form.department,
        city: resolvedCityForShipping,
        shipping_method: 'packages_multimodal'
      });

      try {
        let totalCost = 0;
        let lastKOficina = null;
        const costsByVendor: Record<string, number> = {};

        const groups = items.reduce((acc: Record<string, any[]>, item: any) => {
          const storeKey = getStoreKey(item);
          if (!acc[storeKey]) acc[storeKey] = [];
          acc[storeKey].push(item);
          return acc;
        }, {});

        for (const [storeKey, groupItems] of Object.entries(groups)) {
          const groupTotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);

          const sel = subordersShipping[storeKey];
          if (!sel) {
            costsByVendor[storeKey] = 0;
            continue;
          }

          const method = sel.method;
          const v = vendorsData[storeKey];
          const vendorFreeShippingActive = !!v?.shipping_settings?.free_shipping?.active;
          const vendorMinAmount = Number(v?.shipping_settings?.free_shipping?.min_amount || 0);
          const isVendorFreeShipping = vendorFreeShippingActive && vendorMinAmount > 0 && groupTotal >= vendorMinAmount;
          const isGroupFreeShipping = isFreeShipping || isVendorFreeShipping;

          const hasSD = isMontevideo && v && v.shipping_settings?.soydelivery?.active && globalProviders['soydelivery'] && isSoyDeliveryAvailableForVendor(
            v.default_address, 
            { department: form.department, city: resolvedCityForShipping }
          ).available;

          if (method === 'pickup') {
            costsByVendor[storeKey] = 0;
          } else if (method === 'manual') {
            const fixedCost = Number(v?.shipping_settings?.manual?.fixed_cost || v?.shipping_settings?.manual?.fixed_price || 0);
            costsByVendor[storeKey] = isGroupFreeShipping ? 0 : (isNaN(fixedCost) ? 0 : fixedCost);
            totalCost += costsByVendor[storeKey];
          } else if (method === 'ues') {
            const cost = isGroupFreeShipping ? 0 : 220;
            costsByVendor[storeKey] = cost;
            totalCost += cost;
          } else if (method === 'correo_uruguayo') {
            const cost = isGroupFreeShipping ? 0 : 180;
            costsByVendor[storeKey] = cost;
            totalCost += cost;
          } else if (method === 'delivery' && hasSD) {
            const cost = isGroupFreeShipping ? 0 : calculateShipping(resolvedCityForShipping, form.department, groupTotal, freeShippingThreshold);
            costsByVendor[storeKey] = cost;
            totalCost += cost;
          } else if (method === 'dac_home' || method === 'dac_agency') {
            if (isGroupFreeShipping) {
              costsByVendor[storeKey] = 0;
            } else {
              const dacMode = method === 'dac_agency' ? 'agency' : 'home';
              const suborderAgency = sel.selectedAgency || selectedAgency;
              const bodyPayload: any = {
                mode: dacMode,
                department: form.department,
                city: isMontevideo ? 'Montevideo' : (dacMode === 'agency' ? (suborderAgency?.city || form.city || suborderAgency?.office_name) : form.city),
                locality: isMontevideo ? form.barrio : (dacMode === 'agency' ? (suborderAgency?.locality || form.barrio || "") : (form.barrio || "")),
                phone: form.phone,
                package_quantity: 1,
                package_type: 1,
                cart_total: groupTotal,
                items: groupItems.map(item => ({
                  product_id: item.product_id,
                  variant_id: item.variant_id || "",
                  quantity: item.quantity,
                  price: item.price,
                  title: item.title
                })),
                address: isMontevideo ? form.street : (dacMode === 'agency' && suborderAgency ? (suborderAgency.address || suborderAgency.office_name) : form.street)
              };

              if (dacMode === 'agency' && suborderAgency) {
                bodyPayload.dac_office_id = suborderAgency.id;
                bodyPayload.k_oficina_destino = suborderAgency.k_oficina;
              }

              const { data, error } = await supabase.functions.invoke('dac-get-cost', {
                body: bodyPayload,
                signal: controller.signal
              });

              if (!active) return;
              if (error) throw error;

              if (data && data.success) {
                costsByVendor[storeKey] = data.cost;
                totalCost += data.cost;
                lastKOficina = data.raw_response?.k_oficina || data.finalKOficina || null;
              } else {
                throw new Error(data?.error || "Error al calcular costo DAC.");
              }
            }
          } else {
            throw new Error(`El vendedor ${getVendorName(storeKey)} no tiene métodos de envío disponibles para tu selección.`);
          }
        }

        if (!active) return;
        setVendorShippingCosts(costsByVendor);
        setDacShippingCost(isFreeShipping ? 0 : totalCost);
        setDetectedKOficina(lastKOficina);
        setDacCalculationStatus('success');

      } catch (err: any) {
        if (!active) return;
        const errorMessage = err.message || "Error calculando el costo de envío.";
        setDacShippingError(errorMessage);
        setDacCalculationStatus('error');
        setDacShippingCost(null);
        setVendorShippingCosts({});

        trackGA4Event('shipping_calculation_error', {
          department: form.department,
          city: resolvedCityForShipping,
          error_message: errorMessage
        });
        trackClarityEvent('shipping_calculation_error');
      } finally {
        if (active) {
          setDacShippingLoading(false);
        }
      }
    }

    const timer = setTimeout(() => {
      fetchDacCost();
    }, 450);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    shippingMethod,
    selectedShippingMethod,
    dacDeliveryMode,
    form.department,
    form.city,
    form.barrio,
    form.street,
    selectedAgency?.id,
    selectedAgency?.k_oficina,
    items.length,
    total,
    vendorsData,
    recalculateTrigger,
    subordersShipping,
    hasAnyDelivery,
    hasAnyDac
  ]);



  const isLocationSelected = 
    !hasAnyDelivery || 
    (hasAnyDelivery && (
      (!hasAnyDac && form.phone && (!isMontevideo || form.barrio !== '')) ||
      (hasAnyDac && form.phone && form.ci && validateUruguayanCI(form.ci) && 
        uniqueStoreKeys.every(key => {
          const sel = subordersShipping[key];
          if (!sel) return true;
          if (sel.method === 'dac_agency' && !sel.selectedAgency) return false;
          return true;
        })
      )
    ));
  
  let shipping = Object.values(vendorShippingCosts).reduce((sum, cost) => sum + cost, 0);

  // Debug log for shipping cost final
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[Checkout Debug] Shipping cost final:", shipping);
    }
  }, [shipping]);

  const subtotal = total;
  const subtotalWithShipping = subtotal - autoDiscountAmount + shipping;

  const getUruguayDateTime = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Montevideo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const partValue = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const year = parseInt(partValue('year'), 10);
    const month = parseInt(partValue('month'), 10) - 1; // 0-indexed
    const day = parseInt(partValue('day'), 10);
    const hour = parseInt(partValue('hour'), 10);
    const minute = parseInt(partValue('minute'), 10);
    const second = parseInt(partValue('second'), 10);
    
    const localDate = new Date(year, month, day, hour, minute, second);
    const dayOfWeek = localDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return { hour, minute, dayOfWeek, localDate };
  };

  const parseTimeStr = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return { hour: h || 0, minute: m || 0 };
  };

  const getLogisticsDetails = (city: string, department: string) => {
    if (shippingMethod === 'pickup') {
      return {
        providerName: null,
        message: 'Retirá tu pedido gratis en nuestro local',
        assignedProvider: null
      };
    }

    const isMontevideo = department === 'Montevideo';
    const { hour: curHour, minute: curMin, dayOfWeek } = getUruguayDateTime();

    const hasAnySD = items.some(item => {
      const storeKey = getStoreKey(item);
      const v = vendorsData[storeKey];
      return isMontevideo && v && isSoyDeliveryAvailableForVendor(
        v.default_address, 
        { department, city }
      ).available;
    });

    const allVendorsCoveredBySD = items.every(item => {
      const storeKey = getStoreKey(item);
      const v = vendorsData[storeKey];
      return isMontevideo && v && isSoyDeliveryAvailableForVendor(
        v.default_address, 
        { department, city }
      ).available;
    });

    if (hasAnySD) {
      const providerLabel = allVendorsCoveredBySD ? 'Soy Delivery' : 'Soy Delivery / DAC';
      const cutoffTime = settings['shipping_soydelivery_cutoff_time'] || '15:00';
      const cutoff = parseTimeStr(cutoffTime);
      const isBefore = curHour < cutoff.hour || (curHour === cutoff.hour && curMin < cutoff.minute);

      let message = '';
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        if (isBefore) {
          message = `Recibilo hoy mismo comprando antes de las ${cutoffTime}`;
        } else {
          message = 'Recibilo mañana mismo en tu domicilio';
        }
      } else {
        message = 'Recibilo mañana lunes en tu domicilio';
      }

      if (!allVendorsCoveredBySD) {
        message += ' (algunos artículos se despacharán por DAC)';
      }

      return {
        providerName: providerLabel,
        message,
        assignedProvider: 'soy_delivery'
      };
    } else {
      // DAC
      const providerLabel = 'DAC';
      const cutoffTime = settings['shipping_dac_cutoff_time'] || '14:00';
      const cutoff = parseTimeStr(cutoffTime);
      const isBefore = curHour < cutoff.hour || (curHour === cutoff.hour && curMin < cutoff.minute);

      // Mon-Fri: 1 to 5
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if (isBefore) {
          return {
            providerName: providerLabel,
            message: `Despacho hoy mismo por DAC comprando antes de las ${cutoffTime}`,
            assignedProvider: 'dac'
          };
        } else {
          return {
            providerName: providerLabel,
            message: 'Despacho próximo día hábil por DAC',
            assignedProvider: 'dac'
          };
        }
      } else {
        // Sat or Sun
        return {
          providerName: providerLabel,
          message: 'Despacho próximo día hábil por DAC',
          assignedProvider: 'dac'
        };
      }
    }
  };

  const logistics = getLogisticsDetails(resolvedCityForShipping, form.department);

  const handleDepartmentChange = (val: string) => {
    setForm(current => ({
      ...current,
      department: val,
      city: val === 'Montevideo' ? 'Montevideo' : '',
      barrio: '',
    }));
    setSelectedAgency(null);
    setAgencySearchTerm('');
  };

  const handleAddressSelect = (details: {
    street?: string;
    city?: string;
    department?: string;
    postal_code?: string;
    country?: string;
    barrio?: string;
  }) => {
    setForm((current) => {
      const updated = { ...current };

      if (details.street) updated.street = details.street;
      if (details.postal_code) updated.postal_code = details.postal_code;
      if (details.country) updated.country = details.country;

      // Handle department mapping
      if (details.department) {
        const foundDep = DEPARTAMENTOS.find(
          (dep) => dep.toLowerCase() === details.department!.toLowerCase()
        );
        if (foundDep) {
          updated.department = foundDep;
          if (foundDep === 'Montevideo') {
            updated.city = 'Montevideo';
            updated.barrio = ''; // Reset barrio initially, then try to fill
          } else {
            updated.city = '';
            updated.barrio = '';
          }
        }
      }

      // If department is Montevideo, try to map the barrio from details
      if (updated.department === 'Montevideo' && (details.barrio || details.city)) {
        const sourceBarrio = details.barrio || details.city;
        const matchingBarrio = findClosestLocation(sourceBarrio || '', URUGUAY_LOCATIONS['Montevideo'] || []);
        if (matchingBarrio) {
          updated.barrio = matchingBarrio;
        }
      } else if (updated.department && updated.department !== 'Montevideo' && details.city) {
        // If department is NOT Montevideo, try to map the city/localidad
        const matchingCity = findClosestLocation(details.city, URUGUAY_LOCATIONS[updated.department] || []);
        if (matchingCity) {
          updated.city = matchingCity;
        }
      }

      return updated;
    });
  };

  let bankDiscount = 0;
  if (selectedPromo) {
    let finalEligible = 0;
    
    // Recalcular el subtotal elegible verificando exclusiones del banco y las no acumulables
    items.forEach(item => {
      let isExcluded = false;
      if (selectedPromo.exclusions) {
         for (const exc of selectedPromo.exclusions) {
           if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
           if (exc.target_type === 'category' && item.category_id === exc.target_id) isExcluded = true;
           if (exc.target_type === 'brand' && item.brand_id === exc.target_id) isExcluded = true;
           if (exc.target_type === 'vendor' && item.vendor_id === exc.target_id) isExcluded = true;
           if (exc.target_type === 'tag' && item.tag_ids?.includes(exc.target_id)) isExcluded = true;
         }
      }
      // Verificar si ya aplicó una promoción no acumulable
      const detail = evaluateItemDiscountDetailed(item as any, promotions);
      if (detail.nonStackableApplied) isExcluded = true;

      if (!isExcluded) {
         finalEligible += (item.price * item.quantity);
      }
    });

    // Descontar la proporción de auto-descuentos que afectaron a los items elegibles para validar el mínimo de compra
    // Para simplificar y mantener concordancia con el backend, ajustamos la validación del mínimo de compra
    const adjustedSubtotal = Math.max(subtotal - autoDiscountAmount, 0);
    if (finalEligible > adjustedSubtotal) finalEligible = adjustedSubtotal;

    if (finalEligible >= (selectedPromo.min_purchase || 0)) {
      bankDiscount = Math.round(finalEligible * selectedPromo.discount_value / 100);
      if (selectedPromo.max_discount > 0) {
        bankDiscount = Math.min(bankDiscount, selectedPromo.max_discount);
      }
    }
  }

  let couponDiscount = 0;
  if (activeCoupon) {
    let baseForCoupon = 0;
    items.forEach(item => {
      const isCollectibles = !item.vendor_id || item.vendor_id === 'platform';
      const storeKey = getStoreKey(item);
      const isOptedIn = vendorsData[storeKey]?.promotions_opt_in || false;
      
      if (isCollectibles || isOptedIn) {
        const itemDiscount = evaluateItemDiscount(item as any, promotions);
        baseForCoupon += Math.max(0, (item.price * item.quantity) - itemDiscount);
      }
    });

    couponDiscount = activeCoupon.discount_type === 'percentage'
      ? Math.round(baseForCoupon * Number(activeCoupon.discount_value) / 100)
      : Math.min(Number(activeCoupon.discount_value), baseForCoupon);
  }

  const grandTotal = Math.max(subtotalWithShipping - bankDiscount - couponDiscount, 0);

  // Synchronize finalTotal and log it
  useEffect(() => {
    setFinalTotal(grandTotal);
  }, [grandTotal]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[Checkout Debug] Total final enviado a pago (finalTotal):", finalTotal);
    }
  }, [finalTotal]);

  useEffect(() => {
    setAffiliateCode(localStorage.getItem('affiliate_code') || '');
  }, []);

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, saved_addresses, shipping_address, is_admin')
        .eq('id', user.id)
        .single();

      if (!data) return;
      setIsAdmin(!!data.is_admin);
      const addresses = data.saved_addresses || [];
      setSavedAddresses(addresses);
      const address = addresses.length > 0 ? addresses[0] : (data.shipping_address || {});
      if (addresses.length > 0) setSelectedAddress(0);

      setForm((current) => ({
        ...current,
        email: user.email || current.email,
        first_name: data.first_name || current.first_name,
        last_name: data.last_name || current.last_name,
        phone: data.phone || current.phone,
        street: address.street || current.street,
        apartment: address.apartment || current.apartment,
        city: address.city || current.city,
        department: address.department || current.department,
        barrio: address.barrio || current.barrio || '',
        reference: address.reference || current.reference || '',
        postal_code: address.postal_code || current.postal_code,
        country: address.country || current.country,
        ci: address.ci || '',
      }));

      // Load international addresses
      try {
        const { data: intlData } = await supabase
          .from('customer_international_addresses')
          .select('*')
          .order('is_default', { ascending: false });
        
        if (intlData) {
          setSavedIntlAddresses(intlData);
          const defaultAddr = intlData.find(a => a.is_default);
          if (defaultAddr) {
            setSelectedIntlAddressId(defaultAddr.id);
          } else if (intlData.length > 0) {
            setSelectedIntlAddressId(intlData[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading international addresses:", err);
      }
    }

    loadProfile();
  }, [user]);

  useEffect(() => {
    if (selectedIntlAddressId === 'new') {
      setIntlForm((current) => ({
        ...current,
        recipient_name: `${form.first_name} ${form.last_name}`.trim(),
      }));
    } else {
      const addr = savedIntlAddresses.find(a => a.id === selectedIntlAddressId);
      if (addr) {
        setIntlForm({
          courier_name: addr.courier_name || '',
          recipient_name: addr.recipient_name || '',
          customer_code: addr.customer_code || '',
          address_line_1: addr.address_line_1 || '',
          address_line_2: addr.address_line_2 || '',
          city: addr.city || '',
          state: addr.state || '',
          postal_code: addr.postal_code || '',
          country: addr.country || 'United States',
          phone: addr.phone || '',
          instructions: addr.instructions || ''
        });
      }
    }
  }, [selectedIntlAddressId, savedIntlAddresses, form.first_name, form.last_name]);

  useEffect(() => {
    if (items.length === 0) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    // Heartbeat: Upsert abandoned checkout if email is present
    if (form.email && items.length > 0) {
      const saveAbandonedCheckout = async () => {
        try {
          const { data: profile } = await supabase.from('profiles').select('id').eq('email', form.email).maybeSingle();
          
          const payload = {
            email: form.email,
            customer_id: profile?.id || user?.id || null,
            cart_data: items,
            total_amount: total,
            status: 'abandoned',
            updated_at: new Date().toISOString()
          };

          const { data: existing } = await supabase
            .from('abandoned_checkouts')
            .select('id')
            .eq('email', form.email)
            .eq('status', 'abandoned')
            .order('created_at', { ascending: false })
            .limit(1);

          if (existing && existing.length > 0) {
            await supabase.from('abandoned_checkouts').update(payload).eq('id', existing[0].id);
          } else {
            await supabase.from('abandoned_checkouts').insert(payload);
          }
        } catch (e) {
          console.warn('Silent abandoned checkout log failed', e);
        }
      };
      
      const timeoutId = setTimeout(saveAbandonedCheckout, 2000); // 2s debounce
      return () => clearTimeout(timeoutId);
    }

    async function fetchSuggestions() {
      setSuggestionsLoading(true);
      try {
        const cartProductIds = items.map(item => item.product_id);
        
        // 1. Fetch categories for cart items
        const { data: cartProducts } = await supabase
          .from('products')
          .select('id, category_id')
          .in('id', cartProductIds);
          
        const categoryIds = Array.from(
          new Set(cartProducts?.map(p => p.category_id).filter(Boolean) || [])
        );

        let allSuggested: any[] = [];

        // 2. Fetch products in same categories
        if (categoryIds.length > 0) {
          const { data: categorySuggested } = await supabase
            .from('products')
            .select(`
              id,
              title,
              base_price,
              category_id,
              brand_id,
              vendor_id,
              is_featured,
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count),
              product_tags:product_tags(tag_id)
            `)
            .eq('status', 'published')
            .eq('is_active', true)
            .in('category_id', categoryIds)
            .limit(20);

          if (categorySuggested) {
            allSuggested = categorySuggested.filter(p => !cartProductIds.includes(p.id));
          }
        }

        // 3. Fallback/Supplement with featured products if we have less than 10
        if (allSuggested.length < 10) {
          const { data: featuredProducts } = await supabase
            .from('products')
            .select(`
              id,
              title,
              base_price,
              category_id,
              brand_id,
              vendor_id,
              is_featured,
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count),
              product_tags:product_tags(tag_id)
            `)
            .eq('status', 'published')
            .eq('is_active', true)
            .eq('is_featured', true)
            .limit(20);

          if (featuredProducts) {
            const filteredFeatured = featuredProducts.filter(
              p => !cartProductIds.includes(p.id) && !allSuggested.some(s => s.id === p.id)
            );
            allSuggested = [...allSuggested, ...filteredFeatured];
          }
        }

        // 4. Final fallback with general published products if still short
        if (allSuggested.length < 5) {
          const { data: generalProducts } = await supabase
            .from('products')
            .select(`
              id,
              title,
              base_price,
              category_id,
              brand_id,
              vendor_id,
              is_featured,
              images:product_images(id, url, alt_text, sort_order, is_primary),
              variants:product_variants(id, sku, name, price_adjustment, inventory_count),
              product_tags:product_tags(tag_id)
            `)
            .eq('status', 'published')
            .eq('is_active', true)
            .limit(20);

          if (generalProducts) {
            const filteredGeneral = generalProducts.filter(
              p => !cartProductIds.includes(p.id) && !allSuggested.some(s => s.id === p.id)
            );
            allSuggested = [...allSuggested, ...filteredGeneral];
          }
        }

        // Limit suggestions to 10 items
        setSuggestions(allSuggested.slice(0, 10));
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      } finally {
        setSuggestionsLoading(false);
      }
    }

    fetchSuggestions();
  }, [items.map(item => item.product_id).join(',')]);

  const handleAddSuggestion = (p: any) => {
    const variant = p.variants?.[0];
    if (!variant) return;
    const resolvedPrice = resolveCartItemPrice(p, variant);
    addItem({
      product_id: p.id,
      variant_id: variant.id,
      quantity: 1,
      title: p.title,
      price: resolvedPrice,
      image: getProductImage(p),
      variant_name: variant.name || '',
      category_id: p.category_id,
      brand_id: p.brand_id,
      vendor_id: p.vendor_id,
      tag_ids: p.product_tags?.map((pt: any) => pt.tag_id) || []
    });
  };

  useEffect(() => {
    async function fetchBankPromos() {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('promotions')
        .select('*')
        .eq('discount_type', 'bank_discount')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`);

      setBankPromos(data || []);
    }

    fetchBankPromos();
  }, []);

  useEffect(() => {
    async function fetchPaymentProviders() {
      try {
        const providers = await getPublicPaymentProviders();
        if (import.meta.env.DEV) {
          console.log("payment providers:", providers);
        }
        setPublicPaymentProviders(providers);
      } catch (error) {
        console.error('No se pudieron cargar los medios de pago publicos', error);
      }
    }

    fetchPaymentProviders();
  }, []);

  const mercadopagoEnabled = settings['payments_mercadopago_enabled'] !== 'false';
  const dlocalgoEnabled = settings['payments_dlocal_go_enabled'] !== 'false';
  const paypalEnabled = settings['payments_paypal_enabled'] !== 'false';
  const handyProvider = publicPaymentProviders.find((provider) => provider.provider_key === 'handy');
  const handyEnabled = !!handyProvider?.is_active;

  useEffect(() => {
    if (!settingsLoaded) return;

    // Check if the current paymentMethod is still active
    const isCurrentActive =
      (paymentMethod === 'mercadopago' && mercadopagoEnabled) ||
      (paymentMethod === 'dlocalgo' && dlocalgoEnabled) ||
      (paymentMethod === 'paypal' && paypalEnabled) ||
      (paymentMethod === 'handy' && handyEnabled);

    if (!isCurrentActive) {
      // Find the first active payment method
      if (mercadopagoEnabled) {
        setPaymentMethod('mercadopago');
      } else if (dlocalgoEnabled) {
        setPaymentMethod('dlocalgo');
      } else if (paypalEnabled) {
        setPaymentMethod('paypal');
      } else if (handyEnabled) {
        setPaymentMethod('handy');
      }
    }
  }, [settingsLoaded, mercadopagoEnabled, dlocalgoEnabled, paypalEnabled, handyEnabled, paymentMethod]);

  useEffect(() => {
    if (!items.length || initiateCheckoutTrackedRef.current) return;
    initiateCheckoutTrackedRef.current = true;
    
    analytics.track({
      eventName: 'InitiateCheckout',
      eventData: {
        num_items: items.length,
        value: total,
        currency: 'UYU',
        content_ids: items.map((item) => item.product_id),
      },
      user: { email: user?.email || undefined },
    });

    // Meta Pixel: InitiateCheckout
    const metaEventId = generateMetaEventId('InitiateCheckout');
    trackInitiateCheckout(metaEventId, {
      value: total,
      contents: items.map((item) => ({
        id: item.product_id,
        quantity: item.quantity,
        item_price: item.price
      })),
      num_items: items.length,
      currency: 'UYU'
    });
  }, [items, total, user?.email]);

  useEffect(() => {
    if (currentStep === 3 && items.length > 0) {
      // Meta Pixel: AddPaymentInfo
      const metaEventId = generateMetaEventId('AddPaymentInfo');
      trackAddPaymentInfo(metaEventId, {
        value: grandTotal || total,
        payment_method: paymentMethod,
        currency: 'UYU'
      });
    }
  }, [currentStep, paymentMethod, grandTotal, total, items.length]);

  async function processPaymentFlow(orderId: string, provider: string, email: string) {
    console.log("create-order processPaymentFlow started:", orderId, provider, email);

    const normalizedProvider = 
      provider === 'mercadopago' ? 'mercado_pago' :
      provider === 'dlocalgo' ? 'dlocal_go' :
      provider;

    // GA4 & Clarity Redirect Telemetry (Phase 5 & 6)
    trackGA4Event('payment_redirect_started', {
      order_id: orderId,
      gateway: normalizedProvider,
      device_context: window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop'
    });

    trackClarityEvent('payment_redirect_started');

    try {
      const paymentResult = await startCheckoutPayment({
        provider: provider as any,
        order_id: orderId,
        customer_email: email,
      });

      console.log("create-order paymentResult:", paymentResult);

      if (paymentResult?.redirectUrl) {
        console.log("create-order redirecting to:", paymentResult.redirectUrl);
        window.location.href = paymentResult.redirectUrl;
        return;
      }

      throw new Error("El proveedor no devolvió URL de redirección");
    } catch (err: any) {
      console.error("create-order processPaymentFlow error:", err);

      // GA4 Redirect Error Telemetry (Phase 5)
      trackGA4Event('payment_redirect_error', {
        gateway: normalizedProvider,
        error_code: err.message || String(err),
        error_stage: 'payment_redirect'
      });

      setCheckoutError("Error en el pago: " + (err.message || String(err)));
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }

  const isPaymentBlocked = () => {
    // Check if any package has pickup error
    const hasAnyPickupError = uniqueStoreKeys.some(key => {
      const sel = subordersShipping[key];
      if (sel && sel.method === 'pickup') {
        const groupItems = items.filter(item => getStoreKey(item) === key);
        const groupTotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
        const options = getVendorShippingOptions(key, groupTotal);
        return !options.some(o => o.id === 'pickup' && o.available);
      }
      return false;
    });
    if (hasAnyPickupError) return true;

    if (hasAnyDelivery) {
      if (dacCalculationStatus === 'loading' || dacCalculationStatus === 'error' || dacCalculationStatus === 'missing_data') {
        return true;
      }
      if (dacShippingCost === null) {
        return true;
      }

      if (dacShippingError !== null) return true;
      if (!form.department || !form.phone) return true;

      const hasAnyHomeDelivery = uniqueStoreKeys.some(key => {
        const sel = subordersShipping[key];
        return sel && !['pickup', 'dac_agency', 'international_courier_direct'].includes(sel.method);
      });

      if (hasAnyHomeDelivery) {
        const isMvd = form.department === 'Montevideo';
        if (isMvd && !form.barrio) return true;
        if (!isMvd && !form.city) return true;
        if (!form.street) return true;
      }

      if (hasAnyDac) {
        if (!form.ci || !validateUruguayanCI(form.ci)) return true;
      }

      // Check if all agency selections are resolved
      const missingAgency = uniqueStoreKeys.some(key => {
        const sel = subordersShipping[key];
        return sel && sel.method === 'dac_agency' && !sel.selectedAgency;
      });
      if (missingAgency) return true;
    }

    if (items.some(i => i.is_international)) {
      if (!confirmCopyAddress) return true;
      if (!intlForm.courier_name || !intlForm.recipient_name || !intlForm.address_line_1 || !intlForm.city || !intlForm.state || !intlForm.postal_code || !intlForm.phone) return true;
      const isUS = ['us', 'usa', 'united states', 'estados unidos'].includes((intlForm.country || '').toLowerCase());
      if (!isUS) return true;
    }

    return false;
  };

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (currentStep < 3) {
      goNext();
      return;
    }
    if (submitLockRef.current || isSubmitting) return;

    if (!termsAccepted) {
      setCheckoutError('Debe aceptar los Términos y Condiciones para continuar.');
      return;
    }

    // VALIDACIÓN DEFENSIVA: antes de crear la orden (Phase 1.5)
    if (!validateStep2() || isPaymentBlocked()) {
      setCheckoutError('Los datos de envío no son válidos o falta calcular el costo de DAC. Por favor revisá la sección de envío.');
      return;
    }

    // VALIDACIÓN DEFENSIVA: precio final mayor a cero
    if (finalTotal <= 0) {
      setCheckoutError("No se pudo iniciar el pago porque el total del carrito no es válido. Revisá tu carrito e intentá nuevamente.");
      
      const normalizedPaymentType = 
        paymentMethod === 'mercadopago' ? 'mercado_pago' :
        paymentMethod === 'dlocalgo' ? 'dlocal_go' :
        paymentMethod;

      trackGA4Event('checkout_order_creation_error', {
        payment_method: normalizedPaymentType,
        checkout_step: 3,
        error_code: "INVALID_CHECKOUT_TOTAL",
        error_stage: "pre_order_validation"
      });
      return;
    }

    const normalizedPaymentType = 
      paymentMethod === 'mercadopago' ? 'mercado_pago' :
      paymentMethod === 'dlocalgo' ? 'dlocal_go' :
      paymentMethod;

    // GA4 standard Add Payment Info event
    trackGA4Event('add_payment_info', {
      currency: 'UYU',
      value: finalTotal,
      payment_type: normalizedPaymentType,
      items: mapCartItemsToGA4(items)
    });

    submitLockRef.current = true;
    setIsSubmitting(true);
    setCheckoutError('');

    try {
      // 1. ZINC LIVE CHECK
      const { data: { session } } = await supabase.auth.getSession();
      if (session && items.length > 0) {
         const { data: zincCheck, error: zincErr } = await supabase.functions.invoke('zinc-live-check-before-payment', {
            body: { cart_items: items }
         });

         if (zincErr) {
            console.error('zinc-live-check-before-payment error:', zincErr);
         } else if (zincCheck && !zincCheck.all_ok) {
            const blockedResult = zincCheck.results?.find((r: any) => !r.ok);
            if (blockedResult && blockedResult.message) {
               setCheckoutError(blockedResult.message);
               setIsSubmitting(false);
               submitLockRef.current = false;
               return;
            }
         }
      }

      const subordersShippingPayload: Record<string, any> = {};
      uniqueStoreKeys.forEach(key => {
        const sel = subordersShipping[key];
        if (sel) {
          subordersShippingPayload[key] = {
            shipping_method: sel.method,
            dac_office_id: sel.selectedAgency?.id || null,
            dac_k_oficina_destino: sel.selectedAgency?.k_oficina || null,
            dac_office_name: sel.selectedAgency?.office_name || null,
            dac_office_address: sel.selectedAgency?.address || sel.selectedAgency?.office_name || null,
            ci: form.ci || null
          };
        }
      });

      const firstKey = uniqueStoreKeys[0] || 'collectibles';
      const firstSelection = subordersShipping[firstKey];
      const primaryMethod = firstSelection?.method || 'pickup';
      const primaryAgency = firstSelection?.selectedAgency || null;
      const primaryDacMode = primaryMethod === 'dac_agency' ? 'agency' : 'home';

      // Save international address if checked
      if (items.some(i => i.is_international) && saveIntlAddress && user) {
        try {
          await supabase.from('customer_international_addresses').insert({
            user_id: user.id,
            label: `${intlForm.courier_name} (${intlForm.customer_code || 'Casilla'})`,
            courier_name: intlForm.courier_name,
            recipient_name: intlForm.recipient_name,
            customer_code: intlForm.customer_code,
            address_line_1: intlForm.address_line_1,
            address_line_2: intlForm.address_line_2 || null,
            city: intlForm.city,
            state: intlForm.state,
            postal_code: intlForm.postal_code,
            country: intlForm.country,
            phone: intlForm.phone,
            instructions: intlForm.instructions || null
          });
        } catch (err) {
          console.error("Error saving international address in checkout:", err);
        }
      }

      const order = await createCheckoutOrder({
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          vendor_id: item.vendor_id === 'platform' || !item.vendor_id ? undefined : item.vendor_id,
          vendor_store_id: item.vendor_store_id || undefined,
          quantity: item.quantity,
          price: item.price,
          title: item.title,
        })),
        coupon_code: couponCode.trim() || undefined,
        affiliate_code: affiliateCode.trim() || undefined,
        payment_method: paymentMethod,
        currency: selectedCurrency,
        shipping_method: primaryMethod,
        shipping_address: {
          first_name: form.first_name,
          last_name: form.last_name,
          street: primaryMethod === 'pickup' ? 'Retiro en local' : (primaryMethod === 'dac_agency' ? (primaryAgency?.address || primaryAgency?.office_name || 'Retiro en agencia DAC') : form.street),
          apartment: form.apartment || undefined,
          city: primaryMethod === 'pickup' ? 'Montevideo' : (primaryMethod === 'dac_agency' ? (primaryAgency?.city || primaryAgency?.locality || form.city || '') : form.city),
          department: primaryMethod === 'pickup' ? 'Montevideo' : (primaryMethod === 'dac_agency' ? (primaryAgency?.department || form.department) : form.department),
          postal_code: form.postal_code || undefined,
          country: form.country,
          barrio: primaryMethod === 'pickup' ? undefined : form.barrio,
          reference: primaryMethod === 'pickup' ? undefined : form.reference,
          ci: (primaryMethod === 'dac_home' || primaryMethod === 'dac_agency') ? form.ci : undefined,
          recipient_type: form.country === 'Argentina' ? (form.recipient_type as any) : undefined,
          dni: form.country === 'Argentina' && form.recipient_type === 'person' ? form.dni : undefined,
          cuit: form.country === 'Argentina' && form.recipient_type === 'company' ? form.cuit : undefined,
          razon_social: form.country === 'Argentina' && form.recipient_type === 'company' ? form.razon_social : undefined,
          street_number: form.country === 'Argentina' ? form.street_number : undefined,
          logistics_consent: form.country === 'Argentina' ? form.consent : undefined,
          // Dynamic international courier fields snapshot
          ...(items.some(i => i.is_international) ? {
            international_courier_name: intlForm.courier_name,
            international_recipient_name: intlForm.recipient_name,
            international_customer_code: intlForm.customer_code,
            international_address_line_1: intlForm.address_line_1,
            international_address_line_2: intlForm.address_line_2 || undefined,
            international_city: intlForm.city,
            international_state: intlForm.state,
            international_postal_code: intlForm.postal_code,
            international_country: intlForm.country,
            international_phone: intlForm.phone,
            international_instructions: intlForm.instructions || undefined,
          } : {}),
          ...((primaryMethod === 'dac_home' || primaryMethod === 'dac_agency') ? {
            dac_delivery_mode: primaryDacMode,
            shipping_provider: 'DAC',
            shipping_method: primaryMethod,
          } : {}),
          ...(primaryMethod === 'dac_agency' && primaryAgency ? {
            dac_office_id: primaryAgency.id,
            dac_k_oficina_destino: primaryAgency.k_oficina,
            dac_office_name: primaryAgency.office_name,
            dac_office_address: primaryAgency.address || primaryAgency.office_name,
          } : {}),
        },
        customer_email: form.email,
        customer_phone: form.phone || undefined,
        bank_promo: selectedPromo ? { promo_id: selectedPromo.id } : undefined,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        accepted_terms_version: "2026-05-27",
        email_opt_in: emailOptIn,
        whatsapp_opt_in: whatsappOptIn,
        suborders_shipping: subordersShippingPayload,
        logistics_consent: form.country === 'Argentina' ? form.consent : undefined,
      });

      console.log("create-order success:", order);

      const orderId = order?.id;
      const epm = String(order?.payment_method || paymentMethod || "").toLowerCase().trim();
      const email = form.email;

      console.log("create-order launching payment flow:", orderId, epm, email);

      if (!orderId) {
        throw new Error("La orden no devolvió ID");
      }

      const orderTotal = Number(order?.total_amount || 0);
      if (isNaN(orderTotal) || orderTotal <= 0) {
        throw new Error("INVALID_CHECKOUT_TOTAL: La orden creada tiene un total inválido");
      }

      if (!epm) {
        throw new Error("La orden no devolvió método de pago");
      }

      await processPaymentFlow(orderId, epm, email);

      console.log("create-order processPaymentFlow returned without redirect");
    } catch (err: any) {
      console.error("create-order handlePlaceOrder error:", err);

      // Technical event: checkout_order_creation_error (no PII!)
      trackGA4Event('checkout_order_creation_error', {
        payment_method: normalizedPaymentType,
        checkout_step: 3,
        error_code: err.message || String(err),
        error_stage: 'order_creation'
      });

      setCheckoutError("Error creando la orden: " + (err.message || String(err)));
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-500">No hay productos para pagar</h1>
        <Link to="/shop" className="btn-primary mt-4">Seguir comprando</Link>
      </div>
    );
  }

  const CHECKOUT_STEPS = [
    { id: 1, label: 'Facturación' },
    { id: 2, label: 'Envío' },
    { id: 3, label: 'Pago' },
  ];

  const isValidCUIT = (cuit: string): boolean => {
    const clean = cuit.replace(/\D/g, "");
    if (clean.length !== 11) return false;

    const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += Number(clean[i]) * multipliers[i];
    }

    const remainder = sum % 11;
    const result = 11 - remainder;
    const checkDigit = Number(clean[10]);

    if (result === 11) {
      return checkDigit === 0;
    }
    if (result === 10) {
      return checkDigit === 9 || checkDigit === 4;
    }
    return checkDigit === result;
  };

  const validateStep2 = (): {
    valid: boolean;
    errors: Array<{ field: string; code: string; message: string }>;
  } => {
    const errorsList: Array<{ field: string; code: string; message: string }> = [];
    const isMvd = form.department === 'Montevideo';

    if (form.country === 'Argentina') {
      if (!form.first_name || !form.first_name.trim()) {
        errorsList.push({ field: 'first_name', code: 'REQUIRED', message: 'El nombre es obligatorio.' });
      }
      if (!form.last_name || !form.last_name.trim()) {
        errorsList.push({ field: 'last_name', code: 'REQUIRED', message: 'El apellido es obligatorio.' });
      }
      if (!form.email || !form.email.trim()) {
        errorsList.push({ field: 'email', code: 'REQUIRED', message: 'El correo electrónico es obligatorio.' });
      }
      if (!form.phone || !form.phone.trim()) {
        errorsList.push({ field: 'phone', code: 'REQUIRED', message: 'El teléfono es obligatorio.' });
      } else if (!form.phone.startsWith('+')) {
        errorsList.push({ field: 'phone', code: 'INVALID_FORMAT', message: 'El teléfono debe incluir el prefijo internacional (ej: +54911...).' });
      }
      if (!form.department) {
        errorsList.push({ field: 'department', code: 'REQUIRED', message: 'La provincia es obligatoria.' });
      }
      if (!form.city || !form.city.trim()) {
        errorsList.push({ field: 'city', code: 'REQUIRED', message: 'La localidad es obligatoria.' });
      }
      if (!form.street || !form.street.trim()) {
        errorsList.push({ field: 'street', code: 'REQUIRED', message: 'La calle es obligatoria.' });
      }
      if (!form.street_number || !form.street_number.trim()) {
        errorsList.push({ field: 'street_number', code: 'REQUIRED', message: 'El número de puerta es obligatorio.' });
      }
      if (!form.postal_code || !form.postal_code.trim()) {
        errorsList.push({ field: 'postal_code', code: 'REQUIRED', message: 'El código postal o CPA es obligatorio.' });
      }
      if (form.recipient_type === 'person') {
        if (!form.dni || !form.dni.trim()) {
          errorsList.push({ field: 'dni', code: 'REQUIRED', message: 'El DNI es obligatorio para personas.' });
        }
      } else if (form.recipient_type === 'company') {
        if (!form.cuit || !form.cuit.trim()) {
          errorsList.push({ field: 'cuit', code: 'REQUIRED', message: 'El CUIT es obligatorio para empresas.' });
        } else if (!isValidCUIT(form.cuit)) {
          errorsList.push({ field: 'cuit', code: 'INVALID_FORMAT', message: 'El CUIT no es válido. Verifica el número e intenta nuevamente.' });
        }
        if (!form.razon_social || !form.razon_social.trim()) {
          errorsList.push({ field: 'razon_social', code: 'REQUIRED', message: 'La razón social es obligatoria para empresas.' });
        }
      }
      if (!form.consent) {
        errorsList.push({ field: 'consent', code: 'REQUIRED', message: 'Debes aceptar compartir los datos de envío con el operador logístico.' });
      }

      const uniqueErrors = Array.from(new Map(errorsList.map(e => [e.field, e])).values());
      const mappedErrors: Record<string, string> = {};
      uniqueErrors.forEach(e => { mappedErrors[e.field] = e.message; });
      setStep2Errors(mappedErrors);

      return {
        valid: errorsList.length === 0,
        errors: errorsList
      };
    }

    // 1. Mandatory base fields
    if (!form.department) {
      errorsList.push({
        field: 'department',
        code: 'REQUIRED',
        message: 'El departamento es obligatorio.'
      });
    }
    
    if (hasAnyDelivery) {
      if (!form.phone || !form.phone.trim()) {
        errorsList.push({
          field: 'phone',
          code: 'REQUIRED',
          message: 'El teléfono es obligatorio para coordinar el envío.'
        });
      }

      // Check if any package is using home delivery (requires address)
      const hasAnyHomeDelivery = uniqueStoreKeys.some(key => {
        const sel = subordersShipping[key];
        return sel && !['pickup', 'dac_agency'].includes(sel.method);
      });

      if (hasAnyHomeDelivery) {
        if (isMvd) {
          if (!form.barrio) {
            errorsList.push({
              field: 'barrio',
              code: 'REQUIRED',
              message: 'El barrio es obligatorio para Montevideo.'
            });
          }
        } else {
          if (!form.city) {
            errorsList.push({
              field: 'city',
              code: 'REQUIRED',
              message: 'La ciudad es obligatoria.'
            });
          }
        }
        if (!form.street || !form.street.trim()) {
          errorsList.push({
            field: 'street',
            code: 'REQUIRED',
            message: 'La dirección (calle y número) es obligatoria.'
          });
        }
      }

      // CI checking
      if (hasAnyDac && (!form.ci || !validateUruguayanCI(form.ci))) {
        errorsList.push({
          field: 'ci',
          code: 'INVALID_CI',
          message: 'La Cédula de Identidad es obligatoria e inválida (requerida por DAC).'
        });
      }

      // 2. Agency checking per suborder
      uniqueStoreKeys.forEach(key => {
        const sel = subordersShipping[key];
        if (sel && sel.method === 'dac_agency' && !sel.selectedAgency) {
          errorsList.push({
            field: `agency_${key}`,
            code: 'REQUIRED_AGENCY',
            message: `Debe seleccionar una agencia DAC para el paquete de ${getVendorName(key)}.`
          });
        }
      });

      // 3. Calculation state checking
      if (dacCalculationStatus === 'loading') {
        errorsList.push({
          field: 'calculation',
          code: 'LOADING',
          message: 'Por favor, espere a que termine de calcularse el costo de envío.'
        });
      } else if (dacCalculationStatus === 'missing_data') {
        errorsList.push({
          field: 'calculation',
          code: 'MISSING_DATA',
          message: 'Faltan ingresar datos para calcular el costo de envío.'
        });
      } else if (dacCalculationStatus === 'error') {
        errorsList.push({
          field: 'calculation',
          code: 'CALCULATION_ERROR',
          message: dacShippingError || 'Ocurrió un error al calcular el costo de envío. Por favor intente de nuevo.'
        });
      } else if (dacCalculationStatus === 'idle') {
        errorsList.push({
          field: 'calculation',
          code: 'IDLE',
          message: 'Es necesario calcular el costo de envío.'
        });
      } else if (dacShippingCost === null) {
        errorsList.push({
          field: 'calculation',
          code: 'NULL_COST',
          message: 'El costo de envío es desconocido. No es posible completar la compra.'
        });
      }
    }

    // 4. Shipping Groups Mixed validation
    uniqueStoreKeys.forEach(key => {
      const groupItems = items.filter(item => getStoreKey(item) === key);
      const isCollectiblesGroup = key === 'collectibles' || key === 'platform';
      const v = vendorsData[key];
      
      const groupTotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const options = getVendorShippingOptions(key, groupTotal);
      
      const sel = subordersShipping[key];
      const hasValidMethod = sel && options.some(o => o.available && o.id === sel.method);

      console.log('[CHECKOUT_SHIPPING_GROUP_VALIDATION]', {
        sellerName: getVendorName(key),
        sellerType: isCollectiblesGroup ? 'collectibles' : 'vendor',
        itemCount: groupItems.length,
        selectedMethod: sel?.method || null,
        agencyId: sel?.selectedAgency?.id || null,
        valid: hasValidMethod,
        errors: !v ? ['Vendor data not loaded'] : (!hasValidMethod ? ['No available shipping method for current selection'] : [])
      });

      if (!hasValidMethod) {
        errorsList.push({
          field: 'calculation',
          code: 'INVALID_GROUP_SHIPPING',
          message: `El vendedor ${getVendorName(key)} no tiene métodos de envío disponibles para tu selección.`
        });
      }
    });

    // 5. Agency visual vs internal state validation & debug
    console.log('[CHECKOUT_AGENCY_STATE_DEBUG]', {
      subordersShipping: subordersShipping
    });

    // Map list to Record
    const errorsMap: Record<string, string> = {};
    errorsList.forEach(err => {
      errorsMap[err.field] = err.message;
    });
    setStep2Errors(errorsMap);

    const result = {
      valid: errorsList.length === 0,
      errors: errorsList
    };

    console.log('[CHECKOUT_STEP2_VALIDATION_RESULT]', result);

    if (!result.valid) {
      // Trigger checkout_validation_error technical event (Phase 5)
      trackGA4Event('checkout_validation_error', {
        step: 2,
        error_fields: errorsList.map(e => e.field),
        error_messages: errorsList.map(e => e.message)
      });

      // Smooth scroll to the first element with an error
      const firstErrorKey = errorsList[0].field;
      let elementId = '';
      if (firstErrorKey === 'department') elementId = 'shipping-department';
      else if (firstErrorKey === 'city') elementId = 'shipping-city';
      else if (firstErrorKey === 'barrio') elementId = 'shipping-barrio';
      else if (firstErrorKey === 'street') elementId = 'shipping-street';
      else if (firstErrorKey === 'phone') elementId = 'shipping-phone';
      else if (firstErrorKey.startsWith('agency')) elementId = 'shipping-packages-block';
      else if (firstErrorKey === 'calculation') elementId = 'shipping-packages-block';
      else if (firstErrorKey === 'ci') elementId = 'shipping-ci-block';

      if (elementId) {
        const el = document.getElementById(elementId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus in desktop
          if (window.matchMedia('(min-width: 1024px)').matches) {
            const input = el.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
            if (input) input.focus();
          }
        }
      }
    }

    return result;
  };

  const canAdvanceStep = (step: number): boolean => {
    if (step === 1) {
      return !!(form.email && form.first_name && form.last_name && form.phone);
    }
    if (step === 2) {
      if (!form.department) return false;
      if (hasAnyDelivery) {
        if (!form.phone || !form.phone.trim()) return false;
        
        const hasAnyHomeDelivery = uniqueStoreKeys.some(key => {
          const sel = subordersShipping[key];
          return sel && !['pickup', 'dac_agency'].includes(sel.method);
        });

        if (hasAnyHomeDelivery) {
          const isMvd = form.department === 'Montevideo';
          if (isMvd) {
            if (!form.barrio) return false;
          } else {
            if (!form.city) return false;
          }
          if (!form.street || !form.street.trim()) return false;
        }

        if (hasAnyDac && (!form.ci || !validateUruguayanCI(form.ci))) {
          return false;
        }

        // Agency check per suborder
        const agenciesValid = uniqueStoreKeys.every(key => {
          const sel = subordersShipping[key];
          if (sel && sel.method === 'dac_agency' && !sel.selectedAgency) return false;
          return true;
        });
        if (!agenciesValid) return false;

        // Shipping calculation state check
        if (dacCalculationStatus !== 'success' || dacShippingCost === null) return false;
      }

      // Group shipping validation
      const groupsValid = uniqueStoreKeys.every(key => {
        const groupItems = items.filter(item => getStoreKey(item) === key);
        const groupTotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
        const options = getVendorShippingOptions(key, groupTotal);
        const sel = subordersShipping[key];
        return sel && options.some(o => o.available && o.id === sel.method);
      });
      if (!groupsValid) return false;

      return true;
    }
    return true;
  };

  const goNext = () => {
    console.log('[CHECKOUT_CONTINUE_CLICKED]', {
      currentStep,
      subordersShipping,
      form,
      loading: dacShippingLoading,
      isSubmitting
    });

    if (currentStep === 1) {
      if (canAdvanceStep(1)) {
        setCurrentStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (currentStep === 2) {
      const validation = validateStep2();
      const canAdvance = canAdvanceStep(2);
      
      const blockingReason = !validation.valid ? 'validateStep2 failed' : (!canAdvance ? 'canAdvanceStep failed' : '');
      
      console.log('[CHECKOUT_CONTINUE_BUTTON_STATE]', {
        disabled: !canAdvance,
        reason: blockingReason,
        canAdvance,
        step2Valid: validation.valid
      });

      if (!validation.valid) {
        console.warn('[CHECKOUT_STEP2_BLOCKED]', validation.errors);
        return;
      }

      if (!canAdvance) {
        return;
      }

      // GA4 event: add_shipping_info (Phase 2)
      trackGA4Event('add_shipping_info', {
        currency: 'UYU',
        value: subtotalWithShipping,
        shipping_tier: 'packages_multimodal',
        items: mapCartItemsToGA4(items)
      });

      // Clarity event: shipping_selected (Phase 6)
      trackClarityEvent('shipping_selected');

      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <nav className="flex items-center text-sm text-slate-400 mb-6">
        <Link to="/" className="hover:text-primary-600">Home</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <Link to="/cart" className="hover:text-primary-600">Carrito</Link>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="text-primary-600 font-medium">Checkout</span>
      </nav>

      {/* ═══ STEPPER ═══ */}
      <CheckoutStepper
        currentStep={currentStep}
        onStepClick={(step) => {
          if (currentStep > step) setCurrentStep(step);
        }}
      />

      {checkoutError && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500/30 text-sm text-red-400 rounded-xl flex items-center justify-between">
          <span>{checkoutError}</span>
          <button onClick={() => setCheckoutError('')} className="text-red-400 hover:text-red-300 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ SUGGESTIONS GALLERY ═══ */}
      {suggestions.length > 0 && (
        <div className="mb-8 relative group">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 px-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-500 animate-pulse" />
            Sugerencias para tu compra
          </h3>
          
          <div className="relative flex items-center">
            {/* Left navigation arrow */}
            <button
              type="button"
              onClick={() => {
                if (carouselRef.current) {
                  carouselRef.current.scrollBy({ left: -240, behavior: 'smooth' });
                }
              }}
              className="absolute left-0 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg -translate-x-1/2 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Scrollable container */}
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-3 scroll-smooth no-scrollbar w-full"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {suggestions.map((p) => {
                const primaryImage = getProductImage(p);
                const hasVariants = p.variants && p.variants.length > 0;
                
                return (
                  <div
                    key={p.id}
                    className="w-[200px] shrink-0 glass rounded-xl p-3 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                  >
                    <div className="h-28 flex items-center justify-center bg-white/5 rounded-lg p-2 mb-3">
                      <img
                        src={primaryImage}
                        alt={p.title}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white line-clamp-2 min-h-[32px] leading-snug">
                          {p.title}
                        </h4>
                        <p className="text-sm font-black text-[#f00856] mt-1.5">
                          {formatCurrencyPrice(p.base_price)}
                        </p>
                      </div>
                      
                      <button
                        type="button"
                        disabled={!hasVariants}
                        onClick={() => handleAddSuggestion(p)}
                        className={`w-full mt-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                          hasVariants
                            ? 'bg-[#f00856] hover:bg-[#d00749] text-white shadow-md shadow-primary-500/20 cursor-pointer'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {hasVariants ? 'AGREGAR' : 'SIN STOCK'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right navigation arrow */}
            <button
              type="button"
              onClick={() => {
                if (carouselRef.current) {
                  carouselRef.current.scrollBy({ left: 240, behavior: 'smooth' });
                }
              }}
              className="absolute right-0 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg translate-x-1/2 flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handlePlaceOrder}>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 1: DATOS DE FACTURACIÓN                              */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div className="checkout-step-content" key="step-1">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 shadow-xl">
                  <CheckoutSectionHeader
                    title="Datos de facturación"
                    subtitle="Completá tus datos personales para continuar."
                  />
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Correo electrónico *</label>
                      <input type="email" required className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="form-label">Nombre *</label><input required className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                      <div><label className="form-label">Apellido *</label><input required className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                    </div>
                    <div id="shipping-phone">
                      <label className="form-label">Teléfono *</label>
                      <input required className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                      {step2Errors.phone && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.phone}</p>}
                    </div>

                    {(selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency') && (
                      <div className="space-y-1">
                        <label className="form-label flex items-center justify-between">
                          <span>Cédula de Identidad (CI) *</span>
                          {form.ci && !validateUruguayanCI(form.ci) && (
                            <span className="text-[11px] text-red-400 font-semibold animate-pulse">CI Inválida</span>
                          )}
                          {form.ci && validateUruguayanCI(form.ci) && (
                            <span className="text-[11px] text-green-400 font-semibold">✓ CI Válida</span>
                          )}
                        </label>
                        <input
                          required
                          placeholder="Ej: 1.234.567-8"
                          className={`form-input transition-all ${
                            form.ci
                              ? validateUruguayanCI(form.ci)
                                ? 'border-green-500/50 focus:border-green-500 bg-green-500/5'
                                : 'border-red-500/50 focus:border-red-500 bg-red-500/5'
                              : 'border-white/10 focus:border-primary-500 bg-white/5'
                          }`}
                          value={form.ci}
                          onChange={e => setForm({ ...form, ci: e.target.value })}
                        />
                        <p className="text-[10px] text-slate-400">Requerido para la facturación y el despacho de la guía por DAC.</p>
                      </div>
                    )}

                    <div className="pt-4 mt-2 border-t border-white/5 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={emailOptIn}
                          onChange={(e) => setEmailOptIn(e.target.checked)}
                          className="w-5 h-5 rounded border-white/20 text-primary-500 focus:ring-primary-500/50 focus:ring-offset-0 bg-transparent"
                        />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                          Quiero recibir promociones exclusivas por email
                        </span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={whatsappOptIn}
                          onChange={(e) => setWhatsappOptIn(e.target.checked)}
                          className="w-5 h-5 rounded border-white/20 text-green-500 focus:ring-green-500/50 focus:ring-offset-0 bg-transparent"
                        />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                          Quiero recibir promociones exclusivas por WhatsApp
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Step 1 Nav */}
                  <div className="checkout-nav">
                    <Link to="/cart" className="checkout-btn-back">
                      <ChevronLeft className="w-4 h-4" /> Volver al carrito
                    </Link>
                    <button type="button" onClick={goNext} disabled={!canAdvanceStep(1)} className="checkout-btn-next">
                      Continuar <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 2: DATOS DE ENVÍO                                    */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
              <div className="checkout-step-content" key="step-2">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 shadow-xl">
                  <CheckoutSectionHeader
                    title="Elegí cómo querés recibir cada paquete"
                    subtitle="Tus productos se enviarán en paquetes separados según la tienda. Cada tienda puede tener opciones, costos y promociones de envío diferentes."
                    icon={Truck}
                    badgeText={`${uniqueStoreKeys.length} ${uniqueStoreKeys.length === 1 ? 'Paquete' : 'Paquetes'}`}
                  />

                  {items.some(i => i.is_international) && (
                    <div className="mb-8 bg-[#f00856]/5 border border-[#f00856]/20 p-4 rounded-xl">
                      <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-[#f00856]" /> Importación Internacional
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">
                        Tus productos se enviarán a un courier en Miami, USA.
                      </p>
                      
                      <h3 className="font-bold text-white mb-3">
                        ¿A qué dirección de Estados Unidos enviamos tu compra?
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">
                        Esta es la dirección que te proporcionó tu courier o casilla en Estados Unidos.
                      </p>

                      <div className="space-y-4 mb-6">
                        {savedIntlAddresses.map((addr) => (
                          <label key={addr.id} className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all rounded-lg ${selectedIntlAddressId === addr.id ? 'border-[#f00856] bg-[#f00856]/10' : 'border-white/10 hover:border-white/20 bg-white/5'}`}>
                            <input 
                              type="radio" 
                              name="selected_intl_address"
                              checked={selectedIntlAddressId === addr.id} 
                              onChange={() => setSelectedIntlAddressId(addr.id)} 
                              className="sr-only" 
                            />
                            <div className={`w-4 h-4 rounded-full mt-1 border-2 flex items-center justify-center ${selectedIntlAddressId === addr.id ? 'border-[#f00856]' : 'border-slate-500'}`}>
                              {selectedIntlAddressId === addr.id && <div className="w-2 h-2 bg-[#f00856] rounded-full" />}
                            </div>
                            <div className="flex-1 text-xs text-slate-300">
                              <div className="font-bold text-white mb-1 flex items-center gap-2">
                                {addr.label}
                                {addr.is_default && <span className="bg-white/10 text-white text-[9px] px-1.5 py-0.5 rounded">Predeterminada</span>}
                              </div>
                              <p><span className="text-slate-400">Courier:</span> {addr.courier_name}</p>
                              <p><span className="text-slate-400">Destinatario:</span> {addr.recipient_name} {addr.customer_code ? `(${addr.customer_code})` : ''}</p>
                              <p><span className="text-slate-400">Dirección:</span> {addr.address_line_1} {addr.address_line_2 ? `, ${addr.address_line_2}` : ''}</p>
                              <p><span className="text-slate-400">Ubicación:</span> {addr.city}, {addr.state} {addr.postal_code}, {addr.country}</p>
                              <p><span className="text-slate-400">Teléfono:</span> {addr.phone}</p>
                            </div>
                          </label>
                        ))}

                        <label className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all rounded-lg ${selectedIntlAddressId === 'new' ? 'border-[#f00856] bg-[#f00856]/10' : 'border-white/10 hover:border-white/20 bg-white/5'}`}>
                          <input 
                            type="radio" 
                            name="selected_intl_address"
                            checked={selectedIntlAddressId === 'new'} 
                            onChange={() => setSelectedIntlAddressId('new')} 
                            className="sr-only" 
                          />
                          <div className={`w-4 h-4 rounded-full mt-1 border-2 flex items-center justify-center ${selectedIntlAddressId === 'new' ? 'border-[#f00856]' : 'border-slate-500'}`}>
                            {selectedIntlAddressId === 'new' && <div className="w-2 h-2 bg-[#f00856] rounded-full" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-white">Agregar nueva dirección de courier</div>
                            <p className="text-xs text-slate-400 mt-0.5">Ingresar manualmente todos los campos asignados por tu courier.</p>
                          </div>
                        </label>
                      </div>

                      {selectedIntlAddressId === 'new' && (
                        <div className="space-y-4 p-4 border border-white/5 rounded-xl bg-black/10 mb-6">
                          <h4 className="font-bold text-sm text-white mb-2">Formulario de Dirección Internacional</h4>
                          
                          {/* Courier autocomplete helper */}
                          <div className="mb-2">
                            <span className="text-xs text-slate-400 block mb-2 font-medium">Completar con plantilla sugerida:</span>
                            <div className="flex flex-wrap gap-2">
                              <button 
                                type="button" 
                                className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                                onClick={() => {
                                  setIntlForm(prev => ({
                                    ...prev,
                                    courier_name: 'Urubox',
                                    address_line_1: '2030 NW 95th Ave',
                                    address_line_2: 'Suite UY',
                                    city: 'Doral',
                                    state: 'FL',
                                    postal_code: '33172',
                                    phone: '7863140977'
                                  }));
                                }}
                              >
                                Urubox Miami
                              </button>
                              <button 
                                type="button" 
                                className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                                onClick={() => {
                                  setIntlForm(prev => ({
                                    ...prev,
                                    courier_name: 'USX Cargo',
                                    address_line_1: '8400 NW 25th St',
                                    address_line_2: 'Suite UY',
                                    city: 'Doral',
                                    state: 'FL',
                                    postal_code: '33122',
                                    phone: '3055928880'
                                  }));
                                }}
                              >
                                USX Cargo Miami
                              </button>
                              <button 
                                type="button" 
                                className="bg-white/5 hover:bg-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
                                onClick={() => {
                                  setIntlForm(prev => ({
                                    ...prev,
                                    courier_name: 'PuntoMio',
                                    address_line_1: '2200 NW 129th Ave',
                                    address_line_2: 'Suite UY',
                                    city: 'Miami',
                                    state: 'FL',
                                    postal_code: '33182',
                                    phone: '3054772020'
                                  }));
                                }}
                              >
                                PuntoMio Miami
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Nombre del courier *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: Urubox"
                                value={intlForm.courier_name}
                                onChange={e => setIntlForm({...intlForm, courier_name: e.target.value})}
                              />
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Destinatario completo (según courier) *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: Juan Pérez / UY12345"
                                value={intlForm.recipient_name}
                                onChange={e => setIntlForm({...intlForm, recipient_name: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Número de Casilla / Suite *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: UY12345"
                                value={intlForm.customer_code}
                                onChange={e => setIntlForm({...intlForm, customer_code: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Address Line 1 *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: 2030 NW 95th Ave"
                                value={intlForm.address_line_1}
                                onChange={e => setIntlForm({...intlForm, address_line_1: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Address Line 2 (Opcional)</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: Suite UY"
                                value={intlForm.address_line_2}
                                onChange={e => setIntlForm({...intlForm, address_line_2: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Ciudad *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: Doral o Miami"
                                value={intlForm.city}
                                onChange={e => setIntlForm({...intlForm, city: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Estado / Región *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: FL o Florida"
                                value={intlForm.state}
                                onChange={e => setIntlForm({...intlForm, state: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">ZIP Code / Código Postal *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: 33172"
                                value={intlForm.postal_code}
                                onChange={e => setIntlForm({...intlForm, postal_code: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">País *</label>
                              <input 
                                type="text"
                                disabled
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-slate-400 focus:outline-none focus:border-[#f00856] text-xs"
                                value={intlForm.country}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Teléfono de Recepción *</label>
                              <input 
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                                placeholder="Ej: 7863140977"
                                value={intlForm.phone}
                                onChange={e => setIntlForm({...intlForm, phone: e.target.value})}
                              />
                            </div>
                          </div>

                          <div className="mt-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Instrucciones Adicionales (Opcional)</label>
                            <textarea 
                              rows={2}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#f00856] text-xs"
                              placeholder="Ej: Entregar solo en horario comercial..."
                              value={intlForm.instructions}
                              onChange={e => setIntlForm({...intlForm, instructions: e.target.value})}
                            />
                          </div>

                          {user && (
                            <label className="flex items-center gap-2 mt-4 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={saveIntlAddress}
                                onChange={e => setSaveIntlAddress(e.target.checked)}
                                className="rounded border-white/10 text-[#f00856] focus:ring-[#f00856] bg-black/20"
                              />
                              <span className="text-xs text-slate-300">Guardar esta dirección en mi cuenta para futuras compras</span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Warning & Copy Confirmation Checkbox */}
                      <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg mb-4 text-xs text-yellow-300">
                        <p className="font-bold flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" /> ¡Advertencia Importante!
                        </p>
                        <p className="leading-relaxed">
                          Ingresá la dirección exactamente como te la asignó tu courier. Un dato incorrecto puede provocar demoras, devolución o pérdida del paquete.
                        </p>
                        
                        <label className="flex items-start gap-2.5 mt-3.5 cursor-pointer text-white font-medium select-none">
                          <input 
                            type="checkbox"
                            checked={confirmCopyAddress}
                            onChange={e => setConfirmCopyAddress(e.target.checked)}
                            className="rounded border-white/10 text-[#f00856] focus:ring-[#f00856] bg-black/20 mt-0.5"
                          />
                          <span>Confirmo que copié exactamente la dirección asignada por mi courier.</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <h3 className="font-bold text-white mb-4">Opciones de Envío por Paquete</h3>
                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    Tu pedido incluye productos de distintos vendedores. Seleccioná el método de entrega preferido para cada paquete.
                  </p>

                  {/* Quick Multi-Vendor Shipping Summary Banner */}
                  <div className="mb-6 p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm font-semibold text-neutral-200">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f00856] animate-pulse" />
                      <span>{uniqueStoreKeys.length} {uniqueStoreKeys.length === 1 ? 'paquete' : 'paquetes en total'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-400 font-bold">
                        {Object.values(subordersShipping).filter(s => (vendorShippingCosts[s.method] ?? 0) === 0 || s.method === 'pickup').length} envíos gratis
                      </span>
                      <span className="text-neutral-500">·</span>
                      <span className="text-white font-bold">
                        Total de envío: ${shipping.toLocaleString('es-UY')}
                      </span>
                    </div>
                  </div>

                  <div id="shipping-packages-block" className="space-y-6">
                    {uniqueStoreKeys.map((storeKey, idx) => {
                      const groupItems = items.filter(item => getStoreKey(item) === storeKey);
                      const groupTotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
                      const options = getVendorShippingOptions(storeKey, groupTotal);
                      const selection = subordersShipping[storeKey] || { method: 'pickup', selectedAgency: null };
                      const vendorName = getVendorName(storeKey);
                      const vData = vendorsData[storeKey];
                      const sSettings = vData?.shipping_settings || {};
                      
                      const isCostLoading = dacShippingLoading && (selection.method === 'dac_home' || selection.method === 'dac_agency');
                      const packageCost = vendorShippingCosts[storeKey];
                      const hasCostError = !!dacShippingError && packageCost === undefined && (selection.method === 'dac_home' || selection.method === 'dac_agency');
                      
                      return (
                        <div key={storeKey} className="space-y-4">
                          <PackageCard
                            packageIndex={idx + 1}
                            totalPackages={uniqueStoreKeys.length}
                            storeKey={storeKey}
                            vendorName={vendorName}
                            vendorLogo={vData?.default_address?.address ? null : null}
                            items={groupItems.map(gi => ({
                              id: gi.id,
                              title: gi.title,
                              image_url: getProductImage(gi),
                              price: gi.price,
                              quantity: gi.quantity
                            }))}
                            groupTotal={groupTotal}
                            freeShippingThreshold={freeShippingThreshold}
                            vendorFreeShippingMin={Number(sSettings.free_shipping?.min_amount || 0)}
                            vendorFreeShippingActive={!!sSettings.free_shipping?.active}
                            shippingOptions={options}
                            selectedMethodId={selection.method}
                            onSelectMethod={(methodId) => {
                              setSubordersShipping(prev => ({
                                ...prev,
                                [storeKey]: {
                                  method: methodId as any,
                                  selectedAgency: methodId === 'dac_agency' ? prev[storeKey]?.selectedAgency : null
                                }
                              }));
                            }}
                          />

                          {/* Specific agency selector for this package if Retiro en agencia DAC is chosen */}
                          {selection.method === 'dac_agency' && (
                            <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                              <label className="form-label text-xs flex items-center gap-1.5 text-slate-300">
                                <MapPin className="w-3.5 h-3.5 text-amber-500" />
                                Seleccioná una agencia DAC para {vendorName} en {form.department || 'tu departamento'}
                              </label>

                              {dacAgencies.length > 0 ? (
                                <>
                                  {dacAgencies.length > 4 && (
                                    <div className="relative">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                      <input
                                        type="text"
                                        placeholder="Buscar agencia..."
                                        className="form-input pl-9 text-xs"
                                        value={agencySearchTerm}
                                        onChange={e => setAgencySearchTerm(e.target.value)}
                                      />
                                    </div>
                                  )}
                                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                                    {dacAgencies
                                      .filter(a => {
                                        if (!agencySearchTerm.trim()) return true;
                                        const term = agencySearchTerm.toLowerCase();
                                        return (
                                          a.office_name?.toLowerCase().includes(term) ||
                                          a.city?.toLowerCase().includes(term) ||
                                          a.locality?.toLowerCase().includes(term) ||
                                          a.address?.toLowerCase().includes(term)
                                        );
                                      })
                                      .map((agency) => {
                                        const isAgencySelected = selection.selectedAgency?.id === agency.id;
                                        return (
                                          <button
                                            key={agency.id}
                                            type="button"
                                            onClick={() => {
                                              setSubordersShipping(prev => ({
                                                ...prev,
                                                [storeKey]: {
                                                  ...prev[storeKey],
                                                  selectedAgency: agency
                                                }
                                              }));
                                            }}
                                            className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                              isAgencySelected
                                                ? 'border-amber-500 bg-amber-500/10'
                                                : 'border-white/10 bg-white/5 hover:border-amber-500/30 hover:bg-white/[0.07]'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <div className="font-bold text-sm text-white">{agency.office_name}</div>
                                                {agency.address && (
                                                  <div className="text-[11px] text-slate-400 mt-0.5">{agency.address}</div>
                                                )}
                                                {agency.city && (
                                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                                    {agency.city}{agency.locality ? `, ${agency.locality}` : ''}
                                                  </div>
                                                )}
                                              </div>
                                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                isAgencySelected
                                                  ? 'bg-amber-500 text-white'
                                                  : 'bg-white/10 text-slate-500'
                                              }`}>
                                                K_{agency.k_oficina}
                                              </span>
                                            </div>
                                          </button>
                                        );
                                      })}
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs text-slate-500 p-3 bg-white/5 rounded-lg border border-white/10 text-center">
                                  {form.department ? `No hay agencias DAC activas para retiro en ${form.department}.` : 'Seleccioná un departamento arriba para ver agencias disponibles.'}
                                </div>
                              )}
                              
                              {step2Errors[`agency_${storeKey}`] && (
                                <p className="text-red-500 text-xs font-semibold">{step2Errors[`agency_${storeKey}`]}</p>
                              )}
                            </div>
                          )}

                          {/* Specific cost / loading status for this package */}
                          <div className="px-1 text-xs">
                            {isCostLoading && (
                              <div className="text-amber-400 font-semibold flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
                                <span>Calculando costo de envío...</span>
                              </div>
                            )}
                            {hasCostError && (
                              <div className="text-red-400 font-semibold leading-relaxed">
                                {dacShippingError || "No pudimos calcular el costo de envío para este paquete."}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* CI Input for DAC (visible when using DAC on any package) */}
                  {hasAnyDac && (
                    <div id="shipping-ci-block" className="space-y-1.5 mt-5 pt-5 border-t border-white/10">
                      <label className="form-label flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">Cédula de Identidad (CI) *</span>
                        {form.ci && !validateUruguayanCI(form.ci) && (
                          <span className="text-[11px] text-red-400 font-semibold animate-pulse">CI Inválida</span>
                        )}
                        {form.ci && validateUruguayanCI(form.ci) && (
                          <span className="text-[11px] text-green-400 font-semibold">✓ CI Válida</span>
                        )}
                      </label>
                      <input
                        required
                        placeholder="Ej: 1.234.567-8"
                        className={`form-input text-xs transition-all ${
                          form.ci
                            ? validateUruguayanCI(form.ci)
                              ? 'border-green-500/50 focus:border-green-500 bg-green-500/5'
                              : 'border-red-500/50 focus:border-red-500 bg-red-500/5'
                            : 'border-white/10 focus:border-primary-500 bg-white/5'
                        }`}
                        value={form.ci}
                        onChange={e => setForm({ ...form, ci: e.target.value })}
                      />
                      {step2Errors.ci && <p className="text-red-500 text-xs font-semibold">{step2Errors.ci}</p>}
                      <p className="text-[10px] text-slate-500 leading-normal">Requerida para la facturación y despacho de la guía por DAC.</p>
                    </div>
                  )}

                  {/* Address fields — only for delivery */}
                  {hasAnyDelivery && (
                    <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                      <h3 className="font-semibold text-sm text-slate-400 mb-2">
                        {!hasAnyHomeDelivery ? 'Departamento para Retiro' : 'Dirección de entrega'}
                      </h3>

                      {savedAddresses.length > 0 && hasAnyHomeDelivery && (
                        <div className="space-y-2 mb-4">
                          <label className="form-label text-xs">Elegir dirección guardada</label>
                          <div className="grid gap-2">
                            {savedAddresses.map((address: any, index: number) => (
                              <label key={index} className={`flex items-center gap-3 p-3  border-2 cursor-pointer transition-all ${selectedAddress === index ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-white/10'}`}>
                                <input
                                  type="radio"
                                  name="savedAddr"
                                  className="sr-only"
                                  checked={selectedAddress === index}
                                  onChange={() => {
                                    setSelectedAddress(index);
                                    setForm((current) => ({
                                      ...current,
                                      street: address.street || '',
                                      apartment: address.apartment || '',
                                      city: address.city || '',
                                      department: address.department || '',
                                      barrio: address.barrio || '',
                                      reference: address.reference || '',
                                      postal_code: address.postal_code || '',
                                      country: address.country || 'Uruguay',
                                      ci: address.ci || '',
                                    }));
                                  }}
                                />
                                <div className={`p-1.5  ${selectedAddress === index ? 'bg-primary-500/100 text-white' : 'bg-white/10 text-slate-500'}`}>
                                  <Home className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-bold text-sm block">{address.label || `Dirección ${index + 1}`}</span>
                                  <span className="text-xs text-slate-400 block truncate">{address.street}{address.apartment ? `, ${address.apartment}` : ''} - {address.city}, {address.department}</span>
                                </div>
                              </label>
                            ))}
                            <label className={`flex items-center gap-3 p-3  border-2 cursor-pointer transition-all ${selectedAddress === -2 ? 'border-primary-500 bg-primary-500/100/10' : 'border-white/10 border-dashed hover:border-white/10'}`}>
                              <input
                                type="radio"
                                name="savedAddr"
                                className="sr-only"
                                checked={selectedAddress === -2}
                                onChange={() => {
                                  setSelectedAddress(-2);
                                  setForm((current) => ({ ...current, street: '', apartment: '', city: '', department: '', barrio: '', reference: '', postal_code: '' }));
                                }}
                              />
                              <div className={`p-1.5  ${selectedAddress === -2 ? 'bg-primary-500/100 text-white' : 'bg-white/10 text-slate-500'}`}>
                                <Home className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-slate-400">Usar otra dirección</span>
                            </label>
                          </div>
                        </div>
                      )}

                      {(savedAddresses.length === 0 || selectedAddress === -2 || !hasAnyHomeDelivery) && (
                        <>
                          {form.country === 'Argentina' ? (
                            <div className="space-y-4">
                              {/* Tipo de Destinatario */}
                              <div>
                                <label className="form-label text-slate-300 font-bold">Tipo de Destinatario *</label>
                                <div className="grid grid-cols-2 gap-3 mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setForm({ ...form, recipient_type: 'person', dni: '', cuit: '', razon_social: '' })}
                                    className={`py-2.5 px-4 rounded-xl border-2 font-bold text-sm text-center transition-all ${
                                      form.recipient_type === 'person'
                                        ? 'border-primary-500 bg-primary-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                                    }`}
                                  >
                                    Persona Física
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setForm({ ...form, recipient_type: 'company', dni: '', cuit: '', razon_social: '' })}
                                    className={`py-2.5 px-4 rounded-xl border-2 font-bold text-sm text-center transition-all ${
                                      form.recipient_type === 'company'
                                        ? 'border-primary-500 bg-primary-500/10 text-white'
                                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                                    }`}
                                  >
                                    Empresa
                                  </button>
                                </div>
                              </div>

                              {form.recipient_type === 'person' && (
                                <div>
                                  <label className="form-label text-slate-300">DNI (Documento Nacional de Identidad) *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Ej: 12345678"
                                    className={`form-input ${step2Errors.dni ? 'border-red-500' : ''}`}
                                    value={form.dni}
                                    onChange={e => setForm({ ...form, dni: e.target.value.replace(/[^0-9]/g, '') })}
                                  />
                                  {step2Errors.dni && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.dni}</p>}
                                </div>
                              )}

                              {form.recipient_type === 'company' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                    <label className="form-label text-slate-300">CUIT *</label>
                                    <input
                                      type="text"
                                      required
                                      placeholder="11 dígitos (solo números)"
                                      className={`form-input ${step2Errors.cuit ? 'border-red-500' : ''}`}
                                      value={form.cuit}
                                      onChange={e => setForm({ ...form, cuit: e.target.value.replace(/[^0-9]/g, '') })}
                                    />
                                    {step2Errors.cuit && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.cuit}</p>}
                                  </div>
                                  <div>
                                    <label className="form-label text-slate-300">Razón Social *</label>
                                    <input
                                      type="text"
                                      required
                                      placeholder="Nombre de la empresa"
                                      className={`form-input ${step2Errors.razon_social ? 'border-red-500' : ''}`}
                                      value={form.razon_social}
                                      onChange={e => setForm({ ...form, razon_social: e.target.value })}
                                    />
                                    {step2Errors.razon_social && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.razon_social}</p>}
                                  </div>
                                </div>
                              )}

                              <div>
                                <label className="form-label text-slate-300">Teléfono con prefijo internacional *</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="Ej: +5491112345678"
                                  className={`form-input ${step2Errors.phone ? 'border-red-500' : ''}`}
                                  value={form.phone}
                                  onChange={e => setForm({ ...form, phone: e.target.value })}
                                />
                                <p className="text-[10px] text-slate-400 mt-1">Debe comenzar con '+' y el código de país (ej: +54 para Argentina).</p>
                                {step2Errors.phone && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.phone}</p>}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="form-label text-slate-300">Provincia *</label>
                                  <select
                                    required
                                    className={`form-input ${step2Errors.department ? 'border-red-500' : ''}`}
                                    value={form.department}
                                    onChange={e => setForm({ ...form, department: e.target.value })}
                                  >
                                    <option value="">Selecciona una provincia...</option>
                                    {PROVINCIAS_ARGENTINA.map(p => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                  {step2Errors.department && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.department}</p>}
                                </div>
                                <div>
                                  <label className="form-label text-slate-300">Localidad / Ciudad *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Ej: Rosario"
                                    className={`form-input ${step2Errors.city ? 'border-red-500' : ''}`}
                                    value={form.city}
                                    onChange={e => setForm({ ...form, city: e.target.value })}
                                  />
                                  {step2Errors.city && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.city}</p>}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                  <label className="form-label text-slate-300">Calle *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Nombre de la calle"
                                    className={`form-input ${step2Errors.street ? 'border-red-500' : ''}`}
                                    value={form.street}
                                    onChange={e => setForm({ ...form, street: e.target.value })}
                                  />
                                  {step2Errors.street && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.street}</p>}
                                </div>
                                <div>
                                  <label className="form-label text-slate-300">Nro de puerta *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Nro"
                                    className={`form-input ${step2Errors.street_number ? 'border-red-500' : ''}`}
                                    value={form.street_number}
                                    onChange={e => setForm({ ...form, street_number: e.target.value })}
                                  />
                                  {step2Errors.street_number && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.street_number}</p>}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="form-label text-slate-300">Piso / Departamento (Opcional)</label>
                                  <input
                                    type="text"
                                    placeholder="Ej: Piso 4 Depto B"
                                    className="form-input"
                                    value={form.apartment}
                                    onChange={e => setForm({ ...form, apartment: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="form-label text-slate-300">Código Postal (CPA) *</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Ej: C1024CWN o 2000"
                                    className={`form-input ${step2Errors.postal_code ? 'border-red-500' : ''}`}
                                    value={form.postal_code}
                                    onChange={e => setForm({ ...form, postal_code: e.target.value })}
                                  />
                                  {step2Errors.postal_code && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.postal_code}</p>}
                                </div>
                              </div>

                              <div>
                                <label className="form-label text-slate-300">Indicaciones para la entrega (Opcional)</label>
                                <textarea
                                  placeholder="Ej: Tocar timbre negro, casa de rejas verdes..."
                                  className="form-input min-h-[80px]"
                                  value={form.reference}
                                  onChange={e => setForm({ ...form, reference: e.target.value })}
                                />
                              </div>

                              <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-start gap-3 mt-3">
                                <input
                                  type="checkbox"
                                  id="privacy-logistics-consent"
                                  className={`rounded border-white/10 text-primary-500 focus:ring-primary-500 bg-black/20 mt-1 cursor-pointer ${
                                    step2Errors.consent ? 'border-red-500 ring-2 ring-red-500' : ''
                                  }`}
                                  checked={form.consent}
                                  onChange={e => setForm({ ...form, consent: e.target.checked })}
                                />
                                <label htmlFor="privacy-logistics-consent" className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none">
                                  Acepto compartir los datos personales y de contacto proporcionados en este formulario con el operador logístico (MBE y courier internacional) con el único fin de procesar el transporte y la liberación aduanera del paquete.
                                </label>
                              </div>
                              {step2Errors.consent && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.consent}</p>}

                              <div>
                                <label className="form-label text-slate-300">País</label>
                                <select
                                  className="form-input"
                                  value={form.country}
                                  onChange={e => {
                                    const newCountry = e.target.value;
                                    setForm(prev => ({
                                      ...prev,
                                      country: newCountry,
                                      department: newCountry === 'Argentina' ? 'Buenos Aires' : 'Montevideo',
                                      city: newCountry === 'Argentina' ? '' : 'Montevideo',
                                      barrio: '',
                                    }));
                                  }}
                                >
                                  <option value="Uruguay">Uruguay</option>
                                  <option value="Argentina">Argentina</option>
                                </select>
                              </div>
                            </div>
                          ) : (
                            <>
                              {hasAnyHomeDelivery && (
                                <div id="shipping-street">
                                  <label className="form-label">Dirección (calle y número) *</label>
                                  <AddressAutocomplete
                                    value={form.street}
                                    onChange={value => setForm({ ...form, street: value })}
                                    onSelect={handleAddressSelect}
                                  />
                                  {step2Errors.street && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.street}</p>}
                                </div>
                              )}

                              <div className={!hasAnyHomeDelivery ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
                                <div id="shipping-department">
                                  <label className="form-label">Departamento *</label>
                                  <select
                                    required={hasAnyDelivery}
                                    className={`form-input ${step2Errors.department ? 'border-red-500' : ''}`}
                                    value={form.department}
                                    onChange={e => handleDepartmentChange(e.target.value)}
                                  >
                                    <option value="">Selecciona un departamento...</option>
                                    {DEPARTAMENTOS.map((department) => (
                                      <option key={department} value={department}>{department}</option>
                                    ))}
                                  </select>
                                  {step2Errors.department && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.department}</p>}
                                </div>

                                {hasAnyHomeDelivery && (
                                  <div id="shipping-city">
                                    <label className="form-label">Ciudad / Localidad *</label>
                                    {form.department === 'Montevideo' ? (
                                      <input
                                        type="text"
                                        className="form-input opacity-80 cursor-not-allowed"
                                        value="Montevideo"
                                        readOnly
                                      />
                                    ) : (
                                      <select
                                        required={hasAnyDelivery}
                                        className={`form-input ${step2Errors.city ? 'border-red-500' : ''}`}
                                        value={form.city}
                                        onChange={e => setForm({ ...form, city: e.target.value })}
                                        disabled={!form.department}
                                      >
                                        <option value="">Selecciona una localidad...</option>
                                        {form.department && URUGUAY_LOCATIONS[form.department]?.map((location) => (
                                          <option key={location} value={location}>{location}</option>
                                        ))}
                                      </select>
                                    )}
                                    {step2Errors.city && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.city}</p>}
                                  </div>
                                )}
                              </div>

                              {hasAnyHomeDelivery && (
                                <>
                                  <div className="grid grid-cols-1 gap-4">
                                    <div id="shipping-barrio">
                                      <label className="form-label">Barrio {form.department === 'Montevideo' ? '*' : '(Opcional)'}</label>
                                      {form.department === 'Montevideo' ? (
                                        <select
                                          required={hasAnyDelivery}
                                          className={`form-input ${step2Errors.barrio ? 'border-red-500' : ''}`}
                                          value={form.barrio}
                                          onChange={e => setForm({ ...form, barrio: e.target.value })}
                                        >
                                          <option value="">Selecciona un barrio...</option>
                                          {URUGUAY_LOCATIONS['Montevideo']?.map((barrioName) => (
                                            <option key={barrioName} value={barrioName}>{barrioName}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          className="form-input"
                                          placeholder="Ej: Centro, La Floresta, etc."
                                          value={form.barrio}
                                          onChange={e => setForm({ ...form, barrio: e.target.value })}
                                        />
                                      )}
                                      {step2Errors.barrio && <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.barrio}</p>}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="form-label">Apartamento / Timbre</label>
                                      <input
                                        className="form-input"
                                        placeholder="Ej: Apto 302, Timbre 4"
                                        value={form.apartment}
                                        onChange={e => setForm({ ...form, apartment: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="form-label">Referencia / Indicaciones</label>
                                      <input
                                        className="form-input"
                                        placeholder="Ej: Portón de madera, reja negra"
                                        value={form.reference}
                                        onChange={e => setForm({ ...form, reference: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="form-label">Código postal</label>
                                      <input
                                        className="form-input"
                                        placeholder="Ej: 11300"
                                        value={form.postal_code}
                                        onChange={e => setForm({ ...form, postal_code: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="form-label">País</label>
                                      <select
                                        className="form-input"
                                        value={form.country}
                                        onChange={e => {
                                          const newCountry = e.target.value;
                                          setForm(prev => ({
                                            ...prev,
                                            country: newCountry,
                                            department: newCountry === 'Argentina' ? 'Buenos Aires' : 'Montevideo',
                                            city: newCountry === 'Argentina' ? '' : 'Montevideo',
                                            barrio: '',
                                          }));
                                        }}
                                      >
                                        <option value="Uruguay">Uruguay</option>
                                        <option value="Argentina">Argentina</option>
                                      </select>
                                    </div>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {form.department && (
                        <div className="space-y-3 mt-4" id="shipping-calculation-block">
                          {isLocationSelected && logistics.providerName && (
                            <div className="p-4 rounded-xl border border-primary-500/30 bg-primary-500/5 flex items-start gap-3 shadow-lg">
                              <Clock className="w-5 h-5 text-primary-500 shrink-0 mt-0.5 animate-pulse" />
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-primary-400">
                                  Información de entrega ({logistics.providerName})
                                </h4>
                                <p className="text-sm font-semibold text-white mt-1">
                                  {logistics.message}
                                </p>
                              </div>
                            </div>
                          )}

                          {dacCalculationStatus === 'loading' && (
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs text-slate-300">Calculando costo de envío en tiempo real con DAC...</span>
                            </div>
                          )}

                          {dacCalculationStatus === 'error' && dacShippingError && (
                            <div className="p-4 rounded-lg bg-orange-950/20 border border-orange-500/30 space-y-3">
                              <div className="flex items-start gap-2.5">
                                <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5 animate-bounce" />
                                <div className="text-xs text-orange-200 leading-relaxed">
                                  <strong className="block font-bold text-orange-300 mb-0.5">No fue posible calcular el costo automáticamente</strong>
                                  {dacShippingError}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRecalculateTrigger(prev => prev + 1)}
                                  className="flex-1 py-2 px-3 rounded bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                                >
                                  <RefreshCcw className="w-3.5 h-3.5" /> Reintentar cálculo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const productsList = items.map(item => `- ${item.title} x${item.quantity}`).join('%0A');
                                    const waNum = settings['whatsapp'] || '59899000000';
                                    const formattedNum = waNum.replace(/[^0-9]/g, '');
                                    const msg = `¡Hola! Quería realizar una compra desde la web pero no pudimos calcular el costo de envío automáticamente para ${form.city}, ${form.department}.%0A%0A*Productos:*%0A${productsList}%0A%0A*Dirección de envío:*%0A${form.street}%0A%0A¿Me podrían ayudar a coordinarlo?`;
                                    window.open(`https://wa.me/${formattedNum}?text=${msg}`, '_blank');
                                  }}
                                  className="flex-1 py-2 px-3 rounded bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                                >
                                  Coordinar por WhatsApp
                                </button>
                              </div>
                            </div>
                          )}

                          {step2Errors.calculation && (
                            <p className="text-red-500 text-xs mt-1 font-semibold">{step2Errors.calculation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2 Nav */}
                <div className="space-y-4">
                  {Object.keys(step2Errors).length > 0 && (
                    <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-lg space-y-1.5 animate-pulse">
                      <p className="text-red-400 text-xs font-bold uppercase tracking-wider">No se puede continuar:</p>
                      {Object.entries(step2Errors).map(([field, msg]) => (
                        <p key={field} className="text-red-300 text-xs">• {msg}</p>
                      ))}
                    </div>
                  )}

                  <div className="checkout-nav">
                    <button type="button" onClick={goBack} className="checkout-btn-back">
                      <ChevronLeft className="w-4 h-4" /> Volver
                    </button>
                    <button type="button" onClick={goNext} className="checkout-btn-next">
                      Continuar <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 3: FORMA DE PAGO                                      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div className="checkout-step-content" key="step-3">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 shadow-xl">
                  <CheckoutSectionHeader
                    title="Elegí cómo querés pagar"
                    subtitle="Seleccioná tu pasarela o método de pago preferido para confirmar la compra."
                  />
                  <div className="space-y-3">
                    {mercadopagoEnabled && (
                      <PaymentMethodCard
                        id="mercadopago"
                        title="Mercado Pago"
                        description="Pagá de forma segura con tarjetas de crédito, débito o dinero en cuenta."
                        badge="RECOMENDADO"
                        isSelected={paymentMethod === 'mercadopago'}
                        onSelect={() => setPaymentMethod('mercadopago')}
                      />
                    )}
                    {dlocalgoEnabled && (
                      <PaymentMethodCard
                        id="dlocalgo"
                        title="Tarjetas y Redes de Cobranza (dLocal)"
                        description="OCA, Visa, Mastercard, Diners, Lider, Abitab y Redpagos."
                        isSelected={paymentMethod === 'dlocalgo'}
                        onSelect={() => setPaymentMethod('dlocalgo')}
                      />
                    )}
                    {paypalEnabled && (
                      <PaymentMethodCard
                        id="paypal"
                        title="PayPal"
                        description="Pago internacional rápido y seguro en USD."
                        isSelected={paymentMethod === 'paypal'}
                        onSelect={() => setPaymentMethod('paypal')}
                      />
                    )}
                    {handyEnabled && (
                      <PaymentMethodCard
                        id="handy"
                        title="Handy Pago Directo"
                        description="Pago con tarjetas locales y redes de cobranza."
                        isSelected={paymentMethod === 'handy'}
                        onSelect={() => setPaymentMethod('handy')}
                      />
                    )}
                  </div>
                </div>

                {/* Bank promotions (relocated here under payment options) */}
                {(paymentMethod === 'dlocalgo' || paymentMethod === 'mercadopago') && bankPromos.length > 0 && (
                  <div className="glass p-6 mt-6">
                    <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Promociones bancarias
                    </h2>
                    <p className="text-xs text-slate-400 mb-4">Seleccioná tu tarjeta para aplicar el descuento automáticamente.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {bankPromos.map((promo) => {
                        const colors = CARD_COLORS[promo.bank_name] || { bg: '#6B7280', text: '#fff' };
                        const isSelected = selectedPromo?.id === promo.id;
                        const meetsMinimum = subtotalWithShipping >= (promo.min_purchase || 0);
                        let promoDiscount = 0;
                        if (meetsMinimum) {
                          promoDiscount = Math.round(subtotalWithShipping * promo.discount_value / 100);
                          if (promo.max_discount > 0) promoDiscount = Math.min(promoDiscount, promo.max_discount);
                        }

                        return (
                          <button
                            key={promo.id}
                            type="button"
                            onClick={() => setSelectedPromo(isSelected ? null : promo)}
                            disabled={!meetsMinimum}
                            className={`relative text-left p-4  border-2 transition-all duration-200 ${isSelected ? 'border-green-500 bg-green-50/50 shadow-lg shadow-green-100 ring-2 ring-green-200' : !meetsMinimum ? 'border-white/10 bg-white/5/30 opacity-50 cursor-not-allowed' : 'border-white/10 hover:border-white/10 hover:shadow-sm cursor-pointer'}`}
                          >
                            {isSelected && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md z-10">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                            )}
                            <div className="flex items-start gap-3">
                              <div className="w-11 h-11  flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm" style={{ backgroundColor: colors.bg, color: colors.text }}>
                                {promo.bank_name.substring(0, 3).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-bold text-white text-sm">{promo.bank_name}</span>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 " style={{ backgroundColor: `${colors.bg}15`, color: colors.bg }}>
                                    {promo.discount_value}% OFF
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 leading-snug">{promo.promo_label || `${promo.discount_value}% OFF pagando con ${promo.bank_name}`}</p>
                                {meetsMinimum ? (
                                  <p className="text-xs font-bold text-green-600 mt-1.5">Ahorras {formatCurrencyPrice(promoDiscount)}</p>
                                ) : (
                                  <p className="text-[10px] text-slate-500 mt-1.5">Mínimo {formatCurrencyPrice(promo.min_purchase)} para aplicar</p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedPromo && (
                      <div className="mt-4 flex items-center justify-between bg-green-50 border border-green-200  px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-bold text-green-700">Promo {selectedPromo.bank_name} aplicada: -{selectedPromo.discount_value}% {bankDiscount > 0 && <span className="ml-1 text-green-600">(-{formatCurrencyPrice(bankDiscount)})</span>}</span>
                        </div>
                        <button type="button" onClick={() => setSelectedPromo(null)} className="p-1 hover:bg-green-100 rounded-full transition-colors">
                          <X className="w-4 h-4 text-green-500" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Código de referido */}
                <div className="glass p-6 mt-6">
                  <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-primary-500" />
                    Código de referido
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">Si fuiste referido por un afiliado, ingresá su código aquí.</p>
                  <div>
                    <input className="form-input max-w-md" placeholder="Se completa automáticamente si llegaste desde un afiliado" value={affiliateCode} onChange={e => setAffiliateCode(e.target.value)} />
                  </div>
                </div>

                {/* Step 3 Nav */}
                <div className="checkout-nav mt-6">
                  <button type="button" onClick={goBack} className="checkout-btn-back">
                    <ChevronLeft className="w-4 h-4" /> Volver
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* SIDEBAR: ORDER SUMMARY (always visible)                   */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <div>
            <div className="glass p-4 sm:p-6 sticky top-24">
              <button
                type="button"
                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                className="w-full flex justify-between items-center text-left lg:pointer-events-none"
              >
                <div>
                  <h2 className="font-bold text-lg text-white">Resumen de orden</h2>
                  <p className="text-xs text-slate-400 lg:hidden mt-0.5">
                    {items.length} {items.length === 1 ? 'producto' : 'productos'} · <span className="text-[#f00856] font-black">{formatCurrencyPrice(grandTotal)}</span>
                  </p>
                </div>
                <div className="lg:hidden flex items-center gap-1.5 text-xs font-bold text-[#f00856]">
                  <span>{isSummaryExpanded ? 'Ocultar' : 'Ver detalle'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isSummaryExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <div className={`mt-6 lg:block ${isSummaryExpanded ? 'block animate-fade-in' : 'hidden'}`}>
                <div className="space-y-4 mb-6">
                  {Object.entries(
                    items.reduce((acc: Record<string, { name: string; items: any[] }>, item: any) => {
                      const storeKey = getStoreKey(item);
                      const storeName = item.vendor_name || (storeKey === 'collectibles' ? 'Collectibles.uy' : 'Vendedor');
                      if (!acc[storeKey]) {
                        acc[storeKey] = { name: storeName, items: [] };
                      }
                      acc[storeKey].items.push(item);
                      return acc;
                    }, {})
                  ).map(([storeKey, group]) => {
                    // Calculate vendor group shipping cost dynamically
                    const groupShippingCost = vendorShippingCosts[storeKey] ?? 0;

                    const v = vendorsData[storeKey];
                    const hasSD = isMontevideo && v && v.shipping_settings?.soydelivery?.active && globalProviders['soydelivery'] && isSoyDeliveryAvailableForVendor(
                      v.default_address, 
                      { department: form.department, city: resolvedCityForShipping }
                    ).available;
                    
                    let providerLabel = 'DAC';
                    if (hasSD) {
                      providerLabel = 'Soy Delivery';
                    } else {
                      const isDacActive = v?.shipping_settings?.dac?.active && globalProviders['dac'];
                      const isUesActive = v?.shipping_settings?.ues?.active && globalProviders['ues'];
                      const isCorreoActive = v?.shipping_settings?.correo_uruguayo?.active && globalProviders['correo_uruguayo'];
                      const isManualActive = v?.shipping_settings?.manual?.active;

                      if (isDacActive) {
                        providerLabel = 'DAC';
                      } else if (isUesActive) {
                        providerLabel = 'UES';
                      } else if (isCorreoActive) {
                        providerLabel = 'Correo Uruguayo';
                      } else if (isManualActive) {
                        providerLabel = 'Envío manual';
                      } else {
                        providerLabel = 'Sin método disponible';
                      }
                    }

                    const storeBadges = group.items[0]?.vendor_store_badges || [];
                    const groupTotal = group.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
                    const options = getVendorShippingOptions(storeKey, groupTotal);
                    const availableOptions = options.filter(o => o.available);
                    const unavailableOptions = options.filter(o => !o.available && o.show);

                    const sel = subordersShipping[storeKey] || { method: 'pickup', selectedAgency: null };
                    const assignedMethod = options.find(o => o.id === sel.method);

                    return (
                      <div key={storeKey} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase text-[#f00856] tracking-wider">{group.name}</span>
                            {storeBadges && storeBadges.length > 0 && (
                              <div className="flex items-center gap-1">
                                {storeBadges.map((b: any) => (
                                  <span key={b.id || b.badge_key} className={`text-[8px] px-1 font-semibold leading-none uppercase rounded ${b.color_class || 'bg-blue-600 text-white'}`} title={b.description}>
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isLocationSelected && form.department && (
                            <span className="text-[10px] font-bold text-slate-400">
                              {sel.method === 'pickup' 
                                ? 'Retiro en local: GRATIS'
                                : `Envío (${providerLabel}): ${groupShippingCost === 0 ? 'GRATIS' : formatCurrencyPrice(groupShippingCost)}`
                              }
                            </span>
                          )}
                        </div>
                        <div className="space-y-2.5">
                          {group.items.map((item) => {
                            const itemDiscount = evaluateItemDiscount(item as any, promotions);
                            const displayPrice = (item.price * item.quantity) - itemDiscount;

                            return (
                              <div key={item.variant_id} className="flex items-center gap-2.5 justify-between animate-fade-in">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <img
                                    src={resolveImage(item.image) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23f3f4f6" width="48" height="48" rx="8"/></svg>'}
                                    alt=""
                                    className="w-10 h-10 object-contain bg-white/5 p-0.5 rounded-lg shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-white line-clamp-1 leading-snug" title={item.title}>
                                      {item.title}
                                    </p>
                                    {item.variant_name && (
                                      <p className="text-[10px] text-slate-500 truncate leading-none mt-1">{item.variant_name}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="flex items-center border border-white/10 rounded bg-white/5 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(item.variant_id, item.vendor_id, item.quantity - 1)}
                                      className="p-1 px-1.5 hover:bg-white/5 text-slate-400 hover:text-white transition-colors border-r border-white/10"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="px-2 text-[10px] font-bold text-white min-w-[14px] text-center">
                                      {item.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(item.variant_id, item.vendor_id, item.quantity + 1)}
                                      className="p-1 px-1.5 hover:bg-white/5 text-slate-400 hover:text-white transition-colors border-l border-white/10"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-xs font-bold text-white whitespace-nowrap">
                                      {formatCurrencyPrice(displayPrice)}
                                    </span>
                                    {itemDiscount > 0 && (
                                      <span className="text-[10px] text-slate-500 line-through whitespace-nowrap">
                                        {formatCurrencyPrice(item.price * item.quantity)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        trackGA4Event('remove_from_cart', {
                                          currency: 'UYU',
                                          value: Number(item.price) * Number(item.quantity),
                                          items: [{
                                            item_id: String(item.product_id || item.id || ''),
                                            item_name: String(item.product_name || item.title || ''),
                                            item_brand: item.brand_name || item.brand || undefined,
                                            item_category: item.category_name || item.category || undefined,
                                            item_variant: item.variant_name || item.variant || undefined,
                                            price: Number(item.price),
                                            quantity: Number(item.quantity)
                                          }]
                                        });
                                        removeItem(item.variant_id, item.vendor_id);
                                      }}
                                      className="text-slate-500 hover:text-red-500 transition-colors p-1"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Shipping Info for Package */}
                        {isLocationSelected && (
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-xs">
                            {assignedMethod ? (
                              <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  {assignedMethod.name}
                                </div>
                                {assignedMethod.id === 'pickup' && (
                                  <p className="text-slate-400 mt-1">
                                    Dirección: {v?.shipping_settings?.pickup?.address || v?.default_address?.address || 'No configurada'}
                                    {v?.shipping_settings?.pickup?.hours && ` (${v.shipping_settings.pickup.hours})`}
                                  </p>
                                )}
                                {assignedMethod.id === 'manual' && assignedMethod.reason && (
                                  <p className="text-slate-400 mt-1">{assignedMethod.reason}</p>
                                )}
                              </div>
                            ) : (
                              <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20 text-red-400 font-semibold flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                                No hay método de envío disponible
                              </div>
                            )}

                            {/* Collapsible Unavailable Methods */}
                            {unavailableOptions.length > 0 && (
                              <details className="group mt-2">
                                <summary className="text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer select-none font-bold uppercase tracking-wider flex items-center gap-1">
                                  <span>Otros métodos no disponibles ({unavailableOptions.length})</span>
                                </summary>
                                <ul className="mt-1.5 space-y-1 pl-2 border-l border-white/5">
                                  {unavailableOptions.map(opt => (
                                    <li key={opt.id} className="text-[10px] text-slate-500 flex items-start gap-1">
                                      <span className="font-semibold text-slate-400">{opt.name}:</span>
                                      <span>{opt.reason}</span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <ShipmentSummary
                items={items}
                uniqueStoreKeys={uniqueStoreKeys}
                getVendorName={getVendorName}
                subordersShipping={subordersShipping}
                vendorShippingCosts={vendorShippingCosts}
                subtotal={subtotal}
                shippingTotal={shipping}
                shippingSavings={Object.values(subordersShipping).some(s => s.method === 'pickup') ? 220 : 0}
                couponDiscount={couponDiscount}
                autoDiscount={autoDiscountAmount}
                finalTotal={grandTotal}
                formatCurrencyPrice={formatCurrencyPrice}
                activeCoupon={activeCoupon}
                onRemoveCoupon={handleRemoveCoupon}
              />
              
              {/* Sección de Cupón de Descuento */}
              <div className="border-t border-white/10 pt-4 mt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  ¿Tenés un cupón de descuento?
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      className="form-input pl-9 py-2 text-sm uppercase"
                      placeholder="Ingresá tu cupón"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      disabled={!!couponCode}
                    />
                  </div>
                  {couponCode ? (
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="px-4 py-2 text-sm font-semibold border-2 border-red-500/30 hover:border-red-500/50 bg-red-950/20 text-red-400 hover:text-red-300 transition-all duration-200"
                    >
                      Quitar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading}
                      className="px-4 py-2 text-sm font-semibold btn-primary shrink-0 transition-all duration-200"
                    >
                      {couponLoading ? 'Aplicando...' : 'Aplicar'}
                    </button>
                  )}
                </div>
                {couponError && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {couponError}
                  </p>
                )}
                {couponSuccess && (
                  <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {couponSuccess}
                  </p>
                )}
              </div>
              {checkoutError && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 text-xs text-red-400 rounded-lg flex items-start justify-between">
                  <span className="flex-1 pr-2">{checkoutError}</span>
                  <button type="button" onClick={() => setCheckoutError('')} className="text-red-400 hover:text-red-300 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Submit button — only visible on step 3 */}
              {currentStep === 3 && (
                <>
                  <div className="mt-6 p-4 rounded-xl border border-white/5 bg-white/[0.01] flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="terms-checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-white/10 bg-white/5 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 focus:ring-1 cursor-pointer shrink-0"
                    />
                    <label htmlFor="terms-checkbox" className="text-xs text-slate-300 cursor-pointer select-none leading-relaxed">
                      He leído y acepto los{" "}
                      <a
                        href="https://collectibles-ecommerce.vercel.app/page/terminos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300 underline font-semibold transition-colors"
                      >
                        Términos y Condiciones
                      </a>
                      , incluyendo las condiciones de compra y preventa.
                    </label>
                  </div>

                  {!termsAccepted && (
                    <p className="text-[11px] text-orange-400 font-semibold mt-2">• Debes aceptar los Términos y Condiciones para continuar al pago.</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || isPaymentBlocked() || !termsAccepted || ((selectedShippingMethod === 'dac' || selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency') && dacShippingLoading)}
                    className={`btn-primary w-full mt-4 py-3.5 text-base ${(isSubmitting || isPaymentBlocked() || !termsAccepted || ((selectedShippingMethod === 'dac' || selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency') && dacShippingLoading)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? 'Procesando...' : 'Finalizar compra'}
                  </button>

                  {/* Blocking reason alerts */}
                  {(selectedShippingMethod === 'dac' || selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency') && (
                    <div className="mt-3 space-y-1">
                      {!form.phone && <p className="text-[11px] text-orange-400 font-semibold">• Se requiere Teléfono para despacho por DAC.</p>}
                      {selectedShippingMethod !== 'dac_agency' && !form.street && <p className="text-[11px] text-orange-400 font-semibold">• Se requiere Dirección para despacho por DAC.</p>}
                      {!form.department && <p className="text-[11px] text-orange-400 font-semibold">• Se requiere Departamento.</p>}
                      {selectedShippingMethod !== 'dac_agency' && !form.city && <p className="text-[11px] text-orange-400 font-semibold">• Se requiere Localidad.</p>}
                      {selectedShippingMethod === 'dac_agency' && !selectedAgency && <p className="text-[11px] text-orange-400 font-semibold">• Seleccioná una agencia DAC para retiro.</p>}
                      {!form.ci && <p className="text-[11px] text-orange-400 font-semibold">• Se requiere Cédula de Identidad (CI) para despacho por DAC.</p>}
                      {form.ci && !validateUruguayanCI(form.ci) && <p className="text-[11px] text-red-400 font-semibold">• Cédula de Identidad (CI) inválida.</p>}
                      {dacShippingError && <p className="text-[11px] text-red-400 font-semibold">• Error en cálculo de envío DAC. Por favor use WhatsApp.</p>}
                      {dacShippingCost === null && !dacShippingError && !dacShippingLoading && (
                        <p className="text-[11px] text-orange-400 font-semibold">• Esperando cálculo de envío de DAC...</p>
                      )}
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          </div>
      </form>

      {showPaymentMethodsModal && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6" 
          onClick={() => setShowPaymentMethodsModal(false)}
        >
          <div 
            className="relative max-w-md w-full max-h-[80vh] bg-transparent rounded-xl flex items-center justify-center" 
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3 right-3 text-white/90 hover:text-white bg-black/60 hover:bg-black/80 p-2 rounded-full transition-colors z-20 shadow-lg animate-pulse-subtle"
              onClick={() => setShowPaymentMethodsModal(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src="/logos/Tarjetas.jpg"
              alt="Medios de pago aceptados"
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
