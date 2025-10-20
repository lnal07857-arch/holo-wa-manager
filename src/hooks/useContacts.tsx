import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone_number: string;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const useContacts = () => {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Contact[];
    },
  });

  const createContact = useMutation({
    mutationFn: async (contact: {
      name: string;
      phone_number: string;
      custom_fields?: Record<string, any>;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          ...contact,
          custom_fields: contact.custom_fields || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Kontakt erfolgreich hinzugefügt");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const bulkCreateContacts = useMutation({
    mutationFn: async (contacts: Array<{ name: string; phone_number: string; custom_fields?: Record<string, any> }>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const contactsWithUserId = contacts.map((contact) => ({
        user_id: user.id,
        ...contact,
        custom_fields: contact.custom_fields || {},
      }));

      const { data, error } = await supabase
        .from("contacts")
        .insert(contactsWithUserId)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`${data.length} Kontakte erfolgreich importiert`);
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Kontakt gelöscht");
    },
  });

  return {
    contacts,
    isLoading,
    createContact,
    bulkCreateContacts,
    deleteContact,
  };
};
