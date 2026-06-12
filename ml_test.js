const fs = require('fs');

const SUPABASE_URL = "https://cobtsgkwcftvexaarwmo.supabase.co";

const ML_TOKEN = "APP_USR-2640840034755802-061117-bafa5812f6fd1ba58015a6aad7d6608f-780300463";
const ITEM_ID = "MLU615886931";

async function run() {
    console.log("=== PRUEBA 2: MODIFICAR STOCK Y VALIDAR CRON ===");
    console.log("1. Modificando stock local en vendor_product_variants a 9 (Hecho en auditoria previa)");
    
    console.log("2. Forzando ejecución del webhook/cron sweep...");
    const resSync = await fetch(`${SUPABASE_URL}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
            'x-test-bypass': 'collectibles-ml-test-secret',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: "process_sync_queue" })
    });
    
    console.log("Status de la invocación al cron:", resSync.status);
    const syncText = await resSync.text();
    console.log("Respuesta del cron:", syncText);

    console.log("3. Consultando stock final en ML mediante API (sin usar Supabase)...");
    
    let res = await fetch(`https://api.mercadolibre.com/items/${ITEM_ID}`, {
        headers: { Authorization: `Bearer ${ML_TOKEN}` }
    });
    let item = await res.json();
    console.log(`\n--- DATA OFICIAL DE MERCADOLIBRE ---`);
    console.log(`- Item ID: ${item.id}`);
    console.log(`- Título: ${item.title}`);
    console.log(`- Stock (available_quantity): ${item.available_quantity}`);
    console.log(`------------------------------------\n`);
}

run().catch(console.error);
