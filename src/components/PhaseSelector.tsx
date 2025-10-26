import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

interface PhaseSelectorProps {
  accountId: string;
  accountName: string;
  currentPhase?: string;
  onPhaseChange?: () => void;
}

export const PhaseSelector = ({ accountId, accountName, currentPhase = "phase1", onPhaseChange }: PhaseSelectorProps) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePhaseChange = async (newPhase: string) => {
    setIsUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if warmup stats exist for this account
      const { data: existingStats } = await supabase
        .from("account_warmup_stats")
        .select("*")
        .eq("account_id", accountId)
        .single();

      if (existingStats) {
        // Update existing record
        const { error } = await supabase
          .from("account_warmup_stats")
          .update({ phase: newPhase })
          .eq("account_id", accountId);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from("account_warmup_stats")
          .insert({
            user_id: user.id,
            account_id: accountId,
            phase: newPhase,
          });

        if (error) throw error;
      }

      toast.success(`${accountName} in ${newPhase === "phase1" ? "Phase 1" : newPhase === "phase2" ? "Phase 2" : "Phase 3"} gesetzt`);
      onPhaseChange?.();
    } catch (error: any) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Warmup Phase:</Label>
      <Select
        value={currentPhase}
        onValueChange={handlePhaseChange}
        disabled={isUpdating}
      >
        <SelectTrigger className="w-28 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="phase1">Phase 1</SelectItem>
          <SelectItem value="phase2">Phase 2</SelectItem>
          <SelectItem value="phase3">Phase 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
