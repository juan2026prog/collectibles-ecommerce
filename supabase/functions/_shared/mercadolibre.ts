export async function enqueueMlSyncEvent(supabaseClient: any, variantId: string) {
  try {
    // 1. Get the product info
    const { data: variant } = await supabaseClient
      .from("product_variants")
      .select("product_id")
      .eq("id", variantId)
      .maybeSingle();
      
    if (!variant?.product_id) return;
    const productId = variant.product_id;
    
    // 2. Check if product is linked to ML (check products table and ml_catalog_links)
    const { data: prod } = await supabaseClient
      .from("products")
      .select("id, ml_item_id, vendor_id")
      .eq("id", productId)
      .maybeSingle();
      
    let mlItemId = prod?.ml_item_id;
    
    if (!mlItemId) {
      const { data: link } = await supabaseClient
        .from("ml_catalog_links")
        .select("ml_item_id")
        .eq("variant_id", variantId)
        .maybeSingle();
      mlItemId = link?.ml_item_id;
    }
    
    if (mlItemId) {
      // Find matching seller_id for this vendor (or null if platform)
      const vendorId = prod?.vendor_id || null;
      let query = supabaseClient.from("ml_seller_accounts").select("seller_id");
      if (vendorId === null) {
        query = query.is("vendor_id", null);
      } else {
        query = query.eq("vendor_id", vendorId);
      }
      
      const { data: sellerAcc } = await query.limit(1).maybeSingle();
      const sellerId = sellerAcc?.seller_id || "platform_default";
      
      console.log(`[Sync Queue] Product ${productId} (variant: ${variantId}) is linked to ML: ${mlItemId}. Enqueueing sync event...`);
      
      // Insert into ml_sync_queue
      await supabaseClient
        .from("ml_sync_queue")
        .insert({
          product_id: productId,
          variant_id: variantId,
          ml_item_id: mlItemId,
          seller_id: sellerId,
          action: "sync_stock",
          payload: {}, // Empty payload, worker will resolve stock dynamically
          status: "pending",
          retry_count: 0
        });
    }
  } catch (err: any) {
    console.error("[Sync Queue] Error enqueueing ML sync event:", err.message);
  }
}
