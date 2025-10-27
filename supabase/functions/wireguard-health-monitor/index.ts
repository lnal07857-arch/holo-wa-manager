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

    const { action, accountId, configId, errorMessage } = await req.json();

    // Action: Check if account needs failover
    if (action === 'check-failover') {
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select(`
          id,
          wireguard_config_id,
          wireguard_backup_config_id,
          wireguard_tertiary_config_id,
          active_config_id,
          failover_count
        `)
        .eq('id', accountId)
        .single();

      if (!account || !account.active_config_id) {
        return new Response(
          JSON.stringify({ needsFailover: false, message: 'No active config' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if active config is healthy
      const { data: health } = await supabase
        .from('wireguard_health')
        .select('is_healthy, consecutive_failures')
        .eq('config_id', account.active_config_id)
        .maybeSingle();

      // Failover if: unhealthy OR 3+ consecutive failures
      const needsFailover = !health?.is_healthy || (health?.consecutive_failures ?? 0) >= 3;

      if (needsFailover) {
        console.log(`⚠️ Account ${accountId} needs failover (failures: ${health?.consecutive_failures ?? 0})`);
        
        // Find next healthy config
        const configs = [
          account.wireguard_config_id,
          account.wireguard_backup_config_id,
          account.wireguard_tertiary_config_id
        ].filter(id => id && id !== account.active_config_id);

        for (const nextConfigId of configs) {
          const { data: nextHealth } = await supabase
            .from('wireguard_health')
            .select('is_healthy, consecutive_failures')
            .eq('config_id', nextConfigId)
            .maybeSingle();

          // Use this config if healthy or has fewer failures
          if (!nextHealth || nextHealth.is_healthy || (nextHealth.consecutive_failures ?? 0) < 2) {
            // Perform failover
            const { error: updateError } = await supabase
              .from('whatsapp_accounts')
              .update({
                active_config_id: nextConfigId,
                last_failover_at: new Date().toISOString(),
                failover_count: (account.failover_count || 0) + 1
              })
              .eq('id', accountId);

            if (updateError) throw updateError;

            const { data: newConfig } = await supabase
              .from('wireguard_configs')
              .select('config_name, server_location')
              .eq('id', nextConfigId)
              .single();

            console.log(`✅ Failover complete: ${account.active_config_id} → ${nextConfigId} (${newConfig?.config_name})`);

            return new Response(
              JSON.stringify({
                needsFailover: true,
                performedFailover: true,
                newConfigId: nextConfigId,
                newConfigName: newConfig?.config_name,
                newLocation: newConfig?.server_location
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // No healthy configs available
        console.error(`❌ No healthy configs available for account ${accountId}`);
        return new Response(
          JSON.stringify({
            needsFailover: true,
            performedFailover: false,
            error: 'No healthy backup configs available'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ needsFailover: false, message: 'Config is healthy' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Mark config as healthy/unhealthy
    if (action === 'report-health') {
      if (!configId) {
        throw new Error('configId is required');
      }

      const isHealthy = !errorMessage;

      if (isHealthy) {
        await supabase.rpc('mark_wireguard_healthy', { p_config_id: configId });
        console.log(`✅ Config ${configId} marked as healthy`);
      } else {
        await supabase.rpc('mark_wireguard_unhealthy', {
          p_config_id: configId,
          p_error_message: errorMessage
        });
        console.log(`❌ Config ${configId} marked as unhealthy: ${errorMessage}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Get health status for all configs
    if (action === 'get-health-status') {
      const { data: healthData } = await supabase
        .from('wireguard_health')
        .select(`
          *,
          wireguard_configs (
            config_name,
            server_location
          )
        `)
        .order('updated_at', { ascending: false });

      return new Response(
        JSON.stringify({ configs: healthData || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('WireGuard Health Monitor Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
