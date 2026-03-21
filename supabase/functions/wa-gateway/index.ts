import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAW_SERVER_URL = (Deno.env.get('VPS_SERVER_URL') || Deno.env.get('RAILWAY_SERVER_URL') || '').trim();
// Ensure protocol and remove any trailing slashes to avoid paths like //api/...
const WITH_PROTOCOL = RAW_SERVER_URL && RAW_SERVER_URL.startsWith('http') ? RAW_SERVER_URL : (RAW_SERVER_URL ? `https://${RAW_SERVER_URL}` : '');
const BASE_URL = WITH_PROTOCOL.replace(/\/+$/, '');

// Helper: Build headers with worker routing
function workerHeaders(workerId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (workerId) {
    headers['X-Worker-ID'] = workerId;
    console.log(`[Worker Routing] Routing to ${workerId}`);
  }
  return headers;
}

// Helper: Get worker_id for an account from DB
async function getWorkerIdForAccount(supa: any, accountId: string): Promise<string | null> {
  const { data } = await supa
    .from('whatsapp_accounts')
    .select('worker_id')
    .eq('id', accountId)
    .maybeSingle();
  return data?.worker_id || null;
}

// Helper: Save worker_id from server response
async function saveWorkerId(supa: any, accountId: string, workerId: string) {
  if (workerId) {
    await supa
      .from('whatsapp_accounts')
      .update({ worker_id: workerId })
      .eq('id', accountId);
    console.log(`[Worker Routing] Saved worker_id=${workerId} for account ${accountId}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BASE_URL || BASE_URL === 'https://') {
      throw new Error('VPS_SERVER_URL is not configured');
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

        console.log(`[Initialize] Calling server at: ${BASE_URL}/api/initialize`);
        console.log(`[Initialize] AccountId: ${accountId}`);

        // Get WireGuard config from active_config_id
        const { data: accountData } = await supa
          .from('whatsapp_accounts')
          .select('active_config_id, user_id, proxy_server')
          .eq('id', accountId)
          .maybeSingle();

        // Clean up old proxy_server field if we're using active_config_id system
        if (accountData && accountData.proxy_server && !accountData.active_config_id) {
          console.log('🧹 [Initialize] Cleaning up old proxy_server field');
          await supa
            .from('whatsapp_accounts')
            .update({ proxy_server: null })
            .eq('id', accountId);
        }

        let proxyConfig = null;
        if (accountData?.active_config_id) {
          // Fetch the actual WireGuard config
          const { data: configData } = await supa
            .from('wireguard_configs')
            .select('config_content, server_location')
            .eq('id', accountData.active_config_id)
            .maybeSingle();

          if (configData?.config_content) {
            // Parse WireGuard config to extract proxy details
            const lines = configData.config_content.split('\n');
            const addressLine = lines.find((l: string) => l.startsWith('Address'));
            const endpointLine = lines.find((l: string) => l.startsWith('Endpoint'));
            
            if (endpointLine) {
              const [host, port] = endpointLine.split('=')[1].trim().split(':');
              proxyConfig = {
                host: host.trim(),
                port: parseInt(port) || 51820,
                protocol: 'wireguard',
                config_content: configData.config_content
              };
              console.log('✅ [Initialize] WireGuard VPN configured:', proxyConfig.host);
            }
          } else {
            console.warn('⚠️ [Initialize] Config ID exists but no content found');
          }
        } else {
          console.log('ℹ️ [Initialize] No VPN configured, using direct connection (VPS/direct mode)');
        }

        // Get worker_id for routing
        const workerId = accountData?.worker_id || (await getWorkerIdForAccount(supa, accountId));

        const attemptInitialize = async () => {
          const requestBody: any = {
            accountId,
            userId: accountId,
            supabaseUrl,
            supabaseKey,
          };

          if (proxyConfig) {
            requestBody.proxyConfig = proxyConfig;
          }

          return await fetch(`${BASE_URL}/api/initialize`, {
            method: 'POST',
            headers: workerHeaders(workerId),
            body: JSON.stringify(requestBody),
          });
        };

        // Intelligent retry with up to 3 VPN reassignments across regions
        const MAX_RETRIES = 3;
        let response = await attemptInitialize();
        console.log(`[Initialize] Initial attempt status: ${response.status}`);

        let retryCount = 0;
        while (!response.ok && retryCount < MAX_RETRIES) {
          const errorText = await response.text();
          console.error(`[Initialize] Attempt ${retryCount + 1} failed: ${errorText}`);

          const isProxyError = errorText.includes('ERR_PROXY_CONNECTION_FAILED') || 
                               errorText.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
                               errorText.toLowerCase().includes('proxy') ||
                               errorText.includes('browser has disconnected');

          if (isProxyError) {
            retryCount++;
            console.warn(`⚠️ [Initialize] Proxy failed (attempt ${retryCount}/${MAX_RETRIES}). Reassigning VPN...`);
            
            // Mark current config as unhealthy
            if (accountData?.active_config_id) {
              console.log(`📊 [Initialize] Marking config ${accountData.active_config_id} as unhealthy`);
              await supa.rpc('mark_wireguard_unhealthy', {
                p_config_id: accountData.active_config_id,
                p_error_message: 'VPN connection failed during initialization'
              });
            }

            // Try to get a different healthy config
            console.log(`🔄 [Initialize] Attempting VPN reassignment ${retryCount}/${MAX_RETRIES}...`);
            
            const { data: newConfigData, error: reassignError } = await supa.functions.invoke('wireguard-manager', {
              body: { action: 'select-best-config', accountId }
            });

            if (reassignError || !newConfigData?.success) {
              console.error(`❌ [Initialize] VPN reassignment ${retryCount} failed:`, reassignError || 'No healthy config available');
              if (retryCount >= MAX_RETRIES) {
                throw new Error('Alle VPN-Server sind nicht erreichbar. Bitte versuchen Sie es später erneut oder kontaktieren Sie den Support.');
              }
              continue;
            }

            // Refresh account data to get new config
            const { data: refreshedData } = await supa
              .from('whatsapp_accounts')
              .select('active_config_id')
              .eq('id', accountId)
              .single();

            if (refreshedData?.active_config_id) {
              const { data: newConfig } = await supa
                .from('wireguard_configs')
                .select('config_name, server_location')
                .eq('id', refreshedData.active_config_id)
                .single();
              
              console.log(`✅ [Initialize] New VPN assigned: ${newConfig?.config_name} (${newConfig?.server_location || 'Unknown'})`);
            }

            // Retry with new VPN
            response = await attemptInitialize();
            console.log(`[Initialize] Retry ${retryCount} status: ${response.status}`);
          } else {
            // Non-proxy error - don't retry
            throw new Error(`Backend server error (${response.status}): ${errorText}`);
          }
        }

        // If still not successful after all retries
        if (!response.ok) {
          const finalError = await response.text();
          console.error(`❌ [Initialize] All ${MAX_RETRIES} retries exhausted: ${finalError}`);
          throw new Error(`VPN-Verbindung nach ${MAX_RETRIES} Versuchen fehlgeschlagen. Bitte prüfen Sie Ihren Mullvad-Account oder versuchen Sie es später erneut.`);
        }

        const data = await response.json();
        console.log(`[Initialize] Success:`, data);
        
        // Save worker_id from server response
        if (data?.workerId) {
          const supabaseUrl2 = Deno.env.get('SUPABASE_URL');
          const supabaseKey2 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          const supa2 = createClient(supabaseUrl2 || '', supabaseKey2 || '');
          await saveWorkerId(supa2, accountId, data.workerId);
        }
        
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

        console.log(`[Initialize-Direct] Calling server at: ${BASE_URL}/api/initialize`);
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
          console.error(`[Initialize-Direct] Server error: ${err}`);
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

        // Get worker_id and account data for routing
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supa = createClient(supabaseUrl || '', supabaseKey || '');

        const { data: accountData } = await supa
          .from('whatsapp_accounts')
          .select('proxy_server, user_id, worker_id')
          .eq('id', accountId)
          .maybeSingle();

        if (!accountData) {
          throw new Error('Account not found');
        }

        const workerId = accountData.worker_id;

        let proxyConfig = null;
        if (accountData.proxy_server) {
          try {
            proxyConfig = JSON.parse(accountData.proxy_server);
            console.log('✅ [Send Message] Using configured VPN/Proxy:', proxyConfig.host);
          } catch (e) {
            console.warn('⚠️ [Send Message] Invalid proxy config, proceeding without proxy');
          }
        }

        console.log(`[Send Message] Calling server at: ${BASE_URL}/api/send-message (worker: ${workerId || 'any'})`);

        const requestBody: any = {
          accountId,
          phoneNumber: phoneNum,
          message: messageText,
        };

        if (proxyConfig) {
          requestBody.proxyConfig = proxyConfig;
        }

        const response = await fetch(`${BASE_URL}/api/send-message`, {
          method: 'POST',
          headers: workerHeaders(workerId),
          body: JSON.stringify(requestBody),
        });

        console.log(`[Send Message] Server response status: ${response.status}`);

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Send Message] Server error: ${error}`);
          throw new Error(`Server error: ${error}`);
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
          throw new Error(`Server error: ${error}`);
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'status': {
        // Status abrufen - wenn accountId vorhanden, dann Account-Status, sonst Server-Status
        if (accountId) {
          // Get worker_id for routing
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          const supa = createClient(supabaseUrl || '', supabaseKey || '');
          const workerId = await getWorkerIdForAccount(supa, accountId);
          
          console.log(`[Account Status] Calling server at: ${BASE_URL}/api/status/${accountId} (worker: ${workerId || 'any'})`);
          
          const response = await fetch(`${BASE_URL}/api/status/${accountId}`, {
            headers: workerHeaders(workerId),
          });

          if (!response.ok) {
            const error = await response.text();
            console.error(`[Account Status] Server error: ${error}`);
            throw new Error(`Server error: ${error}`);
          }

          const data = await response.json();
          console.log(`[Account Status] Success:`, data);
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Server-Status abrufen (ohne accountId)
          console.log(`[Server Status] Calling server at: ${BASE_URL}/api/status`);
          
          const response = await fetch(`${BASE_URL}/api/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          console.log(`[Server Status] Server response status: ${response.status}`);

          if (!response.ok) {
            const error = await response.text();
            console.error(`[Server Status] Server error: ${error}`);
            throw new Error(`Server error: ${error}`);
          }

          const data = await response.json();
          console.log(`[Server Status] Success:`, data);
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'disconnect': {
        // Get worker_id for routing
        const supabaseUrl4 = Deno.env.get('SUPABASE_URL');
        const supabaseKey4 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supa4 = createClient(supabaseUrl4 || '', supabaseKey4 || '');
        const workerId4 = await getWorkerIdForAccount(supa4, accountId);
        
        console.log(`[Disconnect] Calling server at: ${BASE_URL}/api/disconnect (worker: ${workerId4 || 'any'})`);
        console.log(`[Disconnect] AccountId: ${accountId}`);
        
        const response = await fetch(`${BASE_URL}/api/disconnect`, {
          method: 'POST',
          headers: workerHeaders(workerId4),
          body: JSON.stringify({ accountId }),
        });

        console.log(`[Disconnect] Server response status: ${response.status}`);

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Disconnect] Server error: ${error}`);
          throw new Error(`Server error: ${error}`);
        }

        const data = await response.json();
        
        // Clear worker_id on disconnect
        await supa4.from('whatsapp_accounts').update({ worker_id: null }).eq('id', accountId);
        
        console.log(`[Disconnect] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete-account': {
        if (!accountId) {
          throw new Error('accountId is required');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
        const authHeader = req.headers.get('authorization');

        if (!authHeader) {
          throw new Error('No authorization header');
        }

        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const {
          data: { user },
          error: userError,
        } = await userClient.auth.getUser();

        if (userError || !user) {
          throw new Error('Not authenticated');
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: ownedAccount, error: ownershipError } = await adminClient
          .from('whatsapp_accounts')
          .select('id')
          .eq('id', accountId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (ownershipError) throw ownershipError;
        if (!ownedAccount) {
          throw new Error('Account nicht gefunden oder keine Berechtigung.');
        }

        // Route disconnect to correct worker (with 5s timeout to avoid hanging)
        const deleteWorkerId = await getWorkerIdForAccount(adminClient, accountId);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          await fetch(`${BASE_URL}/api/disconnect`, {
            method: 'POST',
            headers: workerHeaders(deleteWorkerId),
            body: JSON.stringify({ accountId }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (disconnectError) {
          console.warn('[Delete Account] Disconnect warning (timeout or unreachable):', disconnectError);
        }

        const [messagesDelete, campaignsDelete] = await Promise.all([
          adminClient.from('messages').delete({ count: 'exact' }).eq('account_id', accountId),
          adminClient.from('bulk_campaigns').delete({ count: 'exact' }).eq('account_id', accountId),
        ]);

        if (messagesDelete.error) {
          throw new Error(`Nachrichten konnten nicht gelöscht werden: ${messagesDelete.error.message}`);
        }

        if (campaignsDelete.error) {
          throw new Error(`Kampagnen konnten nicht gelöscht werden: ${campaignsDelete.error.message}`);
        }

        const { error: accountDeleteError, count: accountDeleteCount } = await adminClient
          .from('whatsapp_accounts')
          .delete({ count: 'exact' })
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (accountDeleteError) {
          throw accountDeleteError;
        }

        if (!accountDeleteCount) {
          throw new Error('Account konnte nicht gelöscht werden.');
        }

        return new Response(JSON.stringify({
          success: true,
          deletedAccountId: accountId,
          deletedMessages: messagesDelete.count || 0,
          deletedCampaigns: campaignsDelete.count || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync-messages': {
        // Manuell alle Nachrichten vom WhatsApp-Server synchronisieren
        console.log(`[Sync Messages] Requested for AccountId: ${accountId}`);
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        // Try multiple possible endpoints for backward compatibility
        const candidates: Array<{ method: 'POST' | 'GET'; url: string; body?: any }> = [
          { method: 'POST', url: `${BASE_URL}/api/sync-messages`, body: { accountId, supabaseUrl, supabaseKey } },
          { method: 'POST', url: `${BASE_URL}/api/syncMessages`, body: { accountId, supabaseUrl, supabaseKey } },
          { method: 'GET',  url: `${BASE_URL}/api/sync-messages?accountId=${accountId}` },
          { method: 'POST', url: `${BASE_URL}/api/sync`, body: { accountId, supabaseUrl, supabaseKey } },
        ];

        let lastErrorText = '';
        for (const c of candidates) {
          try {
            console.log(`[Sync Messages] Trying ${c.method} ${c.url}`);
            const response = await fetch(c.url, {
              method: c.method,
              headers: { 'Content-Type': 'application/json' },
              body: c.method === 'POST' ? JSON.stringify(c.body) : undefined,
            });

            console.log(`[Sync Messages] Candidate response status: ${response.status}`);
            if (response.ok) {
              const data = await response.json();
              console.log(`[Sync Messages] Success via ${c.url}`);
              return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            const text = await response.text();
            lastErrorText = text;
            // Continue trying next candidate on 404 or generic Cannot POST
            if (response.status === 404 || /Cannot\s+POST/i.test(text)) {
              continue;
            }
            // For other HTTP errors, break and return immediately
            throw new Error(text);
          } catch (err) {
            console.warn(`[Sync Messages] Attempt failed for ${c.url}:`, err);
          }
        }

        console.error(`[Sync Messages] All endpoints failed. Last error: ${lastErrorText}`);
        return new Response(JSON.stringify({ error: 'SYNC_ENDPOINT_NOT_AVAILABLE', details: lastErrorText }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-fingerprint': {
        // Fingerprint-Informationen abrufen
        console.log(`[Get Fingerprint] Calling server at: ${BASE_URL}/api/fingerprint`);
        
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
          console.error(`[Get Fingerprint] Server error: ${error}`);
          throw new Error(`Server error: ${error}`);
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
