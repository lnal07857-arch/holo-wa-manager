import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAW_SERVER_URL = (Deno.env.get('VPS_SERVER_URL') || Deno.env.get('RAILWAY_SERVER_URL') || '').trim();
const WITH_PROTOCOL = RAW_SERVER_URL && RAW_SERVER_URL.startsWith('http') ? RAW_SERVER_URL : (RAW_SERVER_URL ? `https://${RAW_SERVER_URL}` : '');
const BASE_URL = WITH_PROTOCOL.replace(/\/+$/, '');

// ─── Worker Slot Routing ──────────────────────────────────────────────
// Maps worker_slot (1-10) to direct port (3001-3010) OR uses Nginx (:3000) with X-Worker-ID header.

function buildSlotBaseUrl(primary: string, slot?: number | null): string {
  if (!primary || !slot || slot < 1 || slot > 10) return primary;
  try {
    const url = new URL(primary);
    url.port = String(3000 + slot);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return primary;
  }
}

function buildNginxBaseUrl(primary: string): string {
  if (!primary) return primary;
  try {
    const url = new URL(primary);
    url.port = '3000';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return primary;
  }
}

function buildRoutingCandidates(primary: string, slot?: number | null): string[] {
  if (!slot) return [primary];
  const direct = buildSlotBaseUrl(primary, slot);
  const nginx = buildNginxBaseUrl(primary);
  return [...new Set([direct, nginx, primary].filter(Boolean))];
}

function workerHeaders(slot?: number | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (slot) {
    const workerId = `worker-${String(slot).padStart(2, '0')}`;
    headers['X-Worker-ID'] = workerId;
    console.log(`[Worker Routing] Slot ${slot} → ${workerId}`);
  }
  return headers;
}

// ─── Account Helpers ──────────────────────────────────────────────────

interface AccountInfo {
  worker_slot: number | null;
  worker_id: string | null;
  active_config_id: string | null;
  user_id: string | null;
  proxy_server: string | null;
}

async function getAccountInfo(supa: any, accountId: string): Promise<AccountInfo | null> {
  const { data } = await supa
    .from('whatsapp_accounts')
    .select('worker_slot, worker_id, active_config_id, user_id, proxy_server')
    .eq('id', accountId)
    .maybeSingle();
  return data || null;
}

