import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { normalizeGatewayAccountStatus } from "@/lib/whatsapp-status";

interface AccountForPolling {
  id: string;
  account_name: string;
  status: string;
  worker_slot: number | null;
  qr_code?: string | null;
}

/**
 * Polls VPS every 30s for real connection status.
 * Updates DB when status drifts (e.g. session expired on VPS but DB still says "connected").
 */
export const useStatusPolling = (accounts: AccountForPolling[], enabled = true) => {
  const queryClient = useQueryClient();
  const previousStatuses = useRef<Map<string, string>>(new Map());

  const checkStatuses = useCallback(async () => {
    if (!accounts.length) return;

    for (const account of accounts) {
      try {
        const isTransientInitState =
          account.status === "initializing" ||
          account.status === "qr_generated" ||
          (account.status === "pending" && Boolean(account.qr_code));

        if (isTransientInitState) {
          continue;
        }

        if (!account.worker_slot) {
          console.log(`[StatusPoll] ${account.account_name}: No slot assigned. Attempting recovery...`);
          await recoverSlot(account);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("wa-gateway", {
          body: { action: "status", accountId: account.id },
        });

        if (error) continue;

        const realStatus = normalizeGatewayAccountStatus(
          data as any,
          "disconnected"
        );

        const gatewaySlot = (data as any)?.workerSlot;
        if (gatewaySlot && !account.worker_slot) {
          console.log(`[StatusPoll] Recovering slot ${gatewaySlot} for ${account.account_name}`);
          await supabase
            .from("whatsapp_accounts")
            .update({ worker_slot: gatewaySlot, worker_id: `worker-${String(gatewaySlot).padStart(2, '0')}` })
            .eq("id", account.id);

          await supabase
            .from("worker_slots" as any)
            .update({ is_occupied: true, account_id: account.id, last_used_at: new Date().toISOString() } as any)
            .eq("slot_number", gatewaySlot);

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
        }

        const dbStatus = account.status;
        const prevNotified = previousStatuses.current.get(account.id);
        const hasQr = Boolean(account.qr_code);

        if (realStatus === "connected" && hasQr) {
          console.warn(
            `[StatusPoll] ${account.account_name}: VPS=connected but QR exists → force pending`
          );

          await supabase
            .from("whatsapp_accounts")
            .update({ status: "pending" })
            .eq("id", account.id);

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
          continue;
        }

        if (dbStatus === "connected" && realStatus !== "connected") {
          console.log(
            `[StatusPoll] ${account.account_name}: DB=${dbStatus}, VPS=${realStatus} → updating`
          );

          const newStatus =
            realStatus === "qr_generated" || realStatus === "qr_required" || realStatus === "pending"
              ? "pending"
              : "disconnected";

          await supabase
            .from("whatsapp_accounts")
            .update({ status: newStatus, qr_code: null })
            .eq("id", account.id);

          if (prevNotified !== newStatus) {
            toast.error(`Session abgelaufen: ${account.account_name}`, {
              description: "Bitte verbinden Sie den Account erneut (QR-Scan).",
            });
            previousStatuses.current.set(account.id, newStatus);
          }

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
        }

        if (dbStatus !== "connected" && realStatus === "connected") {
          console.log(
            `[StatusPoll] ${account.account_name}: VPS=connected ignored (waiting for worker ready confirmation)`
          );
        }
      } catch (err) {
        // Silently skip network errors
      }
    }
  }, [accounts, queryClient, recoverSlot]);

  /**
   * Tries to find the account on any worker (slots 1-10) and assigns the slot.
   */
  const recoverSlot = useCallback(async (account: AccountForPolling) => {
    for (let slot = 1; slot <= 10; slot++) {
      try {
        const { data, error } = await supabase.functions.invoke("wa-gateway", {
          body: { action: "status", accountId: account.id },
        });

        // The gateway without a slot tries the default URL — check if it found the account
        if (!error && data && (data as any).status !== "not_found") {
          const foundSlot = (data as any).workerSlot || slot;
          console.log(`[SlotRecovery] Found ${account.account_name} on slot ${foundSlot}`);

          await supabase
            .from("whatsapp_accounts")
            .update({
              worker_slot: foundSlot,
              worker_id: `worker-${String(foundSlot).padStart(2, '0')}`,
            })
            .eq("id", account.id);

          await supabase
            .from("worker_slots" as any)
            .update({ is_occupied: true, account_id: account.id, last_used_at: new Date().toISOString() } as any)
            .eq("slot_number", foundSlot);

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
          return;
        }
      } catch {
        // continue
      }
    }

    // No slot found — assign next free slot so user can connect
    try {
      const { data: freeSlots } = await supabase
        .from("worker_slots" as any)
        .select("slot_number")
        .eq("is_occupied", false)
        .order("slot_number", { ascending: true })
        .limit(1);

      const slotList = freeSlots as any[] | null;
      if (slotList && slotList.length > 0) {
        const freeSlot = slotList[0].slot_number as number;
        console.log(`[SlotRecovery] Assigning free slot ${freeSlot} to ${account.account_name}`);

        await supabase
          .from("whatsapp_accounts")
          .update({
            worker_slot: freeSlot,
            worker_id: `worker-${String(freeSlot).padStart(2, '0')}`,
          })
          .eq("id", account.id);

        await supabase
          .from("worker_slots" as any)
          .update({ is_occupied: true, account_id: account.id, last_used_at: new Date().toISOString() } as any)
          .eq("slot_number", freeSlot);

        toast.info(`Slot ${freeSlot} wurde ${account.account_name} zugewiesen`);
        queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
      }
    } catch {
      // silent
    }
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !accounts.length) return;

    // Initial check after 5s (give page time to load)
    const initialTimeout = setTimeout(checkStatuses, 5000);

    // Then every 30s
    const interval = setInterval(checkStatuses, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [enabled, checkStatuses, accounts.length]);

  return { checkStatuses };
};
