import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronDown, Truck, Store, Tag, Sparkles, X, Home, Ticket, Share2, Clock, AlertCircle, MapPin, Building2, Search, Check, Trash2, Plus, Minus } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { analytics } from '../lib/analytics';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { createCheckoutOrder, getPublicPaymentProviders, startCheckoutPayment, type PublicPaymentProvider } from '../lib/payments';
import { URUGUAY_LOCATIONS, DEPARTAMENTOS, calculateShipping } from '../utils/uruguayLocations';
import { getProductImage, resolveImage } from '../lib/imageUtils';
import { usePromotions, evaluateItemDiscountDetailed } from '../hooks/usePromotions';
import { generateMetaEventId, trackInitiateCheckout, trackAddPaymentInfo } from '../lib/meta/metaPixel';

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
  const { formatCurrencyPrice, selectedCurrency } = useCurrency();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const initiateCheckoutTrackedRef = useRef(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'dlocalgo' | 'paypal' | 'handy'>('mercadopago');
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
  const submitLockRef = useRef(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
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
  });

  const [dacShippingCost, setDacShippingCost] = useState<number | null>(null);
  const [dacShippingLoading, setDacShippingLoading] = useState(false);
  const [dacShippingError, setDacShippingError] = useState<string | null>(null);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<'delivery' | 'pickup' | 'dac' | 'dac_home' | 'dac_agency'>('delivery');
  const [detectedKOficina, setDetectedKOficina] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [finalTotal, setFinalTotal] = useState(0);

  // DAC Multimodal state
  const [dacDeliveryMode, setDacDeliveryMode] = useState<'dac_home' | 'dac_agency'>('dac_home');
  const [dacAgencies, setDacAgencies] = useState<any[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<any | null>(null);
  const [agencySearchTerm, setAgencySearchTerm] = useState('');

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
    console.log("[Checkout Debug] Department elegido:", form.department);
  }, [form.department]);

  // Debug log for shipping method
  useEffect(() => {
    console.log("[Checkout Debug] Shipping method detectado (selectedShippingMethod):", selectedShippingMethod);
  }, [selectedShippingMethod]);

  // Reset DAC cost/error when changing delivery mode or shipping method
  useEffect(() => {
    setDacShippingCost(null);
    setDacShippingError(null);
    setDetectedKOficina(null);
  }, [dacDeliveryMode, selectedShippingMethod]);

  useEffect(() => {
    const isMontevideo = form.department === 'Montevideo';
    
    if (shippingMethod !== 'delivery' || isMontevideo || !form.department) {
      setDacShippingCost(null);
      setDacShippingError(null);
      setDetectedKOficina(null);
      return;
    }

    // For agency mode, need selected agency; for home mode, need city
    if (dacDeliveryMode === 'dac_agency' && !selectedAgency) {
      setDacShippingCost(null);
      setDacShippingError(null);
      setDetectedKOficina(null);
      return;
    }
    if (dacDeliveryMode === 'dac_home' && !form.city) {
      setDacShippingCost(null);
      setDacShippingError(null);
      setDetectedKOficina(null);
      return;
    }

    // Even with free shipping, we still need to resolve the office code
    // for shipment creation. The cost will be overridden to $0 below.
    const isFreeShipping = total >= freeShippingThreshold;

    let active = true;
    async function fetchDacCost() {
      setDacShippingLoading(true);
      setDacShippingError(null);
      try {
        const bodyPayload: any = {
          mode: dacDeliveryMode === 'dac_agency' ? 'agency' : 'home',
          department: form.department,
          city: dacDeliveryMode === 'dac_agency' ? (selectedAgency?.city || form.city || selectedAgency?.office_name) : form.city,
          locality: dacDeliveryMode === 'dac_agency' ? (selectedAgency?.locality || form.barrio || "") : (form.barrio || ""),
          phone: form.phone,
          package_quantity: 1,
          package_type: 1,
          cart_total: total,
          items: items.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id || "",
            quantity: item.quantity,
            price: item.price,
            title: item.title
          }))
        };

        if (dacDeliveryMode === 'dac_agency' && selectedAgency) {
          bodyPayload.dac_office_id = selectedAgency.id;
          bodyPayload.k_oficina_destino = selectedAgency.k_oficina;
          bodyPayload.address = selectedAgency.address || selectedAgency.office_name;
        } else {
          bodyPayload.address = form.street;
        }

        console.log("[Checkout Debug] Llamado a dac-get-cost con payload:", bodyPayload);

        const { data, error } = await supabase.functions.invoke('dac-get-cost', {
          body: bodyPayload
        });

        if (!active) return;

        if (error) throw error;

        console.log("[Checkout Debug] Respuesta dac-get-cost:", data);

        if (data && data.success) {
          // If free shipping applies, override cost to 0 but keep the office code
          setDacShippingCost(isFreeShipping ? 0 : data.cost);
          setDetectedKOficina(data.raw_response?.k_oficina || data.finalKOficina || null);
        } else {
          throw new Error(data?.error || "Error al calcular costo DAC.");
        }
      } catch (err: any) {
        console.error("Error fetching DAC cost:", err);
        if (active) {
          setDacShippingError(err.message || "No pudimos calcular el costo DAC para esta localidad.");
          setDacShippingCost(null);
          setDetectedKOficina(null);
        }
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
    total
  ]);

  const resolvedCityForShipping = form.department === 'Montevideo' ? form.barrio : form.city;
  const isMontevideo = form.department === 'Montevideo';

  const isLocationSelected = 
    shippingMethod === 'pickup' || 
    (shippingMethod === 'delivery' && (
      (isMontevideo && form.barrio !== '') || 
      (!isMontevideo && dacShippingCost !== null)
    ));
  
  let shipping = 0;
  if (shippingMethod === 'delivery') {
    if (isMontevideo) {
      if (form.barrio !== '') {
        shipping = calculateShipping(resolvedCityForShipping, form.department, total, freeShippingThreshold);
      } else {
        shipping = 0;
      }
    } else {
      if (dacShippingCost !== null) {
        shipping = dacShippingCost;
      } else {
        shipping = 0;
      }
    }
  }

  // Debug log for shipping cost final
  useEffect(() => {
    console.log("[Checkout Debug] Shipping cost final:", shipping);
  }, [shipping]);

  const subtotalWithShipping = total - autoDiscountAmount + shipping;

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

  const getLogisticsDetails = () => {
    if (shippingMethod === 'pickup') {
      return {
        providerName: null,
        message: 'Retirá tu pedido gratis en nuestro local',
        assignedProvider: null
      };
    }

    const isMontevideo = form.department === 'Montevideo';
    const provider = isMontevideo ? 'soy_delivery' : 'dac';
    const providerLabel = isMontevideo ? 'Soy Delivery' : 'DAC';

    const { hour: curHour, minute: curMin, dayOfWeek } = getUruguayDateTime();

    if (provider === 'soy_delivery') {
      const cutoffTime = settings['shipping_soydelivery_cutoff_time'] || '15:00';
      const cutoff = parseTimeStr(cutoffTime);
      const isBefore = curHour < cutoff.hour || (curHour === cutoff.hour && curMin < cutoff.minute);

      // Mon-Sat: 1 to 6
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        if (isBefore) {
          return {
            providerName: providerLabel,
            message: `Recibilo hoy mismo comprando antes de las ${cutoffTime}`,
            assignedProvider: 'soy_delivery'
          };
        } else {
          return {
            providerName: providerLabel,
            message: 'Recibilo mañana mismo en tu domicilio',
            assignedProvider: 'soy_delivery'
          };
        }
      } else {
        // Sunday: 0
        return {
          providerName: providerLabel,
          message: 'Recibilo mañana lunes en tu domicilio',
          assignedProvider: 'soy_delivery'
        };
      }
    } else {
      // DAC
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

  const logistics = getLogisticsDetails();

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
    const baseForCoupon = Math.max(total - autoDiscountAmount, 0);
    couponDiscount = activeCoupon.discount_type === 'percentage'
      ? Math.round(baseForCoupon * Number(activeCoupon.discount_value) / 100)
      : Number(activeCoupon.discount_value);
  }

  const grandTotal = Math.max(subtotalWithShipping - bankDiscount - couponDiscount, 0);

  // Synchronize finalTotal and log it
  useEffect(() => {
    setFinalTotal(grandTotal);
  }, [grandTotal]);

  useEffect(() => {
    console.log("[Checkout Debug] Total final enviado a pago (finalTotal):", finalTotal);
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
    }

    loadProfile();
  }, [user]);

  useEffect(() => {
    if (items.length === 0) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
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
    
    addItem({
      product_id: p.id,
      variant_id: variant.id,
      quantity: 1,
      title: p.title,
      price: p.base_price + (variant.price_adjustment || 0),
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
        console.log("payment providers:", providers);
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
      setCheckoutError("Error en el pago: " + (err.message || String(err)));
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }

  const isPaymentBlocked = () => {
    if (selectedShippingMethod === 'dac' || selectedShippingMethod === 'dac_home') {
      if (dacShippingCost === null) return true;
      if (dacShippingError !== null) return true;
      if (!form.department || !form.city || !form.street || !form.phone) return true;
      if (!form.ci || !validateUruguayanCI(form.ci)) return true;
    }
    if (selectedShippingMethod === 'dac_agency') {
      if (dacShippingCost === null) return true;
      if (dacShippingError !== null) return true;
      if (!form.department || !form.phone) return true;
      if (!selectedAgency) return true;
      if (!form.ci || !validateUruguayanCI(form.ci)) return true;
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

    submitLockRef.current = true;
    setIsSubmitting(true);
    setCheckoutError('');

    try {
      const order = await createCheckoutOrder({
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price: item.price,
          title: item.title,
        })),
        coupon_code: couponCode.trim() || undefined,
        affiliate_code: affiliateCode.trim() || undefined,
        payment_method: paymentMethod,
        currency: 'UYU',
        shipping_method: selectedShippingMethod,
        shipping_address: {
          first_name: form.first_name,
          last_name: form.last_name,
          street: selectedShippingMethod === 'pickup' ? 'Retiro en local' : (selectedShippingMethod === 'dac_agency' ? (selectedAgency?.address || selectedAgency?.office_name || 'Retiro en agencia DAC') : form.street),
          apartment: form.apartment || undefined,
          city: selectedShippingMethod === 'pickup' ? 'Montevideo' : form.city,
          department: selectedShippingMethod === 'pickup' ? 'Montevideo' : form.department,
          postal_code: form.postal_code || undefined,
          country: form.country,
          barrio: selectedShippingMethod === 'pickup' ? undefined : form.barrio,
          reference: selectedShippingMethod === 'pickup' ? undefined : form.reference,
          ci: (selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency') ? form.ci : undefined,
          ...(selectedShippingMethod === 'dac_home' || selectedShippingMethod === 'dac_agency' ? {
            dac_delivery_mode: dacDeliveryMode,
            shipping_provider: 'DAC',
            shipping_method: selectedShippingMethod,
          } : {}),
          ...(selectedShippingMethod === 'dac_agency' && selectedAgency ? {
            dac_office_id: selectedAgency.id,
            dac_k_oficina_destino: selectedAgency.k_oficina,
            dac_office_name: selectedAgency.office_name,
            dac_office_address: selectedAgency.address || selectedAgency.office_name,
          } : {}),
        },
        customer_email: form.email,
        customer_phone: form.phone || undefined,
        bank_promo: selectedPromo ? { promo_id: selectedPromo.id } : undefined,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        accepted_terms_version: "2026-05-27",
      });

      console.log("create-order success:", order);

      const orderId = order?.id;
      const epm = String(order?.payment_method || paymentMethod || "").toLowerCase().trim();
      const email = form.email;

      console.log("create-order launching payment flow:", orderId, epm, email);

      if (!orderId) {
        throw new Error("La orden no devolvió ID");
      }

      if (!epm) {
        throw new Error("La orden no devolvió método de pago");
      }

      await processPaymentFlow(orderId, epm, email);

      console.log("create-order processPaymentFlow returned without redirect");
    } catch (err: any) {
      console.error("create-order handlePlaceOrder error:", err);
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

  const canAdvanceStep = (step: number): boolean => {
    if (step === 1) {
      return !!(form.email && form.first_name && form.last_name);
    }
    if (step === 2) {
      if (shippingMethod === 'pickup') return true;
      if (shippingMethod === 'delivery') {
        if (isMontevideo) return !!(form.street && form.department && form.barrio);
        return !!(form.street && form.department && form.city);
      }
    }
    return true;
  };

  const goNext = () => {
    if (currentStep < 3 && canAdvanceStep(currentStep)) {
      setCurrentStep(currentStep + 1);
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
      <div className="checkout-stepper">
        {CHECKOUT_STEPS.map((step, idx) => (
          <div key={step.id} className="checkout-step">
            <div
              className={`checkout-step ${
                currentStep === step.id ? 'checkout-step--active' :
                currentStep > step.id ? 'checkout-step--completed' : ''
              }`}
              style={{ cursor: currentStep > step.id ? 'pointer' : 'default' }}
              onClick={() => { if (currentStep > step.id) setCurrentStep(step.id); }}
            >
              <div className="checkout-step-circle">
                {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span className="checkout-step-label">{step.label}</span>
            </div>
            {idx < CHECKOUT_STEPS.length - 1 && (
              <div className={`checkout-step-line ${currentStep > step.id ? 'checkout-step-line--completed' : ''}`} />
            )}
          </div>
        ))}
      </div>

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
                <div className="glass p-6">
                  <h2 className="font-bold text-lg mb-1">Datos de facturación</h2>
                  <p className="text-xs text-slate-400 mb-6">Completá tus datos personales para continuar.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Correo electrónico *</label>
                      <input type="email" required className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="form-label">Nombre *</label><input required className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                      <div><label className="form-label">Apellido *</label><input required className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                    </div>
                    <div><label className="form-label">Teléfono</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>

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
                <div className="glass p-6">
                  <h2 className="font-bold text-lg mb-1">Datos de envío</h2>
                  <p className="text-xs text-slate-400 mb-6">Elegí cómo querés recibir tu pedido.</p>

                  {/* Shipping method selection */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {form.department === 'Montevideo' ? (
                      <label className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all ${shippingMethod === 'delivery' ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-white/10 bg-white/5'}`}>
                        <input type="radio" checked={shippingMethod === 'delivery'} onChange={() => setShippingMethod('delivery')} className="sr-only" />
                        <div className={`p-2 ${shippingMethod === 'delivery' ? 'bg-primary-500/100 text-white' : 'glass text-slate-400 shadow-sm'}`}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-white">Envío a domicilio</div>
                          <div className="text-sm text-slate-400 mt-1">Recibilo en tu puerta</div>
                        </div>
                      </label>
                    ) : (
                      <label className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all ${shippingMethod === 'delivery' ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-white/10 bg-white/5'}`}>
                        <input type="radio" checked={shippingMethod === 'delivery'} onChange={() => setShippingMethod('delivery')} className="sr-only" />
                        <div className={`p-2 ${shippingMethod === 'delivery' ? 'bg-primary-500/100 text-white' : 'glass text-slate-400 shadow-sm'}`}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-white">Envío por DAC al interior</div>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            Elegí cómo querés recibir tu pedido por DAC.
                          </p>
                        </div>
                      </label>
                    )}
                    <label className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all ${shippingMethod === 'pickup' ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-white/10 bg-white/5'}`}>
                      <input type="radio" checked={shippingMethod === 'pickup'} onChange={() => setShippingMethod('pickup')} className="sr-only" />
                      <div className={`p-2 ${shippingMethod === 'pickup' ? 'bg-primary-500/100 text-white' : 'glass text-slate-400 shadow-sm'}`}>
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Retiro en local</div>
                        <div className="text-sm text-green-600 font-medium mt-1">GRATIS</div>
                      </div>
                    </label>
                  </div>

                  {/* DAC Multimodal Selection — only when delivery is selected and NOT Montevideo */}
                  {form.department !== 'Montevideo' && shippingMethod === 'delivery' && (
                    <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                      <div className="px-1">
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Elegí cómo querés recibir por DAC</p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Card A: Home Delivery */}
                          <button
                            type="button"
                            onClick={() => { setDacDeliveryMode('dac_home'); setSelectedAgency(null); }}
                            className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                              dacDeliveryMode === 'dac_home'
                                ? 'border-primary-500 bg-primary-500/10 shadow-lg shadow-primary-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className={`p-1.5 rounded-lg ${dacDeliveryMode === 'dac_home' ? 'bg-primary-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                                <Truck className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-white">Entrega en domicilio</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              DAC entrega el pedido en la dirección que ingresaste.
                            </p>
                          </button>

                          {/* Card B: Agency Pickup */}
                          <button
                            type="button"
                            onClick={() => setDacDeliveryMode('dac_agency')}
                            className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                              dacDeliveryMode === 'dac_agency'
                                ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className={`p-1.5 rounded-lg ${dacDeliveryMode === 'dac_agency' ? 'bg-amber-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                                <Building2 className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-white">Retiro en agencia DAC</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Enviamos tu pedido a una agencia DAC y lo retirás allí con tu documento.
                            </p>
                          </button>
                        </div>
                      </div>

                      {/* Agency Selector (visible only in agency mode) */}
                      {dacDeliveryMode === 'dac_agency' && (
                        <div className="px-1 space-y-3">
                          <label className="form-label text-xs flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-500" />
                            Seleccioná una agencia DAC en {form.department || 'tu departamento'}
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
                                  .map((agency) => (
                                  <button
                                    key={agency.id}
                                    type="button"
                                    onClick={() => setSelectedAgency(agency)}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      selectedAgency?.id === agency.id
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
                                        {agency.phone && (
                                          <div className="text-[10px] text-slate-500 mt-0.5">Tel: {agency.phone}</div>
                                        )}
                                      </div>
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                        selectedAgency?.id === agency.id
                                          ? 'bg-amber-500 text-white'
                                          : 'bg-white/10 text-slate-500'
                                      }`}>
                                        K_{agency.k_oficina}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-500 p-3 bg-white/5 rounded-lg border border-white/10 text-center">
                              {form.department ? `No hay agencias DAC activas para retiro en ${form.department}.` : 'Seleccioná un departamento para ver agencias disponibles.'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* DAC Cost/Status Display */}
                      <div className="px-1 space-y-2">
                        {dacDeliveryMode === 'dac_agency' && !selectedAgency && (
                          <div className="text-amber-400 text-xs font-semibold">
                            Seleccioná una agencia DAC para calcular el costo.
                          </div>
                        )}
                        {dacShippingLoading && (
                          <div className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
                            <span>Calculando costo DAC...</span>
                          </div>
                        )}
                        {!dacShippingLoading && dacShippingCost !== null && (
                          <div className="text-emerald-400 text-sm font-black">
                            {dacDeliveryMode === 'dac_agency'
                              ? `Retiro en agencia DAC: $${dacShippingCost} UYU`
                              : `Costo envío DAC: $${dacShippingCost} UYU`}
                          </div>
                        )}
                        {!dacShippingLoading && dacShippingError && (
                          <div className="text-red-400 text-xs font-semibold leading-relaxed">
                            {dacDeliveryMode === 'dac_agency'
                              ? "No pudimos calcular el costo para esta agencia. Elegí otra o consultanos por WhatsApp."
                              : "No pudimos calcular DAC para esta localidad. Consultanos por WhatsApp."}
                          </div>
                        )}
                        {isAdmin && detectedKOficina !== null && (
                          <div className="text-amber-500 text-[11px] font-mono mt-1">
                            Oficina DAC destino detectada: {detectedKOficina}
                          </div>
                        )}

                        {/* Context notice */}
                        {dacDeliveryMode === 'dac_home' && dacShippingCost !== null && !dacShippingLoading && (
                          <div className="p-3 rounded-lg bg-primary-500/5 border border-primary-500/20 text-xs text-slate-300">
                            <strong className="text-primary-400">📦 </strong>
                            DAC entregará en la dirección que ingresaste. Tiempo estimado: 24-48 hs hábiles.
                          </div>
                        )}
                        {dacDeliveryMode === 'dac_agency' && selectedAgency && dacShippingCost !== null && !dacShippingLoading && (
                          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-slate-300">
                            <strong className="text-amber-400">🏢 </strong>
                            Te avisaremos cuando esté listo en la agencia <strong className="text-white">{selectedAgency.office_name}</strong>. Recordá llevar tu documento.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Address fields — only for delivery */}
                  {shippingMethod === 'delivery' && (
                    <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                      <h3 className="font-semibold text-sm text-slate-400 mb-2">Dirección de entrega</h3>

                      {savedAddresses.length > 0 && (
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

                      {(savedAddresses.length === 0 || selectedAddress === -2) && (
                        <>
                          <div>
                            <label className="form-label">Dirección (calle y número) *</label>
                            <AddressAutocomplete
                              value={form.street}
                              onChange={value => setForm({ ...form, street: value })}
                              onSelect={handleAddressSelect}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="form-label">Departamento *</label>
                              <select
                                required={shippingMethod === 'delivery'}
                                className="form-input"
                                value={form.department}
                                onChange={e => handleDepartmentChange(e.target.value)}
                              >
                                <option value="">Selecciona un departamento...</option>
                                {DEPARTAMENTOS.map((department) => (
                                  <option key={department} value={department}>{department}</option>
                                ))}
                              </select>
                            </div>

                            <div>
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
                                  required={shippingMethod === 'delivery'}
                                  className="form-input"
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
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <label className="form-label">Barrio {form.department === 'Montevideo' ? '*' : '(Opcional)'}</label>
                              {form.department === 'Montevideo' ? (
                                <select
                                  required={shippingMethod === 'delivery'}
                                  className="form-input"
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
                                onChange={e => setForm({ ...form, country: e.target.value })}
                              >
                                <option value="Uruguay">Uruguay</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}

                        {shippingMethod === 'delivery' && isLocationSelected && form.department && logistics.providerName && (
                         <div className="space-y-3 mt-4">
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

                          {dacShippingLoading && (
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
                              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs text-slate-300">Calculando costo de envío en tiempo real con DAC...</span>
                            </div>
                          )}

                          {dacShippingError && (
                            <div className="p-4 rounded-lg bg-orange-950/20 border border-orange-500/30 space-y-3">
                              <div className="flex items-start gap-2.5">
                                <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-orange-200 leading-relaxed">
                                  <strong className="block font-bold text-orange-300 mb-0.5">No fue posible calcular el costo automáticamente</strong>
                                  {dacShippingError}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const productsList = items.map(item => `- ${item.title} x${item.quantity}`).join('%0A');
                                  const waNum = settings['whatsapp'] || '59899000000';
                                  const formattedNum = waNum.replace(/[^0-9]/g, '');
                                  const msg = `¡Hola! Quería realizar una compra desde la web pero no pudimos calcular el costo de envío automáticamente para ${form.city}, ${form.department}.%0A%0A*Productos:*%0A${productsList}%0A%0A*Dirección de envío:*%0A${form.street}%0A%0A¿Me podrían ayudar a coordinarlo?`;
                                  window.open(`https://wa.me/${formattedNum}?text=${msg}`, '_blank');
                                }}
                                className="w-full py-2 px-3 rounded bg-green-600 hover:bg-green-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.588 2.016 14.12 1 11.487 1 6.052 1 1.628 5.372 1.624 10.8c-.001 1.73.46 3.42 1.336 4.927L1.983 20.89l5.326-1.396zM17.91 14.3c-.336-.169-1.991-.983-2.299-1.096-.309-.113-.534-.169-.758.169-.224.338-.868 1.096-1.064 1.322-.196.225-.392.253-.729.084-.336-.168-1.42-.523-2.705-1.67-.999-.89-1.673-1.99-1.869-2.327-.196-.338-.021-.52.148-.687.151-.15.336-.394.504-.59.168-.198.224-.338.336-.563.112-.225.056-.422-.028-.59-.084-.169-.758-1.83-1.038-2.505-.272-.656-.547-.567-.758-.578-.196-.01-.42-.01-.645-.01-.224 0-.589.084-.897.422-.309.337-1.179 1.153-1.179 2.812 0 1.66 1.207 3.262 1.375 3.487.168.225 2.376 3.628 5.756 5.087.804.347 1.433.555 1.922.712.808.257 1.543.221 2.124.135.647-.096 1.992-.816 2.272-1.605.28-.79.28-1.464.196-1.605-.084-.14-.309-.225-.645-.394z"/>
                                </svg>
                                Coordinar y comprar por WhatsApp
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2 Nav */}
                <div className="checkout-nav">
                  <button type="button" onClick={goBack} className="checkout-btn-back">
                    <ChevronLeft className="w-4 h-4" /> Volver
                  </button>
                  <button type="button" onClick={goNext} className="checkout-btn-next">
                    Continuar <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 3: FORMA DE PAGO                                      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div className="checkout-step-content" key="step-3">
                <div className="glass p-6">
                  <h2 className="font-bold text-lg mb-1">Forma de pago</h2>
                  <p className="text-xs text-slate-400 mb-6">Elegí cómo querés pagar tu pedido.</p>
                  <div className="space-y-3">
                    {mercadopagoEnabled && (
                      <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'mercadopago' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                        <input type="radio" name="payment" value="mercadopago" checked={paymentMethod === 'mercadopago'} onChange={() => setPaymentMethod('mercadopago')} className="text-primary-600 shrink-0" />
                        <img src="/logos/Mercado_Pago.png" alt="Mercado Pago" className="h-6 object-contain" />
                      </label>
                    )}
                    {dlocalgoEnabled && (
                      <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'dlocalgo' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                        <input type="radio" name="payment" value="dlocalgo" checked={paymentMethod === 'dlocalgo'} onChange={() => setPaymentMethod('dlocalgo')} className="text-primary-600 shrink-0" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <img src="/logos/visa-mastercard.png" alt="Visa / Mastercard" className="h-6 object-contain rounded" />
                          <img src="/logos/OCA_LOGO.png" alt="OCA" className="h-6 object-contain" />
                          <img src="/logos/DINERS.png" alt="Diners Club" className="h-6 object-contain" />
                          <img src="/logos/lider.png" alt="Lider" className="h-6 object-contain" />
                          <div className="w-px h-6 bg-gray-200 mx-1" />
                          <img src="/logos/Red_Pagos_Logos.png" alt="RedPagos" className="h-6 object-contain" />
                        </div>
                      </label>
                    )}
                    {paypalEnabled && (
                      <label className={`flex items-center gap-4 p-4  border-2 cursor-pointer transition-all ${paymentMethod === 'paypal' ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                        <input type="radio" name="payment" value="paypal" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} className="text-primary-600 shrink-0" />
                        <img src="/logos/paypal.png" alt="PayPal" className="h-6 object-contain" />
                      </label>
                    )}
                    {handyEnabled && (
                      <label className={`flex items-center gap-4 p-4 border-2 cursor-pointer transition-all ${paymentMethod === 'handy' ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' : 'border-white/10 hover:border-white/10'}`}>
                        <input type="radio" name="payment" value="handy" checked={paymentMethod === 'handy'} onChange={() => setPaymentMethod('handy')} className="text-primary-600 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                              <div className="font-bold text-white">Tarjetas y redes de cobranza</div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                Botón de pago externo ({handyProvider?.environment === 'production' ? 'Producción' : 'Pruebas'})
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <img src="/logos/visa-mastercard.png" alt="Visa / Mastercard" className="h-6 object-contain rounded" />
                                <img src="/logos/OCA_LOGO.png" alt="OCA" className="h-6 object-contain" />
                                <img src="/logos/lider.png" alt="Lider" className="h-6 object-contain" />
                                <div className="w-px h-6 bg-white/20 mx-1" />
                                <img src="/logos/Red_Pagos_Logos.png" alt="RedPagos" className="h-6 object-contain" />
                              </div>
                              <button
                                type="button"
                                className="text-[11px] text-primary-400 hover:text-primary-300 hover:underline font-medium mt-1 bg-transparent border-none p-0 cursor-pointer outline-none"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowPaymentMethodsModal(true);
                                }}
                              >
                                Ver más medios de pago
                              </button>
                            </div>
                          </div>
                        </div>
                      </label>
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
                <div className="space-y-3 mb-6">
                {items.map((item) => {
                  const itemDiscount = evaluateItemDiscount(item as any, promotions);
                  const displayPrice = (item.price * item.quantity) - itemDiscount;

                  return (
                  <div key={item.variant_id} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.02] border border-white/5 justify-between animate-fade-in">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <img
                        src={resolveImage(item.image) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23f3f4f6" width="48" height="48" rx="8"/></svg>'}
                        alt=""
                        className="w-12 h-12 object-contain bg-white/5 p-0.5 rounded-lg shrink-0"
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
                          onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                          className="p-1 px-1.5 hover:bg-white/5 text-slate-400 hover:text-white transition-colors border-r border-white/10"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="px-2 text-[10px] font-bold text-white min-w-[14px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
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
                          onClick={() => removeItem(item.variant_id)}
                          className="text-slate-500 hover:text-red-500 transition-colors p-1"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} {items.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'items'})</span><span className="font-bold">{formatCurrencyPrice(total - autoDiscountAmount)}</span></div>
                {autoDiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-400 text-xs mt-1">
                    <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Ahorro en promociones</span>
                    <span className="font-bold">{formatCurrencyPrice(autoDiscountAmount)}</span>
                  </div>
                )}
                 <div className="flex justify-between text-sm">
                  <span className="text-slate-400">
                    {selectedShippingMethod === 'dac_home' ? 'Envío DAC a domicilio' : selectedShippingMethod === 'dac_agency' ? (selectedAgency ? `Retiro en agencia - ${selectedAgency.office_name}` : 'Retiro en agencia DAC') : selectedShippingMethod === 'dac' ? 'Envío DAC al interior' : 'Envío'}
                  </span>
                  <span className="font-bold flex items-center gap-1.5">
                    {dacShippingLoading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin inline-block" />
                        <span className="text-xs text-slate-400 font-normal">Calculando...</span>
                      </>
                    ) : (
                      !isLocationSelected && total < freeShippingThreshold ? (
                        <span className="text-xs text-slate-400 font-normal">-</span>
                      ) : (
                        shipping === 0 ? 'GRATIS' : formatCurrencyPrice(shipping)
                      )
                    )}
                  </span>
                </div>
                {bankDiscount > 0 && selectedPromo && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 flex items-center gap-1"><Tag className="w-3 h-3" />Promo {selectedPromo.bank_name}</span>
                    <span className="font-bold text-green-600">-{formatCurrencyPrice(bankDiscount)}</span>
                  </div>
                )}
                {activeCoupon && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <Ticket className="w-3.5 h-3.5" />
                      Cupón {couponCode}
                      <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded ml-1">
                        {activeCoupon.discount_type === 'percentage' ? `-${activeCoupon.discount_value}%` : `-$${activeCoupon.discount_value}`}
                      </span>
                    </span>
                    <span className="font-bold text-green-600">-{formatCurrencyPrice(couponDiscount)}</span>
                  </div>
                )}
                {shippingMethod === 'delivery' && isLocationSelected && form.department && logistics.providerName && (
                  <div className="border-t border-white/5 pt-3 mt-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Logística por</span>
                      <span className="font-semibold text-slate-200">{logistics.providerName}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-xs mt-1">
                      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500" />
                      <span className="font-bold text-green-500">{logistics.message}</span>
                    </div>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <div className="text-right">
                    {(bankDiscount > 0 || couponDiscount > 0) && (
                      <span className="text-sm text-slate-500 line-through mr-2">
                        {formatCurrencyPrice(subtotalWithShipping)}
                      </span>
                    )}
                    <span className="text-2xl font-black text-[#f00856]">{formatCurrencyPrice(grandTotal)}</span>
                    {selectedCurrency !== 'UYU' && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Conversión estimada. El cobro final se realiza en pesos uruguayos.
                      </p>
                    )}
                  </div>
                </div>
              </div>

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
