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

    const { action, accountId } = await req.json();

    if (action === 'select-best-config') {
      // Get account with mullvad assignment
      const { data: account, error: accountError } = await supabase
        .from('whatsapp_accounts')
        .select('user_id, id, mullvad_account_id, active_config_id')
        .eq('id', accountId)
        .single();

      if (accountError || !account) {
        throw new Error('Account not found');
      }

      if (!account.mullvad_account_id) {
        throw new Error('Kein Mullvad Account zugewiesen. Bitte erst in Account-Verwaltung einen Mullvad Account zuweisen.');
      }

      // Get all configs from the assigned Mullvad account
      const { data: configs, error: configsError } = await supabase
        .from('wireguard_configs')
        .select('id, config_name, server_location, mullvad_account_id')
        .eq('mullvad_account_id', account.mullvad_account_id)
        .eq('user_id', account.user_id);

      if (configsError || !configs || configs.length === 0) {
        throw new Error('Keine WireGuard Configs für diesen Mullvad Account gefunden');
      }

      // Check 5-connection limit for this Mullvad account
      const configIds = configs.map(c => c.id);
      const { count: activeConnections } = await supabase
        .from('whatsapp_accounts')
        .select('id', { count: 'exact', head: true })
        .in('active_config_id', configIds)
        .neq('id', accountId);

      if ((activeConnections || 0) >= 5) {
        throw new Error(`Mullvad Account hat bereits 5 aktive Verbindungen (max. Limit). Bitte verwende einen anderen Mullvad Account.`);
      }

      // Get health status for all configs
      const { data: healthData } = await supabase
        .from('wireguard_health')
        .select('config_id, is_healthy, consecutive_failures')
        .in('config_id', configIds);

      // Score configs: healthy > less failures > not used yet
      const healthMap = new Map(healthData?.map(h => [h.config_id, h]) || []);
      
      const scoredConfigs = configs.map(config => {
        const health = healthMap.get(config.id);
        const isHealthy = health?.is_healthy ?? true;
        const failures = health?.consecutive_failures ?? 0;
        const isCurrentlyActive = config.id === account.active_config_id;
        
        // Score: healthy=100, each failure=-10, currently active=-50 (prefer switching)
        let score = isHealthy ? 100 : 0;
        score -= failures * 10;
        if (isCurrentlyActive) score -= 50;
        
        return { ...config, score, isHealthy, failures };
      });

      // Sort by score (highest first)
      scoredConfigs.sort((a, b) => b.score - a.score);
      const bestConfig = scoredConfigs[0];

      if (!bestConfig) {
        throw new Error('Keine verfügbare Config gefunden');
      }

      // Update account with best config
      const { error: updateError } = await supabase
        .from('whatsapp_accounts')
        .update({
          active_config_id: bestConfig.id,
          proxy_country: bestConfig.server_location
        })
        .eq('id', accountId);

      if (updateError) throw updateError;

      // Initialize/update health status
      await supabase.rpc('mark_wireguard_healthy', { p_config_id: bestConfig.id });

      console.log(`✅ Selected config ${bestConfig.config_name} for account ${accountId} (score: ${bestConfig.score})`);

      return new Response(
        JSON.stringify({
          success: true,
          config: {
            id: bestConfig.id,
            name: bestConfig.config_name,
            location: bestConfig.server_location,
            isHealthy: bestConfig.isHealthy,
            score: bestConfig.score
          },
          availableConfigs: scoredConfigs.length,
          message: `Beste Config ausgewählt: ${bestConfig.config_name} (${bestConfig.server_location})`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-active-config') {
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('active_config_id, wireguard_configs(*)')
        .eq('id', accountId)
        .single();

      if (!account || !account.active_config_id) {
        return new Response(
          JSON.stringify({ success: false, message: 'No active config' }),
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
