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

    const accountNumber = Deno.env.get('MULLVAD_ACCOUNT_NUMBER');
    if (!accountNumber) {
      throw new Error('MULLVAD_ACCOUNT_NUMBER not configured');
    }

    const { action, count, locations, userId } = await req.json();

    if (action === 'generate-configs') {
      console.log(`🔧 Generating ${count} WireGuard configs for user ${userId}`);

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
            locations.some((loc: string) => 
              s.hostname.includes(loc.toLowerCase()) || 
              s.city_name.toLowerCase().includes(loc.toLowerCase())
            )
          )
        : allServers;

      if (filteredServers.length === 0) {
        throw new Error('No servers found for the specified locations');
      }

      console.log(`📍 Found ${filteredServers.length} servers matching criteria`);

      const generatedConfigs = [];

      for (let i = 0; i < count; i++) {
        // Generate WireGuard key pair
        const keygenResponse = await fetch('https://api.mullvad.net/wg/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${accountNumber}`
          },
          body: JSON.stringify({})
        });

        if (!keygenResponse.ok) {
          console.error(`❌ Failed to generate key ${i + 1}: ${keygenResponse.statusText}`);
          continue;
        }

        const keyData = await keygenResponse.json();
        const { private_key, address } = keyData;

        // Select server (round-robin)
        const server = filteredServers[i % filteredServers.length];

        // Generate config content
        const configContent = `[Interface]
PrivateKey = ${private_key}
Address = ${address}
DNS = 193.138.218.74

[Peer]
PublicKey = ${server.public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${server.ipv4_addr_in}:51820
PersistentKeepalive = 25`;

        const configName = `${server.city_name}-${server.hostname}-${i + 1}`;
        const serverLocation = `${server.country_code}-${server.city_name}`;

        // Extract public key from private key (we'll use the server's public key as identifier)
        const publicKey = server.public_key;

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

        // Rate limiting - wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`🎉 Successfully generated ${generatedConfigs.length}/${count} configs`);

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
