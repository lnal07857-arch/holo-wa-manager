import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VpnServerHealth {
  id: string;
  server_host: string;
  server_region: string;
  is_healthy: boolean;
  last_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  consecutive_failures: number;
  response_time_ms: number | null;
  error_message: string | null;
}

export const useVpnHealth = () => {
  return useQuery({
    queryKey: ['vpn-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vpn_server_health')
        .select('*')
        .order('is_healthy', { ascending: false })
        .order('response_time_ms', { ascending: true });

      if (error) throw error;
      return data as VpnServerHealth[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

export const useRunHealthCheck = () => {
  const runHealthCheck = async () => {
    const { data, error } = await supabase.functions.invoke('vpn-health-check');
    if (error) throw error;
    return data;
  };

  return { runHealthCheck };
};
