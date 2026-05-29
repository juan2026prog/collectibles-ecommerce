import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export async function verifyAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('No Authorization header provided');
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const token = authHeader.replace('Bearer ', '');
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return user;
}

export async function verifyOptionalAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  try {
    return await verifyAuth(req);
  } catch {
    return null;
  }
}

export async function verifyAdmin(req: Request) {
  const bypassSecret = Deno.env.get('TEST_BYPASS_SECRET');
  if (bypassSecret && req.headers.get('x-test-bypass') === bypassSecret) {
    console.log("[Auth] Bypassing admin user check via test header");
    return { id: 'test_bypass', email: 'test_bypass@supabase.local' };
  }

  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader && serviceKey) {
    const token = authHeader.replace('Bearer ', '');
    if (token === serviceKey) {
      console.log("[Auth] Bypassing admin user check for service_role request");
      return { id: 'service_role', email: 'service_role@supabase.local' };
    }
  }

  const user = await verifyAuth(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (error || !profile?.is_admin) {
    throw new Error('Acceso denegado: Se requieren privilegios de administrador');
  }

  return user;
}

export async function verifyVendor(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader && serviceKey) {
    const token = authHeader.replace('Bearer ', '');
    if (token === serviceKey) {
      console.log("[Auth] Bypassing vendor user check for service_role request");
      return { id: 'service_role', email: 'service_role@supabase.local' };
    }
  }

  const user = await verifyAuth(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_vendor')
    .eq('id', user.id)
    .single();

  if (error || !profile?.is_vendor) {
    throw new Error('Acceso denegado: Se requiere cuenta de vendedor activa');
  }

  return user;
}

export async function verifyArtist(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader && serviceKey) {
    const token = authHeader.replace('Bearer ', '');
    if (token === serviceKey) {
      console.log("[Auth] Bypassing artist user check for service_role request");
      return { id: 'service_role', email: 'service_role@supabase.local' };
    }
  }

  const user = await verifyAuth(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('is_artist')
    .eq('id', user.id)
    .single();

  if (error || !profile?.is_artist) {
    throw new Error('Acceso denegado: Se requiere cuenta de artista activa');
  }

  return user;
}

export async function verifyRole(req: Request, role: 'is_admin' | 'is_vendor' | 'is_artist' | 'is_affiliate') {
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (authHeader && serviceKey) {
    const token = authHeader.replace('Bearer ', '');
    if (token === serviceKey) {
      console.log(`[Auth] Bypassing role check for ${role} on service_role request`);
      return { id: 'service_role', email: 'service_role@supabase.local' };
    }
  }

  const user = await verifyAuth(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select(role)
    .eq('id', user.id)
    .single();

  if (error || !profile?.[role]) {
    throw new Error(`Acceso denegado: Se requiere el rol '${role}'`);
  }

  return user;
}
