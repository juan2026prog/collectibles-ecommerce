import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json()
    if (!orderId) throw new Error('orderId is required')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: order, error } = await supabaseClient
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single()

    if (error || !order) throw new Error('Order not found')
    if (order.status !== 'pending') throw new Error('Order is not in pending state')

    const DLOCALGO_API_KEY = Deno.env.get('DLOCALGO_API_KEY') || 'mock-dlocalgo-key'
    
    const paymentPayload = {
      amount: order.total_amount,
      currency: order.currency || "UYU",
      country: "UY",
      order_id: order.id,
      success_url: `${req.headers.get("origin") || 'http://localhost:5173'}/checkout/success?order_id=${order.id}`,
      back_url: `${req.headers.get("origin") || 'http://localhost:5173'}/checkout`,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/dlocalgo-webhook`,
      payer: {
        name: `${order.shipping_address?.first_name || ''} ${order.shipping_address?.last_name || ''}`.trim() || 'Guest Customer',
        email: order.customer_email || 'guest@example.com'
      }
    }

    if (DLOCALGO_API_KEY === 'mock-dlocalgo-key') {
      console.log('Simulating dLocal Go API call to generate SmartLink/Redirect URL', paymentPayload);
      
      const mockPaymentId = "DLG-MOCK-" + Math.floor(Math.random() * 100000);
      await supabaseClient.from('orders').update({ payment_id: mockPaymentId }).eq('id', order.id);

      return new Response(JSON.stringify({ 
         redirect_url: `https://sandbox.dlocalgo.com/checkout/${order.id}`, 
         id: mockPaymentId
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const response = await fetch('https://api.dlocalgo.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DLOCALGO_API_KEY}`
      },
      body: JSON.stringify(paymentPayload)
    })

    const dlocalData = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(dlocalData))

    await supabaseClient
      .from('orders')
      .update({ payment_id: dlocalData.id })
      .eq('id', order.id)

    return new Response(JSON.stringify({ redirect_url: dlocalData.redirect_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
