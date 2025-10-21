import { useState, useEffect } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useTemplates } from "@/hooks/useTemplates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface NonResponder {
  contactPhone: string;
  contactName: string | null;
  lastSentAt: string;
  daysSinceLastSent: number;
  accountId: string;
}

export const FollowUp = () => {
  const { messages } = useMessages();
  const { accounts } = useWhatsAppAccounts();
  const { templates } = useTemplates();
  
  const [daysThreshold, setDaysThreshold] = useState("7");
  const [nonResponders, setNonResponders] = useState<NonResponder[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    analyzeNonResponders();
  }, [messages, daysThreshold]);

  const analyzeNonResponders = () => {
    setIsAnalyzing(true);
    const threshold = parseInt(daysThreshold);
    const cutoffTime = Date.now() - (threshold * 24 * 60 * 60 * 1000);
    
    const contactLastActivity = new Map<string, {
      lastOutgoing: number;
      hasResponse: boolean;
      contactName: string | null;
      accountId: string;
    }>();

    // Analyze messages
    messages.forEach(msg => {
      const key = `${msg.account_id}-${msg.contact_phone}`;
      const msgTime = new Date(msg.sent_at).getTime();

      if (!contactLastActivity.has(key)) {
        contactLastActivity.set(key, {
          lastOutgoing: 0,
          hasResponse: false,
          contactName: msg.contact_name,
          accountId: msg.account_id
        });
      }

      const activity = contactLastActivity.get(key)!;

      if (msg.direction === "outgoing") {
        if (msgTime > activity.lastOutgoing) {
          activity.lastOutgoing = msgTime;
          // Reset response flag for new outgoing message
          if (msgTime >= cutoffTime) {
            activity.hasResponse = false;
          }
        }
      } else if (msg.direction === "incoming") {
        // Check if this is a response to an outgoing message
        if (activity.lastOutgoing > 0 && msgTime > activity.lastOutgoing) {
          activity.hasResponse = true;
        }
      }
    });

    // Filter non-responders
    const nonRespondersArray: NonResponder[] = [];
    contactLastActivity.forEach((activity, key) => {
      const [accountId, contactPhone] = key.split('-');
      
      if (
        activity.lastOutgoing >= cutoffTime &&
        !activity.hasResponse
      ) {
        const daysSince = Math.floor((Date.now() - activity.lastOutgoing) / (24 * 60 * 60 * 1000));
        nonRespondersArray.push({
          contactPhone,
          contactName: activity.contactName,
          lastSentAt: new Date(activity.lastOutgoing).toISOString(),
          daysSinceLastSent: daysSince,
          accountId
        });
      }
    });

    // Sort by days since last sent (descending)
    nonRespondersArray.sort((a, b) => b.daysSinceLastSent - a.daysSinceLastSent);
    
    setNonResponders(nonRespondersArray);
    setIsAnalyzing(false);
  };

  const toggleContact = (contactPhone: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactPhone)) {
      newSelected.delete(contactPhone);
    } else {
      newSelected.add(contactPhone);
    }
    setSelectedContacts(newSelected);
  };

  const selectAll = () => {
    setSelectedContacts(new Set(nonResponders.map(nr => nr.contactPhone)));
  };

  const deselectAll = () => {
    setSelectedContacts(new Set());
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const selectAllAccounts = () => {
    setSelectedAccounts(connectedAccounts.map(acc => acc.id));
  };

  const deselectAllAccounts = () => {
    setSelectedAccounts([]);
  };

  const sendFollowUpMessages = async () => {
    if (selectedAccounts.length === 0 || !selectedTemplate) {
      toast.error("Bitte mindestens einen Account und Template auswählen");
      return;
    }

    if (selectedContacts.size === 0) {
      toast.error("Bitte mindestens einen Kontakt auswählen");
      return;
    }

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) {
      toast.error("Template nicht gefunden");
      return;
    }

    setIsSending(true);
    let successCount = 0;
    let errorCount = 0;

    const selectedNonResponders = nonResponders.filter(nr => selectedContacts.has(nr.contactPhone));

    // Account rotation
    let accountIndex = 0;

    for (const contact of selectedNonResponders) {
      try {
        // Select account in rotation
        const currentAccount = selectedAccounts[accountIndex % selectedAccounts.length];
        accountIndex++;

        // Replace placeholders
        let messageText = template.template_text;
        messageText = messageText.replace(/\{name\}/gi, contact.contactName || contact.contactPhone);
        messageText = messageText.replace(/\{phone\}/gi, contact.contactPhone);

        // Save to database
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error: dbError } = await supabase.from("messages").insert({
          user_id: user.id,
          account_id: currentAccount,
          contact_phone: contact.contactPhone,
          contact_name: contact.contactName,
          message_text: messageText,
          direction: "outgoing",
          sent_at: new Date().toISOString(),
        });

        if (dbError) throw dbError;

        // Send via WhatsApp
        const { error: sendError } = await supabase.functions.invoke("whatsapp-gateway", {
          body: {
            accountId: currentAccount,
            to: contact.contactPhone,
            message: messageText,
          },
        });

        if (sendError) throw sendError;

        successCount++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error sending to ${contact.contactPhone}:`, error);
        errorCount++;
      }
    }

    setIsSending(false);
    toast.success(`${successCount} Nachrichten gesendet${errorCount > 0 ? `, ${errorCount} Fehler` : ""}`);
    
    // Refresh analysis
    analyzeNonResponders();
    setSelectedContacts(new Set());
  };

  const connectedAccounts = accounts?.filter(acc => acc.status === "connected") || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Follow-up Nachrichten</h1>
        <p className="text-muted-foreground mt-2">
          Kontakte die nicht geantwortet haben
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Wähle den Zeitraum für die Analyse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Zeitraum (Tage ohne Antwort)</label>
              <Select value={daysThreshold} onValueChange={setDaysThreshold}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Tage</SelectItem>
                  <SelectItem value="5">5 Tage</SelectItem>
                  <SelectItem value="7">7 Tage</SelectItem>
                  <SelectItem value="14">14 Tage</SelectItem>
                  <SelectItem value="30">30 Tage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">WhatsApp Accounts ({selectedAccounts.length})</label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={selectAllAccounts}
                  >
                    Alle
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={deselectAllAccounts}
                  >
                    Keine
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                {connectedAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine verbundenen Accounts</p>
                ) : (
                  connectedAccounts.map((acc) => (
                    <div key={acc.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedAccounts.includes(acc.id)}
                        onCheckedChange={() => toggleAccount(acc.id)}
                      />
                      <label className="text-sm cursor-pointer" onClick={() => toggleAccount(acc.id)}>
                        {acc.account_name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nachrichtenvorlage</label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Template wählen" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Kontakte ohne Antwort
                {isAnalyzing && <Loader2 className="inline ml-2 h-4 w-4 animate-spin" />}
              </CardTitle>
              <CardDescription>
                {nonResponders.length} Kontakte gefunden • {selectedContacts.size} ausgewählt
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Alle auswählen
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Abwählen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {nonResponders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Kontakte gefunden, die nicht geantwortet haben</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {nonResponders.map((contact) => (
                <div
                  key={contact.contactPhone}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedContacts.has(contact.contactPhone)}
                      onCheckedChange={() => toggleContact(contact.contactPhone)}
                    />
                    <div>
                      <div className="font-medium">
                        {contact.contactName || contact.contactPhone}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {contact.contactPhone}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {contact.daysSinceLastSent} {contact.daysSinceLastSent === 1 ? 'Tag' : 'Tage'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={sendFollowUpMessages}
          disabled={isSending || selectedContacts.size === 0 || selectedAccounts.length === 0 || !selectedTemplate}
        >
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sende...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Follow-up senden ({selectedContacts.size})
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
