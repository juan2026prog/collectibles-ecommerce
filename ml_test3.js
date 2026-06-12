const fs = require('fs');
const SUPABASE_URL = "https://cobtsgkwcftvexaarwmo.supabase.co";

async function run() {
    console.log("3. Forzando procesamiento de webhooks locales...");
    const resSync = await fetch(`${SUPABASE_URL}/functions/v1/mercadolibre-webhook`, {
        method: 'POST',
        headers: {
            'x-test-bypass': 'collectibles-ml-test-secret',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: "sweep" })
    });
    
    console.log(`Status Sync Webhooks: ${resSync.status}`);
    const syncText = await resSync.text();
    console.log(`Respuesta Sync Webhooks: ${syncText}`);
}

run().catch(console.error);
