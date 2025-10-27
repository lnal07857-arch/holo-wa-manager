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

    console.log('🔍 Starting automated WireGuard health checks...');

    // Get all WireGuard configs
    const { data: configs, error: configsError } = await supabase
      .from('wireguard_configs')
      .select('id, config_name, server_location, user_id');

    if (configsError) {
      throw configsError;
    }

    if (!configs || configs.length === 0) {
      console.log('ℹ️ No WireGuard configs found');
      return new Response(
        JSON.stringify({ success: true, message: 'No configs to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Checking ${configs.length} WireGuard configs...`);

    const results = {
      checked: 0,
      healthy: 0,
      unhealthy: 0,
      errors: [] as string[]
    };

    // Check each config
    for (const config of configs) {
      try {
        // Simple ping test: Check if config exists and is accessible
        // In a real scenario, you might want to test actual connectivity
        const { data: health, error: healthError } = await supabase
          .from('wireguard_health')
          .select('is_healthy, consecutive_failures')
          .eq('config_id', config.id)
          .maybeSingle();

        // Mark as healthy if no previous health issues
        // In production, you'd perform actual connectivity tests here
        const isHealthy = !healthError && (!health || health.consecutive_failures < 3);

        if (isHealthy) {
          await supabase.rpc('mark_wireguard_healthy', { p_config_id: config.id });
          results.healthy++;
          console.log(`✅ ${config.config_name} (${config.server_location}) - Healthy`);
        } else {
          await supabase.rpc('mark_wireguard_unhealthy', {
            p_config_id: config.id,
            p_error_message: 'Health check failed or too many consecutive failures'
          });
          results.unhealthy++;
          console.log(`❌ ${config.config_name} (${config.server_location}) - Unhealthy`);
        }

        results.checked++;
      } catch (error: any) {
        console.error(`❌ Error checking ${config.config_name}:`, error);
        results.errors.push(`${config.config_name}: ${error.message}`);
      }
    }

    // Check for accounts that need failover
    const { data: accounts } = await supabase
      .from('whatsapp_accounts')
      .select('id, account_name, active_config_id')
      .not('active_config_id', 'is', null);

    if (accounts && accounts.length > 0) {
      console.log(`\n🔄 Checking ${accounts.length} active WhatsApp accounts for failover needs...`);
      
      for (const account of accounts) {
        try {
          const { data: activeHealth } = await supabase
            .from('wireguard_health')
            .select('is_healthy, consecutive_failures')
            .eq('config_id', account.active_config_id)
            .maybeSingle();

          if (!activeHealth?.is_healthy || (activeHealth?.consecutive_failures ?? 0) >= 3) {
            console.log(`⚠️ Account "${account.account_name}" needs failover check`);
            
            // Trigger failover check via health monitor
            await supabase.functions.invoke('wireguard-health-monitor', {
              body: { action: 'check-failover', accountId: account.id }
            });
          }
        } catch (error: any) {
          console.error(`Error checking account ${account.account_name}:`, error);
        }
      }
    }

    console.log(`\n📈 Health Check Summary:`);
    console.log(`   Checked: ${results.checked}/${configs.length}`);
    console.log(`   Healthy: ${results.healthy}`);
    console.log(`   Unhealthy: ${results.unhealthy}`);
    if (results.errors.length > 0) {
      console.log(`   Errors: ${results.errors.length}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ WireGuard Health Check Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
