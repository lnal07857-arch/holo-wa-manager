import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  account_name: string;
  phone_number: string;
  status: "connected" | "disconnected" | "connecting";
  qr_code: string | null;
  session_data: any;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useWhatsAppAccounts = () => {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as WhatsAppAccount[];
    },
  });

  const createAccount = useMutation({
    mutationFn: async (account: { account_name: string; phone_number: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .insert({
          user_id: user.id,
          account_name: account.account_name,
          phone_number: account.phone_number,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
      toast.success("Account erfolgreich hinzugefügt");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from("whatsapp_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
      toast.success("Account gelöscht");
    },
  });

  return {
    accounts,
    isLoading,
    createAccount,
    deleteAccount,
  };
};
