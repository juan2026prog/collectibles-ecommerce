import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getHandyProviderConfig } from "../_shared/handy.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface CreateHandyPaymentRequest {
  order_id: string;
  customer_email?: string;
}

function getCustomerName(order: Record<string, any>) {
  const shippingAddress = order.shipping_address || {};
  const firstName = shippingAddress.first_name || "";
  const lastName = shippingAddress.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || order.customer_email || "Cliente";
}

// Create the admin Supabase client using Service Role Key
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  // CORS Preflight Request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    console.log("create-handy-payment started");

    const user = await verifyOptionalAuth(req);
    const body = (await req.json()) as CreateHandyPaymentRequest;
    const orderId = body.order_id;
    const customerEmail = (body.customer_email || "").trim().toLowerCase();

    console.log("order_id:", orderId);

    if (!orderId) {
      throw new Error("Debes indicar order_id para generar el pago Handy.");
    }

    const handy = await getHandyProviderConfig(supabaseAdmin);
    
    console.log("Handy provider raw:", handy.provider);

    if (handy.provider.is_active !== true) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Handy no está activo",
          details: {
            provider_key: handy.provider.provider_key,
            is_active: handy.provider.is_active,
            config: handy.provider.config
          }
        }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    if (!handy.merchantSecretKey) {
      throw new Error("La merchant-secret-key de Handy no esta configurada.");
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, customer_email, customer_phone, total_amount, currency, status, payment_status, payment_method, payment_id, payment_processed_at, shipping_address, created_at, order_number"
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(
        `La orden indicada no existe. Detalles del error: ${
          orderError ? JSON.stringify(orderError) : "No hay error de consulta pero la orden no fue devuelta."
        }`
      );
    }

    if (order.payment_processed_at || order.status === "paid") {
      throw new Error("Esta orden ya fue pagada.");
    }

    if (order.payment_method !== "handy") {
      throw new Error("La orden no fue creada con el metodo de pago Handy.");
    }

    if (order.customer_id) {
      if (!user || user.id !== order.customer_id) {
        throw new Error("No tienes permisos para iniciar el pago de esta orden.");
      }
    } else if (
      !customerEmail ||
      customerEmail !== String(order.customer_email || "").toLowerCase()
    ) {
      throw new Error("No se pudo validar el email de la orden.");
    }

    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, payment_url, status, transaction_external_id")
      .eq("order_id", orderId)
      .eq("provider", "handy")
      .in("status", ["pending", "redirected"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayment?.payment_url) {
      console.log("Reusing existing payment URL for order_id:", orderId);
      return new Response(
        JSON.stringify({
          success: true,
          payment_url: existingPayment.payment_url,
          checkout_url: existingPayment.payment_url,
          transaction_external_id: existingPayment.transaction_external_id,
        }),
        {
          status: 200,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id, variant_id, quantity, unit_price, product:products(title)")
      .eq("order_id", orderId);

    if (orderItemsError || !orderItems || orderItems.length === 0) {
      throw new Error("La orden no tiene items para procesar el pago.");
    }

    const amount = Number(order.total_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("La orden no tiene un total valido para cobrar.");
    }

    const transactionExternalId = order.id;
    const safeOrderItems = Array.isArray(orderItems) ? orderItems : [];
    const isTesting = handy.environment === "testing";

    // Products mapping with strict numeric constraints
    const products = safeOrderItems.map((item: any) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || 0);
      let productAmount = unitPrice * quantity;

      // Rule: Product.Amount debe ser decimal mayor a 0. Probar con 5.00 en testing si es menor
      if (isTesting && productAmount < 5.00) {
        productAmount = 5.00;
      }

      return {
        Name: String(item.product?.title || "Producto").trim() || "Producto",
        Quantity: quantity,
        Amount: productAmount,
        TaxedAmount: 0.0, // Use 0 for TaxedAmount to avoid errors
      };
    });

    // Enforce that total matches the sum of product amounts in testing
    const sumProductsAmount = products.reduce((sum, p) => sum + p.Amount, 0);
    const finalTotalAmount = isTesting ? Math.max(amount, sumProductsAmount, 5.00) : amount;
    const currencyCode = order.currency?.toUpperCase() === "USD" ? 840 : 858;

    // Helper function to extract numeric invoice number within 32-bit signed int limit
    function extractNumericInvoiceNumber(orderNumber: string | null | undefined): number {
      if (!orderNumber) return 0;
      
      // 1. If it matches COL-YYYYMMDD-XXXX format
      const colMatch = orderNumber.match(/COL-(\d{4})(\d{2})(\d{2})-(\d{4})/i);
      if (colMatch) {
        const year = parseInt(colMatch[1], 10);
        const month = colMatch[2];
        const day = colMatch[3];
        const seq = colMatch[4];
        
        // Using year offset from 2020 to ensure it fits in a 32-bit signed integer (max 2147483647)
        // E.g., COL-20260707-0001 -> yearOffset 6 -> 607070001
        const yearOffset = year - 2020;
        const val = Number(`${yearOffset}${month}${day}${seq}`);
        if (!isNaN(val) && val > 0 && val <= 2147483647) {
          return val;
        }
      }
      
      // 2. Fallback: extract all digits
      const digits = orderNumber.replace(/\D/g, '');
      const val = Number(digits);
      if (!isNaN(val) && val > 0 && val <= 2147483647) {
        return val;
      }
      
      return 0;
    }

    const invoiceNumber = extractNumericInvoiceNumber(order.order_number);

    console.log('[HANDY_INVOICE_TRACE]', {
      orderId,
      rawOrderNumber: order?.order_number,
      rawType: typeof order?.order_number,
      extractedInvoiceNumber: invoiceNumber,
      extractedType: typeof invoiceNumber,
      length: String(invoiceNumber ?? '').length
    });

    console.log("Handy TransactionExternalId:", order.id);

    // Defensive validation: Order Items
    if (!orderItems || orderItems.length === 0) {
      throw new Error("HANDY_ORDER_WITHOUT_ITEMS");
    }

    // Defensive validation: InvoiceNumber
    if (!invoiceNumber || !/^\d+$/.test(String(invoiceNumber)) || invoiceNumber <= 0 || invoiceNumber > 2147483647) {
      throw new Error("HANDY_INVALID_INVOICE_NUMBER");
    }

    // Defensive validation: Amount
    if (!Number.isFinite(finalTotalAmount) || finalTotalAmount <= 0) {
      throw new Error("HANDY_INVALID_AMOUNT");
    }

    // Defensive validation: Currency
    if (currencyCode !== 840 && currencyCode !== 858) {
      throw new Error("HANDY_INVALID_CURRENCY");
    }

    // Ensure we do not use localhost for SiteUrl
    const siteUrl = handy.siteUrl && !handy.siteUrl.includes("localhost")
      ? handy.siteUrl.trim()
      : "https://collectibles-ecommerce.vercel.app";

    // Ensure we omit LinkImageUrl if empty or invalid
    const linkImageUrl = handy.defaultImageUrl && handy.defaultImageUrl.trim().startsWith("http")
      ? handy.defaultImageUrl.trim()
      : undefined;

    // CallbackUrl must be exactly:
    const callbackUrl = "https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/handy-webhook";

    const requestPayload = {
      Cart: {
        Currency: currencyCode,
        TotalAmount: finalTotalAmount,
        TaxedAmount: 0.0,
        Products: products,
        InvoiceNumber: invoiceNumber,
        LinkImageUrl: linkImageUrl,
        TransactionExternalId: transactionExternalId,
      },
      Client: {
        CommerceName: String(handy.commerceName || "Collectibles").trim() || "Collectibles",
        SiteUrl: siteUrl,
      },
      CallbackURL: callbackUrl,
      CallbackUrl: callbackUrl, // Send both casings to be absolutely foolproof
      ResponseType: "Json",
      Customer: {
        Name: getCustomerName(order),
        Email: order.customer_email,
        Phone: order.customer_phone || undefined,
      },
    };

    console.log("Handy payload:", JSON.stringify(requestPayload, null, 2));

    const insertPayload = {
      order_id: orderId,
      provider: "handy",
      transaction_external_id: transactionExternalId,
      amount: finalTotalAmount,
      currency: order.currency || "UYU",
      status: "pending",
      raw_request: requestPayload,
    };

    const { data: paymentRow, error: paymentInsertError } = await supabaseAdmin
      .from("payments")
      .insert(insertPayload)
      .select("id")
      .single();

    if (paymentInsertError || !paymentRow) {
      throw new Error(
        paymentInsertError?.message || "No se pudo registrar el intento de pago."
      );
    }

    console.log("calling Handy API:", `${handy.baseUrl}/payments`);

    const response = await fetch(`${handy.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchant-secret-key": handy.merchantSecretKey,
      },
      body: JSON.stringify(requestPayload),
    });

    const handyText = await response.text();
    console.error("Handy status:", response.status);
    console.error("Handy response:", handyText);

    let responseBody: Record<string, any> = {};
    try {
      responseBody = handyText ? JSON.parse(handyText) : {};
    } catch {
      responseBody = { raw: handyText };
    }

    if (!response.ok) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          raw_response: responseBody,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRow.id);

      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Handy devolvió 500",
          details: {
            handyStatus: response.status,
            handyResponse: handyText,
            sentPayload: requestPayload,
          },
        }),
        {
          status: 200,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const paymentUrl = String(responseBody.url || responseBody.paymentUrl || "");
    if (!paymentUrl) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          raw_response: responseBody,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRow.id);

      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      throw new Error("Handy no devolvio una URL de pago.");
    }

    await supabaseAdmin
      .from("payments")
      .update({
        payment_url: paymentUrl,
        status: "redirected",
        raw_response: responseBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRow.id);

    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "redirected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    console.log("create-handy-payment successfully completed");

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        checkout_url: paymentUrl,
        transaction_external_id: transactionExternalId,
      }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("create-handy-payment error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error inesperado en create-handy-payment",
      }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  }
});
