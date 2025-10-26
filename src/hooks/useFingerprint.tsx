import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FingerprintInfo {
  fingerprint: {
    userAgent: string;
    resolution: { width: number; height: number };
    timezone: string;
    cores: number;
  };
  proxy: {
    host: string;
    port: number;
    username?: string;
  } | null;
}

export const useFingerprint = (accountId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['fingerprint', accountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wa-gateway', {
        body: { action: 'get-fingerprint', accountId }
      });

      if (error) throw error;
      return data as FingerprintInfo;
    },
    enabled,
  });
};
