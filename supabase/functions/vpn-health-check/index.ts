import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Liste der Mullvad SOCKS5 Server in Deutschland
const MULLVAD_DE_SERVERS = [
  'de-ber-wg-001.mullvad.net',
  'de-ber-wg-002.mullvad.net',
  'de-ber-wg-003.mullvad.net',
  'de-ber-wg-004.mullvad.net',
  'de-ber-wg-005.mullvad.net',
  'de-fra-wg-001.mullvad.net',
  'de-fra-wg-002.mullvad.net',
  'de-fra-wg-003.mullvad.net',
  'de-fra-wg-004.mullvad.net',
  'de-fra-wg-005.mullvad.net',
];

const SOCKS5_PORT = 1080;
const TIMEOUT_MS = 5000;

async function checkServerHealth(serverHost: string): Promise<{
  isHealthy: boolean;
  responseTimeMs?: number;
  errorMessage?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Versuche eine einfache TCP-Verbindung zum SOCKS5-Port
    const conn = await Deno.connect({
      hostname: serverHost,
      port: SOCKS5_PORT,
      transport: "tcp",
    });
    
    const responseTimeMs = Date.now() - startTime;
    
    // Verbindung erfolgreich - Server ist erreichbar
    conn.close();
    
    console.log(`✅ Server ${serverHost} is healthy (${responseTimeMs}ms)`);
    return { isHealthy: true, responseTimeMs };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Server ${serverHost} is unhealthy: ${errorMessage}`);
    return { isHealthy: false, errorMessage };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[VPN Health Check] Starting health check for ${MULLVAD_DE_SERVERS.length} servers...`);

    const results = [];
    
    // Check alle Server parallel mit Timeout
    const healthCheckPromises = MULLVAD_DE_SERVERS.map(async (serverHost) => {
      const timeoutPromise = new Promise<{ isHealthy: false; errorMessage: string }>((resolve) => {
        setTimeout(() => {
          resolve({ isHealthy: false, errorMessage: 'Connection timeout' });
        }, TIMEOUT_MS);
      });

      const healthCheck = checkServerHealth(serverHost);
      const result = await Promise.race([healthCheck, timeoutPromise]);

      // Update database
      if (result.isHealthy) {
        await supabase.rpc('mark_vpn_server_healthy', {
          p_server_host: serverHost,
          p_response_time_ms: result.responseTimeMs || null
        });
      } else {
        await supabase.rpc('mark_vpn_server_unhealthy', {
          p_server_host: serverHost,
          p_error_message: result.errorMessage || 'Health check failed'
        });
      }

      return { serverHost, ...result };
    });

    const checkResults = await Promise.all(healthCheckPromises);
    
    const healthyServers = checkResults.filter(r => r.isHealthy);
    const unhealthyServers = checkResults.filter(r => !r.isHealthy);

    console.log(`[VPN Health Check] Complete: ${healthyServers.length} healthy, ${unhealthyServers.length} unhealthy`);

    // Wenn zu viele Server down sind, sende Warnung
    if (unhealthyServers.length > MULLVAD_DE_SERVERS.length / 2) {
      console.warn(`⚠️ WARNING: More than 50% of VPN servers are unhealthy!`);
    }

    // Reassign accounts on unhealthy servers to healthy ones
    if (unhealthyServers.length > 0 && healthyServers.length > 0) {
      console.log(`[VPN Health Check] Reassigning accounts from ${unhealthyServers.length} unhealthy servers...`);
      
      for (const unhealthyServer of unhealthyServers) {
        // Find accounts using this server
        const { data: accounts } = await supabase
          .from('whatsapp_accounts')
          .select('id, account_name, proxy_server')
          .not('proxy_server', 'is', null);

        if (accounts) {
          for (const account of accounts) {
            try {
              const proxyConfig = JSON.parse(account.proxy_server);
              if (proxyConfig.host === unhealthyServer.serverHost) {
                // Assign new healthy server
                const randomHealthyServer = healthyServers[Math.floor(Math.random() * healthyServers.length)];
                
                const { data: mullvadAccounts } = await supabase
                  .from('mullvad_accounts')
                  .select('account_number')
                  .limit(1)
                  .single();

                if (mullvadAccounts) {
                  const newProxyConfig = {
                    host: randomHealthyServer.serverHost,
                    port: SOCKS5_PORT,
                    username: mullvadAccounts.account_number,
                    password: 'm',
                    protocol: 'socks5'
                  };

                  await supabase
                    .from('whatsapp_accounts')
                    .update({ proxy_server: JSON.stringify(newProxyConfig) })
                    .eq('id', account.id);

                  console.log(`✅ Reassigned ${account.account_name} from ${unhealthyServer.serverHost} to ${randomHealthyServer.serverHost}`);
                }
              }
            } catch (error) {
              console.error(`Error reassigning account ${account.id}:`, error);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalServers: MULLVAD_DE_SERVERS.length,
        healthyServers: healthyServers.length,
        unhealthyServers: unhealthyServers.length,
        results: checkResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[VPN Health Check] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
