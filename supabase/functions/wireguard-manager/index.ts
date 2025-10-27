import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, accountId, configId } = await req.json();

    if (action === 'assign-config') {
      // Get account info
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('user_id, id')
        .eq('id', accountId)
        .single();

      if (!account) {
        throw new Error('Account not found');
      }

      // Get WireGuard config
      const { data: config, error: configError } = await supabase
        .from('wireguard_configs')
        .select('*')
        .eq('id', configId)
        .eq('user_id', account.user_id)
        .single();

      if (configError || !config) {
        throw new Error('WireGuard config not found or access denied');
      }

      // Assign config to account
      const { error: updateError } = await supabase
        .from('whatsapp_accounts')
        .update({
          wireguard_config_id: config.id,
          proxy_country: config.server_location
        })
        .eq('id', accountId);

      if (updateError) throw updateError;

      console.log(`✅ Assigned WireGuard config "${config.config_name}" to account ${accountId}`);

      return new Response(
        JSON.stringify({
          success: true,
          config_name: config.config_name,
          server_location: config.server_location,
          public_key: config.public_key
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-config') {
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('wireguard_config_id, wireguard_configs(*)')
        .eq('id', accountId)
        .single();

      if (!account || !account.wireguard_config_id) {
        return new Response(
          JSON.stringify({ success: false, message: 'No WireGuard config assigned' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          config: account.wireguard_configs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('WireGuard Manager Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
