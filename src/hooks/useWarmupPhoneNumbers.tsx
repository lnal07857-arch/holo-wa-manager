import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useWarmupPhoneNumbers = () => {
  const { data: warmupPhones = new Set<string>(), isLoading } = useQuery<Set<string>>({
    queryKey: ["warmup-phone-numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_phone_numbers")
        .select("phone_number");

      if (error) throw error;
      
      // Return Set of phone numbers for fast lookup
      return new Set(data.map(item => item.phone_number));
    },
  });

  return {
    warmupPhones,
    isLoading,
    isWarmupNumber: (phone: string) => warmupPhones.has(phone),
  };
};
