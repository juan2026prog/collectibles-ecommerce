const SUPABASE_URL = "https://cobtsgkwcftvexaarwmo.supabase.co";
const TEST_BYPASS_SECRET = "collectibles-ml-test-secret";

async function run() {
    console.log("=== PRUEBA 5: PUBLICAR UN PRODUCTO NUEVO ===");
    console.log("Llamando al endpoint 'curate_create' (Simulando VMercadoLibre)...");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-test-bypass': TEST_BYPASS_SECRET
        },
        body: JSON.stringify({
            action: 'curate_create',
            raw_item_id: 'be3e9b70-c53f-4181-a818-616469a35df9', // MLU480371628
            title: 'Lampara De Cuarzo Rosa (Test PRUEBA 5)',
            price: 2500,
            stock: 0,
            category_id: '8c8e5b0b-9b1e-46e3-980a-db6e4d5156cd', // Some random category
            seller_id: '780300463'
        })
    });

    const data = await res.json();
    console.log("Resultado de publicación:");
    console.log(JSON.stringify(data, null, 2));
    
    if (data.success) {
        console.log("\n-> Creación exitosa.");
    } else {
        console.error("\n-> Falló la publicación.");
    }
}

run().catch(console.error);
