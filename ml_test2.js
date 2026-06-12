const fs = require('fs');

const SUPABASE_URL = "https://cobtsgkwcftvexaarwmo.supabase.co";

const ML_TOKEN = "APP_USR-2640840034755802-061117-bafa5812f6fd1ba58015a6aad7d6608f-780300463";
const ITEM_ID = "MLU615886931";
const NEW_STOCK = 8;

async function run() {
    console.log("=== PRUEBA 3: MODIFICAR STOCK EN ML Y RECIBIR WEBHOOK ===");
    console.log(`1. Modificando stock directamente en la API de Mercado Libre a ${NEW_STOCK}...`);
    
    let mlRes = await fetch(`https://api.mercadolibre.com/items/${ITEM_ID}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${ML_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ available_quantity: 8 })
    });
    let mlUpdate = await mlRes.json();
    console.log(`Stock actualizado en ML: ${mlUpdate.available_quantity}`);

    console.log("\n2. Simulando recepción del Webhook oficial de Mercado Libre...");
    const webhookPayload = {
        resource: `/items/${ITEM_ID}`,
        user_id: 780300463,
        topic: "items",
        application_id: 2640840034755802,
        attempts: 1,
        sent: new Date().toISOString(),
        received: new Date().toISOString()
    };

    const webhookRes = await fetch(`${SUPABASE_URL}/functions/v1/mercadolibre-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
    });
    
    console.log(`Status Webhook: ${webhookRes.status}`);
    const webhookText = await webhookRes.text();
    console.log(`Respuesta Webhook: ${webhookText}`);

}

run().catch(console.error);
