import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WireGuardConfig {
  id: string;
  user_id: string;
  config_name: string;
  config_content: string;
  server_location: string;
  public_key: string | null;
  created_at: string;
  updated_at: string;
}

export const useWireGuardConfigs = () => {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["wireguard-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wireguard_configs")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as WireGuardConfig[];
    },
  });

  const uploadConfig = useMutation({
    mutationFn: async ({ configName, configContent, serverLocation }: {
      configName: string;
      configContent: string;
      serverLocation: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Extract public key from config
      const publicKeyMatch = configContent.match(/PublicKey\s*=\s*([^\n]+)/);
      const publicKey = publicKeyMatch ? publicKeyMatch[1].trim() : null;

      const { data, error } = await supabase
        .from("wireguard_configs")
        .insert({
          user_id: user.id,
          config_name: configName,
          config_content: configContent,
          server_location: serverLocation,
          public_key: publicKey
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wireguard-configs"] });
      toast.success("WireGuard-Konfiguration hochgeladen");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from("wireguard_configs")
        .delete()
        .eq("id", configId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wireguard-configs"] });
      toast.success("WireGuard-Konfiguration gelöscht");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  return {
    configs,
    isLoading,
    uploadConfig,
    deleteConfig,
  };
};
