import { useState, useEffect } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useTemplates } from "@/hooks/useTemplates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Clock, BanIcon, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";

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
  const [disabledContacts, setDisabledContacts] = useState<Set<string>>(new Set());
  const [disabledContactsMap, setDisabledContactsMap] = useState<Map<string, string>>(new Map());
  const [contactToDisable, setContactToDisable] = useState<string | null>(null);

  useEffect(() => {
    loadDisabledContacts();
  }, []);

  useEffect(() => {
    analyzeNonResponders();
    updateDisabledContactNames();
  }, [messages, daysThreshold, disabledContacts]);

  const loadDisabledContacts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("follow_up_disabled_contacts")
        .select("contact_phone")
        .eq("user_id", user.id);

      if (error) throw error;

      setDisabledContacts(new Set(data.map(d => d.contact_phone)));
    } catch (error) {
      console.error("Error loading disabled contacts:", error);
    }
  };

  const updateDisabledContactNames = () => {
    const phoneToNameMap = new Map<string, string>();
    
    // Get contact names from messages
    messages.forEach(msg => {
      if (disabledContacts.has(msg.contact_phone) && msg.contact_name) {
        phoneToNameMap.set(msg.contact_phone, msg.contact_name);
      }
    });
    
    setDisabledContactsMap(phoneToNameMap);
  };

  const analyzeNonResponders = async () => {
    setIsAnalyzing(true);
    const threshold = parseInt(daysThreshold);
    const cutoffTime = Date.now() - (threshold * 24 * 60 * 60 * 1000);
    
    try {
      // Get all bulk campaign recipients that were sent
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAnalyzing(false);
        return;
      }

      const { data: recipients, error: recipientsError } = await supabase
        .from('campaign_recipients')
        .select(`
          contact_id,
          sent_at,
          campaign_id,
          contacts (
            phone_number,
            name
          ),
          bulk_campaigns (
            account_id
          )
        `)
        .eq('status', 'sent')
        .not('sent_at', 'is', null);

      if (recipientsError) {
        console.error('Error fetching recipients:', recipientsError);
        setIsAnalyzing(false);
        return;
      }

      if (!recipients || recipients.length === 0) {
        setNonResponders([]);
        setIsAnalyzing(false);
        return;
      }

      // Map: contactPhone -> { lastBulkSentAt, accountId, contactName }
      const bulkContacts = new Map<string, {
        lastBulkSentAt: number;
        accountId: string;
        contactName: string | null;
      }>();

      recipients.forEach((recipient: any) => {
        if (!recipient.contacts || !recipient.bulk_campaigns) return;
        
        const phone = recipient.contacts.phone_number;
        const sentTime = new Date(recipient.sent_at).getTime();
        const accountId = recipient.bulk_campaigns.account_id;
        const contactName = recipient.contacts.name;

        if (sentTime >= cutoffTime) {
          const existing = bulkContacts.get(phone);
          if (!existing || sentTime > existing.lastBulkSentAt) {
            bulkContacts.set(phone, {
              lastBulkSentAt: sentTime,
              accountId,
              contactName
            });
          }
        }
      });

      // Check for responses after bulk messages
      const contactResponses = new Map<string, boolean>();
      
      messages.forEach(msg => {
        if (msg.direction === "incoming") {
          const bulkInfo = bulkContacts.get(msg.contact_phone);
          if (bulkInfo) {
            const msgTime = new Date(msg.sent_at).getTime();
            // If incoming message is after bulk message
            if (msgTime > bulkInfo.lastBulkSentAt) {
              contactResponses.set(msg.contact_phone, true);
            }
          }
        }
      });

      // Build non-responders list (exclude disabled contacts)
      const nonRespondersArray: NonResponder[] = [];
      
      bulkContacts.forEach((info, contactPhone) => {
        const hasResponded = contactResponses.get(contactPhone) || false;
        
        if (
          !hasResponded &&
          !disabledContacts.has(contactPhone)
        ) {
          const daysSince = Math.floor((Date.now() - info.lastBulkSentAt) / (24 * 60 * 60 * 1000));
          nonRespondersArray.push({
            contactPhone,
            contactName: info.contactName,
            lastSentAt: new Date(info.lastBulkSentAt).toISOString(),
            daysSinceLastSent: daysSince,
            accountId: info.accountId
          });
        }
      });

      // Sort by days since last sent (descending)
      nonRespondersArray.sort((a, b) => b.daysSinceLastSent - a.daysSinceLastSent);
      
      setNonResponders(nonRespondersArray);
    } catch (error) {
      console.error('Error analyzing non-responders:', error);
    } finally {
      setIsAnalyzing(false);
    }
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

  const disableContact = async (contactPhone: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("follow_up_disabled_contacts")
        .insert({
          user_id: user.id,
          contact_phone: contactPhone,
        });

      if (error) throw error;

      setDisabledContacts(new Set([...disabledContacts, contactPhone]));
      toast.success("Kontakt für Follow-up deaktiviert");
      setContactToDisable(null);
      
      // Remove from selected if present
      const newSelected = new Set(selectedContacts);
      newSelected.delete(contactPhone);
      setSelectedContacts(newSelected);
    } catch (error) {
      console.error("Error disabling contact:", error);
      toast.error("Fehler beim Deaktivieren des Kontakts");
    }
  };

  const enableContact = async (contactPhone: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("follow_up_disabled_contacts")
        .delete()
        .eq("user_id", user.id)
        .eq("contact_phone", contactPhone);

      if (error) throw error;

      const newDisabled = new Set(disabledContacts);
      newDisabled.delete(contactPhone);
      setDisabledContacts(newDisabled);
      toast.success("Kontakt für Follow-up aktiviert");
    } catch (error) {
      console.error("Error enabling contact:", error);
      toast.error("Fehler beim Aktivieren des Kontakts");
    }
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
          Kontakte die auf Bulk-Kampagnen nicht geantwortet haben
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
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      checked={selectedContacts.has(contact.contactPhone)}
                      onCheckedChange={() => toggleContact(contact.contactPhone)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {contact.contactName || contact.contactPhone}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {contact.contactPhone}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {contact.daysSinceLastSent} {contact.daysSinceLastSent === 1 ? 'Tag' : 'Tage'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setContactToDisable(contact.contactPhone)}
                      title="Für Follow-up deaktivieren"
                    >
                      <BanIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
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

      {disabledContacts.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deaktivierte Kontakte</CardTitle>
            <CardDescription>
              {disabledContacts.size} Kontakte werden nicht für Follow-up vorgeschlagen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Array.from(disabledContacts).map((phone) => {
                const contactName = disabledContactsMap.get(phone);
                return (
                  <div
                    key={phone}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {contactName || phone}
                      </div>
                      {contactName && (
                        <div className="text-xs text-muted-foreground">
                          {phone}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => enableContact(phone)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Aktivieren
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={contactToDisable !== null} onOpenChange={() => setContactToDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kontakt für Follow-up deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Kontakt wird nicht mehr in der Follow-up Liste angezeigt. Sie können ihn später wieder aktivieren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => contactToDisable && disableContact(contactToDisable)}>
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};