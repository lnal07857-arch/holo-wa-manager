import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multi-Region Mullvad SOCKS5 Servers
const MULLVAD_SERVERS: { [key: string]: string[] } = {
  DE: [
    'de-ber-wg-001.relays.mullvad.net',
    'de-ber-wg-002.relays.mullvad.net',
    'de-ber-wg-003.relays.mullvad.net',
    'de-fra-wg-001.relays.mullvad.net',
    'de-fra-wg-002.relays.mullvad.net',
    'de-fra-wg-003.relays.mullvad.net',
    'de-dus-wg-001.relays.mullvad.net',
    'de-dus-wg-002.relays.mullvad.net',
    'de-dus-wg-003.relays.mullvad.net',
  ],
  NL: [
    'nl-ams-wg-001.relays.mullvad.net',
    'nl-ams-wg-002.relays.mullvad.net',
    'nl-ams-wg-003.relays.mullvad.net',
  ],
  SE: [
    'se-sto-wg-001.relays.mullvad.net',
    'se-sto-wg-002.relays.mullvad.net',
    'se-got-wg-001.relays.mullvad.net',
  ],
  CH: [
    'ch-zrh-wg-001.relays.mullvad.net',
    'ch-zrh-wg-002.relays.mullvad.net',
  ],
};

// Flatten all servers for health checks
const ALL_SERVERS: Array<{ host: string; region: string }> = [];
Object.entries(MULLVAD_SERVERS).forEach(([region, hosts]) => {
  hosts.forEach(host => ALL_SERVERS.push({ host, region }));
});

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

    console.log(`[VPN Health Check] Starting health check for ${ALL_SERVERS.length} servers across ${Object.keys(MULLVAD_SERVERS).length} regions...`);

    const results = [];
    
    // Check alle Server parallel mit Timeout
    const healthCheckPromises = ALL_SERVERS.map(async ({ host: serverHost, region }) => {
      const timeoutPromise = new Promise<{ isHealthy: false; errorMessage: string }>((resolve) => {
        setTimeout(() => {
          resolve({ isHealthy: false, errorMessage: 'Connection timeout' });
        }, TIMEOUT_MS);
      });

      const healthCheck = checkServerHealth(serverHost);
      const result = await Promise.race([healthCheck, timeoutPromise]);

      // Update database with region info
      if (result.isHealthy) {
        await supabase
          .from('vpn_server_health')
          .upsert({
            server_host: serverHost,
            server_region: region,
            is_healthy: true,
            last_check_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            consecutive_failures: 0,
            response_time_ms: result.responseTimeMs || null,
            error_message: null
          }, { onConflict: 'server_host' });
      } else {
        const { data: existing } = await supabase
          .from('vpn_server_health')
          .select('consecutive_failures, failure_count')
          .eq('server_host', serverHost)
          .single();

        await supabase
          .from('vpn_server_health')
          .upsert({
            server_host: serverHost,
            server_region: region,
            is_healthy: false,
            last_check_at: new Date().toISOString(),
            last_failure_at: new Date().toISOString(),
            consecutive_failures: (existing?.consecutive_failures || 0) + 1,
            failure_count: (existing?.failure_count || 0) + 1,
            error_message: result.errorMessage || 'Health check failed'
          }, { onConflict: 'server_host' });
      }

      return { serverHost, region, ...result };
    });

    const checkResults = await Promise.all(healthCheckPromises);
    
    const healthyServers = checkResults.filter(r => r.isHealthy);
    const unhealthyServers = checkResults.filter(r => !r.isHealthy);

    console.log(`[VPN Health Check] Complete: ${healthyServers.length} healthy, ${unhealthyServers.length} unhealthy`);

    // Wenn zu viele Server down sind, sende Warnung
    if (unhealthyServers.length > ALL_SERVERS.length / 2) {
      console.warn(`⚠️ WARNING: More than 50% of VPN servers are unhealthy!`);
    }
    
    // Log region-specific health
    Object.keys(MULLVAD_SERVERS).forEach(region => {
      const regionResults = checkResults.filter(r => r.region === region);
      const regionHealthy = regionResults.filter(r => r.isHealthy).length;
      console.log(`[VPN Health Check] ${region}: ${regionHealthy}/${regionResults.length} healthy`);
    });

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

    // Build region summary
    const regionSummary: { [key: string]: { healthy: number; total: number } } = {};
    Object.keys(MULLVAD_SERVERS).forEach(region => {
      const regionResults = checkResults.filter(r => r.region === region);
      regionSummary[region] = {
        healthy: regionResults.filter(r => r.isHealthy).length,
        total: regionResults.length
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        totalServers: ALL_SERVERS.length,
        healthyServers: healthyServers.length,
        unhealthyServers: unhealthyServers.length,
        regionSummary,
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
