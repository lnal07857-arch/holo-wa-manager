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
              userId: accountId,
              supabaseUrl,
              supabaseKey,
            }),
          });
        };

        // Ensure VPN is assigned BEFORE initialization
        const { data: accountData } = await supa
          .from('whatsapp_accounts')
          .select('proxy_server, user_id')
          .eq('id', accountId)
          .maybeSingle();

        if (!accountData?.proxy_server) {
          console.log('🔐 [Initialize] No VPN assigned yet. Assigning now...');
          
          // Assign VPN before proceeding
          const { error: vpnError } = await supa.functions.invoke('mullvad-proxy-manager', {
            body: { action: 'assign-proxy', accountId }
          });
          
          if (vpnError) {
            console.error('❌ [Initialize] Failed to assign VPN:', vpnError);
            throw new Error('VPN-Zuweisung fehlgeschlagen. Bitte versuchen Sie es erneut.');
          }
          
          console.log('✅ [Initialize] VPN assigned successfully');
        }

        // Try with assigned VPN (STICKY - no automatic IP rotation)
        let response = await attemptInitialize();
        console.log(`[Initialize] Initial attempt status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Initialize] Error: ${errorText}`);

          const isProxyError = errorText.includes('ERR_PROXY_CONNECTION_FAILED') || errorText.toLowerCase().includes('proxy');

          if (isProxyError) {
            console.warn('⚠️ [Initialize] Proxy failed. Your VPN server may be down.');
            
            // Mark current VPN as unhealthy for future assignments
            const currentProxy = accountData?.proxy_server ? JSON.parse(accountData.proxy_server) : null;
            if (currentProxy?.host) {
              console.log(`📊 [Initialize] Marking ${currentProxy.host} as potentially unhealthy`);
              // The health check will handle this in the background
            }

            // Give ONE chance: Try to get a different healthy VPN (not multiple retries)
            console.log('🔄 [Initialize] Attempting ONE VPN reassignment...');
            
            const { error: reassignError } = await supa.functions.invoke('mullvad-proxy-manager', {
              body: { action: 'assign-proxy', accountId }
            });

            if (reassignError) {
              console.error('❌ [Initialize] Could not reassign VPN:', reassignError);
              throw new Error('Ihr VPN-Server ist nicht erreichbar und kein alternativer Server verfügbar. Bitte versuchen Sie es später erneut.');
            }

            console.log('✅ [Initialize] VPN reassigned, retrying once...');
            response = await attemptInitialize();
            console.log(`[Initialize] Retry with new VPN status: ${response.status}`);

            if (!response.ok) {
              const retryError = await response.text();
              console.error(`❌ [Initialize] Retry also failed: ${retryError}`);
              throw new Error('VPN-Verbindung fehlgeschlagen. Bitte klicken Sie auf "VPN zuweisen" um einen neuen Server zu erhalten.');
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

      case 'initialize-direct': {
        // Force initialize without VPN (explicit user action)
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supa = createClient(supabaseUrl || '', supabaseKey || '');

        console.log(`[Initialize-Direct] Temporarily removing proxy for account ${accountId}`);
        await supa
          .from('whatsapp_accounts')
          .update({ proxy_server: null })
          .eq('id', accountId);

        console.log(`[Initialize-Direct] Calling Railway at: ${BASE_URL}/api/initialize`);
        const response = await fetch(`${BASE_URL}/api/initialize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            userId: accountId,
            supabaseUrl,
            supabaseKey,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error(`[Initialize-Direct] Railway error: ${err}`);
          return new Response(JSON.stringify({ error: err }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const data = await response.json();
        console.log(`[Initialize-Direct] Success:`, data);
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

        // CRITICAL: Check if VPN/Proxy is assigned before sending
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supa = createClient(supabaseUrl || '', supabaseKey || '');

        const { data: accountData } = await supa
          .from('whatsapp_accounts')
          .select('proxy_server, user_id')
          .eq('id', accountId)
          .maybeSingle();

        if (!accountData) {
          throw new Error('Account not found');
        }

        // If no proxy assigned, auto-assign one before sending
        if (!accountData.proxy_server) {
          console.log('⚠️ [Send Message] No VPN assigned! Auto-assigning healthy proxy...');
          
          // Try to assign a healthy proxy
          try {
            const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/mullvad-proxy-manager`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                action: 'assign-proxy',
                accountId
              })
            });

            if (!proxyResponse.ok) {
              const error = await proxyResponse.text();
              console.error('[Send Message] VPN assignment failed:', error);
              throw new Error('Kein VPN verfügbar. Bitte warten Sie, bis der VPN-Service wieder verfügbar ist.');
            }

            const proxyResult = await proxyResponse.json();
            console.log('✅ [Send Message] VPN auto-assigned:', proxyResult.server);
          } catch (proxyError) {
            console.error('[Send Message] Critical: Cannot send without VPN:', proxyError);
            throw new Error('Nachrichten können nur mit aktivem VPN gesendet werden. Bitte versuchen Sie es später erneut.');
          }
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
