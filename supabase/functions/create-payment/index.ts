import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRequest {
  provider: "dlocal" | "paypal";
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

    let orderId = body.order_id

    // 1. CREATE ORDER IF NOT EXISTS (Using Service Role)
    if (!orderId) {
      console.log("Creating order via Service Role...")
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
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
        const orderItems = items.map(item => ({
          order_id: orderId,
          product_id: item.id,
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
          payment_provider_id: orderResult.id,
          payment_method: 'paypal'
        }).eq('id', orderId)
        
        return new Response(JSON.stringify({ checkout_url: approvalLink.href }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }
      
      throw new Error('PayPal no devolvió URL de aprobación. Response: ' + JSON.stringify(orderResult))
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
