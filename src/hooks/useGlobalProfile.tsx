import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GlobalProfileSettings {
  global_profile_name: string | null;
  global_profile_email: string | null;
  global_profile_image: string | null;
  global_profile_category: string | null;
  global_profile_info: string | null;
  global_profile_description: string | null;
  global_profile_website: string | null;
  global_profile_address: string | null;
}

export const useGlobalProfile = () => {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["global-profile-settings"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("global_profile_name, global_profile_email, global_profile_image, global_profile_category, global_profile_info, global_profile_description, global_profile_website, global_profile_address")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data as GlobalProfileSettings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: GlobalProfileSettings) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .update(newSettings)
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-profile-settings"] });
      toast.success("Globale Profil-Einstellungen gespeichert");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  return {
    settings,
    isLoading,
    updateSettings,
  };
};
