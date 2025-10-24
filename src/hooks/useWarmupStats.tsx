import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WarmupStats {
  id: string;
  account_id: string;
  account_name: string;
  sent_messages: number;
  received_messages: number;
  unique_contacts: Record<string, number>;
  blocks: number;
  status: 'warming' | 'bulk_ready' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface DailyHistory {
  date: string;
  sent_count: number;
  received_count: number;
}

export function useWarmupStats() {
  return useQuery({
    queryKey: ['warmup-stats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('account_warmup_stats')
        .select(`
          *,
          whatsapp_accounts (
            account_name,
            phone_number
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((stat: any) => ({
        id: stat.id,
        account_id: stat.account_id,
        account_name: stat.whatsapp_accounts?.account_name || 'Unknown',
        sent_messages: stat.sent_messages || 0,
        received_messages: stat.received_messages || 0,
        unique_contacts: stat.unique_contacts || {},
        blocks: stat.blocks || 0,
        status: stat.status || 'warming',
        created_at: stat.created_at,
        updated_at: stat.updated_at
      })) as WarmupStats[];
    },
    refetchInterval: 10000 // Refetch every 10 seconds
  });
}

export function useWarmupDailyHistory(accountId: string) {
  return useQuery({
    queryKey: ['warmup-daily-history', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warmup_daily_history')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;

      return (data || []).map((history: any) => ({
        date: history.date,
        sent_count: history.sent_count || 0,
        received_count: history.received_count || 0
      })) as DailyHistory[];
    },
    enabled: !!accountId
  });
}

export function computeAvgDaily(history: DailyHistory[], days: number = 7): number {
  const recentHistory = history.slice(0, days);
  if (recentHistory.length === 0) return 0;
  
  const sum = recentHistory.reduce((acc, h) => acc + h.sent_count, 0);
  return Math.round(sum / recentHistory.length);
}

export function isBulkReady(stats: WarmupStats, avgDaily: number): boolean {
  const uniqueContactsCount = Object.keys(stats.unique_contacts).length;
  
  return (
    stats.sent_messages >= 500 &&
    uniqueContactsCount >= 15 &&
    stats.blocks === 0 &&
    avgDaily >= 50
  );
}
