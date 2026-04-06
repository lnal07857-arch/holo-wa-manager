import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// go-whatsapp-web-multidevice base URL
const RAW_URL = (Deno.env.get('VPS_SERVER_URL') || '').trim();
const BASE_URL = RAW_URL.replace(/\/+$/, '');

function createSupaAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );
}

// Helper: build go-whatsapp device_id from our account's phone or use account UUID as fallback
async function getDeviceId(supa: any, accountId: string): Promise<string | null> {
  const { data } = await supa
    .from('whatsapp_accounts')
    .select('phone_number, worker_id')
    .eq('id', accountId)
    .maybeSingle();

  if (!data) return null;

  // If the account has a real phone number, use JID format
  const phone = data.phone_number?.replace(/[^0-9]/g, '');
  if (phone && phone.length > 5) {
    return `${phone}@s.whatsapp.net`;
  }

  // Fallback: use worker_id or account UUID as device_id
  return data.worker_id || accountId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BASE_URL) {
      throw new Error('VPS_SERVER_URL is not configured');
    }

    const { action, accountId, phoneNumber, phone, message, text, contacts } = await req.json();
    console.log(`[GoWA Gateway] Action: ${action}, Account: ${accountId}`);
    const supa = createSupaAdmin();

    switch (action) {
      // ═══════════════════════════════════════════════════════════════
      // INITIALIZE — Create device + start QR login
      // ═══════════════════════════════════════════════════════════════
      case 'initialize': {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) throw new Error('No authorization header');

        // Step 1: Create or reuse a device in go-whatsapp using the accountId as device_id
        const deviceId = accountId; // Use Supabase account UUID as stable device ID

        // Try to add the device (idempotent — if exists, will get error, that's fine)
        try {
          await fetch(`${BASE_URL}/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId }),
          });
        } catch (_) { /* device may already exist */ }

        // Step 2: Trigger QR login
        const loginResp = await fetch(`${BASE_URL}/devices/${encodeURIComponent(deviceId)}/login`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!loginResp.ok) {
          const errText = await loginResp.text();
          
          // If already logged in, just return success
          if (errText.includes('already') || errText.includes('logged')) {
            // Update DB to connected
            await supa.from('whatsapp_accounts').update({
              status: 'connected',
              qr_code: null,
              worker_id: deviceId,
              updated_at: new Date().toISOString(),
            }).eq('id', accountId);

            return new Response(JSON.stringify({
              success: true,
              status: 'already_connected',
              message: 'Device is already connected',
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          throw new Error(`Login failed (${loginResp.status}): ${errText}`);
        }

        const loginData = await loginResp.json();
        console.log(`[GoWA] Login response:`, loginData);

        // The QR is returned as a link to an image or as raw data
        // go-whatsapp returns: { results: { qr_link: "...", qr_duration: 30 } }
        const qrLink = loginData?.results?.qr_link;
        
        if (qrLink) {
          // Fetch the actual QR image and convert to base64 for our frontend QR renderer
          // OR: if qr_link contains the raw QR string, store it directly
          // go-whatsapp serves QR as PNG image at the qr_link URL
          
          // We need to fetch the QR data. The go-whatsapp QR endpoint returns the raw
          // WhatsApp QR string that can be rendered by qrcode.react
          // Actually, the login endpoint returns a link to a PNG. We need the raw QR string.
          // Let's store the qr_link and fetch it as image in the frontend
          
          await supa.from('whatsapp_accounts').update({
            status: 'qr_generated',
            qr_code: qrLink, // Store the QR image URL
            worker_id: deviceId,
            updated_at: new Date().toISOString(),
          }).eq('id', accountId);
        }

        // Update status
        await supa.from('whatsapp_accounts').update({
          status: qrLink ? 'qr_generated' : 'initializing',
          worker_id: deviceId,
          updated_at: new Date().toISOString(),
        }).eq('id', accountId);

        return new Response(JSON.stringify({
          success: true,
          status: 'initializing',
          qr_link: qrLink || null,
          message: 'QR code generated, scan with WhatsApp',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════════
      // STATUS
      // ═══════════════════════════════════════════════════════════════
      case 'status': {
        if (!accountId) throw new Error('accountId is required');

        // Get device_id (try account UUID first, then phone-based JID)
        const deviceId = accountId;

        try {
          const statusResp = await fetch(`${BASE_URL}/devices/${encodeURIComponent(deviceId)}/status`, {
            headers: { 'Content-Type': 'application/json' },
          });

          if (!statusResp.ok) {
            // Try with phone-based device_id
            const phoneDeviceId = await getDeviceId(supa, accountId);
            if (phoneDeviceId && phoneDeviceId !== deviceId) {
              const statusResp2 = await fetch(`${BASE_URL}/devices/${encodeURIComponent(phoneDeviceId)}/status`, {
                headers: { 'Content-Type': 'application/json' },
              });
              if (statusResp2.ok) {
                const data2 = await statusResp2.json();
                const isConnected = data2?.results?.is_connected && data2?.results?.is_logged_in;
                return new Response(JSON.stringify({
                  connected: isConnected,
                  status: isConnected ? 'connected' : 'disconnected',
                  device_id: phoneDeviceId,
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            }
            
            return new Response(JSON.stringify({
              connected: false,
              status: 'not_found',
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          const data = await statusResp.json();
          const isConnected = data?.results?.is_connected && data?.results?.is_logged_in;

          // Auto-update DB if connected
          if (isConnected) {
            const deviceJid = data?.results?.device_id;
            const phone = deviceJid?.split('@')[0];

            const updateData: any = {
              status: 'connected',
              qr_code: null,
              updated_at: new Date().toISOString(),
            };

            if (phone && phone.length > 5) {
              updateData.phone_number = '+' + phone;
            }

            await supa.from('whatsapp_accounts').update(updateData).eq('id', accountId);
          }

          console.log(`[GoWA Status] ${accountId}: connected=${isConnected}`);
          return new Response(JSON.stringify({
            connected: isConnected,
            status: isConnected ? 'connected' : 'disconnected',
            device_id: data?.results?.device_id,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e) {
          console.error(`[GoWA Status Error]`, e);
          return new Response(JSON.stringify({
            connected: false,
            status: 'error',
            error: String(e),
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // SEND MESSAGE
      // ═══════════════════════════════════════════════════════════════
      case 'send':
      case 'send-message': {
        const phoneNum = phoneNumber || phone;
        const messageText = message || text;
        if (!phoneNum || !messageText) throw new Error('Phone and message are required');

        // Format phone for go-whatsapp: needs JID format
        const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;

        // Get device_id
        const deviceId = accountId;

        const sendResp = await fetch(`${BASE_URL}/send/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': deviceId,
          },
          body: JSON.stringify({ phone: jid, message: messageText }),
        });

        if (!sendResp.ok) {
          const errText = await sendResp.text();
          throw new Error(`Send failed: ${errText}`);
        }

        const sendData = await sendResp.json();

        // Save to messages table
        await supa.from('messages').insert({
          account_id: accountId,
          contact_phone: cleanPhone,
          message_text: messageText,
          direction: 'outgoing',
          sent_at: new Date().toISOString(),
          is_read: true,
          is_warmup: false,
        });

        return new Response(JSON.stringify({
          success: true,
          message_id: sendData?.results?.message_id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════════
      // SEND BULK
      // ═══════════════════════════════════════════════════════════════
      case 'send-bulk': {
        if (!contacts || !Array.isArray(contacts)) throw new Error('Contacts array is required');

        const deviceId = accountId;
        let sent = 0, failed = 0;

        for (const contact of contacts) {
          try {
            const contactPhone = (contact.phone || contact.phoneNumber || '').replace(/[^0-9]/g, '');
            const contactText = contact.message || contact.text || '';
            if (!contactPhone || !contactText) { failed++; continue; }

            const jid = `${contactPhone}@s.whatsapp.net`;
            
            const resp = await fetch(`${BASE_URL}/send/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Device-Id': deviceId,
              },
              body: JSON.stringify({ phone: jid, message: contactText }),
            });

            if (resp.ok) {
              sent++;
              await supa.from('messages').insert({
                account_id: accountId,
                contact_phone: contactPhone,
                message_text: contactText,
                direction: 'outgoing',
                sent_at: new Date().toISOString(),
                is_read: true,
                is_warmup: false,
              });
            } else {
              failed++;
            }

            // Rate limiting: 2-5s between messages
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
          } catch (e) {
            failed++;
          }
        }

        return new Response(JSON.stringify({ success: true, sent, failed, total: contacts.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // DISCONNECT
      // ═══════════════════════════════════════════════════════════════
      case 'disconnect': {
        const deviceId = accountId;

        try {
          await fetch(`${BASE_URL}/devices/${encodeURIComponent(deviceId)}/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (_) { /* best effort */ }

        await supa.from('whatsapp_accounts').update({
          status: 'disconnected',
          qr_code: null,
          updated_at: new Date().toISOString(),
        }).eq('id', accountId);

        return new Response(JSON.stringify({ success: true, message: 'Disconnected' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // DELETE ACCOUNT
      // ═══════════════════════════════════════════════════════════════
      case 'delete-account': {
        if (!accountId) throw new Error('accountId is required');

        const authHeader = req.headers.get('authorization');
        if (!authHeader) throw new Error('No authorization header');

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) throw new Error('Not authenticated');

        // Get account info
        const { data: account } = await supa
          .from('whatsapp_accounts')
          .select('id, worker_slot')
          .eq('id', accountId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!account) throw new Error('Account nicht gefunden oder keine Berechtigung.');

        // Disconnect on go-whatsapp
        try {
          await fetch(`${BASE_URL}/devices/${encodeURIComponent(accountId)}/logout`, {
            method: 'POST',
          });
        } catch (_) {}

        // Remove device from go-whatsapp
        try {
          await fetch(`${BASE_URL}/devices/${encodeURIComponent(accountId)}`, {
            method: 'DELETE',
          });
        } catch (_) {}

        // Delete related data
        await Promise.all([
          supa.from('messages').delete().eq('account_id', accountId),
          supa.from('bulk_campaigns').delete().eq('account_id', accountId),
        ]);

        const { error: deleteError } = await supa
          .from('whatsapp_accounts')
          .delete()
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (deleteError) throw deleteError;

        // Free worker slot
        if (account.worker_slot) {
          await supa
            .from('worker_slots')
            .update({ is_occupied: false, account_id: null })
            .eq('slot_number', account.worker_slot);
        }

        return new Response(JSON.stringify({
          success: true,
          deletedAccountId: accountId,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ═══════════════════════════════════════════════════════════════
      // LIST DEVICES (new)
      // ═══════════════════════════════════════════════════════════════
      case 'list-devices': {
        const resp = await fetch(`${BASE_URL}/devices`, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error(`[GoWA Gateway Error]`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
