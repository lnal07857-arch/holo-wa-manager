import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MullvadAccount {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  max_devices: number;
  devices_used: number;
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
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as MullvadAccount[];
    },
  });

  const addAccount = useMutation({
    mutationFn: async ({ accountNumber, accountName }: {
      accountNumber: string;
      accountName: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("mullvad_accounts")
        .insert({
          user_id: user.id,
          account_number: accountNumber,
          account_name: accountName,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mullvad-accounts"] });
      toast.success("Mullvad Account hinzugefügt");
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, accountNumber, accountName, devicesUsed }: {
      id: string;
      accountNumber?: string;
      accountName?: string;
      devicesUsed?: number;
    }) => {
      const updateData: any = {};
      if (accountNumber !== undefined) updateData.account_number = accountNumber;
      if (accountName !== undefined) updateData.account_name = accountName;
      if (devicesUsed !== undefined) updateData.devices_used = devicesUsed;

      const { error } = await supabase
        .from("mullvad_accounts")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mullvad-accounts"] });
      toast.success("Mullvad Account aktualisiert");
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
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  return {
    accounts,
    isLoading,
    addAccount,
    updateAccount,
    deleteAccount,
  };
};
