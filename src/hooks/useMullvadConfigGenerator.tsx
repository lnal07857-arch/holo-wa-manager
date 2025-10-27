import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useMullvadConfigGenerator = () => {
  const queryClient = useQueryClient();
  
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["mullvad-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mullvad-config-generator', {
        body: { action: 'get-available-locations' }
      });

      if (error) throw error;
      return data.locations || [];
    },
  });

  const generateConfigs = useMutation({
    mutationFn: async ({ 
      count, 
      selectedLocations,
      mullvadAccountId
    }: { 
      count: number; 
      selectedLocations: string[];
      mullvadAccountId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('mullvad-config-generator', {
        body: { 
          action: 'generate-configs', 
          count,
          locations: selectedLocations,
          userId: user.id,
          mullvadAccountId
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["wireguard-configs"] });
      toast.success(`✅ ${data.generated} von ${data.total} Configs erfolgreich generiert`);
    },
    onError: (error: Error) => {
      toast.error(`❌ Fehler: ${error.message}`);
    },
  });

  return {
    locations,
    locationsLoading,
    generateConfigs,
    isGenerating: generateConfigs.isPending,
  };
};
