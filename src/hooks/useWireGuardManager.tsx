import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useWireGuardManager = () => {
  const selectBestConfig = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('wireguard-manager', {
        body: { action: 'select-best-config', accountId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || `Config ausgewählt: ${data.config.name}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const getActiveConfig = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('wireguard-manager', {
        body: { action: 'get-active-config', accountId }
      });

      if (error) throw error;
      return data;
    },
  });

  return {
    selectBestConfig,
    getActiveConfig,
  };
};
