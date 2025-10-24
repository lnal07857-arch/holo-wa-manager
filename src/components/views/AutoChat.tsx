import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Square, Zap, Clock, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const [interval, setInterval] = useState<number>(5);
  const [messagesPerSession, setMessagesPerSession] = useState<number>(5);
  const [isRunning, setIsRunning] = useState(false);
  const [messagesSent, setMessagesSent] = useState<number>(0);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [skippedPairs, setSkippedPairs] = useState<number>(0);
  const [completedRounds, setCompletedRounds] = useState<number>(0);
  const [settingsId, setSettingsId] = useState<string | null>(null);

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
        setInterval(settings.interval_minutes);
        setMessagesPerSession(settings.messages_per_session);
        setIsRunning(settings.is_running);
        setMessagesSent(settings.messages_sent);
        setSkippedPairs(settings.skipped_pairs);
        setCompletedRounds(settings.completed_rounds);
        setLastMessage(settings.last_message || "");
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
            interval_minutes: interval,
            messages_per_session: messagesPerSession,
            all_pairs: shuffledPairs,
            current_pair_index: 0,
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
            interval_minutes: interval,
            messages_per_session: messagesPerSession,
            all_pairs: shuffledPairs,
            current_pair_index: 0,
            messages_sent: 0,
            skipped_pairs: 0,
            completed_rounds: 0,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Account Warm-up</h1>
        <p className="text-muted-foreground">
          Lasse verbundene Accounts automatisch miteinander kommunizieren
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
              <p className="text-sm font-medium mb-1">Automatischer Hintergrund-Modus</p>
              <p className="text-xs text-muted-foreground">
                Läuft automatisch im Hintergrund - auch wenn du die Seite wechselst oder schließt
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Intervall (Minuten)
              </Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value) || 5)}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Wie oft sollen die Accounts miteinander chatten?
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Nachrichten pro Session
              </Label>
              <Input
                type="number"
                min="2"
                max="20"
                value={messagesPerSession}
                onChange={(e) => setMessagesPerSession(parseInt(e.target.value) || 5)}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Anzahl der Nachrichten die pro Chat-Session ausgetauscht werden (pro Account)
              </p>
            </div>

            <div className="pt-4 flex gap-2">
              {!isRunning ? (
                <Button onClick={startAutoChat} className="flex-1 gap-2">
                  <Play className="w-4 h-4" />
                  Starten
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

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>
              Aktuelle Aktivität des Auto-Chats
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={isRunning ? "default" : "secondary"}>
                {isRunning ? "Aktiv" : "Inaktiv"}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <span className="text-sm font-medium">Gesendete Nachrichten</span>
              <span className="text-2xl font-bold">{messagesSent}</span>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <span className="text-sm font-medium">Übersprungene Paare</span>
              <span className="text-2xl font-bold text-orange-500">{skippedPairs}</span>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <span className="text-sm font-medium">Abgeschlossene Runden</span>
              <span className="text-2xl font-bold text-green-500">{completedRounds}</span>
            </div>

            {lastMessage && (
              <div className="p-4 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Letzte Aktivität</p>
                <p className="text-sm">{lastMessage}</p>
              </div>
            )}

            <div className="p-4 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">ℹ️ Hinweis</p>
              <p className="text-sm">
                Der Warm-up läuft automatisch im Hintergrund auf dem Server. Du musst diese Seite 
                nicht geöffnet lassen - der Prozess läuft weiter, auch wenn du die App schließt.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
