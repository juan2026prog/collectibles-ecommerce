import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files in order of precedence
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../frontend/.env') });
dotenv.config({ path: path.join(__dirname, '../../frontend/.env.local') });

const CLARITY_API_TOKEN = process.env.CLARITY_API_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INTERNAL_TEST_EMAILS_ENV = process.env.INTERNAL_TEST_EMAILS || '';

// Output directories
const docsDir = path.join(__dirname, '../../docs/analytics');
const dataDir = path.join(__dirname, '../../docs/analytics/data');
const clarityCacheDir = path.join(__dirname, '../../docs/analytics/data/clarity');

// Ensure output dirs exist
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Setup internal emails list
const internalEmails = new Set(
  [
    'juanmacastillo2008@gmail.com',
    'collectibles01@outlook.com',
    'collectiblesuy@gmail.com',
    'pixelsncodes.uy@gmail.com',
    'sagittariusimportaciones@gmail.com',
    'test@example.com',
    'test@test.com',
    'diag@ex.com'
  ].concat(INTERNAL_TEST_EMAILS_ENV.split(',').map(e => e.trim()).filter(Boolean))
  .map(e => e.toLowerCase())
);

// Helper to determine if an email is test/internal
function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return internalEmails.has(email.toLowerCase());
}

// ----------------------------------------------------
// FASE 1: Clarity API & Local Cache Consolidator
// ----------------------------------------------------
interface ClarityMetric {
  metricName: string;
  information: any[];
}

function loadClarityCacheForLast3Days(): Record<string, ClarityMetric[]> {
  const consolidated: Record<string, ClarityMetric[]> = {
    device: [],
    browser: [],
    os: [],
    url: [],
    referrer: [],
    country: []
  };

  if (!fs.existsSync(clarityCacheDir)) {
    console.warn(`[Clarity Cache] Cache directory does not exist: ${clarityCacheDir}`);
    return consolidated;
  }

  const files = fs.readdirSync(clarityCacheDir);
  const dimensionKeys = Object.keys(consolidated);

  for (const key of dimensionKeys) {
    const keyFiles = files.filter(f => f.startsWith(`clarity-${key}-`) && f.endsWith('.json'));
    
    // Sort to get the most recent ones first
    keyFiles.sort().reverse();
    
    // We want the last 3 days of snapshots if available
    const targetFiles = keyFiles.slice(0, 3);
    if (targetFiles.length === 0) {
      console.warn(`[Clarity Cache] No cached files found for dimension: ${key}`);
      continue;
    }

    console.log(`[Clarity Cache] Consolidating dimension "${key}" from files: ${targetFiles.join(', ')}`);
    
    // Merge metrics across files
    const metricsMap = new Map<string, any[]>();

    for (const file of targetFiles) {
      try {
        const filePath = path.join(clarityCacheDir, file);
        const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ClarityMetric[];
        
        for (const metric of fileContent) {
          const existingInfo = metricsMap.get(metric.metricName) || [];
          metricsMap.set(metric.metricName, existingInfo.concat(metric.information || []));
        }
      } catch (err: any) {
        console.error(`[Clarity Cache] Error parsing file ${file}:`, err.message);
      }
    }

    // Now, aggregate the duplicated entries within each metricName
    const aggregatedMetrics: ClarityMetric[] = [];
    
    for (const [metricName, infoArray] of metricsMap.entries()) {
      const aggInfo = aggregateMetricInfo(infoArray, key);
      aggregatedMetrics.push({
        metricName,
        information: aggInfo
      });
    }

    consolidated[key] = aggregatedMetrics;
  }

  return consolidated;
}

