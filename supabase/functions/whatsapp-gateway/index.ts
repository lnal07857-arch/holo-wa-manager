import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAW_RAILWAY_URL = Deno.env.get('RAILWAY_SERVER_URL') || '';
const BASE_URL = RAW_RAILWAY_URL && RAW_RAILWAY_URL.startsWith('http') ? RAW_RAILWAY_URL : `https://${RAW_RAILWAY_URL}`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BASE_URL || BASE_URL === 'https://') {
      throw new Error('RAILWAY_SERVER_URL is not configured');
    }

    const { action, accountId, phoneNumber, phone, message, text, contacts } = await req.json();

    console.log(`[WhatsApp Gateway] Action: ${action}, Account: ${accountId}`);

    // Action Router
    switch (action) {
      case 'initialize': {
        // Get user ID from auth header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
          throw new Error('No authorization header');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supa = createClient(supabaseUrl || '', supabaseKey || '');

        console.log(`[Initialize] Calling Railway at: ${BASE_URL}/api/initialize`);
        console.log(`[Initialize] AccountId: ${accountId}`);

        const attemptInitialize = async () => {
          return await fetch(`${BASE_URL}/api/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              userId: accountId, // We use accountId as userId is already part of the account record
              supabaseUrl,
              supabaseKey,
            }),
          });
        };

        // 1st attempt
        let response = await attemptInitialize();
        console.log(`[Initialize] Railway response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Initialize] Railway error: ${errorText}`);

          const isProxyError = errorText.includes('ERR_PROXY_CONNECTION_FAILED') || errorText.toLowerCase().includes('proxy');

          if (isProxyError) {
            console.warn('[Initialize] Detected proxy failure. Attempting automatic VPN failover...');

            // Fetch healthy servers
            const { data: healthy, error: healthErr } = await supa
              .from('vpn_server_health')
              .select('server_host')
              .eq('is_healthy', true)
              .eq('server_region', 'DE')
              .order('response_time_ms', { ascending: true })
              .limit(5);

            // Fallback list if no health data
            const FALLBACK_SERVERS = [
              'de-ber-wg-001.mullvad.net',
              'de-ber-wg-002.mullvad.net',
              'de-ber-wg-003.mullvad.net',
              'de-fra-wg-001.mullvad.net',
              'de-fra-wg-002.mullvad.net',
            ];

            const candidateServers = (healthy && healthy.length > 0)
              ? healthy.map((s: any) => s.server_host)
              : FALLBACK_SERVERS;

            // Load account + user
            const { data: accountRow } = await supa
              .from('whatsapp_accounts')
              .select('id, user_id')
              .eq('id', accountId)
              .maybeSingle();

            if (!accountRow?.user_id) {
              throw new Error('Account not found for failover');
            }

            // Pick Mullvad account (first)
            const { data: mv } = await supa
              .from('mullvad_accounts')
              .select('account_number')
              .eq('user_id', accountRow.user_id)
              .order('created_at', { ascending: true })
              .maybeSingle();

            if (!mv?.account_number) {
              throw new Error('No Mullvad account available for failover');
            }

            // Choose best server
            const newHost = candidateServers[Math.floor(Math.random() * candidateServers.length)];
            const newProxy = {
              host: newHost,
              port: 1080,
              username: mv.account_number,
              password: 'm',
              protocol: 'socks5',
            };

            await supa
              .from('whatsapp_accounts')
              .update({ proxy_server: JSON.stringify(newProxy) })
              .eq('id', accountId);

            console.log(`[Initialize] Failover applied: ${newHost}. Retrying initialize...`);

            // 2nd attempt after failover
            response = await attemptInitialize();
            console.log(`[Initialize] Retry response status: ${response.status}`);

            if (!response.ok) {
              const retryText = await response.text();
              console.error(`[Initialize] Retry failed: ${retryText}`);
              throw new Error(`Railway server error (${response.status}): ${retryText}`);
            }
          } else {
            throw new Error(`Railway server error (${response.status}): ${errorText}`);
          }
        }

        const data = await response.json();
        console.log(`[Initialize] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send':
      case 'send-message': {
        // Nachricht senden
        const phoneNum = phoneNumber || phone;
        const messageText = message || text;
        
        console.log(`[Send Message] Account: ${accountId}, Phone: ${phoneNum}, Message: ${messageText?.substring(0, 50)}...`);
        
        if (!phoneNum || !messageText) {
          throw new Error('Phone and message are required');
        }

        console.log(`[Send Message] Calling Railway at: ${BASE_URL}/api/send-message`);

        const response = await fetch(`${BASE_URL}/api/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            phoneNumber: phoneNum,
            message: messageText,
          }),
        });

        console.log(`[Send Message] Railway response status: ${response.status}`);

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Send Message] Railway error: ${error}`);
          throw new Error(`Railway error: ${error}`);
        }

        const data = await response.json();
        console.log(`[Send Message] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-bulk': {
        // Bulk-Nachrichten senden
        if (!contacts || !Array.isArray(contacts)) {
          throw new Error('Contacts array is required');
        }

        const response = await fetch(`${BASE_URL}/api/send-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            contacts,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Railway error: ${error}`);
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'status': {
        // Status abrufen - wenn accountId vorhanden, dann Account-Status, sonst Server-Status
        if (accountId) {
          console.log(`[Account Status] Calling Railway at: ${BASE_URL}/api/status/${accountId}`);
          
          const response = await fetch(`${BASE_URL}/api/status/${accountId}`);

          if (!response.ok) {
            const error = await response.text();
            console.error(`[Account Status] Railway error: ${error}`);
            throw new Error(`Railway error: ${error}`);
          }

          const data = await response.json();
          console.log(`[Account Status] Success:`, data);
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Server-Status abrufen (ohne accountId)
          console.log(`[Server Status] Calling Railway at: ${BASE_URL}/api/status`);
          
          const response = await fetch(`${BASE_URL}/api/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          console.log(`[Server Status] Railway response status: ${response.status}`);

          if (!response.ok) {
            const error = await response.text();
            console.error(`[Server Status] Railway error: ${error}`);
            throw new Error(`Railway error: ${error}`);
          }

          const data = await response.json();
          console.log(`[Server Status] Success:`, data);
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'disconnect': {
        // Client-Instanz beenden und aufräumen
        console.log(`[Disconnect] Calling Railway at: ${BASE_URL}/api/disconnect`);
        console.log(`[Disconnect] AccountId: ${accountId}`);
        
        const response = await fetch(`${BASE_URL}/api/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });

        console.log(`[Disconnect] Railway response status: ${response.status}`);

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Disconnect] Railway error: ${error}`);
          throw new Error(`Railway error: ${error}`);
        }

        const data = await response.json();
        console.log(`[Disconnect] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-fingerprint': {
        // Fingerprint-Informationen abrufen
        console.log(`[Get Fingerprint] Calling Railway at: ${BASE_URL}/api/fingerprint`);
        
        const response = await fetch(`${BASE_URL}/api/fingerprint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            supabaseUrl: Deno.env.get('SUPABASE_URL'),
            supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Get Fingerprint] Railway error: ${error}`);
          throw new Error(`Railway error: ${error}`);
        }

        const data = await response.json();
        console.log(`[Get Fingerprint] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('WhatsApp Gateway Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
