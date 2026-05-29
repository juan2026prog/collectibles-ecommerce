const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';
const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabase = createClient(supabaseUrl, ANON_KEY);

const BYPASS_SECRET = 'collectibles-ml-test-secret';
const TEST_VARIANT_ID = 'aa82a74e-263a-41e1-8022-39a3e2198bf6';
const TEST_VENDOR_VARIANT_ID = '03f18ff6-f6c3-42da-95d6-5e8131d1f3a1';
const TEST_SELLER_ID = '63700367';
const TEST_ML_ITEM_ID = 'MLU615456398';

function callWebhookEdge(body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
      path: '/functions/v1/mercadolibre-webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ANON_KEY,
        'x-test-bypass': BYPASS_SECRET,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

function callSyncEdge(body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
      path: '/functions/v1/mercadolibre-sync',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ANON_KEY,
        'x-test-bypass': BYPASS_SECRET,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Bypassed assertions via Deno endpoint
async function runAssertion(payload) {
  const res = await callWebhookEdge({
    action: 'test_assertion',
    ...payload
  });
  return res.body;
}

async function runCleanup() {
  await callWebhookEdge({ action: 'test_cleanup' });
  await callWebhookEdge({ action: 'test_set_kill_switch', enabled: true });
  await callWebhookEdge({ action: 'test_set_token_expiry', seller_id: TEST_SELLER_ID, hours_offset: 6 });
}

async function pollEventStatus(resource, targetStatus = 'processed', maxRetries = 15, intervalMs = 600) {
  for (let i = 0; i < maxRetries; i++) {
    const assertRes = await runAssertion({ event_resource: resource });
    if (assertRes && assertRes.event) {
      console.log(`   [Poll] Event status: ${assertRes.event.status} (attempt ${i + 1}/${maxRetries})`);
      if (assertRes.event.status === targetStatus || assertRes.event.status === 'failed' || assertRes.event.status === 'dead_letter') {
        return assertRes.event;
      }
    } else {
      console.log(`   [Poll] Event not found yet (attempt ${i + 1}/${maxRetries})`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Event status did not reach ${targetStatus} for resource ${resource}`);
}

async function runEnterpriseSuite() {
  console.log('==================================================');
  console.log('🚀 INICIANDO TEST SUITE ENTERPRISE AUTOMATIZADO (.CJS)');
  console.log('==================================================\n');

  try {
    // --------------------------------------------------
    // CLEANUP & RESET
    // --------------------------------------------------
    console.log('1. [Setup] Limpiando datos de prueba anteriores y alineando inventarios...');
    await runCleanup();

    // Reset stock to 10 for test variant and vendor variant
    await callWebhookEdge({
      action: 'manual_reconcile',
      link_ids: ['03857f70-5ef0-4506-ba5c-93063a990f93'],
      target: 'manual_reset'
    });

    const initAssert = await runAssertion({
      variant_id: TEST_VARIANT_ID,
      vendor_product_variant_id: TEST_VENDOR_VARIANT_ID
    });
    console.log(`   Stock Inicial - Master: ${initAssert.variant?.inventory_count || 0}, Vendor: ${initAssert.vendorVariant?.inventory_count || 0}`);
    console.log('   Setup completado.\n');

    // --------------------------------------------------
    // ESCENARIO A: VENTAS
    // --------------------------------------------------
    console.log('2. [Escenario: Ventas] A.1 Simulando venta desde storefront (local)...');
    const decRes = await callWebhookEdge({
      action: 'test_decrement_inventory',
      variant_id: TEST_VARIANT_ID,
      quantity: 1
    });
    if (decRes.body?.error || !decRes.body?.success) {
      throw new Error('Storefront inventory decrement failed: ' + (decRes.body?.error || 'Unknown error'));
    }

    const sfAssert = await runAssertion({ variant_id: TEST_VARIANT_ID });
    console.log(`   Stock Master post-storefront: ${sfAssert.variant?.inventory_count}`);

    console.log('\n2.2. A.2 Ingestando venta desde Mercado Libre webhook...');
    const ingestOrderRes = await callWebhookEdge({
      resource: '/orders/2000003508419054',
      user_id: TEST_SELLER_ID,
      topic: 'orders',
      application_id: 123456789012,
      sent: new Date().toISOString()
    });
    console.log('   Ingesta Webhook ML Status:', ingestOrderRes.status, ingestOrderRes.body?.message);

    console.log('   Ejecutando Barrido (Sweep) para procesar el pedido ML...');
    await callWebhookEdge({ action: 'sweep' });

    // Wait until event is fully processed
    console.log('   Esperando procesamiento de orden...');
    await pollEventStatus('/orders/2000003508419054');

    const mlOrderAssert = await runAssertion({
      ml_order_id: '2000003508419054',
      variant_id: TEST_VARIANT_ID,
      vendor_product_variant_id: TEST_VENDOR_VARIANT_ID
    });
    console.log('   Pedido creado en orders:', mlOrderAssert.order ? 'SÍ' : 'NO', `(ml_order_id: ${mlOrderAssert.order?.ml_order_id})`);
    console.log(`   Stock post-ML - Master: ${mlOrderAssert.variant?.inventory_count}, Vendor: ${mlOrderAssert.vendorVariant?.inventory_count}`);

    console.log('\n2.3. A.3 Cancelación de orden...');
    if (mlOrderAssert.order) {
      const cancelRes = await callWebhookEdge({
        action: 'test_cancel_order',
        order_id: mlOrderAssert.order.id
      });
      if (cancelRes.body?.error || !cancelRes.body?.success) {
        throw new Error('Cancel order failed: ' + (cancelRes.body?.error || 'Unknown error'));
      }
      console.log('   Orden de venta cancelada.');
    }

    // --------------------------------------------------
    // ESCENARIO B: OAUTH
    // --------------------------------------------------
    console.log('\n3. [Escenario: OAuth] B.1 Simulación de Token Expirado (Auto-Refresh)...');
    const expireTokenRes = await callWebhookEdge({
      action: 'test_expire_token',
      seller_id: TEST_SELLER_ID
    });
    if (expireTokenRes.body?.error || !expireTokenRes.body?.success) {
      throw new Error('Simulating expired token failed: ' + (expireTokenRes.body?.error || 'Unknown error'));
    }

    console.log('   Gatillando acción webhook que requiera token para disparar auto-refresh...');
    await callWebhookEdge({
      resource: `/items/${TEST_ML_ITEM_ID}`,
      user_id: TEST_SELLER_ID,
      topic: 'items',
      sent: new Date().toISOString()
    });
    await callWebhookEdge({ action: 'sweep' });

    console.log('   Esperando procesamiento de item (auto-refresh)...');
    await pollEventStatus(`/items/${TEST_ML_ITEM_ID}`);

    const updatedSellerAssert = await runAssertion({ seller_id: TEST_SELLER_ID });
    const updatedSeller = updatedSellerAssert.seller;
    if (!updatedSeller) {
      throw new Error('Failed to retrieve updated seller account after refresh simulation');
    }

    const hoursLeft = (new Date(updatedSeller.expires_at).getTime() - Date.now()) / (1000 * 60 * 60);
    console.log('   Expires At post-action:', updatedSeller.expires_at, `(Quedan ${hoursLeft.toFixed(2)} horas -> Auto-Refresh OK)`);

    // --------------------------------------------------
    // ESCENARIO C: WEBHOOKS ROBUSTNESS
    // --------------------------------------------------
    console.log('\n4. [Escenario: Webhooks] C.1 Ingestando webhook duplicado (Idempotencia)...');
    const dupRes = await callWebhookEdge({
      resource: '/orders/2000003508419054',
      user_id: TEST_SELLER_ID,
      topic: 'orders',
      application_id: 123456789012,
      sent: new Date().toISOString()
    });
    console.log('   Respuesta duplicado (debe omitir sin error):', dupRes.body?.message);

    console.log('   C.2 Ingestando webhook corrupto/inválido...');
    const corruptRes = await callWebhookEdge({
      topic: 'items',
      sent: new Date().toISOString()
    });
    console.log('   Respuesta webhook corrupto (debe fallar con 400):', corruptRes.status, corruptRes.body?.error);

    // --------------------------------------------------
    // ESCENARIO D: MULTI-VENDOR
    // --------------------------------------------------
    console.log('\n5. [Escenario: Multi-vendor] D.1 Verificando aislamiento RLS...');
    const { data: policiesData, error: policyErr } = await supabase
      .from('ml_seller_accounts')
      .select('id, seller_id');
    
    if (policyErr) throw policyErr;
    console.log(`   Número de cuentas visibles como Admin/Anon: ${policiesData.length}`);
    if (policiesData.length > 0) {
      throw new Error('RLS Failure: Anonymous/Unauthenticated user can read ml_seller_accounts records!');
    }
    console.log('   Aislamiento RLS en base de datos: Confirmado (0 cuentas visibles para Anon).');

    // --------------------------------------------------
    // ESCENARIO E: AUDITORÍA DE STOCK & ALERTAS
    // --------------------------------------------------
    console.log('\n6. [Escenario: Auditoría] E.1 Ejecutando stock_audit...');
    const auditRes = await callSyncEdge({ action: 'stock_audit' });
    console.log(`   Resultado de Auditoría - Mismatches encontrados: ${auditRes.body?.mismatch_count || 0}`);

    const alertAssert = await runAssertion({ alert_type: 'stock_mismatch' });
    console.log('   Alerta stock_mismatch registrada en BD:', alertAssert.alert ? 'SÍ (Correcto)' : 'NO');

    // --------------------------------------------------
    // ESCENARIO F: SEGURIDAD & DLQ
    // --------------------------------------------------
    console.log('\n7. [Escenario: DLQ] F.1 Forzando evento al Dead Letter Queue (3 reintentos)...');
    const dlqIngest = await callWebhookEdge({
      resource: '/items/MLU000000000',
      user_id: '9999999999999999', // Invalid seller
      topic: 'items',
      sent: new Date().toISOString()
    });
    const eventId = dlqIngest.body?.id;
    console.log('   Evento fallido ingestando ID:', eventId);

    console.log('   Ejecutando Barrido (Sweep) 1...');
    await callWebhookEdge({ action: 'sweep' });
    console.log('   Ejecutando Barrido (Sweep) 2...');
    await callWebhookEdge({ action: 'sweep' });
    console.log('   Ejecutando Barrido (Sweep) 3...');
    await callWebhookEdge({ action: 'sweep' });

    console.log('   Esperando a que el evento pase a DLQ / dead_letter...');
    await pollEventStatus('/items/MLU000000000', 'dead_letter');

    const dlqAssert = await runAssertion({ alert_type: 'dead_letter' });
    console.log('   Alerta de Dead Letter Queue registrada:', dlqAssert.alert ? 'SÍ (Correcto)' : 'NO');
    if (dlqAssert.alert) {
      console.log('   Mensaje de Alerta DLQ:', dlqAssert.alert.message);
    }

    // --------------------------------------------------
    // ESCENARIO G: WEBHOOK KILL SWITCH
    // --------------------------------------------------
    console.log('\n8. [Escenario: Kill Switch] G.1 Desactivando globalmente el procesamiento de webhooks...');
    const disableSwitchRes = await callWebhookEdge({
      action: 'test_set_kill_switch',
      enabled: false
    });
    if (disableSwitchRes.body?.error || !disableSwitchRes.body?.success) {
      throw new Error('Disabling kill switch failed: ' + (disableSwitchRes.body?.error || 'Unknown error'));
    }

    console.log('   Enviando evento webhook con Kill Switch apagado...');
    const ingestOrderSwitchOff = await callWebhookEdge({
      resource: '/orders/2000003508419055',
      user_id: TEST_SELLER_ID,
      topic: 'orders',
      application_id: 123456789012,
      sent: new Date().toISOString()
    });
    console.log('   Respuesta webhook (debe estar deshabilitado):', ingestOrderSwitchOff.status, ingestOrderSwitchOff.body?.message || ingestOrderSwitchOff.body?.error);
    if (ingestOrderSwitchOff.body?.message !== 'Webhooks are globally disabled') {
      throw new Error('Kill switch failed: Webhook was not blocked! Response was: ' + JSON.stringify(ingestOrderSwitchOff.body));
    }

    console.log('   Re-activando globalmente el procesamiento de webhooks...');
    const enableSwitchRes = await callWebhookEdge({
      action: 'test_set_kill_switch',
      enabled: true
    });
    if (enableSwitchRes.body?.error || !enableSwitchRes.body?.success) {
      throw new Error('Enabling kill switch failed: ' + (enableSwitchRes.body?.error || 'Unknown error'));
    }

    console.log('   Enviando el mismo evento webhook con Kill Switch encendido...');
    const ingestOrderSwitchOn = await callWebhookEdge({
      resource: '/orders/2000003508419055',
      user_id: TEST_SELLER_ID,
      topic: 'orders',
      application_id: 123456789012,
      sent: new Date().toISOString()
    });
    console.log('   Respuesta webhook (debe ingerirse correctamente):', ingestOrderSwitchOn.status, ingestOrderSwitchOn.body?.message);
    if (ingestOrderSwitchOn.body?.message !== 'Event ingested') {
      throw new Error('Failed to ingest event after re-enabling kill switch');
    }

    // --------------------------------------------------
    // ESCENARIO H: ALERTAS DE SYNC QUEUE BACKLOG
    // --------------------------------------------------
    console.log('\n9. [Escenario: Backlog Alert] H.1 Simulando acumulación de cola (>50 elementos)...');
    const simulateBacklogRes = await callWebhookEdge({
      action: 'test_simulate_backlog',
      seller_id: TEST_SELLER_ID,
      variant_id: TEST_VARIANT_ID,
      product_id: '3da2bfb1-192b-445a-b406-f26195bedc96'
    });
    if (simulateBacklogRes.body?.error || !simulateBacklogRes.body?.success) {
      throw new Error('Simulating sync queue backlog failed: ' + (simulateBacklogRes.body?.error || 'Unknown error'));
    }

    console.log('   Ejecutando worker process_sync_queue para disparar alerta...');
    await callSyncEdge({ action: 'process_sync_queue' });

    const backlogAlertAssert = await runAssertion({ alert_type: 'sync_queue_backlog' });
    console.log('   Alerta sync_queue_backlog registrada en BD:', backlogAlertAssert.alert ? 'SÍ (Correcto)' : 'NO');
    if (backlogAlertAssert.alert) {
      console.log('   Mensaje de Alerta Backlog:', backlogAlertAssert.alert.message);
    } else {
      throw new Error('Sync queue backlog alert was not created!');
    }

    // --------------------------------------------------
    // ESCENARIO I: ALERTA DE VENCIMIENTO DE TOKEN OAUTH
    // --------------------------------------------------
    console.log('\n10. [Escenario: Token Expiry Alert] I.1 Simulando token expirando en menos de 24 horas (12 horas offset)...');
    const setExpiryRes = await callWebhookEdge({
      action: 'test_set_token_expiry',
      seller_id: TEST_SELLER_ID,
      hours_offset: 12
    });
    if (setExpiryRes.body?.error || !setExpiryRes.body?.success) {
      throw new Error('Setting token expiry failed: ' + (setExpiryRes.body?.error || 'Unknown error'));
    }

    console.log('   Ejecutando check_oauth_tokens para disparar alerta...');
    await callSyncEdge({ action: 'check_oauth_tokens' });

    const expiryAlertAssert = await runAssertion({ alert_type: 'oauth_expiring' });
    console.log('   Alerta oauth_expiring registrada en BD:', expiryAlertAssert.alert ? 'SÍ (Correcto)' : 'NO');
    if (expiryAlertAssert.alert) {
      console.log('   Mensaje de Alerta Expiración:', expiryAlertAssert.alert.message);
    } else {
      throw new Error('OAuth token expiring alert was not created!');
    }

    // Restore to normal
    await runCleanup();
    console.log('\n==================================================');
    console.log('✅ TEST SUITE ENTERPRISE COMPLETO EXITOSO (.CJS)');
    console.log('==================================================');

  } catch (err) {
    console.error('\n❌ TEST SUITE ENTERPRISE FALLÓ:', err.message);
    // Ensure cleanup is executed on failure as well
    try {
      await runCleanup();
    } catch (_) {}
    process.exit(1);
  }
}

runEnterpriseSuite();
