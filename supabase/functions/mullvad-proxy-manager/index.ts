import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// List of German Mullvad servers for rotation
const DE_SERVERS = [
  'de-ber-wg-001.relays.mullvad.net',
  'de-ber-wg-002.relays.mullvad.net',
  'de-ber-wg-003.relays.mullvad.net',
  'de-fra-wg-001.relays.mullvad.net',
  'de-fra-wg-002.relays.mullvad.net',
  'de-fra-wg-003.relays.mullvad.net',
  'de-dus-wg-001.relays.mullvad.net',
  'de-dus-wg-002.relays.mullvad.net',
  'de-dus-wg-003.relays.mullvad.net',
  'de-ham-wg-001.relays.mullvad.net',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, accountId } = await req.json();

    if (action === 'assign-proxy') {
      // Get all WhatsApp accounts for the user
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('user_id, id')
        .eq('id', accountId)
        .single();

      if (!account) {
        throw new Error('Account not found');
      }

      // Get all Mullvad accounts for this user
      const { data: mullvadAccounts, error: mullvadError } = await supabase
        .from('mullvad_accounts')
        .select('*')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: true });

      if (mullvadError) throw mullvadError;

      if (!mullvadAccounts || mullvadAccounts.length === 0) {
        throw new Error('No Mullvad accounts found. Please add at least one Mullvad account first.');
      }

      // Get ONLY healthy servers with recent checks (last 15 minutes)
      const { data: healthyServers } = await supabase
        .from('vpn_server_health')
        .select('server_host, response_time_ms')
        .eq('is_healthy', true)
        .eq('server_region', 'DE')
        .gte('last_check', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .order('response_time_ms', { ascending: true });

      // ONLY use healthy servers with recent checks
      if (!healthyServers || healthyServers.length === 0) {
        console.error('❌ No healthy VPN servers available. All servers are currently down or unchecked.');
        throw new Error('No healthy VPN servers available at the moment. Please try again in a few minutes.');
      }

      const availableServers = healthyServers.map(s => s.server_host);
      console.log(`✅ Using ${availableServers.length} verified healthy servers`);

      // Get all WhatsApp accounts to determine the index
      const { data: allAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('id')
        .eq('user_id', account.user_id)
        .order('created_at', { ascending: true });

      if (!allAccounts) {
        throw new Error('Could not fetch accounts');
      }

      const accountIndex = allAccounts.findIndex(a => a.id === accountId);
      if (accountIndex === -1) {
        throw new Error('Account not found in list');
      }

      // Calculate which Mullvad account to use (5 WhatsApp accounts per Mullvad account)
      const mullvadIndex = Math.floor(accountIndex / 5) % mullvadAccounts.length;
      const serverIndex = accountIndex % availableServers.length;
      
      const mullvadAccount = mullvadAccounts[mullvadIndex];
      const proxyServer = availableServers[serverIndex];

      // Create proxy configuration
      const proxyConfig = {
        host: proxyServer,
        port: 1080,
        username: mullvadAccount.account_number,
        password: 'm',
        protocol: 'socks5'
      };

      // Update the WhatsApp account with proxy info
      const { error: updateError } = await supabase
        .from('whatsapp_accounts')
        .update({
          proxy_server: JSON.stringify(proxyConfig),
          proxy_country: 'DE'
        })
        .eq('id', accountId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          proxy: proxyConfig,
          mullvad_account: mullvadAccount.account_number,
          server: proxyServer
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-proxy') {
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('proxy_server')
        .eq('id', accountId)
        .single();

      if (!account || !account.proxy_server) {
        return new Response(
          JSON.stringify({ success: false, message: 'No proxy assigned' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          proxy: JSON.parse(account.proxy_server)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Mullvad Proxy Manager Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
