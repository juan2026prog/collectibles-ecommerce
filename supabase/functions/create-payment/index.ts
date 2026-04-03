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
      const apiKey = config.payments_dlocal_go_secret_key || config.payments_dlocal_go_api_key
      const response = await fetch("https://api.dlocalgo.com/v1/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          amount: parseFloat(amount.toString()).toFixed(2),
          currency: currency,
          country: "UY", 
          order_id: orderId,
          success_url: `${req.headers.get("origin")}/checkout/success?order_id=${orderId}&provider=dlocal`,
          back_url: `${req.headers.get("origin")}/checkout`,
          notification_url: `${supabaseUrl}/functions/v1/payment-webhook?provider=dlocal`,
          payer: { name: customer.name, email: customer.email }
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(`dLocal Error: ${JSON.stringify(result)}`)
      
      return new Response(JSON.stringify({ checkout_url: result.checkout_url || result.redirect_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    if (provider === 'paypal') {
      // (Similar logic for PayPal order creation...)
      // But for now, let's focus on dLocal Go's success.
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
