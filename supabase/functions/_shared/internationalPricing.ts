import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export interface ExchangeRateConfig {
  rate: number;
  safety_buffer_percent: number;
  max_age_hours: number;
  source: string;
  updated_at: string;
}

/**
 * Recupera el tipo de cambio efectivo de la base de datos aplicando el buffer de seguridad
 */
export async function getEffectiveExchangeRate(supabaseAdmin: any): Promise<{
  effective_rate: number;
  rate: number;
  source: string;
  safety_buffer_percent: number;
  updated_at: string;
}> {
  const { data: rateData, error } = await supabaseAdmin
    .from("site_exchange_rates")
    .select("*")
    .eq("currency_pair", "USD_UYU")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !rateData) {
    throw new Error("No existe una cotización activa para USD_UYU en la base de datos.");
  }

  const updatedAtTime = new Date(rateData.updated_at).getTime();
  const maxAgeMs = rateData.max_age_hours * 60 * 60 * 1000;
  const now = new Date().getTime();

  if (now - updatedAtTime > maxAgeMs) {
    throw new Error(`La cotización de USD_UYU ha expirado (más de ${rateData.max_age_hours} horas de antigüedad).`);
  }

  const rate = Number(rateData.rate);
  const safety_buffer_percent = Number(rateData.safety_buffer_percent);
  const effective_rate = rate * (1 + safety_buffer_percent / 100);

  return {
    effective_rate: Number(effective_rate.toFixed(4)),
    rate,
    source: rateData.source,
    safety_buffer_percent,
    updated_at: rateData.updated_at
  };
}
