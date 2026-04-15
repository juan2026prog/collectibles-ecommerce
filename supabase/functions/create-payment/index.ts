import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRequest {
  provider: "dlocal" | "paypal" | "mercadopago";
  amount: number;
  currency: string;
  order_id?: string; // Optional because we might create it here
  customer: {
    name: string;
    email: string;
    address?: string;
    city?: string;
    phone?: string;
  };
  items: any[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Supabase configuration missing')

    // Use Service Role Client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    const body = await req.json()
    const { provider, amount, currency, customer, items } = body as PaymentRequest

    // Try to extract the authenticated user from the JWT
    let customerId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // Only try to get user if token is NOT the anon key
      if (token.length > 200) { // User JWTs are longer than anon keys
        const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
        const { data: { user } } = await anonClient.auth.getUser(token);
        if (user) {
          customerId = user.id;
          console.log(`[create-payment] Authenticated user: ${user.email} (${user.id})`);
        }
      }
    }

    let orderId = body.order_id

    // 1. CREATE ORDER IF NOT EXISTS (Using Service Role)
    if (!orderId) {
      console.log("Creating order via Service Role...")
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          customer_id: customerId,
          customer_email: customer.email,
          customer_phone: customer.phone,
          total_amount: amount,
          currency: currency,
          status: 'pending',
          payment_method: provider,
          shipping_address: { full_address: customer.address, name: customer.name }
        })
        .select()
        .single()

      if (orderError) throw new Error(`Order creation failed: ${orderError.message}`)
      orderId = order.id

      // Create order items
      if (items && items.length > 0) {
        // Fetch product information (vendor_id) for each item
        const { data: productsData } = await supabaseAdmin
          .from('products')
          .select('id, vendor_id')
          .in('id', items.map(i => i.id))

        const productVendorMap = Object.fromEntries((productsData || []).map(p => [p.id, p.vendor_id]))

        const orderItems = items.map(item => ({
          order_id: orderId,
          product_id: item.id,
          variant_id: item.variant_id || null,
          vendor_id: productVendorMap[item.id] || null,
          quantity: item.quantity,
          unit_price: item.price
        }))
        await supabaseAdmin.from('order_items').insert(orderItems)
      }
    }

    // 2. FETCH SETTINGS
    const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value')
    const config = Object.fromEntries((settings || []).map(s => [s.key, s.value]))

    // 3. GATEWAY LOGIC (dLocal Go / PayPal)
    if (provider === 'dlocal') {
      const apiKey = (config.payments_dlocal_go_api_key || '').trim()
      
      if (!apiKey) {
        throw new Error('dLocal Go API key not configured. Set it in Admin > Settings > Payments.')
      }
      
      const origin = req.headers.get("origin") || 'https://collectibles-ecommerce.vercel.app'
      const isSandbox = config.payments_dlocal_go_sandbox === 'true'
      const apiBaseUrl = isSandbox ? 'https://api-sbx.dlocalgo.com' : 'https://api.dlocalgo.com'
      
      const requestBody = JSON.stringify({
        amount: parseFloat(amount.toString()).toFixed(2),
        currency: currency,
        country: "UY",
        order_id: String(orderId),
        description: `Order ${orderId}`,
        success_url: `${origin}/checkout/success?order_id=${orderId}&provider=dlocal`,
        back_url: `${origin}/checkout`,
        notification_url: `${supabaseUrl}/functions/v1/dlocalgo-webhook`,
        payer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone || undefined
        }
      })
      
      console.log(`[dLocal Go] Calling ${apiBaseUrl}/v1/checkout, sandbox=${isSandbox}`)
      
      const response = await fetch(`${apiBaseUrl}/v1/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: requestBody
      })

      const result = await response.json()
      console.log("[dLocal Go] Response:", response.status, JSON.stringify(result))
      
      if (!response.ok || result.errorCode) {
        const errorMsg = result.errorMessage || result.message || JSON.stringify(result)
        throw new Error(`dLocal Go Error (${result.errorCode || response.status}): ${errorMsg}`)
      }
      
      // dLocal Go returns a redirect URL for the hosted checkout page
      const checkoutUrl = result.redirect_url || result.checkout_url || result.link
      if (checkoutUrl) {
        return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }
      
      // If we get an ID but no redirect, construct the dLocal Go checkout URL
      if (result.id) {
        return new Response(JSON.stringify({ 
          checkout_url: `https://checkout.dlocalgo.com/collect/${result.id}`,
          payment_id: result.id
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }
      
      throw new Error('dLocal Go no devolvió URL de checkout. Response: ' + JSON.stringify(result))
    }

    if (provider === 'paypal') {
      const clientId = (config.payments_paypal_client_id || '').trim()
      const clientSecret = (config.payments_paypal_client_secret || '').trim()
      
      if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials not configured. Set Client ID and Client Secret in Admin > Settings > Payments.')
      }
      
      const origin = req.headers.get("origin") || 'https://collectibles-ecommerce.vercel.app'
      const isSandbox = config.payments_paypal_sandbox === 'true'
      const apiBase = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
      
      // Step 1: Get OAuth2 access token
      console.log(`[PayPal] Getting access token from ${apiBase}, sandbox=${isSandbox}`)
      const authString = btoa(`${clientId}:${clientSecret}`)
      
      const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      })
      
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok) {
        throw new Error(`PayPal Auth Error: ${JSON.stringify(tokenData)}`)
      }
      
      const accessToken = tokenData.access_token
      console.log('[PayPal] Got access token successfully')
      
      // Step 2: Create PayPal order
      const paypalCurrency = currency === 'UYU' ? 'USD' : currency // PayPal doesn't support UYU well
      const paypalAmount = paypalCurrency === 'USD' && currency === 'UYU' 
        ? (amount / 42).toFixed(2)  // Approximate UYU to USD conversion
        : parseFloat(amount.toString()).toFixed(2)
      
      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(orderId),
          description: `Collectibles Order #${orderId}`,
          amount: {
            currency_code: paypalCurrency,
            value: paypalAmount
          }
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Collectibles Store',
              locale: 'es-UY',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: `${origin}/checkout/success?order_id=${orderId}&provider=paypal`,
              cancel_url: `${origin}/checkout`
            }
          }
        }
      }
      
      console.log('[PayPal] Creating order...')
      const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(orderPayload)
      })
      
      const orderResult = await orderRes.json()
      console.log('[PayPal] Order response:', orderRes.status, JSON.stringify(orderResult))
      
      if (!orderRes.ok) {
        throw new Error(`PayPal Order Error (${orderRes.status}): ${JSON.stringify(orderResult)}`)
      }
      
      // Find the approval URL
      const approvalLink = orderResult.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')
      
      if (approvalLink?.href) {
        // Update order with PayPal order ID
        await supabaseAdmin.from('orders').update({
          payment_id: orderResult.id,
          payment_method: 'paypal'
        }).eq('id', orderId)
        
        return new Response(JSON.stringify({ checkout_url: approvalLink.href }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }
      
      throw new Error('PayPal no devolvió URL de aprobación. Response: ' + JSON.stringify(orderResult))
    }

    // ═══════════════════════════════════════════════
    // 🟦 MERCADO PAGO — Checkout Preferences API
    // ═══════════════════════════════════════════════
    if (provider === 'mercadopago') {
      const mpAccessToken = (config.payments_mercadopago_access_token || '').trim()
      
      if (!mpAccessToken) {
        throw new Error('Mercado Pago Access Token no configurado. Configúralo en Admin > Settings > Payments.')
      }

      const origin = req.headers.get('origin') || 'https://collectibles-ecommerce.vercel.app'
      const isSandbox = mpAccessToken.startsWith('TEST-')
      const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`

      // Build items array for MP
      const mpItems: any[] = items.map((item: any) => ({
        id: String(item.id),
        title: item.title || 'Producto',
        quantity: Number(item.quantity),
        unit_price: Number(item.price),
        currency_id: currency || 'UYU',
      }))

      const itemsTotal = items.reduce((acc, curr) => acc + (Number(curr.price) * Number(curr.quantity)), 0);
      const diff = amount - itemsTotal;
      
      if (Math.abs(diff) > 0.01) {
        if (diff > 0) {
          mpItems.push({
            id: 'shipping',
            title: 'Envío',
            quantity: 1,
            unit_price: diff,
            currency_id: currency || 'UYU'
          });
        } else {
          mpItems.push({
            id: 'discount',
            title: 'Descuento Bancario',
            quantity: 1,
            unit_price: diff,
            currency_id: currency || 'UYU'
          });
        }
      }

      const preferencePayload = {
        items: mpItems,
        payer: {
          email: customer.email || 'guest@collectibles.uy',
          name: customer.name?.split(' ')[0] || 'Cliente',
          surname: customer.name?.split(' ').slice(1).join(' ') || 'Guest',
        },
        back_urls: {
          success: `${origin}/checkout/success?order_id=${orderId}&provider=mercadopago`,
          failure: `${origin}/checkout?error=pagorechazado`,
          pending: `${origin}/checkout/success?order_id=${orderId}&provider=mercadopago&status=pending`,
        },
        auto_return: 'approved',
        external_reference: String(orderId),
        notification_url: webhookUrl,
        statement_descriptor: 'COLLECTIBLES STORE',
      }

      console.log(`[MercadoPago] Creating preference, sandbox=${isSandbox}`)

      const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(preferencePayload),
      })

      const mpResult = await mpResponse.json()
      console.log('[MercadoPago] Response:', mpResponse.status, JSON.stringify(mpResult))

      if (!mpResponse.ok) {
        throw new Error(`Mercado Pago Error (${mpResponse.status}): ${JSON.stringify(mpResult)}`)
      }

      // Use sandbox_init_point for TEST tokens, init_point for production
      const checkoutUrl = isSandbox ? mpResult.sandbox_init_point : mpResult.init_point

      if (!checkoutUrl) {
        throw new Error('Mercado Pago no devolvió URL de checkout. Response: ' + JSON.stringify(mpResult))
      }

      // Save MP preference ID on the order
      await supabaseAdmin.from('orders').update({
        payment_id: mpResult.id,
        payment_method: 'mercadopago',
      }).eq('id', orderId)

      return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error("Proveedor no configurado")

  } catch (err: any) {
    console.error("Payment Function Error:", err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
