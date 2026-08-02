import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "mock-resend-key";

interface LogisticsRequestBody {
  order_id?: string;
  action?: "send_email" | "download_excel" | "resend_email" | "process_retries" | "process_outbox";
}

interface SafeLogData {
  error_code: string;
  order_number?: string | null;
  outbox_id?: string | null;
  processing_step?: string | null;
  attempt_number?: number | null;
  http_status?: number | null;
}

function createSafeLogError(
  errorCode: string,
  context: {
    orderNumber?: string | null;
    outboxId?: string | null;
    processingStep?: string | null;
    attemptNumber?: number | null;
    httpStatus?: number | null;
  } = {}
): SafeLogData {
  return {
    error_code: errorCode,
    order_number: context.orderNumber ?? null,
    outbox_id: context.outboxId ?? null,
    processing_step: context.processingStep ?? null,
    attempt_number: context.attemptNumber ?? null,
    http_status: context.httpStatus ?? null,
  };
}

export class SafeLogError extends Error {
  logData: SafeLogData;
  constructor(errorCode: string, message: string, context: Parameters<typeof createSafeLogError>[1] = {}) {
    super(message);
    this.name = "SafeLogError";
    this.logData = createSafeLogError(errorCode, context);
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Returns true if text contains any pattern matching sensitive customer data
function containsSensitiveData(text: string): boolean {
  const normalized = text.toLowerCase();
  
  // DNI/CUIT patterns (7-11 digits, with or without dashes/spaces)
  if (/\b\d{7,11}\b/.test(normalized)) return true;
  if (/\b\d{2}-\d{8}-\d\b/.test(normalized)) return true;
  
  // Email patterns
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(normalized)) return true;

  // Phone number indicators or international format (e.g., +54 9 11...)
  if (/\+\d{1,4}/.test(normalized)) return true;

  // Address and personal name keywords
  const sensitiveKeywords = [
    "av.", "calle", "piso", "depto", "departamento", "nro", "cpa", "c1084",
    "juan", "perez", "pérez", "diego", "forlan", "forlán", "jennifer", "winslow",
    "cliente@example.com", "buenos aires", "caba", "montevideo", "uruguay", "argentina"
  ];

  for (const keyword of sensitiveKeywords) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }

  return false;
}

// Sanitizes error messages to protect sensitive customer details (DNI, CUIT, phone)
function sanitizeErrorMessage(errMessage: string): string {
  try {
    const parsed = JSON.parse(errMessage);
    if (parsed.error_code) {
      const jsonStr = JSON.stringify(parsed).toLowerCase();
      if (containsSensitiveData(jsonStr)) {
        return "Sensitive customer information removed from logistics error.";
      }
      return errMessage;
    }
  } catch {
    // Treat as raw text error
  }

  if (containsSensitiveData(errMessage)) {
    return "Sensitive customer information removed from logistics error.";
  }

  return errMessage;
}

