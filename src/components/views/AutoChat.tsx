import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { WarmupAccountStats } from "./WarmupAccountStats";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Square, Zap, Clock, MessageCircle, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const DEFAULT_MESSAGES = [
  // Begrüßungen
  "Hallo, wie geht es dir?",
  "Hey, alles klar?",
  "Moin!",
  "Guten Morgen!",
  "Hi, was geht?",
  "Servus!",
  "Grüß dich!",
  "Na, alles gut?",
  
  // Antworten & Bestätigungen
  "Danke, mir geht's gut!",
  "Alles bestens, danke!",
  "Ja, alles super bei mir",
  "Mir geht es sehr gut, danke der Nachfrage",
  "Passt alles, danke!",
  "Bestens!",
  "Perfekt!",
  "Alles klar!",
  "Verstanden!",
  "Ok, danke!",
  "Super, danke!",
  "Sehr gut, danke!",
  
  // Fragen & Small Talk
  "Was machst du gerade?",
  "Was gibt es Neues?",
  "Wie war dein Tag?",
  "Alles gut bei dir?",
  "Kommst du zurecht?",
  "Hast du heute viel vor?",
  "Wie läuft es bei dir?",
  "Was treibst du so?",
  "Arbeitest du gerade?",
  "Schon Feierabend?",
  "Hast du schon Pläne fürs Wochenende?",
  "Wie war dein Wochenende?",
  
  // Antworten auf Fragen
  "Ich arbeite gerade",
  "Bin gerade unterwegs",
  "Nichts Besonderes",
  "Das Übliche halt",
  "Ganz ok, nichts Besonderes",
  "Nicht viel los heute",
  "Bin noch im Büro",
  "Gerade am Entspannen",
  "Gleich Feierabend",
  "Hab heute frei",
  
  // Positive Reaktionen
  "Das freut mich!",
  "Schön zu hören!",
  "Cool!",
  "Sehr schön!",
  "Top!",
  "Freut mich für dich!",
  "Das klingt gut!",
  "Prima!",
  
  // Verabschiedungen
  "Bis später!",
  "Bis dann!",
  "Mach's gut!",
  "Bis bald!",
  "Schönen Tag noch!",
  "Dir auch!",
  "Ciao!",
  "Tschüss!",
  "Einen schönen Abend!",
  "Gute Nacht!",
  
  // Kurze Antworten
  "Ok",
  "Ja",
  "Stimmt",
  "Genau",
  "Richtig",
  "Klar",
  "Sicher",
  "Auf jeden Fall",
  "Definitiv",
  "Passt",
  
  // Mit Emojis
  "Alles gut 👍",
  "Danke dir! 😊",
  "Super! 🎉",
  "Perfekt! ✅",
  "Freut mich! 😊",
  "Alles klar! 👌",
  "Top! 👍",
  "Ok! ✌️",
];

// Mode type removed - only rotation mode is used