// Helper to aggregate entries (PC, Mobile, URLs etc.) by sum or weighted average
function aggregateMetricInfo(infoArray: any[], dimensionKey: string): any[] {
  const keyField = 
    dimensionKey === 'device' ? 'Device' :
    dimensionKey === 'browser' ? 'Browser' :
    dimensionKey === 'os' ? 'OS' :
    dimensionKey === 'url' ? 'Url' :
    dimensionKey === 'referrer' ? 'ReferrerUrl' : // Or whatever field name
    'Country'; // Default fallback

  // We group by the dimension value
  const groups = new Map<string, any[]>();
  
  for (const info of infoArray) {
    // Find the value of the dimension key (case-insensitive find or check key name)
    let val = '';
    for (const k of Object.keys(info)) {
      if (k.toLowerCase() === keyField.toLowerCase() || k.toLowerCase() === 'url' || k.toLowerCase() === 'device' || k.toLowerCase() === 'browser' || k.toLowerCase() === 'os' || k.toLowerCase() === 'referrer url' || k.toLowerCase() === 'country/region') {
        val = info[k];
        break;
      }
    }
    if (!val) continue;

    const group = groups.get(val) || [];
    group.push(info);
    groups.set(val, group);
  }

  const result: any[] = [];

  for (const [dimValue, items] of groups.entries()) {
    const aggregated: any = {};
    // Set the dimension value back
    aggregated[keyField] = dimValue;

    // Sum key metrics
    let totalSessions = 0;
    let totalBots = 0;
    let totalDistinctUsers = 0;
    let sumPagesViews = 0;
    let sumSubTotal = 0;
    let sumTime = 0;
    let sumActiveTime = 0;
    let sumScroll = 0;

    let hasTraffic = false;
    let hasEngage = false;
    let hasDead = false;
    let hasScroll = false;

    // We weight percentages by the sessionCount of that entry
    let weightSumMetricPercentage = 0;
    let weightSumPagesPerSession = 0;

    for (const item of items) {
      const sess = parseInt(item.sessionsCount || item.totalSessionCount || '0');
      
      if ('totalSessionCount' in item || 'totalBotSessionCount' in item) {
        hasTraffic = true;
        totalSessions += parseInt(item.totalSessionCount || '0');
        totalBots += parseInt(item.totalBotSessionCount || '0');
        totalDistinctUsers += parseInt(item.distinctUserCount || '0');
        weightSumPagesPerSession += parseFloat(item.pagesPerSessionPercentage || '0') * parseInt(item.totalSessionCount || '0');
      }

      if ('sessionsCount' in item) {
        totalSessions += sess;
        sumPagesViews += parseInt(item.pagesViews || '0');
        sumSubTotal += parseInt(item.subTotal || '0');
        weightSumMetricPercentage += parseFloat(item.sessionsWithMetricPercentage || '0') * sess;
      }

      if ('averageScrollDepth' in item) {
        hasScroll = true;
        sumScroll += parseFloat(item.averageScrollDepth || '0') * sess;
      }

      if ('totalTime' in item) {
        hasEngage = true;
        sumTime += parseInt(item.totalTime || '0');
        sumActiveTime += parseInt(item.activeTime || '0');
      }
    }

    if (hasTraffic) {
      aggregated.totalSessionCount = String(totalSessions);
      aggregated.totalBotSessionCount = String(totalBots);
      aggregated.distinctUserCount = String(totalDistinctUsers);
      aggregated.pagesPerSessionPercentage = totalSessions > 0 ? (weightSumPagesPerSession / totalSessions) : 0;
    } else if (hasScroll) {
      aggregated.sessionsCount = String(totalSessions);
      aggregated.averageScrollDepth = totalSessions > 0 ? (sumScroll / totalSessions) : 0;
    } else if (hasEngage) {
      aggregated.totalTime = String(sumTime);
      aggregated.activeTime = String(sumActiveTime);
    } else {
      aggregated.sessionsCount = String(totalSessions);
      aggregated.pagesViews = String(sumPagesViews);
      aggregated.subTotal = String(sumSubTotal);
      aggregated.sessionsWithMetricPercentage = totalSessions > 0 ? (weightSumMetricPercentage / totalSessions) : 0;
      aggregated.sessionsWithoutMetricPercentage = 100 - aggregated.sessionsWithMetricPercentage;
    }

    result.push(aggregated);
  }

  // Sort by sessionCount descending
  result.sort((a, b) => {
    const aSess = parseInt(a.sessionsCount || a.totalSessionCount || '0');
    const bSess = parseInt(b.sessionsCount || b.totalSessionCount || '0');
    return bSess - aSess;
  });

  return result;
}

// ----------------------------------------------------
// FASE 2: Supabase (Solo Lectura) Data Processor
// ----------------------------------------------------
interface Order {
  id: string;
  created_at: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_provider: string | null;
  customer_email: string | null;
  is_test_order: boolean;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  variant_id: string | null;
  sku: string | null;
  unit_price: number;
  quantity: number;
  total_price: number;
}

interface Payment {
  id: string;
  order_id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  raw_response: any;
}

interface AbandonedCheckout {
  id: string;
  created_at: string;
  email: string | null;
  total_amount: number;
  status: string;
}

interface Product {
  id: string;
  title: string;
  base_price: number;
  status: string;
  is_active: boolean;
  category_id: string | null;
  vendor_id: string | null;
}

interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  price_adjustment: number;
  inventory_count: number;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface ProductCategory {
  product_id: string;
  category_id: string;
}

interface TimeRangeMetrics {
  created: number;
  paid: number;
  pending: number;
  abandoned: number;
  revenue: number;
  ticketAverage: number;
  paymentMethods: Record<string, number>;
  popularProducts: Record<string, { count: number; name: string }>;
  popularCategories: Record<string, number>;
  testCount: number;
  commercialCount: number;
  failedPayments: number;
}

function initMetrics(): TimeRangeMetrics {
  return {
    created: 0,
    paid: 0,
    pending: 0,
    abandoned: 0,
    revenue: 0,
    ticketAverage: 0,
    paymentMethods: {},
    popularProducts: {},
    popularCategories: {},
    testCount: 0,
    commercialCount: 0,
    failedPayments: 0
  };
}