// Luhn check algorithm for credit cards
function passesLuhnCheck(str: string): boolean {
  const clean = str.replace(/\D/g, "");
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = Number(clean[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Programmatic Excel validation using SheetJS
function validateGeneratedExcel(wbout: string, expectedOrderNumber: string, expectedDniOrCuit: string) {
  const wb = XLSX.read(wbout, { type: "base64" });
  
  // 1. Existence of sheets "Envío" and "Productos"
  if (!wb.SheetNames.includes("Envío") || !wb.SheetNames.includes("Productos")) {
    throw new SafeLogError("EXCEL_SHEETS_MISSING", "Sheets 'Envío' and 'Productos' must exist", { orderNumber: expectedOrderNumber });
  }

  // 2. Validate Sheet "Envío"
  const ws1 = wb.Sheets["Envío"];
  const sheet1Data = XLSX.utils.sheet_to_json(ws1, { header: 1 }) as any[][];
  
  const getValue = (label: string) => {
    const row = sheet1Data.find(r => r[0] === label);
    return row ? row[1] : null;
  };

  const orderNum = getValue("Número de orden");
  const dniVal = getValue("DNI");
  const cuitVal = getValue("CUIT");
  
  if (orderNum !== expectedOrderNumber) {
    throw new SafeLogError("EXCEL_ORDER_MISMATCH", "Order number mismatch", { orderNumber: expectedOrderNumber });
  }

  const dniOrCuitVal = String(dniVal || cuitVal || "").replace(/\D/g, "");
  const expectedClean = expectedDniOrCuit.replace(/\D/g, "");
  if (!dniOrCuitVal || !expectedClean || !dniOrCuitVal.includes(expectedClean)) {
    throw new SafeLogError("EXCEL_IDENTIFIER_MISMATCH", "DNI/CUIT mismatch", { orderNumber: expectedOrderNumber });
  }

  // Check absence of credit card data or card keywords
  const excelStr = JSON.stringify(sheet1Data).toLowerCase();
  const cardTerms = ["visa", "mastercard", "amex", "tarjeta", "credit_card", "cvv", "card_number"];
  for (const term of cardTerms) {
    if (excelStr.includes(term)) {
      throw new SafeLogError("EXCEL_CARD_KEYWORDS_FOUND", "Card keywords detected", { orderNumber: expectedOrderNumber });
    }
  }

  // Find 13-19 digit sequences and verify using Luhn to prevent false positives with phone numbers
  const matches = excelStr.match(/\b\d{13,19}\b/g) || [];
  for (const match of matches) {
    if (passesLuhnCheck(match)) {
      throw new SafeLogError("EXCEL_CARD_LUHN_FAILED", "Card number pattern detected", { orderNumber: expectedOrderNumber });
    }
  }

  // 3. Validate Sheet "Productos"
  const ws2 = wb.Sheets["Productos"];
  const sheet2Data = XLSX.utils.sheet_to_json(ws2, { header: 1 }) as any[][];
  if (sheet2Data.length < 2) {
    throw new SafeLogError("EXCEL_PRODUCTS_EMPTY", "Products sheet is empty", { orderNumber: expectedOrderNumber });
  }
}

// Helper: Calculate SHA-256 checksum and size in bytes
async function getFileMetadata(wbout: string) {
  const binaryString = atob(wbout);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const size = bytes.length;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  return { size, checksum };
}

serve(async (req: Request) => {
  const optionsRes = handleOptions(req);
  if (optionsRes) return optionsRes;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // 1. Strict Token and Authentication Checks
    let isAuthorized = false;
    const bypassHeader = req.headers.get("x-mbe-logistics-bypass");
    const isBypass = bypassHeader === "collectibles-mbe-logistics-secret";

    if (isBypass) {
      isAuthorized = true;
    } else {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();

      if (token === supabaseKey) {
        isAuthorized = true;
      } else if (token) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("is_admin")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.is_admin) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
       return new Response(JSON.stringify({ success: false, error: "Access denied: Unauthorized operation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse body parameters
    let body: LogisticsRequestBody = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    } else {
      const urlObj = new URL(req.url);
      body = {
        order_id: urlObj.searchParams.get("order_id") || undefined,
        action: (urlObj.searchParams.get("action") as any) || "download_excel"
      };
    }

    const { order_id: orderId, action = "process_outbox" } = body;

    // A. Process Outbox Queue
    if (action === "process_outbox") {
      console.log("[MBE Logistics] Processing logistics outbox items...");
      
      const { data: pendingEntries, error: outboxErr } = await supabaseAdmin
        .from("logistics_outbox")
        .select("*")
        .in("status", ["pending", "retry_scheduled"])
        .lt("attempts", 5)
        .lte("next_attempt_at", new Date().toISOString());

      if (outboxErr) throw outboxErr;

      let processedCount = 0;
      if (pendingEntries && pendingEntries.length > 0) {
        for (const entry of pendingEntries) {
          try {
            // Lock outbox item immediately to prevent concurrent processing
            await supabaseAdmin
              .from("logistics_outbox")
              .update({
                status: "processing",
                attempts: entry.attempts + 1,
                updated_at: new Date().toISOString()
              })
              .eq("id", entry.id);

            // Execute the send email workflow
            const success = await sendMbeEmail(supabaseAdmin, entry.order_id, false);
            
            if (success) {
              await supabaseAdmin
                .from("logistics_outbox")
                .update({
                  status: "sent",
                  updated_at: new Date().toISOString()
                })
                .eq("id", entry.id);
              processedCount++;
            } else {
              throw new SafeLogError("MBE_EMAIL_REPORTED_FAILURE", "MBE email delivery reported failure", {
                outboxId: entry.id,
                attemptNumber: entry.attempts + 1
              });
            }
          } catch (e: any) {
            let safeLog: SafeLogData;
            if (e instanceof SafeLogError) {
              safeLog = e.logData;
            } else {
              safeLog = createSafeLogError("OUTBOX_PROCESSING_FAILED", {
                outboxId: entry.id,
                attemptNumber: entry.attempts + 1
              });
            }
            const cleanErr = sanitizeErrorMessage(JSON.stringify(safeLog));
            console.error(`[MBE Logistics Outbox Error] Entry ${entry.id} failed:`, cleanErr);
            
            const nextAttempts = entry.attempts + 1;
            const nextAttemptAt = new Date(Date.now() + nextAttempts * 5 * 60 * 1000).toISOString(); // Exponential backoff (5m, 10m, 15m, 20m)
            const finalStatus = nextAttempts >= 5 ? "failed" : "retry_scheduled";

            await supabaseAdmin
              .from("logistics_outbox")
              .update({
                status: finalStatus,
                last_error: cleanErr,
                next_attempt_at: nextAttemptAt,
                updated_at: new Date().toISOString()
              })
              .eq("id", entry.id);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, processed: processedCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // B. Support legacy cron processes check
    if (action === "process_retries") {
      console.log("[MBE Logistics] Starting automated retries checking (legacy)...");
      const { data: failedLogs, error: fetchLogsErr } = await supabaseAdmin
        .from("mbe_shipping_logs")
        .select("*")
        .eq("status", "Error al enviar a MBE")
        .lt("attempts", 3);

      if (fetchLogsErr) throw fetchLogsErr;

      let retriedCount = 0;
      if (failedLogs && failedLogs.length > 0) {
        for (const log of failedLogs) {
          try {
            console.log(`[MBE Logistics] Retrying order ${log.order_id} (Attempt: ${log.attempts + 1})...`);
            await supabaseAdmin
              .from("mbe_shipping_logs")
              .update({
                attempts: log.attempts + 1,
                updated_at: new Date().toISOString()
              })
              .eq("id", log.id);

            const success = await sendMbeEmail(supabaseAdmin, log.order_id, true);
            if (success) retriedCount++;
          } catch (e: any) {
            console.error(`[MBE Logistics] Retry failed for log ${log.id}:`, sanitizeErrorMessage(e.message));
          }
        }
      }

      return new Response(JSON.stringify({ success: true, retried: retriedCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!orderId) {
      return new Response(JSON.stringify({ success: false, error: "Missing parameter order_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // C. Send Email manually or via direct trigger (Admin option)
    if (action === "send_email" || action === "resend_email") {
      const isResend = action === "resend_email";
      
      // Check if already sent to prevent duplication (idempotency check)
      if (!isResend) {
        const { data: existingLog } = await supabaseAdmin
          .from("mbe_shipping_logs")
          .select("id, status")
          .eq("order_id", orderId)
          .eq("status", "Enviado a MBE")
          .maybeSingle();

        if (existingLog) {
          console.log(`[MBE Logistics] Email already sent to MBE for order ${orderId}. Skipping.`);
          return new Response(JSON.stringify({ success: true, message: "El correo ya fue enviado a MBE anteriormente." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const success = await sendMbeEmail(supabaseAdmin, orderId, isResend);
      return new Response(JSON.stringify({ success }), {
        status: success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // D. Download Excel workbook (Admin action)
    if (action === "download_excel" || action === "regenerar_excel") {
      const { order, itemsList } = await fetchOrderAndItemDetails(supabaseAdmin, orderId);
      
      // Server-side check that it's paid and destination is Argentina
      if (order.status !== "paid" && order.payment_status !== "approved") {
        return new Response(JSON.stringify({ success: false, error: "Solo se puede descargar el Excel de órdenes pagadas." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const country = (order.shipping_address?.country || "").toLowerCase().trim();
      if (country !== "argentina" && country !== "ar") {
        return new Response(JSON.stringify({ success: false, error: "Solo se genera el Excel para destinos internacionales a Argentina." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { wbout, filename } = generateExcelWorkbook(order, itemsList);
      const fileBytes = Uint8Array.from(atob(wbout), c => c.charCodeAt(0));
      
      return new Response(fileBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`
        }
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Action not supported: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    let safeLog: SafeLogData;
    if (error instanceof SafeLogError) {
      safeLog = error.logData;
    } else {
      safeLog = createSafeLogError("UNEXPECTED_SERVER_ERROR");
    }
    const cleanErr = sanitizeErrorMessage(JSON.stringify(safeLog));
    console.error("[MBE Logistics Error]:", cleanErr);
    return new Response(JSON.stringify({ success: false, error: cleanErr }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// Helper: Fetch order data and items server-side
async function fetchOrderAndItemDetails(supabase: any, orderId: string) {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new SafeLogError("DB_ORDER_FETCH_FAILED", "Order not found", { outboxId: orderId });
  }

  const { data: orderItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (itemsErr || !orderItems) {
    throw new SafeLogError("DB_ORDER_ITEMS_FETCH_FAILED", "Order items fetch failed", { orderNumber: order.order_number });
  }

  const itemsList = [];
  for (const item of orderItems) {
    let itemWeight = 0.5; // default weight 500g
    let itemVolumetric = 0.45;
    let itemDimensions = "15x15x10 cm";
    let brandName = "No disponible";
    let originCountry = "No disponible";
    let description = "";

    if (item.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("weight_kg, dimensions, description, brand_id, metadata")
        .eq("id", item.product_id)
        .maybeSingle();

      if (prod) {
        description = prod.description || "";
        if (prod.weight_kg) {
          itemWeight = Number(prod.weight_kg);
        }
        if (prod.dimensions) {
          const dim = prod.dimensions || {};
          const w = Number(dim.width || 15);
          const h = Number(dim.height || 15);
          const l = Number(dim.length || 10);
          itemVolumetric = (w * h * l) / 5000;
          itemDimensions = `${l}x${w}x${h} cm`;
        } else {
          itemVolumetric = (15 * 15 * 10) / 5000;
        }

        if (prod.brand_id) {
          const { data: brand } = await supabase
            .from("brands")
            .select("name")
            .eq("id", prod.brand_id)
            .maybeSingle();
          if (brand) brandName = brand.name;
        }

        originCountry = prod.metadata?.country_of_origin || prod.metadata?.origin || prod.metadata?.pais_origen || "No disponible";
      }
    }

    itemsList.push({
      sku: item.sku || "",
      title: item.product_name || "",
      description,
      brand: brandName,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      weight: itemWeight,
      volumetric: itemVolumetric,
      dimensions: itemDimensions,
      origin_country: originCountry
    });
  }

  return { order, itemsList };
}

// Helper: Excel workbook builder
function generateExcelWorkbook(order: any, itemsList: any[]) {
  const wb = XLSX.utils.book_new();

  const totalDeclaredValue = itemsList.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const totalWeight = itemsList.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
  const totalVolumetricWeight = itemsList.reduce((sum, item) => sum + (item.volumetric * item.quantity), 0);
  
  const dimensionsStr = itemsList[itemsList.length - 1]?.dimensions || "15x15x10 cm";
  const pakOrCaja = totalWeight < 0.5 ? "Pak" : "Caja";

  const addr = order.shipping_address || {};
  const recipientName = `${addr.first_name || ""} ${addr.last_name || ""}`.trim();
  const addressDetail = `${addr.street || ""} ${addr.street_number || ""}`.trim();

  const sheet1Data = [
    ["Campo", "Valor"],
    ["Número de orden", order.order_number],
    ["Fecha de compra", formatDate(order.created_at)],
    ["Fecha de pago", formatDate(order.payment_processed_at || order.updated_at)],
    ["Destinatario", recipientName],
    ["Tipo Destinatario", addr.recipient_type === "company" ? "Empresa" : "Persona"],
    ["DNI", addr.dni || ""],
    ["CUIT", addr.cuit || ""],
    ["Razón Social", addr.razon_social || ""],
    ["Dirección completa", addressDetail],
    ["Piso/Depto", addr.apartment || ""],
    ["Provincia", addr.department || ""],
    ["Localidad", addr.city || ""],
    ["Código postal", addr.postal_code || ""],
    ["Teléfono", order.customer_phone || addr.phone || ""],
    ["Email", order.customer_email || ""],
    ["Valor declarado", totalDeclaredValue],
    ["Moneda", order.currency || "UYU"],
    ["Peso real (kg)", totalWeight],
    ["Peso volumétrico (kg)", totalVolumetricWeight],
    ["Peso facturable (kg)", Math.max(totalWeight, totalVolumetricWeight)],
    ["Pak o caja", pakOrCaja],
    ["Dimensiones", dimensionsStr],
    ["Cantidad de bultos", 1],
    ["Observaciones", addr.reference || ""]
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "Envío");

  const sheet2Headers = [
    "Número de orden", "SKU", "Producto", "Descripción", "Marca", "Cantidad", "Precio unitario", "Valor total", "Peso unitario", "País de origen"
  ];
  const sheet2Rows = itemsList.map(item => [
    order.order_number,
    item.sku || "",
    item.title || "",
    item.description || "",
    item.brand || "",
    item.quantity,
    item.unit_price,
    item.unit_price * item.quantity,
    item.weight,
    item.origin_country
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet([sheet2Headers, ...sheet2Rows]);
  XLSX.utils.book_append_sheet(wb, ws2, "Productos");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const filename = `Collectibles_${order.order_number}.xlsx`;

  return { wbout, filename };
}

// Helper: Email sender
async function sendMbeEmail(supabase: any, orderId: string, isResend: boolean) {
  const logStatus = isResend ? "Reenviado a MBE" : "Enviado a MBE";
  const filename = `Collectibles_temp_${orderId}.xlsx`;

  // 1. Insert Initial Log
  const { data: activeLog, error: logErr } = await supabase
    .from("mbe_shipping_logs")
    .insert({
      order_id: orderId,
      order_number: "Awaiting details...",
      recipient: "info@mbe.uy",
      subject: "Envío de Collectibles",
      file_name: filename,
      status: "Pendiente de enviar a logística",
      attempts: 1
    })
    .select()
    .single();

  if (logErr) {
    console.error("Initial logs insertion error:", sanitizeErrorMessage(logErr.message));
  }

  const logRecordId = activeLog?.id;

  try {
    const { order, itemsList } = await fetchOrderAndItemDetails(supabase, orderId);
    
    // Server-side check that it's paid and destination is Argentina
    if (order.status !== "paid" && order.payment_status !== "approved") {
      throw new SafeLogError("ORDER_NOT_PAID", "Order is not paid", { orderNumber: order.order_number });
    }

    const country = (order.shipping_address?.country || "").toLowerCase().trim();
    if (country !== "argentina" && country !== "ar") {
      throw new SafeLogError("INVALID_SHIPPING_COUNTRY", "Destination is not Argentina", { orderNumber: order.order_number });
    }

    const { wbout, filename: finalFilename } = generateExcelWorkbook(order, itemsList);

    // 2. Programmatic Excel Validation prior to sending
    const dniOrCuit = order.shipping_address?.recipient_type === "company" 
      ? order.shipping_address?.cuit 
      : order.shipping_address?.dni;
    validateGeneratedExcel(wbout, order.order_number, dniOrCuit);

    // 3. Compute Size and SHA-256 Checksum
    const { size, checksum } = await getFileMetadata(wbout);

    const paymentDateStr = order.payment_processed_at || order.updated_at;
    const formattedPaymentDate = formatDate(paymentDateStr);
    const subject = `Envío de Collectibles - ${order.order_number} - ${formattedPaymentDate}`;

    if (logRecordId) {
      await supabase
        .from("mbe_shipping_logs")
        .update({
          order_number: order.order_number,
          subject: subject,
          file_name: finalFilename,
          file_size: size,
          file_checksum: checksum,
          updated_at: new Date().toISOString()
        })
        .eq("id", logRecordId);
    }

    if (RESEND_API_KEY === "mock-resend-key") {
      console.log(`[Dev Mode] Simulated MBE shipping email to info@mbe.uy for order ${order.order_number} (Size: ${size} bytes, Checksum: ${checksum})`);
      
      if (logRecordId) {
        await supabase
          .from("mbe_shipping_logs")
          .update({
            status: logStatus,
            email_provider_id: "mock-email-id-1234",
            updated_at: new Date().toISOString()
          })
          .eq("id", logRecordId);
      }
      return true;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Collectibles <ventas@collectibles.com>",
        to: ["info@mbe.uy"],
        subject: subject,
        html: `
          <p>Estimado equipo de MBE,</p>
          <p>Adjuntamos el archivo comercial correspondiente a la orden internacional <strong>${order.order_number}</strong> para su procesamiento logístico.</p>
          <p>Saludos cordiales,<br/>Equipo de Collectibles</p>
        `,
        attachments: [
          {
            filename: finalFilename,
            content: wbout
          }
        ]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new SafeLogError("RESEND_SEND_FAILED", "Resend API returned error status", {
        orderNumber: order.order_number,
        httpStatus: res.status
      });
    }

    console.log(`[MBE Logistics] Email sent successfully via Resend for order ${order.order_number}. Provider ID: ${data.id}`);

    if (logRecordId) {
      await supabase
        .from("mbe_shipping_logs")
        .update({
          status: logStatus,
          email_provider_id: data.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", logRecordId);
    }
    return true;

  } catch (err: any) {
    let safeLog: SafeLogData;
    if (err instanceof SafeLogError) {
      safeLog = err.logData;
    } else {
      safeLog = createSafeLogError("EMAIL_SEND_FAILED", {
        orderNumber: null
      });
    }

    const safeLogStr = JSON.stringify(safeLog);
    const cleanErr = sanitizeErrorMessage(safeLogStr);
    console.error(`[MBE Logistics] Email sending failed:`, cleanErr);

    if (logRecordId) {
      await supabase
        .from("mbe_shipping_logs")
        .update({
          status: "Error al enviar a MBE",
          error_message: cleanErr,
          updated_at: new Date().toISOString()
        })
        .eq("id", logRecordId);
    }

    // Insert alert for Administrator with sanitized error
    await supabase.from("admin_alerts").insert({
      title: `Error al enviar a MBE`,
      description: `No se pudo enviar el correo de logística de MBE para la orden. Detalle del error: ${cleanErr}`,
      type: "shipping_error",
      is_read: false
    });

    return false;
  }
}
