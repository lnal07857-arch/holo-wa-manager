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
        const { data, error } = await supabase.functions.invoke("wa-gateway", {
          body: { action: "status", accountId: account.id },
        });

        if (error) continue;

        const realStatus = normalizeGatewayAccountStatus(
          data as any,
          "disconnected"
        );

        const dbStatus = account.status;
        const prevNotified = previousStatuses.current.get(account.id);

        // DB says connected but VPS says otherwise → session expired
        if (
          dbStatus === "connected" &&
          realStatus !== "connected"
        ) {
          console.log(
            `[StatusPoll] ${account.account_name}: DB=${dbStatus}, VPS=${realStatus} → updating`
          );

          const newStatus =
            realStatus === "qr_generated" || realStatus === "pending"
              ? "pending"
              : "disconnected";

          await supabase
            .from("whatsapp_accounts")
            .update({ status: newStatus, qr_code: null })
            .eq("id", account.id);

          if (prevNotified !== newStatus) {
            toast.error(
              `Session abgelaufen: ${account.account_name}`,
              {
                description: "Bitte verbinden Sie den Account erneut (QR-Scan).",
              }
            );
            previousStatuses.current.set(account.id, newStatus);
          }

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
        }

        // DB says disconnected but VPS says connected → auto-heal
        if (
          dbStatus !== "connected" &&
          realStatus === "connected"
        ) {
          console.log(
            `[StatusPoll] ${account.account_name}: DB=${dbStatus}, VPS=connected → healing`
          );

          await supabase
            .from("whatsapp_accounts")
            .update({
              status: "connected",
              last_connected_at: new Date().toISOString(),
            })
            .eq("id", account.id);

          if (prevNotified !== "connected") {
            toast.success(`${account.account_name} ist wieder verbunden`);
            previousStatuses.current.set(account.id, "connected");
          }

          queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
        }
      } catch (err) {
        // Silently skip network errors
      }
    }
  }, [accounts, queryClient]);

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
