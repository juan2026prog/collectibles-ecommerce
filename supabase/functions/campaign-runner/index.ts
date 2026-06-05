// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: any) => {
  try {
    const now = new Date();

    // 1. Fetch campaigns that are scheduled or currently processing (so we can batch them)
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, segment_id, template_id, channel, scheduled_at, stats, status')
      .in('status', ['scheduled', 'processing'])
      .lte('scheduled_at', now.toISOString());

    if (error) throw error;

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No campaigns to process." }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    let processedCount = 0;

    for (const campaign of campaigns) {
      // Mark as processing if it was just scheduled
      if (campaign.status === 'scheduled') {
        await supabase.from('campaigns').update({ status: 'processing' }).eq('id', campaign.id);
      }

      // Fetch the template
      const { data: template } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('id', campaign.template_id)
        .single();

      if (!template) {
        console.error(`Template ${campaign.template_id} not found for campaign ${campaign.id}`);
        await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id);
        continue;
      }

      // Fetch segment
      const { data: segment } = await supabase
        .from('customer_segments')
        .select('*')
        .eq('id', campaign.segment_id)
        .single();

      if (!segment) {
        console.error(`Segment ${campaign.segment_id} not found for campaign ${campaign.id}`);
        await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id);
        continue;
      }

      // Find users matching segment constraints and consent
      // We will do a generic fetch for now, simulating complex segment extraction
      // In production, you would translate segment.query_rules (JSON array) into a Supabase Query Builder chain.
      const { data: consents } = await supabase
        .from('customer_consents')
        .select('customer_id, email, whatsapp_opt_in, email_marketing_opt_in')
        .limit(1000); // safety limit for full batch pool

      if (!consents || consents.length === 0) {
        await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
        continue;
      }

      // Get users who ALREADY got this campaign so we don't duplicate
      const { data: existingLogs } = await supabase
        .from('communication_logs')
        .select('email, phone')
        .eq('campaign_id', campaign.id);
      
      const alreadySentEmails = new Set(existingLogs?.filter(l => l.email).map(l => l.email) || []);
      
      // Filter the remaining users for THIS batch (Batch size = 50)
      const remainingUsers = consents.filter(c => !alreadySentEmails.has(c.email)).slice(0, 50);

      // If no remaining users, campaign is done
      if (remainingUsers.length === 0) {
        await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
        continue;
      }

      let sentCount = (campaign.stats?.sent || 0);
      let failedCount = (campaign.stats?.failed || 0);
      let skippedCount = (campaign.stats?.skipped || 0);

      // Process batch
      for (const consent of remainingUsers) {
        let msgStatus = 'sent';
        let channelUsed = campaign.channel;

        // Validation & Skipped logic
        if (campaign.channel === 'whatsapp' && !consent.whatsapp_opt_in) {
          msgStatus = 'skipped';
        } else if (campaign.channel === 'email' && !consent.email_marketing_opt_in) {
          msgStatus = 'skipped';
        } else if (campaign.channel === 'both') {
           if (!consent.email_marketing_opt_in && !consent.whatsapp_opt_in) {
             msgStatus = 'skipped';
           }
        }

        if (msgStatus === 'skipped') {
           skippedCount++;
        } else {
           // Attempt sending
           try {
             console.log(`[CAMPAIGN: ${campaign.name}] Sending to: ${consent.email} via ${channelUsed}`);
             
             // Rate Limiting simulation: sleep 200ms between requests
             await new Promise(resolve => setTimeout(resolve, 200));

             // IF real API fails here, throw Error
             // Example: throw new Error('API Rate Limit or Network Error');

             sentCount++;
           } catch(e) {
             console.error(`Failed to send to ${consent.email}:`, e);
             msgStatus = 'failed';
             failedCount++;
           }
        }

        // Log result
        await supabase.from('communication_logs').insert({
          customer_id: consent.customer_id,
          email: consent.email,
          campaign_id: campaign.id,
          template_id: template.id,
          channel: channelUsed,
          status: msgStatus
        });
      }

      // Update Campaign Stats
      const newStats = {
        ...(campaign.stats as any),
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount
      };

      // We stay in 'processing' status. The next cron run will pick it up and process the next batch of 50.
      await supabase.from('campaigns').update({ stats: newStats }).eq('id', campaign.id);
      processedCount += remainingUsers.length;
    }

    return new Response(JSON.stringify({ success: true, processed: processedCount }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Campaign runner error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