async function getSlotForAccount(supa: any, accountId: string): Promise<number | null> {
  const info = await getAccountInfo(supa, accountId);
  if (info?.worker_slot) return info.worker_slot;
  // Fallback: parse from worker_id
  if (info?.worker_id) {
    const match = info.worker_id.match(/worker-(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function createSupaAdmin() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(url, key);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BASE_URL || BASE_URL === 'https://') {
      throw new Error('VPS_SERVER_URL is not configured');
    }

    const { action, accountId, phoneNumber, phone, message, text, contacts } = await req.json();
    console.log(`[WhatsApp Gateway] Action: ${action}, Account: ${accountId}`);

    switch (action) {
      // ═══════════════════════════════════════════════════════════════
      // INITIALIZE
      // ═══════════════════════════════════════════════════════════════
      case 'initialize': {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) throw new Error('No authorization header');

        const supa = createSupaAdmin();
        const accountInfo = await getAccountInfo(supa, accountId);
        const slot = accountInfo?.worker_slot || null;

        if (!slot) {
          throw new Error('Kein Worker-Slot zugewiesen. Bitte Account neu erstellen.');
        }

        const candidates = buildRoutingCandidates(BASE_URL, slot);
        const initBase = candidates[0] || BASE_URL;

        console.log(`[Initialize] Slot ${slot}, URL: ${initBase}/api/initialize, AccountId: ${accountId}`);

        // Pre-flight: cleanup stale sessions
        try {
          const preResp = await fetch(`${initBase}/api/status/${accountId}`, {
            headers: workerHeaders(slot),
          });
          if (preResp.ok) {
            const preStatus = await preResp.json();
            if (preStatus && preStatus.status !== 'connected' && preStatus.status !== 'not_found') {
              console.log(`[Initialize] Stale session (${preStatus.status}). Disconnecting first...`);
              try {
                await fetch(`${initBase}/api/disconnect`, {
                  method: 'POST',
                  headers: workerHeaders(slot),
                  body: JSON.stringify({ accountId }),
                });
                await new Promise(r => setTimeout(r, 500));
              } catch (_) { /* best effort */ }
            }
          }
        } catch (_) { /* pre-flight failed, continue */ }

        // Build proxy config if active_config_id exists
        let proxyConfig = null;
        if (accountInfo?.active_config_id) {
          const { data: configData } = await supa
            .from('wireguard_configs')
            .select('config_content, server_location')
            .eq('id', accountInfo.active_config_id)
            .maybeSingle();

          if (configData?.config_content) {
            const lines = configData.config_content.split('\n');
            const endpointLine = lines.find((l: string) => l.startsWith('Endpoint'));
            if (endpointLine) {
              const [host, port] = endpointLine.split('=')[1].trim().split(':');
              proxyConfig = {
                host: host.trim(),
                port: parseInt(port) || 51820,
                protocol: 'wireguard',
                config_content: configData.config_content
              };
            }
          }
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        const requestBody: any = { accountId, userId: accountId, supabaseUrl, supabaseKey };
        if (proxyConfig) requestBody.proxyConfig = proxyConfig;

        const response = await fetch(`${initBase}/api/initialize`, {
          method: 'POST',
          headers: workerHeaders(slot),
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Backend error (${response.status}): ${err}`);
        }

        const data = await response.json();
        console.log(`[Initialize] Success:`, data);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // SEND MESSAGE
      // ═══════════════════════════════════════════════════════════════
      case 'send':
      case 'send-message': {
        const phoneNum = phoneNumber || phone;
        const messageText = message || text;
        if (!phoneNum || !messageText) throw new Error('Phone and message are required');

        const supa = createSupaAdmin();
        const slot = await getSlotForAccount(supa, accountId);
        const sendBase = buildSlotBaseUrl(BASE_URL, slot);

        const response = await fetch(`${sendBase}/api/send-message`, {
          method: 'POST',
          headers: workerHeaders(slot),
          body: JSON.stringify({ accountId, phoneNumber: phoneNum, message: messageText }),
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

      // ═══════════════════════════════════════════════════════════════
      // SEND BULK
      // ═══════════════════════════════════════════════════════════════
      case 'send-bulk': {
        if (!contacts || !Array.isArray(contacts)) throw new Error('Contacts array is required');

        const supa = createSupaAdmin();
        const slot = await getSlotForAccount(supa, accountId);
        const bulkBase = buildSlotBaseUrl(BASE_URL, slot);

        const response = await fetch(`${bulkBase}/api/send-bulk`, {
          method: 'POST',
          headers: workerHeaders(slot),
          body: JSON.stringify({ accountId, contacts }),
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

      // ═══════════════════════════════════════════════════════════════
      // STATUS
      // ═══════════════════════════════════════════════════════════════
      case 'status': {
        if (accountId) {
          const supa = createSupaAdmin();
          const slot = await getSlotForAccount(supa, accountId);
          const candidates = buildRoutingCandidates(BASE_URL, slot);

          let lastError = '';
          for (const base of candidates) {
            try {
              console.log(`[Status] ${base}/api/status/${accountId} (slot: ${slot})`);
              const response = await fetch(`${base}/api/status/${accountId}`, {
                headers: workerHeaders(slot),
              });

              if (!response.ok) {
                lastError = await response.text();
                continue;
              }

              const data = await response.json();
              const normalized = {
                ...data,
                connected: data?.status === 'connected' || data?.connected === true,
                status: data?.status || (data?.connected ? 'connected' : 'disconnected'),
                workerSlot: slot,
              };

              console.log(`[Status] Success:`, normalized);
              return new Response(JSON.stringify(normalized), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } catch (e) {
              lastError = String(e);
            }
          }

          throw new Error(`Status check failed: ${lastError}`);
        } else {
          const response = await fetch(`${BASE_URL}/api/status`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (!response.ok) throw new Error(await response.text());
          const data = await response.json();
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // DISCONNECT
      // ═══════════════════════════════════════════════════════════════
      case 'disconnect': {
        const supa = createSupaAdmin();
        const slot = await getSlotForAccount(supa, accountId);
        const dcBase = buildSlotBaseUrl(BASE_URL, slot);

        console.log(`[Disconnect] ${dcBase}/api/disconnect (slot: ${slot})`);
        const response = await fetch(`${dcBase}/api/disconnect`, {
          method: 'POST',
          headers: workerHeaders(slot),
          body: JSON.stringify({ accountId }),
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

      // ═══════════════════════════════════════════════════════════════
      // DELETE ACCOUNT
      // ═══════════════════════════════════════════════════════════════
      case 'delete-account': {
        if (!accountId) throw new Error('accountId is required');

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
        const authHeader = req.headers.get('authorization');
        if (!authHeader) throw new Error('No authorization header');

        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) throw new Error('Not authenticated');

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // Get slot before delete
        const { data: ownedAccount } = await adminClient
          .from('whatsapp_accounts')
          .select('id, worker_slot')
          .eq('id', accountId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!ownedAccount) throw new Error('Account nicht gefunden oder keine Berechtigung.');

        const deleteSlot = ownedAccount.worker_slot;

        // Disconnect on VPS with timeout
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          await fetch(`${buildSlotBaseUrl(BASE_URL, deleteSlot)}/api/disconnect`, {
            method: 'POST',
            headers: workerHeaders(deleteSlot),
            body: JSON.stringify({ accountId }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (_) {
          console.warn('[Delete Account] Disconnect warning (timeout or unreachable)');
        }

        // Delete related data
        const [messagesDelete, campaignsDelete] = await Promise.all([
          adminClient.from('messages').delete({ count: 'exact' }).eq('account_id', accountId),
          adminClient.from('bulk_campaigns').delete({ count: 'exact' }).eq('account_id', accountId),
        ]);

        if (messagesDelete.error) throw new Error(`Nachrichten: ${messagesDelete.error.message}`);
        if (campaignsDelete.error) throw new Error(`Kampagnen: ${campaignsDelete.error.message}`);

        const { error: accountDeleteError, count: accountDeleteCount } = await adminClient
          .from('whatsapp_accounts')
          .delete({ count: 'exact' })
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (accountDeleteError) throw accountDeleteError;
        if (!accountDeleteCount) throw new Error('Account konnte nicht gelöscht werden.');

        // Free the worker slot
        if (deleteSlot) {
          await adminClient
            .from('worker_slots')
            .update({ is_occupied: false, account_id: null })
            .eq('slot_number', deleteSlot);
        }

        return new Response(JSON.stringify({
          success: true,
          deletedAccountId: accountId,
          freedSlot: deleteSlot,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // SYNC MESSAGES
      // ═══════════════════════════════════════════════════════════════
      case 'sync-messages': {
        console.log(`[Sync Messages] AccountId: ${accountId}`);
        const supa = createSupaAdmin();
        const slot = await getSlotForAccount(supa, accountId);

        if (!slot) {
          return new Response(JSON.stringify({ error: 'NO_WORKER_SLOT', message: 'Kein Worker-Slot zugewiesen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const syncBase = buildSlotBaseUrl(BASE_URL, slot);
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        // Pre-flight: check if worker has account active
        let workerReady = false;
        try {
          const statusResp = await fetch(`${syncBase}/api/status/${accountId}`, {
            headers: workerHeaders(slot),
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            workerReady = statusData?.connected === true || statusData?.status === 'connected';
            if (!workerReady) {
              console.warn(`[Sync] Worker reports status=${statusData?.status}`);
            }
          }
        } catch (e) {
          console.warn(`[Sync] Pre-flight failed:`, e);
        }

        if (!workerReady) {
          console.warn(`[Sync] Account not live. Auto-initializing on slot ${slot}...`);

          try {
            const initResp = await fetch(`${syncBase}/api/initialize`, {
              method: 'POST',
              headers: workerHeaders(slot),
              body: JSON.stringify({ accountId, userId: accountId, supabaseUrl, supabaseKey }),
            });

            if (initResp.ok) {
              // Wait up to 30s for reconnection
              let connected = false;
              for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                  const checkResp = await fetch(`${syncBase}/api/status/${accountId}`, {
                    headers: workerHeaders(slot),
                  });
                  if (checkResp.ok) {
                    const checkData = await checkResp.json();
                    if (checkData?.connected || checkData?.status === 'connected') {
                      connected = true;
                      console.log(`[Sync] Auto-reconnect successful after ${(i+1)*2}s`);
                      break;
                    }
                    if (checkData?.status === 'qr_generated' || checkData?.status === 'pending') {
                      return new Response(JSON.stringify({
                        error: 'QR_SCAN_REQUIRED',
                        message: 'Account benötigt erneuten QR-Scan.'
                      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                    }
                  }
                } catch (_) { /* continue polling */ }
              }

              if (!connected) {
                return new Response(JSON.stringify({
                  error: 'RECONNECT_TIMEOUT',
                  message: 'Auto-Reconnect fehlgeschlagen.'
                }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            } else {
              const errText = await initResp.text();
              return new Response(JSON.stringify({ error: 'AUTO_RECONNECT_FAILED', details: errText }), {
                status: 503,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } catch (initErr) {
            return new Response(JSON.stringify({ error: 'AUTO_RECONNECT_ERROR' }), {
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Try sync endpoints
        const endpoints = [
          { method: 'POST' as const, url: `${syncBase}/api/sync-messages`, body: { accountId, supabaseUrl, supabaseKey } },
          { method: 'POST' as const, url: `${syncBase}/api/syncMessages`, body: { accountId, supabaseUrl, supabaseKey } },
          { method: 'POST' as const, url: `${syncBase}/api/sync`, body: { accountId, supabaseUrl, supabaseKey } },
        ];

        let lastErrorText = '';
        for (const ep of endpoints) {
          try {
            console.log(`[Sync] Trying ${ep.method} ${ep.url} (slot: ${slot})`);
            const response = await fetch(ep.url, {
              method: ep.method,
              headers: workerHeaders(slot),
              body: JSON.stringify(ep.body),
            });

            if (response.ok) {
              const data = await response.json();
              console.log(`[Sync] Success via ${ep.url}`);
              return new Response(JSON.stringify({ ...data, workerSlot: slot }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            const text = await response.text();
            lastErrorText = text;
            if (response.status === 404 || /Cannot\s+POST/i.test(text)) continue;
            throw new Error(text);
          } catch (err) {
            console.warn(`[Sync] Failed for ${ep.url}:`, err);
          }
        }

        return new Response(JSON.stringify({ error: 'SYNC_ENDPOINT_NOT_AVAILABLE', details: lastErrorText }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // GET FINGERPRINT
      // ═══════════════════════════════════════════════════════════════
      case 'get-fingerprint': {
        const supa = createSupaAdmin();
        const slot = await getSlotForAccount(supa, accountId);
        const fpBase = buildSlotBaseUrl(BASE_URL, slot);

        const response = await fetch(`${fpBase}/api/fingerprint/${accountId}`, {
          headers: workerHeaders(slot),
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[WhatsApp Gateway Error]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