export const AutoChat = () => {
  const { accounts } = useWhatsAppAccounts();
  const [isRunning, setIsRunning] = useState(false);
  const [messagesSent, setMessagesSent] = useState<number>(0);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [skippedPairs, setSkippedPairs] = useState<number>(0);
  const [completedRounds, setCompletedRounds] = useState<number>(0);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("phase1");
  
  // New warmup settings
  const [activeStartHour, setActiveStartHour] = useState<number>(8);
  const [activeEndHour, setActiveEndHour] = useState<number>(22);
  const [sleepStartHour, setSleepStartHour] = useState<number>(23);
  const [sleepEndHour, setSleepEndHour] = useState<number>(7);

  const connectedAccounts = accounts.filter(acc => acc.status === "connected");

  // Load warmup settings from DB on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data: settings, error } = await supabase
        .from('warmup_settings')
        .select('*')
        .eq('user_id', user.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[AutoChat] Error loading settings:', error);
        return;
      }

      if (settings) {
        setSettingsId(settings.id);
        setIsRunning(settings.is_running);
        setMessagesSent(settings.messages_sent);
        setSkippedPairs(settings.skipped_pairs);
        setCompletedRounds(settings.completed_rounds);
        setLastMessage(settings.last_message || "");
        setPhase(settings.phase || "phase1");
        setActiveStartHour(settings.active_start_hour || 8);
        setActiveEndHour(settings.active_end_hour || 22);
        setSleepStartHour(settings.sleep_start_hour || 23);
        setSleepEndHour(settings.sleep_end_hour || 7);
      }
    };

    loadSettings();
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!settingsId) return;

    const channel = supabase
      .channel(`warmup-${settingsId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'warmup_settings',
          filter: `id=eq.${settingsId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setMessagesSent(updated.messages_sent);
          setSkippedPairs(updated.skipped_pairs);
          setCompletedRounds(updated.completed_rounds);
          setLastMessage(updated.last_message || "");
          setIsRunning(updated.is_running);
          setPhase(updated.phase || "phase1");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [settingsId]);

  const startAutoChat = async () => {
    if (connectedAccounts.length === 0) {
      toast.error("Keine verbundenen Accounts gefunden - bitte zuerst Accounts verbinden");
      return;
    }

    if (connectedAccounts.length < 2) {
      toast.error("Mindestens 2 verbundene Accounts benötigt");
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Nicht angemeldet");
        return;
      }

      // Create or update warmup settings
      const pairs: [string, string][] = [];
      for (let i = 0; i < connectedAccounts.length; i++) {
        for (let j = i + 1; j < connectedAccounts.length; j++) {
          pairs.push([connectedAccounts[i].id, connectedAccounts[j].id]);
        }
      }
      const shuffledPairs = pairs.sort(() => Math.random() - 0.5);

      if (settingsId) {
        // Update existing
        const { error } = await supabase
          .from('warmup_settings')
          .update({
            is_running: true,
            all_pairs: shuffledPairs,
            current_pair_index: 0,
            active_start_hour: activeStartHour,
            active_end_hour: activeEndHour,
            sleep_start_hour: sleepStartHour,
            sleep_end_hour: sleepEndHour,
            started_at: new Date().toISOString(), // Reset start time for phase calculation
            last_run_at: null, // trigger immediate first cycle
          })
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('warmup_settings')
          .insert({
            user_id: user.user.id,
            is_running: true,
            all_pairs: shuffledPairs,
            current_pair_index: 0,
            messages_sent: 0,
            skipped_pairs: 0,
            completed_rounds: 0,
            active_start_hour: activeStartHour,
            active_end_hour: activeEndHour,
            sleep_start_hour: sleepStartHour,
            sleep_end_hour: sleepEndHour,
            started_at: new Date().toISOString(),
            last_run_at: null,
          })
          .select()
          .single();

        if (error) throw error;
        setSettingsId(data.id);
      }

      setIsRunning(true);
      toast.success(`Auto-Chat gestartet - läuft automatisch im Hintergrund`);
    } catch (error: any) {
      console.error('[AutoChat] Start error:', error);
      toast.error(`Fehler beim Starten: ${error.message}`);
    }
  };

  const stopAutoChat = async () => {
    if (!settingsId) {
      setIsRunning(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('warmup_settings')
        .update({ is_running: false })
        .eq('id', settingsId);

      if (error) throw error;

      setIsRunning(false);
      toast.info("Auto-Chat gestoppt");
    } catch (error: any) {
      console.error('[AutoChat] Stop error:', error);
      toast.error(`Fehler beim Stoppen: ${error.message}`);
    }
  };

  const getPhaseInfo = (p: string) => {
    switch (p) {
      case 'phase1':
        return { label: 'Phase 1: Sanft', days: '0-7 Tage', color: 'bg-blue-500' };
      case 'phase2':
        return { label: 'Phase 2: Moderat', days: '7-14 Tage', color: 'bg-yellow-500' };
      case 'phase3':
        return { label: 'Phase 3: Intensiv', days: '14+ Tage', color: 'bg-green-500' };
      default:
        return { label: 'Phase 1', days: '0-7 Tage', color: 'bg-blue-500' };
    }
  };

  const phaseInfo = getPhaseInfo(phase);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Account Warm-up</h1>
        <p className="text-muted-foreground">
          Professionelles 3-Phasen-System über 21 Tage für sicheres Account-Warming
        </p>
      </div>

      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Einstellungen
            </CardTitle>
            <CardDescription>
              Konfiguriere die Auto-Chat Funktion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Automatisches 3-Phasen-System</p>
              <p className="text-xs text-muted-foreground">
                Läuft 24/7 auf dem Server - respektiert Aktiv- und Schlafzeiten
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sun className="w-4 h-4" />
                Aktive Zeiten (Stunden)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={activeStartHour}
                    onChange={(e) => setActiveStartHour(parseInt(e.target.value) || 8)}
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ende</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={activeEndHour}
                    onChange={(e) => setActiveEndHour(parseInt(e.target.value) || 22)}
                    disabled={isRunning}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                In diesen Stunden werden Nachrichten gesendet (z.B. 8-22 Uhr)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Moon className="w-4 h-4" />
                Schlafzeiten (Stunden)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={sleepStartHour}
                    onChange={(e) => setSleepStartHour(parseInt(e.target.value) || 23)}
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ende</Label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={sleepEndHour}
                    onChange={(e) => setSleepEndHour(parseInt(e.target.value) || 7)}
                    disabled={isRunning}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                In diesen Stunden ruht der Warm-up (z.B. 23-7 Uhr)
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">ℹ️ Automatische Anpassung</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Die Nachrichtenfrequenz und Typing-Simulationen passen sich automatisch an die aktuelle Phase an.
              </p>
            </div>

            <div className="pt-4 flex gap-2">
              {!isRunning ? (
                <Button onClick={startAutoChat} className="flex-1 gap-2">
                  <Play className="w-4 h-4" />
                  Warm-up Starten
                </Button>
              ) : (
                <Button onClick={stopAutoChat} variant="destructive" className="flex-1 gap-2">
                  <Square className="w-4 h-4" />
                  Stoppen
                </Button>
              )}
            </div>
          </CardContent>
      </Card>

      {/* Detailed Account Statistics */}
      <WarmupAccountStats />
    </div>
  );
};
