import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MullvadServer {
  hostname: string;
  country_code: string;
  city_name: string;
  public_key: string;
  ipv4_addr_in: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, count, locations, userId, mullvadAccountId } = await req.json();

    if (action === 'generate-configs') {
      if (!mullvadAccountId) {
        throw new Error('mullvadAccountId is required');
      }

      // Get Mullvad account from database
      const { data: mullvadAccount, error: accountError } = await supabase
        .from('mullvad_accounts')
        .select('*')
        .eq('id', mullvadAccountId)
        .eq('user_id', userId)
        .single();

      if (accountError || !mullvadAccount) {
        throw new Error('Mullvad account not found');
      }

      const accountNumber = mullvadAccount.account_number;
      console.log(`🔧 Generating ${count} WireGuard configs for user ${userId} using Mullvad account ${mullvadAccount.account_name}`);

      // Get available Mullvad servers
      const serversResponse = await fetch('https://api.mullvad.net/public/relays/wireguard/v2/', {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!serversResponse.ok) {
        throw new Error(`Failed to fetch Mullvad servers: ${serversResponse.statusText}`);
      }

      const serversData = await serversResponse.json();
      const allServers: MullvadServer[] = serversData.wireguard.relays || [];
      
      // Filter servers by requested locations
      const filteredServers = locations && locations.length > 0
        ? allServers.filter((s: MullvadServer) => 
            locations.some((loc: string) => {
              const locLower = loc?.toLowerCase() || '';
              return s.hostname.toLowerCase().includes(locLower) || 
                     s.city_name.toLowerCase().includes(locLower);
            })
          )
        : allServers;

      if (filteredServers.length === 0) {
        throw new Error('No servers found for the specified locations');
      }

      console.log(`📍 Found ${filteredServers.length} servers matching criteria`);

      const generatedConfigs = [];

      for (let i = 0; i < count; i++) {
        try {
          // Generate WireGuard key pair locally using Web Crypto API
          const keyPair = await crypto.subtle.generateKey(
            {
              name: 'X25519',
              namedCurve: 'X25519'
            },
            true,
            ['deriveKey', 'deriveBits']
          );

          // Export keys to base64
          const privateKeyRaw = await crypto.subtle.exportKey('raw', keyPair.privateKey);
          const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
          
          const privateKey = btoa(String.fromCharCode(...new Uint8Array(privateKeyRaw)));
          const publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)));

          // Register public key with Mullvad using the old API endpoint (more reliable)
          const registerResponse = await fetch('https://api.mullvad.net/wg/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `account=${accountNumber}&pubkey=${encodeURIComponent(publicKey)}`
          });

          if (!registerResponse.ok) {
            const errorText = await registerResponse.text();
            console.error(`❌ Failed to register key ${i + 1}: ${registerResponse.status} - ${errorText}`);
            continue;
          }

          const registerData = await registerResponse.text();
          
          // Parse the response (format: "10.x.x.x/32")
          const ipMatch = registerData.match(/(\d+\.\d+\.\d+\.\d+\/\d+)/);
          if (!ipMatch) {
            console.error(`❌ Failed to parse IP from response: ${registerData}`);
            continue;
          }
          
          const address = ipMatch[1];

          // Select server (round-robin)
          const server = filteredServers[i % filteredServers.length];

          // Generate config content
          const configContent = `[Interface]
PrivateKey = ${privateKey}
Address = ${address}
DNS = 193.138.218.74

[Peer]
PublicKey = ${server.public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${server.ipv4_addr_in}:51820
PersistentKeepalive = 25`;

          const configName = `${server.city_name}-${server.hostname}-${i + 1}`;
          const serverLocation = `${server.country_code}-${server.city_name}`;

          // Insert into database
          const { data, error } = await supabase
            .from('wireguard_configs')
            .insert({
              user_id: userId,
              config_name: configName,
              config_content: configContent,
              server_location: serverLocation,
              public_key: publicKey
            })
            .select()
            .single();

          if (error) {
            console.error(`❌ Failed to save config ${i + 1}:`, error);
            continue;
          }

          generatedConfigs.push(data);
          console.log(`✅ Generated config ${i + 1}/${count}: ${configName}`);

          // Rate limiting - wait 2 seconds between requests to avoid 429
          if (i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (keyError) {
          console.error(`❌ Failed to generate config ${i + 1}:`, keyError);
          continue;
        }
      }

      console.log(`🎉 Successfully generated ${generatedConfigs.length}/${count} configs`);

      // Update devices_used count for Mullvad account
      await supabase
        .from('mullvad_accounts')
        .update({ 
          devices_used: (mullvadAccount.devices_used || 0) + generatedConfigs.length 
        })
        .eq('id', mullvadAccountId);

      return new Response(
        JSON.stringify({
          success: true,
          generated: generatedConfigs.length,
          total: count,
          configs: generatedConfigs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-available-locations') {
      // Get available Mullvad server locations
      const serversResponse = await fetch('https://api.mullvad.net/public/relays/wireguard/v2/', {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!serversResponse.ok) {
        throw new Error('Failed to fetch Mullvad servers');
      }

      const serversData = await serversResponse.json();
      const servers: MullvadServer[] = serversData.wireguard.relays || [];

      // Extract unique locations
      const locations = Array.from(new Set(
        servers.map((s: MullvadServer) => `${s.country_code}-${s.city_name}`)
      ));

      return new Response(
        JSON.stringify({ success: true, locations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Mullvad Config Generator Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
