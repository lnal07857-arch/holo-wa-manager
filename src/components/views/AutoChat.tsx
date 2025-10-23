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
  "Hallo, wie geht es dir?",
  "Alles klar bei dir?",
  "Danke, mir geht's gut!",
  "Super, freut mich zu hören!",
  "Was machst du gerade?",
  "Ich arbeite gerade, und du?",
  "Auch am Arbeiten :)",
  "Okay, dann viel Erfolg!",
  "Danke dir auch!",
  "Bis später!",
];

export const AutoChat = () => {
  const { accounts } = useWhatsAppAccounts();
  const [account1, setAccount1] = useState<string>("");
  const [account2, setAccount2] = useState<string>("");
  const [interval, setInterval] = useState<number>(5);
  const [messagesPerSession, setMessagesPerSession] = useState<number>(5);
  const [isRunning, setIsRunning] = useState(false);
  const [messagesSent, setMessagesSent] = useState<number>(0);
  const [lastMessage, setLastMessage] = useState<string>("");
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
      const { data, error } = await supabase.functions.invoke('whatsapp-gateway', {
        body: {
          action: 'send-message',
          accountId: fromAccountId,
          phoneNumber: toPhone,
          message: message,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return true;
    } catch (error: any) {
      console.error('[Auto-Chat Send Error]', error);
      toast.error(`Fehler beim Senden: ${error.message}`);
      return false;
    }
  };

  const runChatSession = async () => {
    if (!account1 || !account2) {
      toast.error("Bitte wähle beide Accounts aus");
      return;
    }

    const acc1 = connectedAccounts.find(a => a.id === account1);
    const acc2 = connectedAccounts.find(a => a.id === account2);

    if (!acc1 || !acc2) {
      toast.error("Accounts nicht gefunden");
      return;
    }

    setIsRunning(true);
    let sessionMessages = 0;

    // Sende abwechselnd Nachrichten
    for (let i = 0; i < messagesPerSession; i++) {
      if (!intervalRef.current) break; // Stop wenn gestoppt

      const message = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
      
      // Account 1 sendet an Account 2
      const success1 = await sendMessage(acc1.id, acc2.phone_number, message);
      if (success1) {
        sessionMessages++;
        setMessagesSent(prev => prev + 1);
        setLastMessage(`${acc1.account_name} → ${acc2.account_name}: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000)); // 2-5 Sekunden Pause
      }

      if (!intervalRef.current) break;

      // Account 2 antwortet an Account 1
      const message2 = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
      const success2 = await sendMessage(acc2.id, acc1.phone_number, message2);
      if (success2) {
        sessionMessages++;
        setMessagesSent(prev => prev + 1);
        setLastMessage(`${acc2.account_name} → ${acc1.account_name}: ${message2}`);
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000)); // 2-5 Sekunden Pause
      }

      if (!intervalRef.current) break;
    }

    toast.success(`Chat-Session beendet: ${sessionMessages} Nachrichten gesendet`);
  };

  const startAutoChat = () => {
    if (!account1 || !account2) {
      toast.error("Bitte wähle beide Accounts aus");
      return;
    }

    if (account1 === account2) {
      toast.error("Bitte wähle zwei verschiedene Accounts");
      return;
    }

    setMessagesSent(0);
    toast.success("Auto-Chat gestartet");

    // Erste Session sofort starten
    runChatSession();

    // Weitere Sessions im Intervall
    intervalRef.current = window.setInterval(() => {
      runChatSession();
    }, interval * 60 * 1000);
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
            <div className="space-y-2">
              <Label>Account 1</Label>
              <Select value={account1} onValueChange={setAccount1} disabled={isRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Wähle Account 1" />
                </SelectTrigger>
                <SelectContent>
                  {connectedAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.phone_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Account 2</Label>
              <Select value={account2} onValueChange={setAccount2} disabled={isRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Wähle Account 2" />
                </SelectTrigger>
                <SelectContent>
                  {connectedAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.phone_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                Anzahl der Nachrichten die pro Chat-Session ausgetauscht werden
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

            {lastMessage && (
              <div className="p-4 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Letzte Nachricht</p>
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
