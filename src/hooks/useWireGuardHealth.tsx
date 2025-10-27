import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WireGuardHealth {
  id: string;
  config_id: string;
  is_healthy: boolean;
  last_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  consecutive_failures: number;
  error_message: string | null;
  wireguard_configs: {
    config_name: string;
    server_location: string;
  };
}

export const useWireGuardHealth = () => {
  const { data: healthStatus = [], isLoading, refetch } = useQuery<WireGuardHealth[]>({
    queryKey: ["wireguard-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wireguard-health-monitor', {
        body: { action: 'get-health-status' }
      });

      if (error) throw error;
      return data.configs || [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getConfigHealth = (configId: string) => {
    return healthStatus.find(h => h.config_id === configId);
  };

  return {
    healthStatus,
    isLoading,
    refetch,
    getConfigHealth,
  };
};