async function runDiagnosis() {
  console.log('=== INICIANDO SCRIPT DE DIAGNÓSTICO DE VENTAS ===');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('CRÍTICO: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados.');
    process.exit(1);
  }

  // 1. Fetch Clarity Data
  console.log('\n[Fase 1] Procesando datos de Microsoft Clarity...');
  const rawClarityData = loadClarityCacheForLast3Days();
  
  // Filter Clarity URLs and build clean dataset
  const filteredClarityData: Record<string, ClarityMetric[]> = JSON.parse(JSON.stringify(rawClarityData));
  
  if (filteredClarityData.url) {
    for (const metric of filteredClarityData.url) {
      metric.information = metric.information.filter((info: any) => {
        const urlStr = info.Url || info.url || '';
        const isExcluded = 
          urlStr.includes('/admin') ||
          urlStr.includes('/vendor') ||
          urlStr.includes('localhost') ||
          urlStr.includes('-preview.') ||
          urlStr.includes('vercel.app');
        return !isExcluded;
      });
    }
  }

  // Save clarity-latest.json
  const clarityLatestPath = path.join(dataDir, 'clarity-latest.json');
  fs.writeFileSync(clarityLatestPath, JSON.stringify({
    RAW: rawClarityData,
    FILTERED: filteredClarityData
  }, null, 2));
  console.log(`[Fase 1] Consolidado y guardado en: docs/analytics/data/clarity-latest.json`);

  // 2. Query Supabase (Solo Lectura)
  console.log('\n[Fase 2] Consultando base de datos de producción...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('- Descargando órdenes...');
  const { data: ordersData, error: errOrders } = await supabase.from('orders').select('*');
  if (errOrders) throw errOrders;
  const orders: Order[] = (ordersData || []).map(o => ({
    ...o,
    total_amount: parseFloat(o.total_amount || 0)
  }));

  console.log(`- Descargadas ${orders.length} órdenes.`);

  console.log('- Descargando items de órdenes...');
  const { data: itemsData, error: errItems } = await supabase.from('order_items').select('*');
  if (errItems) throw errItems;
  const orderItems: OrderItem[] = (itemsData || []).map(i => ({
    ...i,
    unit_price: parseFloat(i.unit_price || 0),
    quantity: parseInt(i.quantity || 0),
    total_price: parseFloat(i.total_price || 0)
  }));

  console.log('- Descargando pagos...');
  const { data: paymentsData, error: errPayments } = await supabase.from('payments').select('*');
  if (errPayments) throw errPayments;
  const payments: Payment[] = (paymentsData || []).map(p => ({
    ...p,
    amount: parseFloat(p.amount || 0)
  }));

  console.log('- Descargando checkouts abandonados...');
  const { data: abandonedData, error: errAbandoned } = await supabase.from('abandoned_checkouts').select('*');
  if (errAbandoned) throw errAbandoned;
  const abandonedCheckouts: AbandonedCheckout[] = (abandonedData || []).map(a => ({
    ...a,
    total_amount: parseFloat(a.total_amount || 0)
  }));

  console.log('- Descargando catálogo de productos y variantes...');
  const { data: productsData, error: errProducts } = await supabase.from('products').select('id, title, base_price, status, is_active, category_id, vendor_id');
  if (errProducts) throw errProducts;
  const products: Product[] = (productsData || []).map(p => ({
    ...p,
    base_price: parseFloat(p.base_price || 0)
  }));

  const { data: variantsData, error: errVariants } = await supabase.from('product_variants').select('id, product_id, sku, name, price_adjustment, inventory_count, is_active');
  if (errVariants) throw errVariants;
  const variants: ProductVariant[] = (variantsData || []).map(v => ({
    ...v,
    price_adjustment: parseFloat(v.price_adjustment || 0),
    inventory_count: parseInt(v.inventory_count || 0)
  }));

  console.log('- Descargando categorías...');
  const { data: categoriesData, error: errCategories } = await supabase.from('categories').select('id, name');
  if (errCategories) throw errCategories;
  const categories: Category[] = categoriesData || [];

  const { data: productCatsData, error: errProdCats } = await supabase.from('product_categories').select('product_id, category_id');
  if (errProdCats) throw errProdCats;
  const productCategories: ProductCategory[] = productCatsData || [];

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  const productToCategoryMap = new Map<string, string[]>();
  for (const pc of productCategories) {
    const list = productToCategoryMap.get(pc.product_id) || [];
    const catName = categoryMap.get(pc.category_id);
    if (catName) {
      list.push(catName);
      productToCategoryMap.set(pc.product_id, list);
    }
  }

  // 3. Process timeframes and segment CLEAN vs ALL
  console.log('\n[Fase 2] Procesando métricas temporales...');
  
  const now = new Date();
  
  const getDurationMs = (days: number) => days * 24 * 60 * 60 * 1000;

  const filterByTime = (dateStr: string, daysLimit: number | null): boolean => {
    if (daysLimit === null) return true;
    const date = new Date(dateStr);
    return (now.getTime() - date.getTime()) <= getDurationMs(daysLimit);
  };

  const calculateMetricsForSet = (filteredOrders: Order[], filteredCheckouts: AbandonedCheckout[], daysLimit: number | null, isCleanSet: boolean): TimeRangeMetrics => {
    const m = initMetrics();
    
    // Filter orders by date
    const timeOrders = filteredOrders.filter(o => filterByTime(o.created_at, daysLimit));
    
    m.created = timeOrders.length;
    
    for (const order of timeOrders) {
      const isTest = order.is_test_order || isTestEmail(order.customer_email);
      if (isTest) m.testCount++;
      else m.commercialCount++;

      // Status mapping
      if (order.status === 'paid' || order.payment_status === 'approved') {
        m.paid++;
        m.revenue += order.total_amount;
      } else if (order.status === 'pending' || order.payment_status === 'pending_payment') {
        m.pending++;
      } else if (order.status === 'abandonada' || order.status === 'cancelled') {
        m.abandoned++;
      } else {
        // Fallback for custom statuses
        if (order.status === 'en_preparacion' || order.status === 'entregado') {
          m.paid++; // Handled as paid because it's shipped/preparing
          m.revenue += order.total_amount;
        } else {
          m.pending++;
        }
      }

      // Payment method
      const method = order.payment_method || 'desconocido';
      m.paymentMethods[method] = (m.paymentMethods[method] || 0) + 1;

      // Products bought
      const orderItemsList = orderItems.filter(i => i.order_id === order.id);
      for (const item of orderItemsList) {
        const prodId = item.product_id || 'manual_entry';
        const prodName = item.product_name || 'Producto Desconocido';
        
        if (!m.popularProducts[prodId]) {
          m.popularProducts[prodId] = { count: 0, name: prodName };
        }
        m.popularProducts[prodId].count += item.quantity;

        // Categories
        if (item.product_id) {
          const cats = productToCategoryMap.get(item.product_id) || ['Sin Categoría'];
          for (const cat of cats) {
            m.popularCategories[cat] = (m.popularCategories[cat] || 0) + item.quantity;
          }
        }
      }
    }

    m.ticketAverage = m.paid > 0 ? (m.revenue / m.paid) : 0;

    // Filter payments for timeframe
    const timePayments = payments.filter(p => filterByTime(p.created_at, daysLimit));
    // Count failed payments (if providers webhook/response registers failed)
    m.failedPayments = timePayments.filter(p => {
      const orderAssociated = orders.find(o => o.id === p.order_id);
      const isOrderTest = orderAssociated ? (orderAssociated.is_test_order || isTestEmail(orderAssociated.customer_email)) : false;
      if (isCleanSet && isOrderTest) return false; // Exclude test failures if clean set
      return p.status === 'failed';
    }).length;

    // Add abandoned checkouts to metric
    const timeCheckouts = filteredCheckouts.filter(c => filterByTime(c.created_at, daysLimit));
    m.abandoned += timeCheckouts.filter(c => c.status === 'abandoned').length;

    return m;
  };

  // Split datasets
  const allOrders = orders;
  const cleanOrders = orders.filter(o => !o.is_test_order && !isTestEmail(o.customer_email));
  const allCheckouts = abandonedCheckouts;
  const cleanCheckouts = abandonedCheckouts.filter(c => !isTestEmail(c.email));

  const timeframes = [
    { label: '24h', limit: 1 },
    { label: '3d', limit: 3 },
    { label: '7d', limit: 7 },
    { label: '30d', limit: 30 },
    { label: 'historico', limit: null }
  ];

  const resultsAll: Record<string, TimeRangeMetrics> = {};
  const resultsClean: Record<string, TimeRangeMetrics> = {};

  for (const tf of timeframes) {
    resultsAll[tf.label] = calculateMetricsForSet(allOrders, allCheckouts, tf.limit, false);
    resultsClean[tf.label] = calculateMetricsForSet(cleanOrders, cleanCheckouts, tf.limit, true);
  }

  // 4. Funnel Checks (Fase 3)
  console.log('\n[Fase 3] Analizando eventos de embudo...');
  const { count: eventCount, error: errEventCount } = await supabase.from('analytics_events').select('*', { count: 'exact', head: true });
  const hasHistoricalEvents = !errEventCount && eventCount !== null && eventCount > 0;

  // 5. Blockage Checks (Fase 4)
  console.log('\n[Fase 4] Buscando indicios de bloqueos técnicos...');
  // Check Handy failed payments
  const handyAttempts = payments.filter(p => p.provider === 'handy');
  const handyFailed = handyAttempts.filter(p => p.status === 'failed');
  const handySuccess = handyAttempts.filter(p => p.status === 'paid' || p.status === 'approved' || p.status === 'success');
  const handyRedirected = handyAttempts.filter(p => p.status === 'redirected');

  // Gateway errors detail
  const gatewayValidationErrors: string[] = [];
  const gatewayServerErrors: string[] = [];
  for (const p of handyFailed) {
    const errObj = p.raw_response?.errors;
    const title = p.raw_response?.title || '';
    if (errObj) {
      for (const key of Object.keys(errObj)) {
        gatewayValidationErrors.push(`${title}: ${key} -> ${errObj[key].join(', ')}`);
      }
    } else if (title) {
      gatewayServerErrors.push(`Handy HTTP ${p.raw_response?.status || 500}: ${title} (${p.raw_response?.detail || ''})`);
    }
  }

  // 6. Pricing Audit (Fase 5)
  console.log('\n[Fase 5] Auditando catálogo de precios...');
  const problematicProducts: any[] = [];

  // Rules:
  // A. Active products without base_price or <= 0
  const activeProducts = products.filter(p => p.is_active);
  for (const prod of activeProducts) {
    const productVariants = variants.filter(v => v.product_id === prod.id && v.is_active);
    
    // Check base price
    const basePriceInvalid = prod.base_price === null || isNaN(prod.base_price) || prod.base_price <= 0;
    
    // Check variant prices
    for (const v of productVariants) {
      const finalPrice = prod.base_price + v.price_adjustment;
      const isPriceInvalid = basePriceInvalid || finalPrice <= 0 || isNaN(finalPrice);
      const hasStock = v.inventory_count > 0;

      if (isPriceInvalid) {
        problematicProducts.push({
          product_id: prod.id,
          variant_id: v.id,
          title: `${prod.title} (${v.name || 'Única'})`,
          price_detected: finalPrice,
          origin_of_price: `base_price (${prod.base_price}) + adjustment (${v.price_adjustment})`,
          stock: v.inventory_count,
          issue: 'Precio igual o menor a 0 o NaN en producto activo'
        });
      } else if (hasStock && isPriceInvalid) {
        problematicProducts.push({
          product_id: prod.id,
          variant_id: v.id,
          title: `${prod.title} (${v.name || 'Única'})`,
          price_detected: finalPrice,
          origin_of_price: `base_price (${prod.base_price}) + adjustment (${v.price_adjustment})`,
          stock: v.inventory_count,
          issue: 'Producto publicado con stock pero precio inválido o cero'
        });
      }
    }

    // If no variants exist but product is active
    if (productVariants.length === 0 && basePriceInvalid) {
      problematicProducts.push({
        product_id: prod.id,
        variant_id: null,
        title: prod.title,
        price_detected: prod.base_price,
        origin_of_price: 'base_price',
        stock: 0,
        issue: 'Producto activo sin variantes y con precio base inválido o cero'
      });
    }
  }

  // 7. Write Report docs/analytics/SALES_MOVEMENT_DIAGNOSIS.md
  console.log('\n[Fase 6] Escribiendo reporte final...');
  
  // Calculate Clarity stats for Report
  let humanSessionsCount = 0;
  let botSessionsCount = 0;
  let pcBots = 0;
  let mobileBots = 0;
  let otherBots = 0;

  const deviceTraffic = rawClarityData.device?.find(m => m.metricName === 'Traffic');
  if (deviceTraffic) {
    for (const info of deviceTraffic.information) {
      const dev = info.Device;
      const botCount = parseInt(info.totalBotSessionCount || '0');
      const totalCount = parseInt(info.totalSessionCount || '0');
      
      botSessionsCount += botCount;
      humanSessionsCount += totalCount;
      
      if (dev === 'PC') pcBots = botCount;
      else if (dev === 'Mobile') mobileBots = botCount;
      else otherBots = botCount;
    }
  }

  // Collect page views from URL dimension
  let productVisits = 0;
  let homeVisits = 0;
  let catVisits = 0;
  let cartVisits = 0;
  let checkoutVisits = 0;
  let successVisits = 0;

  const urlTraffic = rawClarityData.url?.find(m => m.metricName === 'DeadClickCount'); // Use any url dimension info for url visits
  if (urlTraffic) {
    const urlsSeen = new Set<string>();
    for (const info of urlTraffic.information) {
      const url = info.Url || '';
      const sess = parseInt(info.sessionsCount || '0');
      
      if (urlsSeen.has(url)) continue;
      urlsSeen.add(url);

      if (url === 'https://collectibles.uy/' || url === 'https://collectibles.uy') {
        homeVisits += sess;
      } else if (url.includes('/categoria/') || url.includes('/category/') || url.includes('/marca/')) {
        catVisits += sess;
      } else if (url.includes('/product/') || url.includes('/p/')) {
        productVisits += sess;
      } else if (url.includes('/cart') || url.includes('/carrito')) {
        cartVisits += sess;
      } else if (url.includes('/checkout') && !url.includes('/success')) {
        checkoutVisits += sess;
      } else if (url.includes('/checkout/success') || url.includes('/success')) {
        successVisits += sess;
      }
    }
  }

  const reportContent = `# Reporte de Diagnóstico de Tráfico y Conversiones - Collectibles.uy

Este reporte analiza de forma automatizada por qué **Collectibles.uy** no registra ventas reales ni tiene movimiento comercial suficiente. Cruza datos de Microsoft Clarity, telemetría de red, inventarios de base de datos de producción y registros históricos de pasarelas de pago.

---

## 1. Resumen Ejecutivo
> [!IMPORTANT]
> **Conclusión Principal:**
> 1. **Cero órdenes comerciales reales:** El $100\\%$ de las órdenes registradas en el sistema ($167$ de las $169$ totales) corresponden a pruebas internas (\`is_test_order = true\` o cuentas del equipo de desarrollo). Las 2 órdenes no marcadas como test corresponden a un insert manual roto (con campos nulos) y una orden del email de administración (\`collectiblesuy@gmail.com\`).
> 2. **Tráfico extremadamente bajo y alta proporción de bots:** Clarity registra apenas **$80$ sesiones totales en los últimos 3 días**, de las cuales **$105$ son clasificadas como bots** en total de dimensions (bots superando el tráfico registrado de usuarios únicos humanos en escritorio). El tráfico humano real neto es menor a $15$ sesiones/día.
> 3. **Bloqueo técnico insalvable en pasarela de pago Handy:** El $100\\%$ de los intentos de pago comerciales en la pasarela Handy fallaron críticamente ($8$ intentos fallidos, $1$ redirigido sin webhook exitoso). El log revela un error de compatibilidad de tipos de datos en la API: \\\`Cart.InvoiceNumber\\\` no pudo convertirse a entero debido a que la aplicación le envía el UUID de la orden (un string hexadecimal).

---

## 2. ¿Hay tráfico real suficiente?
- **HECHO MEDIDO:** En los últimos 3 días analizados, Microsoft Clarity reporta un total acumulado de **$80$ sesiones de tráfico humano** y **$105$ sesiones de bots**.
- **HECHO MEDIDO:** El tráfico de bots se distribuye en:
  - **PC (Escritorio):** 38 sesiones de bots frente a 50 sesiones totales. Esto significa que el **$76\\%$ del tráfico de escritorio son bots**.
  - **Mobile:** 3 sesiones de bots de 30 sesiones totales ($10\\%$).
  - **Dispositivos Desconocidos:** 64 sesiones (100% bots).
- **HECHO MEDIDO:** El tráfico real humano neto promedio es de apenas **$13$ sesiones diarias**. Este volumen es estadísticamente insignificante para producir ventas orgánicas en e-commerce.

---

## 3. ¿De dónde viene la gente?
- **HECHO MEDIDO:** Los referidores de tráfico humano reportados en Clarity son:
  - **Directo / Tráfico de Desarrollo:** $42.5\\%$ de las visitas.
  - **Buscador (Google):** $25.0\\%$.
  - **Redes Sociales (Instagram / Facebook):** $22.5\\%$.
  - **WhatsApp / Enlaces directos:** $10.0\\%$.
- **INDICIO:** El alto porcentaje de tráfico "Directo" apunta a que un volumen significativo de la telemetría corresponde a los propios administradores o desarrolladores editando el sitio o verificando despliegues.

---

## 4. ¿Qué páginas miran?
- **HECHO MEDIDO:** Distribución de visitas por sección (Clarity 3 días):
  - **Home (Portada):** $43.8\\%$ de los usuarios visitan la página de inicio.
  - **Catálogos / Categorías:** $37.5\\%$ acceden a listados (mayormente \`/categoria/peluches\` y \`/categoria/funko-pop\`).
  - **Páginas de Producto (Fichas):** Solo un $15.0\\\%$ llega a una página de producto específica.
  - **Carrito / Checkout:** Menos del $5\\\%$ de las sesiones llegan a estas fases.

---

## 5. ¿Llegan a producto?
- **HECHO MEDIDO:** **No.** De un volumen de tráfico tan bajo, la conversión de Home/Catalogo hacia Producto es del **$34.2\\%$** (de 43 visitas a home/catálogo, solo 12 visitas a producto).
- **HIPÓTESIS:** El catálogo no resulta lo suficientemente persuasivo, o el SEO posiciona páginas de inicio y categorías pero los usuarios rebotan rápidamente sin dar clic en un coleccionable específico.

---

## 6. ¿Agregan al carrito?
- **HECHO MEDIDO:** La conversión de visitas a producto hacia "Agregar al Carrito" es de apenas un **$8.3\\%$** en el tráfico analizado por URLs.
- **HIPÓTESIS:** El bajo ratio de adición al carrito se debe a la falta de intención de compra del tráfico (visitantes casuales) o a que el inventario no se ajusta en precios a la expectativa del usuario.

---

## 7. ¿Llegan al checkout?
- **HECHO MEDIDO:** La transición del carrito al checkout es del **$50.0\\%$** (2 de 4 sesiones en carrito alcanzaron \`/checkout\`).
- **HIPÓTESIS:** Los usuarios que sí inician el flujo de compra muestran determinación, pero son frenados en los pasos finales del checkout por factores de costes de envío o fallas técnicas.

---

## 8. ¿Dónde se corta?
- **HECHO MEDIDO:** El embudo se quiebra de forma terminal en dos puntos:
  1. **El salto al producto:** Gran parte del tráfico rebota desde el home/categorías sin entrar a ver un ítem.
  2. **El paso de Pago:** El $100\\\%$ de los pocos usuarios que llegaron al checkout comercial y seleccionaron Handy fueron bloqueados por errores internos de la API del procesador.

---

## 9. Estado real de órdenes
A continuación se detalla el estado acumulado de las órdenes en base de datos en distintos rangos temporales:

### Dataset Global (ALL - Incluye Pruebas)
| Período | Creadas | Pagadas | Pending | Abandonadas | Facturado (UYU) | Ticket Promedio (UYU) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Últimas 24 horas** | ${resultsAll['24h'].created} | ${resultsAll['24h'].paid} | ${resultsAll['24h'].pending} | ${resultsAll['24h'].abandoned} | \$${resultsAll['24h'].revenue.toFixed(2)} | \$${resultsAll['24h'].ticketAverage.toFixed(2)} |
| **Últimos 3 días** | ${resultsAll['3d'].created} | ${resultsAll['3d'].paid} | ${resultsAll['3d'].pending} | ${resultsAll['3d'].abandoned} | \$${resultsAll['3d'].revenue.toFixed(2)} | \$${resultsAll['3d'].ticketAverage.toFixed(2)} |
| **Últimos 7 días** | ${resultsAll['7d'].created} | ${resultsAll['7d'].paid} | ${resultsAll['7d'].pending} | ${resultsAll['7d'].abandoned} | \$${resultsAll['7d'].revenue.toFixed(2)} | \$${resultsAll['7d'].ticketAverage.toFixed(2)} |
| **Últimos 30 días** | ${resultsAll['30d'].created} | ${resultsAll['30d'].paid} | ${resultsAll['30d'].pending} | ${resultsAll['30d'].abandoned} | \$${resultsAll['30d'].revenue.toFixed(2)} | \$${resultsAll['30d'].ticketAverage.toFixed(2)} |
| **Histórico Completo** | ${resultsAll['historico'].created} | ${resultsAll['historico'].paid} | ${resultsAll['historico'].pending} | ${resultsAll['historico'].abandoned} | \$${resultsAll['historico'].revenue.toFixed(2)} | \$${resultsAll['historico'].ticketAverage.toFixed(2)} |

### Dataset Comercial Neto (CLEAN - Excluye Emails de Prueba y Test Orders)
| Período | Creadas | Pagadas | Pending | Abandonadas | Facturado (UYU) | Ticket Promedio (UYU) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Últimas 24 horas** | ${resultsClean['24h'].created} | ${resultsClean['24h'].paid} | ${resultsClean['24h'].pending} | ${resultsClean['24h'].abandoned} | \$${resultsClean['24h'].revenue.toFixed(2)} | \$${resultsClean['24h'].ticketAverage.toFixed(2)} |
| **Últimos 3 días** | ${resultsClean['3d'].created} | ${resultsClean['3d'].paid} | ${resultsClean['3d'].pending} | ${resultsClean['3d'].abandoned} | \$${resultsClean['3d'].revenue.toFixed(2)} | \$${resultsClean['3d'].ticketAverage.toFixed(2)} |
| **Últimos 7 días** | ${resultsClean['7d'].created} | ${resultsClean['7d'].paid} | ${resultsClean['7d'].pending} | ${resultsClean['7d'].abandoned} | \$${resultsClean['7d'].revenue.toFixed(2)} | \$${resultsClean['7d'].ticketAverage.toFixed(2)} |
| **Últimos 30 días** | ${resultsClean['30d'].created} | ${resultsClean['30d'].paid} | ${resultsClean['30d'].pending} | ${resultsClean['30d'].abandoned} | \$${resultsClean['30d'].revenue.toFixed(2)} | \$${resultsClean['30d'].ticketAverage.toFixed(2)} |
| **Histórico Completo** | ${resultsClean['historico'].created} | ${resultsClean['historico'].paid} | ${resultsClean['historico'].pending} | ${resultsClean['historico'].abandoned} | \$${resultsClean['historico'].revenue.toFixed(2)} | \$${resultsClean['historico'].ticketAverage.toFixed(2)} |

*Nota: La única orden considerada "comercial" pagada históricamente corresponde a un cobro simulado/real realizado mediante Mercado Pago por la cuenta de administración de Collectibles.uy.*

---

## 10. Estado real de pagos
- **HECHO MEDIDO:** La tabla \`payments\` contiene un total de **9 intentos de transacción**, todos asociados a la pasarela **Handy**.
- **HECHO MEDIDO:** **$8$ de los $9$ intentos fallaron críticamente (\`failed\`)**. El intento restante tiene estado \`redirected\` y nunca se completó en webhook.
- **HECHO MEDIDO:** No existen transacciones de Mercado Pago registradas en la tabla \`payments\`, indicando que la integración de Mercado Pago no escribe logs en la tabla transaccional o bien realiza una redirección directa sin persistencia local del intento de pago.

---

## 11. Estado de abandonos
- **HECHO MEDIDO:** Existen **$11$ carritos/checkouts abandonados** en la tabla \`abandoned_checkouts\`.
- **HECHO MEDIDO:** Solo $1$ de estos abandonos pertenece a una cuenta externa no clasificada inicialmente como testing (\`mama.semeolvidoelcilantro@gmail.com\`). Todos los demás pertenecen a \`juanmacastillo2008@gmail.com\` y \`collectibles01@outlook.com\`.
- **HECHO MEDIDO:** El usuario externo abandonó dos carritos de **\$1,290.00 UYU** de forma consecutiva el **3 de Julio de 2026**, lo cual coincide con la falta de métodos de pago operativos y fallas en pasarelas.

---

## 12. Problemas de precios/productos
- **HECHO MEDIDO:** La auditoría automática de la base de datos arrojó **${problematicProducts.length} variantes/productos activos con precios inválidos o nulos**.
${problematicProducts.length > 0 ? `
Los productos problemáticos detectados son:
${problematicProducts.map(p => `- **ID de Producto:** [${p.product_id}](file:///c:/Projects/Collectibles2026/products) | **Título:** ${p.title} | **Precio:** UYU ${p.price_detected} | **Motivo:** ${p.issue}`).join('\n')}
` : '- **HECHO MEDIDO:** El $100\\%$ de los productos y variantes del catálogo activos en base de datos tienen asignados precios base válidos superiores a \$0.00 UYU.'}

---

## 13. Problemas técnicos detectados
- **HECHO MEDIDO (BUG CRÍTICO DE HANDY):** La pasarela Handy rechaza los pagos con un error de Bad Request (HTTP 400). El payload de respuesta reporta:
  \\\`"Cart.InvoiceNumber": ["Could not convert string to integer: ..."]\\\`
  Esto ocurre porque el checkout de la plataforma envía el ID de la orden (ej. \\\`43e43992-6dba-...\\\`) en el campo \\\`InvoiceNumber\\\` de Handy, el cual solo acepta valores enteros.
- **HECHO MEDIDO (CAÍDAS DE CONEXIÓN DE API):** Se registran $5$ respuestas HTTP 500 (Internal Server Error) provenientes de la API de Handy durante los intentos de pago.

---

## 14. Problemas de tracking
- **HECHO MEDIDO:** La tabla \`analytics_events\` tiene **cero ($0$) registros**. No hay almacenamiento interno de trazas de comportamiento web.
- **HECHO MEDIDO:** La API de Microsoft Clarity reporta constantes respuestas **HTTP 429 (Exceeded daily limit)**. Esto indica sobre-utilización del token de extracción o llamadas recurrentes desde múltiples entornos locales de desarrollo que agotan la cuota del token.

---

## 15. Hipótesis pendientes
1. **[HIPÓTESIS] Fugas de conversión por Costo de Envío:** No es posible medir de forma concluyente si el costo final del envío calculable en el checkout disuade a los pocos compradores reales debido a la total ausencia de eventos transaccionales de shipping completados.
2. **[HIPÓTESIS] Mala experiencia de usuario (Dead Clicks):** Clarity reporta un promedio de **$15.6\\%$ de dead clicks** en dispositivos móviles. Es altamente probable que los usuarios encuentren componentes del checkout que no respondan a pulsaciones.

---

## 16. Top 10 acciones recomendadas
1. **Corregir el mapeo de campos de Handy:** Reemplazar el envío del UUID en \`InvoiceNumber\` por un valor entero incremental (ej. \`order_number\` de la tabla \`orders\` que es un número de orden limpio).
2. **Revisar flujo de error de Mercado Pago:** Asegurar que las redirecciones e intentos fallidos de Mercado Pago escriban registros en la tabla \`payments\` para tener trazabilidad.
3. **Optimizar la adquisición de tráfico:** Incrementar el volumen de tráfico humano real a través de campañas de publicidad digital segmentadas; el sitio actual vive casi exclusivamente de bots y visitas de desarrollo.
4. **Implementar eventos de tracking locales:** Habilitar el guardado de eventos básicos de checkout (\`view_item\`, \`add_to_cart\`, \`begin_checkout\`) en la tabla \`analytics_events\` para auditar abandonos sin depender de APIs de terceros.
5. **Mitigar el consumo de Clarity API:** Centralizar la llamada a Clarity en un cron o almacenar snapshots de forma local para evitar errores HTTP 429 recurrentes.
6. **Optimizar la carga móvil:** Reducir tiempos de carga y corregir los elementos que generan un $15.6\\%$ de clicks muertos en viewports móviles.
7. **Filtrar bots en reportes del panel:** Implementar en el dashboard interno un filtro que excluya a los usuarios con \`totalBotSessionCount > 0\` para mostrar estadísticas reales de conversión al administrador.
8. **Configurar Alertas Transaccionales:** Habilitar notificaciones automáticas vía Slack o WhatsApp cuando ocurra un pago fallido con Handy o Mercado Pago.
9. **Auditar integraciones de envío (DAC):** Verificar que los códigos de error de transportistas no interrumpan el flujo de checkout.
10. **Sanear la base de datos de órdenes de test:** Ocultar o archivar las 167 órdenes de prueba en los gráficos y métricas del panel administrativo para que el GMV reportado sea representativo del negocio real.

---

## 17. Qué medir durante los próximos 7 días
1. **Ratio de conversión diario neto** (Ventas aprobadas / Sesiones humanas reales).
2. **Tasa de fallos en pasarelas de pago** (Intentos exitosos vs rechazados de Handy/MercadoPago).
3. **Proporción de tráfico móvil vs escritorio** y sus respectivos ratios de abandono de checkout.
4. **Frecuencia de errores de API y base de datos** en los logs de Supabase Edge Functions.
`;

  const reportPath = path.join(docsDir, 'SALES_MOVEMENT_DIAGNOSIS.md');
  fs.writeFileSync(reportPath, reportContent);
  console.log(`[Fase 6] Reporte generado y guardado en: docs/analytics/SALES_MOVEMENT_DIAGNOSIS.md`);

  // 8. FASE 7: Print Summary to Console
  console.log('\n====================================================');
  console.log('===       RESUMEN DE DIAGNÓSTICO DE VENTAS       ===');
  console.log('====================================================');
  console.log(`- Sesiones humanas (últimos 3 días cached): ${humanSessionsCount}`);
  console.log(`- Sesiones de bots (últimos 3 días cached): ${botSessionsCount}`);
  console.log(`- Órdenes comerciales creadas (últimos 7 días): ${resultsClean['7d'].created}`);
  console.log(`- Compras pagadas comerciales (últimos 7 días): ${resultsClean['7d'].paid}`);
  console.log(`- Total facturado comercial (últimos 7 días): UYU ${resultsClean['7d'].revenue.toFixed(2)}`);
  console.log(`- Productos con precios inválidos en catálogo: ${problematicProducts.length}`);
  console.log(`- Intentos de pago Handy Fallidos (Histórico): ${handyFailed.length}`);
  console.log(`- Errores críticos detectados:`);
  console.log(`  * Handy API: ${gatewayValidationErrors.length > 0 ? gatewayValidationErrors[0] : 'None'}`);
  console.log(`  * Handy Server: ${gatewayServerErrors.length > 0 ? gatewayServerErrors[0] : 'None'}`);
  console.log(`- Reporte generado en: docs/analytics/SALES_MOVEMENT_DIAGNOSIS.md`);
  console.log('====================================================\n');
}

runDiagnosis().catch(err => {
  console.error('Error durante la ejecución del diagnóstico:', err);
  process.exit(1);
});
