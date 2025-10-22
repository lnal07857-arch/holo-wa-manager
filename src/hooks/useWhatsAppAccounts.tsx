import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

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

  // Realtime-Updates für Status-Änderungen
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-accounts-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_accounts'
        },
        (payload: any) => {
          console.log('[Account Status Change]', payload);
          
          // Invalidate queries to refetch data
          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
          
          // Show toast for disconnections
          if (payload.new.status === 'disconnected' && payload.old.status === 'connected') {
            toast.error(`WhatsApp-Verbindung getrennt: ${payload.new.account_name}`, {
              description: 'Bitte verbinden Sie den Account erneut'
            });
          }
          
          // Show toast for successful connections
          if (payload.new.status === 'connected' && payload.old.status !== 'connected') {
            toast.success(`WhatsApp erfolgreich verbunden: ${payload.new.account_name}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    accounts,
    isLoading,
    createAccount,
    deleteAccount,
  };
};
