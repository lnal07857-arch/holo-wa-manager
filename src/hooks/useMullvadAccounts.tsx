import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MullvadAccount {
  id: string;
  user_id: string;
  account_number: string;
  server_region: string;
  created_at: string;
  updated_at: string;
}

export const useMullvadAccounts = () => {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["mullvad-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mullvad_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MullvadAccount[];
    },
  });

  const createAccount = useMutation({
    mutationFn: async (account: { account_number: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("mullvad_accounts")
        .insert({
          user_id: user.id,
          account_number: account.account_number,
          server_region: "DE",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mullvad-accounts"] });
      toast.success("Mullvad Account erfolgreich hinzugefügt");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from("mullvad_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mullvad-accounts"] });
      toast.success("Mullvad Account gelöscht");
    },
  });

  return {
    accounts,
    isLoading,
    createAccount,
    deleteAccount,
  };
};
