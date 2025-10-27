import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useWireGuardManager = () => {
  const assignConfig = useMutation({
    mutationFn: async ({ accountId, configId }: { accountId: string; configId: string }) => {
      const { data, error } = await supabase.functions.invoke('wireguard-manager', {
        body: { action: 'assign-config', accountId, configId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`WireGuard VPN zugewiesen: ${data.server_location}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Fehler beim Zuweisen des VPN: ${error.message}`);
    },
  });

  const getConfig = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('wireguard-manager', {
        body: { action: 'get-config', accountId }
      });

      if (error) throw error;
      return data;
    },
  });

  return {
    assignConfig,
    getConfig,
  };
};
