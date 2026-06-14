import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function maskPhone(phone: string): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length <= 7) return '********';
  return `${clean.slice(0, 4)}******${clean.slice(-3)}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { event_type, webhook_secret, order_id, payout_id, variant_id, product_id, shipment_id, vendor_id: body_vendor_id } = body;

    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let isAuthorized = false;
    if (token === supabaseServiceKey) {
      isAuthorized = true;
    } else if (webhook_secret) {
      const { data: secretSetting } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_webhook_secret')
        .maybeSingle();
      if (secretSetting && secretSetting.value === webhook_secret) {
        isAuthorized = true;
      }
    }

    // If it's a test notification, we allow the vendor user to authorize it using their own user JWT token
    if (!isAuthorized && event_type === 'test_notification' && token) {
      try {
        const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
        if (authUser && authUser.id === body_vendor_id) {
          isAuthorized = true;
        }
      } catch (err) {
        console.error("[WhatsApp Function] Failed to verify user token:", err);
      }
    }

    if (!isAuthorized) {
      console.error("[WhatsApp Function] Unauthorized invocation attempt.");
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    console.log(`[WhatsApp Function] Processing event: ${event_type}`, body);

    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || 'mock-whatsapp-key';
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || '1234567890';

    // Helper to log notifications
    const logNotification = async (scope: 'vendor' | 'admin', targetVendorId: string | null, recipientPhone: string, status: string, errorMsg: string | null = null) => {
      const masked = maskPhone(recipientPhone);
      await supabaseAdmin.from('notification_logs').insert({
        scope,
        vendor_id: targetVendorId,
        event_type,
        recipient_number_masked: masked,
        status,
        error_message: errorMsg
      });
    };

    // Helper to send real or simulated SMS/WhatsApp
    const dispatchWhatsApp = async (phone: string, text: string): Promise<{ status: string; error: string | null }> => {
      if (!WHATSAPP_TOKEN || WHATSAPP_TOKEN === 'mock-whatsapp-key' || !WHATSAPP_TOKEN.startsWith('EAAG')) {
        console.log(`[WhatsApp Simulated] To: ${phone} | Body: ${text}`);
        return { status: 'queued', error: 'pending provider connection' };
      }

      try {
        const cleanPhone = phone.replace(/[\+\s\-]/g, '');
        const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { body: text, preview_url: false }
          })
        });
        
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || JSON.stringify(data));
        }
        return { status: 'sent', error: null };
      } catch (err: any) {
        console.error(`[WhatsApp API Error] To: ${phone}`, err.message);
        return { status: 'failed', error: err.message };
      }
    };

    // 2. Event Handlers & Data Loading
    if (event_type === 'order_paid') {
      // Load Order details
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();
      
      if (orderErr || !order) throw new Error("Order not found");

      // Load order items with products and vendors
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity, unit_price, product_id, products(title, vendor_id, vendors(store_name))')
        .eq('order_id', order_id);

      const itemsList = items || [];
      const orderIdShort = order.id.slice(0, 8).toUpperCase();
      
      let clientName = 'Cliente';
      if (order.shipping_address && typeof order.shipping_address === 'object') {
        const addr = order.shipping_address as any;
        if (addr.first_name) {
          clientName = `${addr.first_name} ${addr.last_name || ''}`.trim();
        }
      }

      // Group items by vendor
      const vendorItems: Record<string, { store_name: string; items: any[]; total: number }> = {};
      let collectiblesTotal = 0;
      let hasVendorItems = false;

      itemsList.forEach((item: any) => {
        const product = item.products;
        if (product && product.vendor_id) {
          hasVendorItems = true;
          if (!vendorItems[product.vendor_id]) {
            vendorItems[product.vendor_id] = {
              store_name: product.vendors?.store_name || 'Tienda',
              items: [],
              total: 0
            };
          }
          vendorItems[product.vendor_id].items.push(item);
          vendorItems[product.vendor_id].total += Number(item.unit_price || 0) * item.quantity;
        } else {
          collectiblesTotal += Number(item.unit_price || 0) * item.quantity;
        }
      });

      // A. Notify Vendors involved
      for (const [vendorId, group] of Object.entries(vendorItems)) {
        const { data: settings } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', vendorId)
          .eq('is_active', true)
          .eq('notify_new_sale', true)
          .maybeSingle();

        if (settings) {
          const productLines = group.items.map(it => `- ${it.products?.title} (x${it.quantity})`).join('\n');
          const message = `Nueva venta en tu tienda\n\nPedido: #${orderIdShort}\nTotal: $${group.total.toLocaleString()}\nProductos: ${group.items.length}\n${productLines}\nCliente: ${clientName}\nEstado: Pago aprobado\n\nVer en panel:\nhttps://collectibles.uy/vendor?tab=orders`;
          
          const numbers = (settings.whatsapp_numbers || []) as any[];
          for (const n of numbers) {
            if (n.enabled && n.number) {
              const res = await dispatchWhatsApp(n.number, message);
              await logNotification('vendor', vendorId, n.number, res.status, res.error);
            }
          }
        }
      }

      // B. Notify Collectibles Admin
      const { data: adminSettings } = await supabaseAdmin
        .from('admin_notification_settings')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (adminSettings) {
        const numbers = (adminSettings.whatsapp_numbers || []) as any[];

        // Case 1: Collectibles Own Sales
        if (collectiblesTotal > 0 && adminSettings.notify_own_sales) {
          const message = `Nueva venta en Collectibles\n\nPedido: #${orderIdShort}\nTotal: $${collectiblesTotal.toLocaleString()}\nCliente: ${clientName}\nMétodo de pago: ${order.payment_method || 'Mercado Pago'}`;
          for (const n of numbers) {
            if (n.enabled && n.number) {
              const res = await dispatchWhatsApp(n.number, message);
              await logNotification('admin', null, n.number, res.status, res.error);
            }
          }
        }

        // Case 2: Vendor Sales for Admin
        if (hasVendorItems && adminSettings.notify_vendor_sales) {
          for (const [vendorId, group] of Object.entries(vendorItems)) {
            // Estimate commission based on vendor's commission rate
            const { data: vendorData } = await supabaseAdmin
              .from('vendors')
              .select('base_commission_rate')
              .eq('id', vendorId)
              .maybeSingle();
            
            const rate = Number(vendorData?.base_commission_rate || 10);
            const estCommission = (group.total * rate) / 100;

            const message = `Nueva venta Marketplace\n\nVendor: ${group.store_name}\nPedido: #${orderIdShort}\nTotal: $${group.total.toLocaleString()}\nComisión estimada: $${estCommission.toLocaleString()}`;
            
            for (const n of numbers) {
              if (n.enabled && n.number) {
                const res = await dispatchWhatsApp(n.number, message);
                await logNotification('admin', null, n.number, res.status, res.error);
              }
            }
          }
        }
      }

    } else if (event_type === 'payout_paid') {
      // Load payout details
      const { data: payout } = await supabaseAdmin
        .from('vendor_payouts')
        .select('*, vendors(store_name)')
        .eq('id', payout_id)
        .single();
      
      if (payout) {
        const { data: settings } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', payout.vendor_id)
          .eq('is_active', true)
          .eq('notify_payout_paid', true)
          .maybeSingle();

        if (settings) {
          const dateStr = payout.paid_at ? new Date(payout.paid_at).toLocaleDateString('es-UY') : new Date().toLocaleDateString('es-UY');
          const message = `Liquidación pagada\n\nMonto: $${Number(payout.amount).toLocaleString()}\nFecha: ${dateStr}`;
          
          const numbers = (settings.whatsapp_numbers || []) as any[];
          for (const n of numbers) {
            if (n.enabled && n.number) {
              const res = await dispatchWhatsApp(n.number, message);
              await logNotification('vendor', payout.vendor_id, n.number, res.status, res.error);
            }
          }
        }
      }

    } else if (event_type === 'low_stock') {
      // Load variant details
      const { data: variant } = await supabaseAdmin
        .from('product_variants')
        .select('*, products(title, vendor_id)')
        .eq('id', variant_id)
        .single();
      
      if (variant && variant.products) {
        const product = variant.products;
        const vendorId = product.vendor_id;
        const message = `Producto con stock bajo\n\nProducto: ${product.title} (${variant.name})\nSKU: ${variant.sku || 'N/A'}\nStock actual: ${variant.inventory_count}`;

        // A. Notify Vendor
        if (vendorId) {
          const { data: settings } = await supabaseAdmin
            .from('vendor_notification_settings')
            .select('*')
            .eq('vendor_id', vendorId)
            .eq('is_active', true)
            .eq('notify_low_stock', true)
            .maybeSingle();

          if (settings) {
            const numbers = (settings.whatsapp_numbers || []) as any[];
            for (const n of numbers) {
              if (n.enabled && n.number) {
                const res = await dispatchWhatsApp(n.number, message);
                await logNotification('vendor', vendorId, n.number, res.status, res.error);
              }
            }
          }
        }

        // B. Notify Admin
        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_active', true)
          .eq('notify_low_stock', true)
          .maybeSingle();

        if (adminSettings) {
          const numbers = (adminSettings.whatsapp_numbers || []) as any[];
          for (const n of numbers) {
            if (n.enabled && n.number) {
              const res = await dispatchWhatsApp(n.number, message);
              await logNotification('admin', null, n.number, res.status, res.error);
            }
          }
        }
      }

    } else if (event_type === 'shipment_created' || event_type === 'shipment_delivered') {
      // Load shipment and order details
      const { data: shipment } = await supabaseAdmin
        .from('shipments')
        .select('*, orders(shipping_address, customer_phone)')
        .eq('id', shipment_id)
        .single();
      
      if (shipment) {
        const orderIdShort = shipment.order_id.slice(0, 8).toUpperCase();
        let customerName = shipment.customer_name;
        let city = shipment.customer_city || 'Montevideo';
        
        if (!customerName && shipment.orders && typeof shipment.orders === 'object') {
          const ord = shipment.orders as any;
          if (ord.shipping_address && typeof ord.shipping_address === 'object') {
            const addr = ord.shipping_address;
            if (addr.first_name) {
              customerName = `${addr.first_name} ${addr.last_name || ''}`.trim();
            }
            if (addr.city) {
              city = addr.city;
            }
          }
        }
        if (!customerName) customerName = 'Cliente';
        
        let message = '';
        if (event_type === 'shipment_created') {
          message = `Pedido enviado\n\nPedido: #${orderIdShort}\nDestino: ${city}\nProveedor: ${shipment.provider_key}\nGuía: ${shipment.tracking_code || shipment.external_guide || 'Ver panel'}`;
        } else {
          message = `Pedido entregado\n\nPedido: #${orderIdShort}\nCliente: ${customerName}\nEstado: Entregado ✅`;
        }

        // A. Notify Vendor
        if (body_vendor_id) {
          const { data: settings } = await supabaseAdmin
            .from('vendor_notification_settings')
            .select('*')
            .eq('vendor_id', body_vendor_id)
            .eq('is_active', true)
            .eq('notify_order_shipped', true)
            .maybeSingle();

          if (settings) {
            const numbers = (settings.whatsapp_numbers || []) as any[];
            for (const n of numbers) {
              if (n.enabled && n.number) {
                const res = await dispatchWhatsApp(n.number, message);
                await logNotification('vendor', body_vendor_id, n.number, res.status, res.error);
              }
            }
          }
        }

        // B. Notify Admin
        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_active', true)
          .eq('notify_shipping_events', true)
          .maybeSingle();

        if (adminSettings) {
          const numbers = (adminSettings.whatsapp_numbers || []) as any[];
          for (const n of numbers) {
            if (n.enabled && n.number) {
              const res = await dispatchWhatsApp(n.number, message);
              await logNotification('admin', null, n.number, res.status, res.error);
            }
          }
        }
      }
    } else if (event_type === 'test_notification') {
      if (!body_vendor_id) {
        throw new Error("vendor_id is required for test_notification");
      }

      // Try to get numbers from request body, otherwise load from DB
      let activeNumbers: any[] = [];
      if (body.whatsapp_numbers && Array.isArray(body.whatsapp_numbers)) {
        activeNumbers = body.whatsapp_numbers.filter((n: any) => n.enabled && n.number);
      } else {
        const { data: settings, error: settingsErr } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', body_vendor_id)
          .maybeSingle();

        if (settingsErr) throw settingsErr;
        const numbers = (settings?.whatsapp_numbers || []) as any[];
        activeNumbers = numbers.filter(n => n.enabled && n.number);
      }

      if (activeNumbers.length === 0) {
        throw new Error("No hay números de WhatsApp activos configurados para enviar la prueba.");
      }

      const { data: vendor } = await supabaseAdmin
        .from('vendors')
        .select('store_name')
        .eq('id', body_vendor_id)
        .maybeSingle();

      const storeName = vendor?.store_name || 'tu tienda';
      const message = `Notificación de prueba\n\nTu canal de WhatsApp Comercial para "${storeName}" está configurado correctamente y funcionando. ✅`;

      for (const n of activeNumbers) {
        const res = await dispatchWhatsApp(n.number, message);
        await logNotification('vendor', body_vendor_id, n.number, res.status, res.error);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[WhatsApp Function Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
