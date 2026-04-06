import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  account_name: string;
  phone_number: string;
  status: "connected" | "disconnected" | "connecting" | "initializing" | "pending" | "qr_generated" | "qr_required" | "blocked";
  qr_code: string | null;
  session_data: any;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  proxy_server: string | null;
  proxy_country: string | null;
  display_order: number;
  worker_id: string | null;
  worker_slot: number | null;
  auto_welcome_enabled: boolean;
  auto_welcome_message: string | null;
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

      // Find next free worker slot via the worker_slots table
      const { data: freeSlots } = await supabase
        .from("worker_slots" as any)
        .select("slot_number")
        .eq("is_occupied", false)
        .order("slot_number", { ascending: true })
        .limit(1);

      const slotList = freeSlots as any[] | null;
      if (!slotList || slotList.length === 0) {
        throw new Error("Keine freien Worker-Slots verfügbar (max. 10 Accounts)");
      }

      const assignedSlot = slotList[0].slot_number as number;
      const assignedWorker = `worker-${String(assignedSlot).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .insert({
          user_id: user.id,
          account_name: account.account_name || 'Neues Konto',
          worker_id: assignedWorker,
          worker_slot: assignedSlot,
        })
        .select()
        .single();

      if (error) throw error;

      // Mark slot as occupied
      await supabase
        .from("worker_slots" as any)
        .update({ is_occupied: true, account_id: data.id, last_used_at: new Date().toISOString() } as any)
        .eq("slot_number", assignedSlot);

      console.log(`[Account Create] Assigned to Slot ${assignedSlot} (${assignedWorker})`);

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
      // Get worker_slot before deleting so we can free it
      const account = accounts.find(a => a.id === accountId);
      const slot = account?.worker_slot;

      const { data, error } = await supabase.functions.invoke('wa-gateway', {
        body: { action: 'delete-account', accountId }
      });

      if (error) throw new Error(error.message || 'Löschen fehlgeschlagen');
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }

      // Free the worker slot
      if (slot) {
        await supabase
          .from("worker_slots" as any)
          .update({ is_occupied: false, account_id: null } as any)
          .eq("slot_number", slot);
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
          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });

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

          if (
            payload.new.status === 'initializing' &&
            payload.old.status !== 'initializing' &&
            payload.old.qr_code
          ) {
            toast.info(`QR-Code gescannt: ${payload.new.account_name}`, {
              description: 'WhatsApp übernimmt jetzt die Verbindung im Hintergrund.',
            });
          }

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
