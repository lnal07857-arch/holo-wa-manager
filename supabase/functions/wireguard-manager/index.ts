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
        .select('user_id, id, wireguard_config_id, wireguard_backup_config_id')
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

      // Smart assignment: Primary → Backup → Tertiary
      let updateFields: any = {
        proxy_country: config.server_location
      };

      if (!account.wireguard_config_id) {
        // First config = Primary
        updateFields.wireguard_config_id = config.id;
        updateFields.active_config_id = config.id;
        console.log(`✅ Assigned as PRIMARY config for account ${accountId}`);
      } else if (!account.wireguard_backup_config_id) {
        // Second config = Backup
        updateFields.wireguard_backup_config_id = config.id;
        console.log(`✅ Assigned as BACKUP config for account ${accountId}`);
      } else {
        // Third config = Tertiary
        updateFields.wireguard_tertiary_config_id = config.id;
        console.log(`✅ Assigned as TERTIARY config for account ${accountId}`);
      }

      // Assign config to account
      const { error: updateError } = await supabase
        .from('whatsapp_accounts')
        .update(updateFields)
        .eq('id', accountId);

      if (updateError) throw updateError;

      // Initialize health status
      await supabase.rpc('mark_wireguard_healthy', { p_config_id: config.id });

      return new Response(
        JSON.stringify({
          success: true,
          config_name: config.config_name,
          server_location: config.server_location,
          public_key: config.public_key,
          role: !account.wireguard_config_id ? 'primary' : 
                !account.wireguard_backup_config_id ? 'backup' : 'tertiary'
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
