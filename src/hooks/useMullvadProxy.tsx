import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useMullvadProxy = () => {
  const assignProxy = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('mullvad-proxy-manager', {
        body: { action: 'assign-proxy', accountId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Mullvad VPN zugewiesen: ${data.server}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Fehler beim Zuweisen des VPN: ${error.message}`);
    },
  });

  const getProxy = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('mullvad-proxy-manager', {
        body: { action: 'get-proxy', accountId }
      });

      if (error) throw error;
      return data;
    },
  });

  return {
    assignProxy,
    getProxy,
  };
};
