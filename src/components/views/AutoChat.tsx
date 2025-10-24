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
  const [currentPairIndex, setCurrentPairIndex] = useState<number>(0);
  const [allPairs, setAllPairs] = useState<[string, string][]>([]);
  const [skippedPairs, setSkippedPairs] = useState<number>(0);
  const [completedRounds, setCompletedRounds] = useState<number>(0);
  const [lastAccountCount, setLastAccountCount] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);

  const connectedAccounts = accounts.filter(acc => acc.status === "connected");

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const sendMessage = async (fromAccountId: string, toPhone: string, message: string) => {
    try {
      console.log(`[Warm-up] Sending from ${fromAccountId} to ${toPhone}:`, message);
      
      // Erst Status prüfen
      const { data: statusData, error: statusError } = await supabase.functions.invoke('whatsapp-gateway', {
        body: {
          action: 'status',
          accountId: fromAccountId,
        }
      });

      if (statusError) {
        console.error('[Warm-up Status Error]', statusError);
        throw new Error(`Status-Prüfung fehlgeschlagen: ${statusError.message}`);
      }

      if (!statusData?.connected) {
        throw new Error('Account ist nicht verbunden - bitte zuerst verbinden');
      }

      // Telefonnummer säubern (nur Ziffern, z.B. +49 157 123 → 49157123)
      const cleaned = (toPhone || '').replace(/\D/g, '');
      if (!cleaned) {
        throw new Error('Ungültige Zielnummer');
      }

      // Nachricht über WhatsApp senden
      const { data, error } = await supabase.functions.invoke('whatsapp-gateway', {
        body: {
          action: 'send-message',
          accountId: fromAccountId,
          phoneNumber: cleaned,
          message: message,
        }
      });

      if (error) {
        console.error('[Warm-up Send Error]', error);
        throw error;
      }
      if (data?.error) {
        console.error('[Warm-up Railway Error]', data.error);
        throw new Error(data.error);
      }

      // Nach erfolgreichem Senden: Nachricht in DB mit is_warmup=true speichern
      const { error: dbError } = await supabase
        .from('messages')
        .insert({
          account_id: fromAccountId,
          contact_phone: toPhone,
          contact_name: null,
          message_text: message,
          direction: 'outgoing',
          is_warmup: true,
          sent_at: new Date().toISOString(),
        });

      if (dbError) {
        console.error('[Warm-up DB Error]', dbError);
        // Fehler beim DB-Insert soll nicht die Funktion stoppen
      }

      console.log('[Warm-up] Message sent successfully');
      return true;
    } catch (error: any) {
      console.error('[Auto-Chat Send Error]', error);
      toast.error(`Fehler beim Senden: ${error.message}`);
      return false;
    }
  };

  const runChatSession = async () => {
    // Accounts immer frisch holen, damit neu verbundene Accounts sofort erkannt werden
    const currentConnectedAccounts = accounts.filter(acc => acc.status === "connected");
    
    // Prüfe ob sich die Anzahl der verbundenen Accounts geändert hat
    if (currentConnectedAccounts.length !== lastAccountCount && lastAccountCount > 0) {
      console.log(`[Warm-up] Account-Anzahl geändert von ${lastAccountCount} zu ${currentConnectedAccounts.length} - Paare werden neu erstellt`);
      const newPairs = createAllPossiblePairs(currentConnectedAccounts);
      const shuffledPairs = newPairs.sort(() => Math.random() - 0.5);
      setAllPairs(shuffledPairs);
      setCurrentPairIndex(0);
      setLastAccountCount(currentConnectedAccounts.length);
      toast.info(`Account-Änderung erkannt - ${newPairs.length} Paare neu erstellt`);
    }
    
    // Rotation Modus: Alle möglichen Kombinationen durchgehen
    // Wenn keine Paare vorhanden sind UND wir laufen, dann neu generieren
    if (allPairs.length === 0) {
      if (isRunning) {
        console.log("[Warm-up] Paare werden initial generiert");
        const newPairs = createAllPossiblePairs(currentConnectedAccounts);
        const shuffledPairs = newPairs.sort(() => Math.random() - 0.5);
        setAllPairs(shuffledPairs);
        setCurrentPairIndex(0);
        // Warte kurz bis State aktualisiert ist
        setTimeout(() => runChatSession(), 100);
        return;
      } else {
        console.log("[Warm-up] Keine Paarungen verfügbar");
        setLastMessage("⚠️ Keine Paarungen verfügbar");
        return;
      }
    }

    const pairIds = allPairs[currentPairIndex];
    const acc1 = currentConnectedAccounts.find(a => a.id === pairIds[0]);
    const acc2 = currentConnectedAccounts.find(a => a.id === pairIds[1]);
    
    // Prüfe ob beide Accounts noch verbunden sind
    if (!acc1 || !acc2 || acc1.status !== 'connected' || acc2.status !== 'connected') {
      const reason = !acc1 || !acc2 ? "nicht gefunden" : "nicht verbunden";
      console.log(`[Warm-up] Überspringe Paar ${currentPairIndex + 1}/${allPairs.length}: Accounts ${reason}`);
      setSkippedPairs(prev => prev + 1);
      setLastMessage(`⚠️ Paar übersprungen (${reason})`);
      
      // Zum nächsten Paar wechseln
      const nextIndex = (currentPairIndex + 1) % allPairs.length;
      setCurrentPairIndex(nextIndex);
      
      // Wenn wir wieder am Anfang sind: Runde abgeschlossen
      if (nextIndex === 0) {
        setCompletedRounds(prev => prev + 1);
        // Paare neu mischen für nächste Runde - mit aktuellen verbundenen Accounts
        const newPairs = createAllPossiblePairs(currentConnectedAccounts);
        const shuffledPairs = newPairs.sort(() => Math.random() - 0.5);
        setAllPairs(shuffledPairs);
        console.log(`[Warm-up] Runde abgeschlossen, ${newPairs.length} Paare neu gemischt mit ${currentConnectedAccounts.length} Accounts`);
        toast.success(`Warm-up Runde abgeschlossen - ${newPairs.length} Paare neu gemischt`);
      }
      
      return;
    }
    
    console.log(`[Warm-up Rotation] Using pair ${currentPairIndex + 1}/${allPairs.length}: ${acc1.account_name} ↔ ${acc2.account_name}`);
    
    // Zum nächsten Paar wechseln und prüfen ob Runde abgeschlossen
    const nextIndex = (currentPairIndex + 1) % allPairs.length;
    setCurrentPairIndex(nextIndex);
    
    // Wenn wir wieder am Anfang sind: Runde abgeschlossen
    if (nextIndex === 0) {
      setCompletedRounds(prev => prev + 1);
      // Paare neu mischen für nächste Runde - mit aktuellen verbundenen Accounts
      const newPairs = createAllPossiblePairs(currentConnectedAccounts);
      const shuffledPairs = newPairs.sort(() => Math.random() - 0.5);
      setAllPairs(shuffledPairs);
      console.log(`[Warm-up] Runde abgeschlossen, ${newPairs.length} Paare neu gemischt mit ${currentConnectedAccounts.length} Accounts`);
      toast.success(`Warm-up Runde abgeschlossen - ${newPairs.length} Paare neu gemischt`);
    }

    let sessionMessages = 0;

    // Sende abwechselnd Nachrichten
    for (let i = 0; i < messagesPerSession; i++) {
      const message = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
      
      const success1 = await sendMessage(acc1.id, acc2.phone_number, message);
      if (success1) {
        sessionMessages++;
        setMessagesSent(prev => prev + 1);
        setLastMessage(`${acc1.account_name} → ${acc2.account_name}: ${message}`);
        // Pause basierend auf Nachrichtenlänge: kurze Nachrichten 2-3s, lange 4-6s
        const baseDelay = Math.min(message.length * 50, 4000); // Max 4s Basis
        const randomVariation = Math.floor(Math.random() * 2000); // +0-2s Variation
        await new Promise(resolve => setTimeout(resolve, baseDelay + randomVariation));
      }

      const message2 = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
      const success2 = await sendMessage(acc2.id, acc1.phone_number, message2);
      if (success2) {
        sessionMessages++;
        setMessagesSent(prev => prev + 1);
        setLastMessage(`${acc2.account_name} → ${acc1.account_name}: ${message2}`);
        // Pause basierend auf Nachrichtenlänge: kurze Nachrichten 2-3s, lange 4-6s
        const baseDelay = Math.min(message2.length * 50, 4000); // Max 4s Basis
        const randomVariation = Math.floor(Math.random() * 2000); // +0-2s Variation
        await new Promise(resolve => setTimeout(resolve, baseDelay + randomVariation));
      }
    }

    toast.success(`Chat-Session beendet: ${sessionMessages} Nachrichten gesendet`);
  };

  const createAllPossiblePairs = (accounts: typeof connectedAccounts): [string, string][] => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < accounts.length; i++) {
      for (let j = i + 1; j < accounts.length; j++) {
        pairs.push([accounts[i].id, accounts[j].id]);
      }
    }
    return pairs;
  };

  const startAutoChat = () => {
    // Prüfe ob es überhaupt verbundene Accounts gibt
    if (connectedAccounts.length === 0) {
      toast.error("Keine verbundenen Accounts gefunden - bitte zuerst Accounts verbinden");
      return;
    }

    if (connectedAccounts.length < 2) {
      toast.error("Mindestens 2 verbundene Accounts benötigt");
      return;
    }

    // Rotation Modus: Alle möglichen Kombinationen, direkt gemischt
    const pairs = createAllPossiblePairs(connectedAccounts);
    const shuffledPairs = pairs.sort(() => Math.random() - 0.5);
    
    console.log(`[Warm-up] Starting Rotation mode with ${connectedAccounts.length} accounts, ${pairs.length} pairs`);

    setAllPairs(shuffledPairs);
    setCurrentPairIndex(0);
    setMessagesSent(0);
    setSkippedPairs(0);
    setCompletedRounds(0);
    setLastAccountCount(connectedAccounts.length);
    setIsRunning(true);
    
    // Ersten Chat sofort starten
    setTimeout(() => {
      runChatSession();
    }, 500);
    
    // Dann im Intervall weitermachen
    intervalRef.current = window.setInterval(() => {
      runChatSession();
    }, interval * 60 * 1000);
    
    toast.success(`Auto-Chat gestartet mit ${pairs.length} Paarungen`);
  };

  const stopAutoChat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    toast.info("Auto-Chat gestoppt");
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
              <p className="text-sm font-medium mb-1">Rotation Modus</p>
              <p className="text-xs text-muted-foreground">
                {createAllPossiblePairs(connectedAccounts).length} mögliche Paarungen werden systematisch durchlaufen
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
                Die Accounts senden sich gegenseitig harmlose Nachrichten, um die Verbindung 
                aktiv und "warm" zu halten. Dies kann helfen, Account-Beschränkungen zu vermeiden.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
