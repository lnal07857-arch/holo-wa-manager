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
  proxy_server: string | null;
  proxy_country: string | null;
  display_order: number;
  worker_id: string | null;
}

export const useWhatsAppAccounts = () => {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as WhatsAppAccount[];
    },
  });

  const createAccount = useMutation({
    mutationFn: async (account: { account_name?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Find next available worker_id
      const { data: existingAccounts } = await supabase
        .from("whatsapp_accounts")
        .select("worker_id")
        .eq("user_id", user.id);

      const usedWorkers = new Set((existingAccounts || []).map(a => a.worker_id).filter(Boolean));
      let assignedWorker = 'worker-01';
      for (let i = 1; i <= 10; i++) {
        const wid = `worker-${String(i).padStart(2, '0')}`;
        if (!usedWorkers.has(wid)) {
          assignedWorker = wid;
          break;
        }
      }

      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .insert({
          user_id: user.id,
          account_name: account.account_name || 'Neues Konto',
          worker_id: assignedWorker,
        })
        .select()
        .single();

      if (error) throw error;
      
      console.log(`[Account Create] Assigned to ${assignedWorker}`);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('wa-gateway', {
        body: { action: 'delete-account', accountId }
      });

      if (error) throw new Error(error.message || 'Löschen fehlgeschlagen');
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
      toast.success("Account gelöscht und Verbindung beendet");
    },
    onError: (error: Error) => {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
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
          
          // Show toast for connection loss from a connected state
          if (payload.old.status === 'connected' && payload.new.status !== 'connected') {
            const status = payload.new.status as string;
            const msg = status === 'pending'
              ? `Verbindung unterbrochen: ${payload.new.account_name} (QR-Code erforderlich)`
              : `WhatsApp-Verbindung getrennt: ${payload.new.account_name}`;
            toast.error(msg, {
              description: status === 'pending'
                ? 'Bitte erneut verbinden, es wird ein neuer QR-Code angezeigt.'
                : 'Bitte verbinden Sie den Account erneut.',
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
    refetch,
  };
};
