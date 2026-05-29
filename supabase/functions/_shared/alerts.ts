// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export interface AlertPayload {
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: any;
  sellerId?: string | null;
}

export async function sendAlert(
  supabaseClient: any,
  payload: AlertPayload
) {
  const { alertType, severity, message, details = {}, sellerId = null } = payload;
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    // 1. Check for duplicate/similar active alert in the last 15 minutes for grouping
    let query = supabaseClient
      .from('ml_alerts')
      .select('id, grouped_count')
      .eq('alert_type', alertType)
      .eq('message', message)
      .is('resolved_at', null)
      .gt('last_triggered_at', fifteenMinutesAgo);

    if (sellerId) {
      query = query.eq('seller_id', sellerId);
    } else {
      query = query.is('seller_id', null);
    }

    const { data: existingAlert, error: selectErr } = await query.maybeSingle();

    if (selectErr) {
      console.error("[Alerts Helper] Error querying existing alerts:", selectErr.message);
    }

    if (existingAlert) {
      // Grouping / Anti-Spam: increment grouped count and update timestamp
      console.log(`[Alerts Helper] Grouping alert of type ${alertType}. Incrementing count.`);
      const { error: updateErr } = await supabaseClient
        .from('ml_alerts')
        .update({
          grouped_count: (existingAlert.grouped_count || 1) + 1,
          last_triggered_at: new Date().toISOString()
        })
        .eq('id', existingAlert.id);

      if (updateErr) {
        console.error("[Alerts Helper] Failed to update grouped alert:", updateErr.message);
      }
      return existingAlert.id;
    }

    // 2. Insert new alert in database
    const { data: newAlert, error: insertErr } = await supabaseClient
      .from('ml_alerts')
      .insert({
        alert_type: alertType,
        severity,
        message,
        details,
        seller_id: sellerId,
        grouped_count: 1,
        last_triggered_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[Alerts Helper] Failed to insert new alert:", insertErr.message);
      return null;
    }

    // 3. Dispatch notifications asynchronously in background
    dispatchExternalNotifications(newAlert).catch(err => {
      console.error("[Alerts Helper] Error dispatching notifications:", err.message);
    });

    return newAlert.id;
  } catch (err: any) {
    console.error("[Alerts Helper] Exception in sendAlert:", err.message);
    return null;
  }
}

async function dispatchExternalNotifications(alert: any) {
  const discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL");
  const adminEmail = Deno.env.get("ADMIN_EMAIL") || "admin@collectibles.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const title = `⚠️ [Collectibles ML Alert] - Severity: ${alert.severity.toUpperCase()}`;
  const description = `**Type:** ${alert.alert_type}\n**Message:** ${alert.message}\n**Seller ID:** ${alert.seller_id || 'Platform Store'}\n**Timestamp:** ${alert.created_at}`;

  // Severity colors for embed
  let color = 3447003; // Blue (info)
  if (alert.severity === 'warning') color = 15105570; // Orange
  if (alert.severity === 'critical') color = 15158332; // Red

  // Discord Dispatch
  if (discordUrl) {
    try {
      const res = await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title,
            description,
            color,
            fields: [
              { name: "Details", value: JSON.stringify(alert.details).substring(0, 1024) }
            ]
          }]
        })
      });
      if (!res.ok) console.error(`Discord Webhook failed: ${res.status}`);
    } catch (e: any) {
      console.error("Discord notification failed:", e.message);
    }
  }

  // Slack Dispatch
  if (slackUrl) {
    try {
      const res = await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*${title}*\n${description}\n\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``
        })
      });
      if (!res.ok) console.error(`Slack Webhook failed: ${res.status}`);
    } catch (e: any) {
      console.error("Slack notification failed:", e.message);
    }
  }

  // Email Notification via transactional-emails Edge Function
  if (alert.severity === 'critical' && supabaseUrl && supabaseServiceKey) {
    try {
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #d9534f; margin-top: 0;">${title}</h2>
          <p><strong>Alerta Crítica Detectada en Mercado Libre Enterprise:</strong></p>
          <hr />
          <p><strong>Tipo:</strong> ${alert.alert_type}</p>
          <p><strong>Mensaje:</strong> ${alert.message}</p>
          <p><strong>Seller ID:</strong> ${alert.seller_id || 'Platform Store'}</p>
          <p><strong>Fecha/Hora:</strong> ${alert.created_at}</p>
          <p><strong>Detalles:</strong></p>
          <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(alert.details, null, 2)}</pre>
          <p style="margin-top: 20px; font-size: 12px; color: #888;">Este es un mensaje automático de monitoreo de Collectibles.</p>
        </div>
      `;

      const res = await fetch(`${supabaseUrl}/functions/v1/transactional-emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          recipientEmail: adminEmail,
          subject: title,
          htmlContent: emailHtml,
          emailType: "ml_alert_critical"
        })
      });
      if (!res.ok) console.error(`Email Alert Dispatch failed: ${res.status}`);
    } catch (e: any) {
      console.error("Email notification dispatch failed:", e.message);
    }
  }
}
