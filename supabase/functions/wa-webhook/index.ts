import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/**
 * Webhook receiver for go-whatsapp-web-multidevice.
 * go-whatsapp sends events like:
 * { "event": "message", "device_id": "628xxx@s.whatsapp.net", "payload": { ... } }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const event = body.event;
    const deviceId = body.device_id; // e.g. "628xxx@s.whatsapp.net"
    const payload = body.payload;

    console.log(`[WA Webhook] Event: ${event}, Device: ${deviceId}`);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    // Find the account by device_id (which is the account UUID we used as device_id)
    // OR by phone number extracted from JID
    let accountId: string | null = null;
    
    // First try: deviceId is the account UUID
    const { data: directMatch } = await supa
      .from('whatsapp_accounts')
      .select('id')
      .eq('id', deviceId)
      .maybeSingle();

    if (directMatch) {
      accountId = directMatch.id;
    } else if (deviceId?.includes('@')) {
      // Try matching by phone number
      const phone = deviceId.split('@')[0];
      const { data: phoneMatch } = await supa
        .from('whatsapp_accounts')
        .select('id')
        .or(`phone_number.eq.+${phone},phone_number.eq.${phone},worker_id.eq.${deviceId}`)
        .maybeSingle();

      if (phoneMatch) {
        accountId = phoneMatch.id;
      }
    }

    if (!accountId) {
      console.warn(`[WA Webhook] No account found for device: ${deviceId}`);
      return new Response(JSON.stringify({ ok: false, error: 'unknown_device' }), {
        status: 200, // Return 200 to prevent go-whatsapp from retrying
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (event) {
      case 'message': {
        // Incoming text message
        const senderJid = payload?.from || payload?.sender_jid || '';
        const senderPhone = senderJid.split('@')[0]?.replace(/[^0-9]/g, '') || '';
        const messageText = payload?.message || payload?.text || payload?.body || '';
        const contactName = payload?.pushname || payload?.push_name || payload?.sender_name || null;
        const timestamp = payload?.timestamp || new Date().toISOString();

        if (!senderPhone || senderJid.includes('@g.us')) {
          // Skip group messages or empty
          break;
        }

        // Check if message is from us (outgoing)
        const isFromMe = payload?.is_from_me === true || payload?.from_me === true;
        const direction = isFromMe ? 'outgoing' : 'incoming';
        const contactPhone = isFromMe
          ? (payload?.to || payload?.chat_jid || '').split('@')[0]?.replace(/[^0-9]/g, '')
          : senderPhone;

        if (!contactPhone) break;

        // Deduplicate
        const sentAt = typeof timestamp === 'number'
          ? new Date(timestamp * 1000).toISOString()
          : (timestamp || new Date().toISOString());

        const { data: existing } = await supa
          .from('messages')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_phone', contactPhone)
          .eq('direction', direction)
          .eq('sent_at', sentAt)
          .maybeSingle();

        if (existing) break;

        // Handle media
        let mediaUrl = payload?.media_url || payload?.url || null;
        let mediaType = payload?.media_type || null;
        let mediaMimetype = payload?.mimetype || null;

        const finalText = messageText || (mediaType ? `[${mediaType}]` : '');
        if (!finalText && !mediaUrl) break;

        await supa.from('messages').insert({
          account_id: accountId,
          contact_phone: contactPhone,
          contact_name: contactName,
          message_text: finalText,
          direction,
          sent_at: sentAt,
          is_read: isFromMe,
          is_warmup: false,
          media_url: mediaUrl,
          media_type: mediaType,
          media_mimetype: mediaMimetype,
        });

        console.log(`[WA Webhook] ${direction} message saved: ${contactPhone}`);

        // Auto-welcome for incoming messages
        if (direction === 'incoming') {
          const { data: acct } = await supa
            .from('whatsapp_accounts')
            .select('auto_welcome_enabled, auto_welcome_message')
            .eq('id', accountId)
            .maybeSingle();

          if (acct?.auto_welcome_enabled && acct?.auto_welcome_message) {
            // Check if this is the first message from this contact
            const { count } = await supa
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('account_id', accountId)
              .eq('contact_phone', contactPhone)
              .eq('direction', 'incoming');

            if (count === 1) {
              // Send auto-welcome via go-whatsapp
              const vpsUrl = Deno.env.get('VPS_SERVER_URL') || '';
              const baseUrl = vpsUrl.replace(/\/+$/, '');
              if (baseUrl) {
                try {
                  await fetch(`${baseUrl}/send/message`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Device-Id': accountId,
                    },
                    body: JSON.stringify({
                      phone: `${contactPhone}@s.whatsapp.net`,
                      message: acct.auto_welcome_message,
                    }),
                  });
                  console.log(`[WA Webhook] Auto-welcome sent to ${contactPhone}`);
                } catch (e) {
                  console.error(`[WA Webhook] Auto-welcome failed:`, e);
                }
              }
            }
          }
        }
        break;
      }

      case 'message.ack': {
        // Delivery/read receipts
        const ack = payload?.ack || payload?.receipt_type;
        // Map: server=1, delivered=2, read=3
        const ackMap: Record<string, number> = { server: 1, delivered: 2, read: 3, played: 4 };
        const ackValue = typeof ack === 'number' ? ack : (ackMap[ack] || 0);

        if (ackValue > 0 && payload?.message_id) {
          // We don't have a direct message_id match, skip for now
          console.log(`[WA Webhook] ACK ${ack} for message`);
        }
        break;
      }

      default:
        console.log(`[WA Webhook] Unhandled event: ${event}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(`[WA Webhook Error]`, error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200, // Always 200 to prevent retries
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
