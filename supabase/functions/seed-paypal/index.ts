import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
  
  const settings = [
    { key: 'payments_paypal_client_id', value: 'Ab1Wxfph_pmMSmofik-4Ez1aFJZO7EsGWYzRoSr7_xmEG5yJSyWnuQSkOm4vlIgoo_wSigrsT8LbYxOB' },
    { key: 'payments_paypal_client_secret', value: 'EDM5ni301F88VzlUcRFpSj9zYFTOC_GMWLgZQ6icJfg95-fh8lEr7kWcp2zUHsGiw9XdsVHRNSsC5I-S' },
    { key: 'payments_paypal_sandbox', value: 'false' },
    { key: 'payments_paypal_enabled', value: 'true' },
  ]

  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .upsert(settings, { onConflict: 'key' })
    .select()

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
