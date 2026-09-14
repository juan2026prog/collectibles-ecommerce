import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

import { corsHeaders, handleOptions } from "../_shared/cors.ts"


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

    const DLOCALGO_API_KEY = Deno.env.get('DLOCALGO_API_KEY')
    const isDev = Deno.env.get('ENVIRONMENT') === 'development' || Deno.env.get('ALLOW_MOCK_PAYMENTS') === 'true'

    if (!DLOCALGO_API_KEY) {
      if (!isDev) {
        throw new Error('DLOCALGO_API_KEY is not configured on the server.')
      }
      console.log('[Dev Mode] Simulating dLocal Go API call to generate SmartLink/Redirect URL', paymentPayload);
      
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
