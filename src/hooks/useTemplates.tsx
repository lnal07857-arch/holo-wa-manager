import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MessageTemplate {
  id: string;
  user_id: string;
  template_name: string;
  category: string;
  template_text: string;
  placeholders: string[];
  created_at: string;
  updated_at: string;
}

export const useTemplates = () => {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MessageTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: {
      template_name: string;
      category: string;
      template_text: string;
      placeholders: string[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("message_templates")
        .insert({
          user_id: user.id,
          ...template,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Vorlage erfolgreich erstellt");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({
      templateId,
      template,
    }: {
      templateId: string;
      template: {
        template_name: string;
        category: string;
        template_text: string;
        placeholders: string[];
      };
    }) => {
      const { data, error } = await supabase
        .from("message_templates")
        .update(template)
        .eq("id", templateId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Vorlage aktualisiert");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Vorlage gelöscht");
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
};
