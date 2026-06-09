import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runQA() {
  console.log("🚀 Iniciando QA End-to-End del Vendor...");

  // 1. Obtener el primer vendor
  const { data: vendors, error: vErr } = await supabase.from('vendors').select('*').limit(1);
  if (vErr || !vendors.length) return console.error("Error vendors:", vErr);
  const vendor = vendors[0];
  console.log(`✅ Vendor encontrado: ${vendor.store_name} (${vendor.id})`);

  // 2. Aprobar KYC y configurar datos de facturación
  console.log("📝 Aprobando KYC y configurando cuenta bancaria...");
  await supabase.from('vendors').update({
    kyc_status: 'approved',
    tax_id: '211234560012',
    vendor_payment_settings: {
      account_name: 'Juan Perez',
      bank_name: 'BROU',
      account_number: '123456789',
      currency: 'UYU'
    }
  }).eq('id', vendor.id);

  // 3. Conectar ML (mock)
  console.log("🔗 Simulando conexión Mercado Libre...");
  const { data: mlAccount } = await supabase.from('ml_seller_accounts').select('id').eq('vendor_id', vendor.id).maybeSingle();
  if (!mlAccount) {
    await supabase.from('ml_seller_accounts').insert({
      vendor_id: vendor.id,
      ml_user_id: 'MOCK_ML_USER_123',
      access_token: 'mock_token',
      refresh_token: 'mock_refresh',
      nickname: 'TEST_VENDOR_ML',
      status: 'active'
    });
  } else {
    await supabase.from('ml_seller_accounts').update({ status: 'active' }).eq('id', mlAccount.id);
  }

  // 4. Crear un producto si no tiene
  let { data: product } = await supabase.from('vendor_products').select('id').eq('vendor_id', vendor.id).limit(1).maybeSingle();
  if (!product) {
    console.log("📦 Creando producto de prueba...");
    const { data: pData } = await supabase.from('vendor_products').insert({
      vendor_id: vendor.id,
      title: 'Producto QA E2E',
      status: 'active',
      base_price: 1500
    }).select().single();
    product = pData;
    
    await supabase.from('vendor_product_variants').insert({
      product_id: product.id,
      sku: 'QA-E2E-01',
      price: 1500,
      inventory_count: 10
    });
  }
  
  const { data: variant } = await supabase.from('vendor_product_variants').select('id').eq('product_id', product.id).limit(1).single();

  // 5. Simular una Compra
  console.log("🛒 Simulando compra de cliente...");
  // Obtenemos un cliente cualquiera (no vendor)
  const { data: customer } = await supabase.from('profiles').select('id').eq('is_admin', false).limit(1).maybeSingle();
  
  const { data: order } = await supabase.from('orders').insert({
    customer_id: customer?.id || vendor.id,
    total_amount: 1500,
    status: 'paid',
    shipping_address: { street: 'Av 18 de Julio 1234', city: 'Montevideo' }
  }).select().single();

  await supabase.from('order_items').insert({
    order_id: order.id,
    product_variant_id: variant.id,
    vendor_id: vendor.id,
    quantity: 1,
    price: 1500
  });

  // 6. Generar Payout
  console.log("💰 Generando Payout para el Vendor...");
  await supabase.from('vendor_payouts').insert({
    vendor_id: vendor.id,
    amount: 1350, // 1500 - 10%
    status: 'pending',
    period_start: new Date().toISOString(),
    period_end: new Date().toISOString()
  });

  // 7. Simular despacho DAC
  console.log("🚚 Simulando conexión logística...");
  const { data: shippingConn } = await supabase.from('vendor_shipping_connections').select('id').eq('vendor_id', vendor.id).eq('provider', 'dac').maybeSingle();
  if (!shippingConn) {
    await supabase.from('vendor_shipping_connections').insert({
      vendor_id: vendor.id,
      provider: 'dac',
      connection_status: 'connected',
      credentials_encrypted: 'mock_encrypted'
    });
  }

  console.log("✅ QA End-to-End finalizado exitosamente.");
}

runQA().catch(console.error);
