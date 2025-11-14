import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Send, FileText, AlertCircle, X, CheckCircle2, XCircle, MinusCircle, Smartphone } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useTemplates } from "@/hooks/useTemplates";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Contact {
  name: string;
  phone: string;
  [key: string]: any;
}

interface SendResult {
  contact: string;
  phone: string;
  account: string;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
}

const BulkSender = () => {
  const { accounts } = useWhatsAppAccounts();
  const { templates } = useTemplates();
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [textRotation, setTextRotation] = useState(true);
  const [delay, setDelay] = useState("2-5");
  const [excludeContacted, setExcludeContacted] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Statistiken für Versand
  const [sendStats, setSendStats] = useState({
    successful: 0,
    failed: 0,
    skipped: 0
  });
  
  const [sendResults, setSendResults] = useState<SendResult[]>([]);

  // Keine automatische Auswahl - User muss manuell Accounts wählen

  const sanitizePhone = (phone: string) => {
    // Entfernt führende Apostrophe, Leerzeichen und gängige Trenner, behält '+' und Ziffern
    return (phone || "")
      .toString()
      .trim()
      .replace(/^'+/, "")
      .replace(/[()\-]/g, "")
      .replace(/\s+/g, "");
  };

  const replacePlaceholders = (text: string, contact: Contact): string => {
    let result = text;
    
    // Ersetze zuerst doppelte Klammern {{field_name}}
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, fieldName) => {
      const value = contact[fieldName];
      return value !== undefined && value !== null && value !== "" ? String(value) : "";
    });
    
    // Dann einfache Klammern {field_name}
    result = result.replace(/\{([^}]+)\}/g, (match, fieldName) => {
      const value = contact[fieldName];
      return value !== undefined && value !== null && value !== "" ? String(value) : "";
    });
    
    return result;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadedFile(file.name);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Contact[];
          
          // Validate that we have name and phone columns
          if (jsonData.length === 0) {
            toast.error("Die Datei ist leer");
            return;
          }
          
          const firstRow = jsonData[0];
          const hasName = "name" in firstRow || "Name" in firstRow || "namen" in firstRow || "Namen" in firstRow;
          const hasPhone = "phone" in firstRow || "Phone" in firstRow || "telefon" in firstRow || "Telefon" in firstRow || "nummer" in firstRow || "Nummer" in firstRow;
          
          if (!hasName || !hasPhone) {
            toast.error("Die Datei muss Spalten mit 'Name' und 'Nummer' (oder 'Phone'/'Telefon') enthalten");
            return;
          }
          
          // Normalize column names
          const normalizedContacts = jsonData.map((row: any) => ({
            name: row.name || row.Name || row.namen || row.Namen || "",
            phone: row.phone || row.Phone || row.telefon || row.Telefon || row.nummer || row.Nummer || "",
            ...row
          }));
          
          setContacts(normalizedContacts);
          toast.success(`${normalizedContacts.length} Kontakte erfolgreich geladen`);
        } catch (error) {
          console.error("Error parsing file:", error);
          toast.error("Fehler beim Lesen der Datei");
        }
      };
      
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Fehler beim Hochladen der Datei");
    }
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Bulk-Nachrichten senden</h2>
        <p className="text-muted-foreground">Versenden Sie personalisierte Nachrichten an mehrere Empfänger</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. CSV/Excel-Datei hochladen</CardTitle>
            <CardDescription>Laden Sie eine Datei mit Ihren Kontakten hoch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                {uploadedFile ? uploadedFile : "Datei hier ablegen oder klicken"}
              </p>
              <p className="text-xs text-muted-foreground">CSV oder Excel (max. 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
              />
            </div>
            {uploadedFile && contacts.length > 0 && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Datei erfolgreich hochgeladen: {uploadedFile}
                  <br />
                  <span className="text-xs text-muted-foreground">{contacts.length} Kontakte gefunden</span>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Konten & Vorlagen auswählen</CardTitle>
            <CardDescription>Wählen Sie mehrere Accounts und Vorlagen für optimale Rotation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>WhatsApp-Accounts (Wähle manuell aus)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {selectedAccounts.length > 0
                      ? `${selectedAccounts.length} Account(s) ausgewählt (${accounts.filter(a => a.status === 'connected' && selectedAccounts.includes(a.id)).length} verbunden)`
                      : "Keine Accounts verfügbar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="max-h-64 overflow-auto p-2">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => toggleAccount(account.id)}
                      >
                        <Checkbox checked={selectedAccounts.includes(account.id)} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{account.account_name}</p>
                          <p className="text-xs text-muted-foreground">{account.phone_number}</p>
                        </div>
                        {account.status === 'connected' && (
                          <Badge variant="default" className="text-xs">Verbunden</Badge>
                        )}
                        {account.status === 'disconnected' && (
                          <Badge variant="secondary" className="text-xs">Getrennt</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedAccounts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedAccounts.map((id) => {
                    const account = accounts.find((a) => a.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {account?.account_name}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => toggleAccount(id)}
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nachrichtenvorlagen</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {selectedTemplates.length > 0
                      ? `${selectedTemplates.length} Vorlage(n) ausgewählt`
                      : "Vorlagen auswählen..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="max-h-64 overflow-auto p-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                        onClick={() => toggleTemplate(template.id)}
                      >
                        <Checkbox checked={selectedTemplates.includes(template.id)} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{template.template_name}</p>
                          <p className="text-xs text-muted-foreground">{template.category}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedTemplates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTemplates.map((id) => {
                    const template = templates.find((t) => t.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {template?.template_name}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => toggleTemplate(id)}
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview">Rotation-Info</Label>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {selectedAccounts.length > 0 && selectedTemplates.length > 0 ? (
                    <>
                      Die Nachrichten werden rotierend über{" "}
                      <strong>{accounts.filter(a => a.status === 'connected' && selectedAccounts.includes(a.id)).length}</strong>{" "}
                      verbundene Account(s) und <strong>{selectedTemplates.length}</strong> Vorlage(n) versendet.
                      {accounts.filter(a => a.status !== 'connected' && selectedAccounts.includes(a.id)).length > 0 && (
                        <>
                          <br />
                          <span className="text-destructive font-medium mt-1 block">
                            Warnung: {accounts.filter(a => a.status !== 'connected' && selectedAccounts.includes(a.id)).length}{" "}
                            getrennte Account(s) werden übersprungen.
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    "Wählen Sie mindestens einen Account und eine Vorlage aus."
                  )}
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3. Versandoptionen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Textrotation aktivieren</Label>
              <p className="text-sm text-muted-foreground">
                Variiert den Text automatisch zwischen den ausgewählten Vorlagen
              </p>
            </div>
            <Switch checked={textRotation} onCheckedChange={setTextRotation} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Account-Rotation</Label>
              <p className="text-sm text-muted-foreground">
                Versendet abwechselnd über alle ausgewählten Accounts
              </p>
            </div>
            <Switch checked={selectedAccounts.length > 1} disabled />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Bereits kontaktierte Personen ausschließen</Label>
              <p className="text-sm text-muted-foreground">
                Verhindert, dass Kontakte mit bestehenden Konversationen erneut angeschrieben werden
              </p>
            </div>
            <Switch checked={excludeContacted} onCheckedChange={setExcludeContacted} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versand starten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sending ? (
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={selectedAccounts.length === 0 || selectedTemplates.length === 0 || contacts.length === 0 || sending}
              onClick={async () => {
                try {
                  setSending(true);
                  setProgress(0);
                  setSendStats({ successful: 0, failed: 0, skipped: 0 });
                  setSendResults([]);
                  toast.info("Versand wird gestartet...");

                  const selectedTemplateObjects = templates.filter((t) => selectedTemplates.includes(t.id));
                  const connectedAccountIds = accounts
                    .filter(acc => acc.status === 'connected' && selectedAccounts.includes(acc.id))
                    .map(acc => acc.id);

                  if (connectedAccountIds.length === 0) {
                    toast.error("Keine verbundenen WhatsApp-Accounts verfügbar");
                    setSending(false);
                    return;
                  }

                  // Filter bereits kontaktierte Personen wenn aktiviert
                  let contactsToSend = contacts;
                  let excludedCount = 0;
                  
                  if (excludeContacted) {
                    const phoneNumbers = contacts.map(c => sanitizePhone(String(c.phone || "")));
                    const { data: existingMessages } = await supabase
                      .from("messages")
                      .select("contact_phone")
                      .in("contact_phone", phoneNumbers);
                    
                    const contactedPhones = new Set(existingMessages?.map(m => m.contact_phone) || []);
                    contactsToSend = contacts.filter(c => !contactedPhones.has(sanitizePhone(String(c.phone || ""))));
                    excludedCount = contacts.length - contactsToSend.length;
                    
                    if (excludedCount > 0) {
                      setSendStats(prev => ({ ...prev, skipped: excludedCount }));
                      toast.info(`${excludedCount} bereits kontaktierte Person(en) werden übersprungen`);
                    }
                  }

                  const total = contactsToSend.length;

                  for (let i = 0; i < contactsToSend.length; i++) {
                    const contact = contactsToSend[i];
                    const contact_phone = sanitizePhone(String(contact.phone || ""));

                    // Account-Rotation: Verteile die Kontakte gleichmäßig über alle verbundenen Accounts
                    const accountId = connectedAccountIds[i % connectedAccountIds.length];
                    const accountName = accounts.find(acc => acc.id === accountId)?.account_name || 'Unbekannt';

                    const template = (textRotation && selectedTemplateObjects.length > 0)
                      ? selectedTemplateObjects[i % selectedTemplateObjects.length]
                      : selectedTemplateObjects[0];

                    const templateText = template?.template_text || "";
                    const message_text = replacePlaceholders(templateText, contact);
                    const contact_name = contact.name || null;

                    if (!contact_phone) {
                      setSendStats(prev => ({ ...prev, skipped: prev.skipped + 1 }));
                      setSendResults(prev => [...prev, {
                        contact: contact_name || 'Unbekannt',
                        phone: String(contact.phone || ""),
                        account: accountName,
                        status: 'skipped',
                        reason: 'Keine Telefonnummer'
                      }]);
                      setProgress(Math.round(((i + 1) / total) * 100));
                      continue;
                    }

                    // 1. Nachricht in DB speichern
                    const { error: dbError } = await supabase.from("messages").insert({
                      account_id: accountId,
                      contact_phone,
                      contact_name,
                      message_text,
                      direction: "outgoing",
                    });

                    if (dbError) {
                      console.error("Fehler beim Anlegen der Nachricht:", dbError);
                      setSendStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                      setSendResults(prev => [...prev, {
                        contact: contact_name || 'Unbekannt',
                        phone: contact_phone,
                        account: accountName,
                        status: 'failed',
                        reason: 'Datenbankfehler: ' + dbError.message
                      }]);
                      setProgress(Math.round(((i + 1) / total) * 100));
                      continue;
                    }

                    // 2. Nachricht via WhatsApp versenden
                    try {
                      console.log(`[BulkSender] Sending message to ${contact_phone} via account ${accountId}`);
                      const { data: sendData, error: sendError } = await supabase.functions.invoke("wa-gateway", {
                        body: {
                          action: "send-message",
                          accountId: accountId,
                          phoneNumber: contact_phone,
                          message: message_text,
                        },
                      });

                      if (sendError) {
                        console.error("WhatsApp Versand fehlgeschlagen:", sendError);
                        setSendStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                        
                        // Prüfen ob Nummer nicht in WhatsApp existiert
                        const errorMsg = sendError.message?.toLowerCase() || '';
                        const reason = errorMsg.includes('not registered') || errorMsg.includes('nicht registriert') 
                          ? 'Nummer nicht in WhatsApp'
                          : sendError.message || 'Unbekannter Fehler';
                        
                        setSendResults(prev => [...prev, {
                          contact: contact_name || 'Unbekannt',
                          phone: contact_phone,
                          account: accountName,
                          status: 'failed',
                          reason
                        }]);
                        
                        if (errorMsg.includes('not registered') || errorMsg.includes('nicht registriert')) {
                          toast.error(`${contact.name}: Nummer nicht in WhatsApp`);
                        } else {
                          toast.error(`Fehler beim Versand an ${contact.name}: ${sendError.message}`);
                        }
                      } else if (sendData?.error) {
                        // Prüfen auf Server-seitige Fehler
                        setSendStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                        const errorMsg = sendData.error?.toLowerCase() || '';
                        const reason = errorMsg.includes('not registered') || errorMsg.includes('nicht registriert')
                          ? 'Nummer nicht in WhatsApp'
                          : sendData.error || 'Unbekannter Fehler';
                        
                        setSendResults(prev => [...prev, {
                          contact: contact_name || 'Unbekannt',
                          phone: contact_phone,
                          account: accountName,
                          status: 'failed',
                          reason
                        }]);
                        
                        if (errorMsg.includes('not registered') || errorMsg.includes('nicht registriert')) {
                          toast.error(`${contact.name}: Nummer nicht in WhatsApp`);
                        } else {
                          toast.error(`Fehler beim Versand an ${contact.name}: ${sendData.error}`);
                        }
                      } else {
                        console.log(`[BulkSender] Message sent successfully:`, sendData);
                        setSendStats(prev => ({ ...prev, successful: prev.successful + 1 }));
                        setSendResults(prev => [...prev, {
                          contact: contact_name || 'Unbekannt',
                          phone: contact_phone,
                          account: accountName,
                          status: 'success',
                        }]);
                      }
                    } catch (sendErr) {
                      console.error("Fehler beim WhatsApp-Versand:", sendErr);
                      setSendStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                      setSendResults(prev => [...prev, {
                        contact: contact_name || 'Unbekannt',
                        phone: contact_phone,
                        account: accountName,
                        status: 'failed',
                        reason: String(sendErr)
                      }]);
                      toast.error(`Exception beim Versand: ${sendErr}`);
                    }

                    setProgress(Math.round(((i + 1) / total) * 100));
                    
                    // Delay zwischen Nachrichten (2 Sekunden)
                    if (i < contactsToSend.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                  }

                  const totalProcessed = sendStats.successful + sendStats.failed + sendStats.skipped;
                  toast.success(`Versand abgeschlossen! ✅ ${sendStats.successful} erfolgreich | ❌ ${sendStats.failed} fehlgeschlagen | ⏭️ ${sendStats.skipped} übersprungen`);
                } catch (e) {
                  console.error(e);
                  toast.error("Fehler beim Versand");
                } finally {
                  setSending(false);
                }
              }}
            >
              <Send className="w-4 h-4" />
              Versand starten ({contacts.length} Empfänger)
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Versand läuft...</span>
                  <span className="font-semibold">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">
                  {Math.round((progress / 100) * contacts.length)} von {contacts.length} Nachrichten verarbeitet
                </p>
              </div>
              
              {/* Statistik während des Versands */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{sendStats.successful}</div>
                  <div className="text-xs text-muted-foreground">Erfolgreich</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{sendStats.failed}</div>
                  <div className="text-xs text-muted-foreground">Fehlgeschlagen</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{sendStats.skipped}</div>
                  <div className="text-xs text-muted-foreground">Übersprungen</div>
                </div>
              </div>
            </div>
          )}
          
          {/* Detaillierte Ergebnisse nach dem Versand */}
          {sendResults.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Versand-Details</CardTitle>
                <CardDescription>
                  Detaillierte Übersicht aller versendeten Nachrichten
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Zusammenfassung pro Account */}
                <div className="grid gap-3">
                  <h4 className="text-sm font-semibold">Zusammenfassung pro Account</h4>
                  {(() => {
                    const accountStats = sendResults.reduce((acc, result) => {
                      if (!acc[result.account]) {
                        acc[result.account] = { success: 0, failed: 0, skipped: 0, notWhatsApp: 0 };
                      }
                      if (result.status === 'success') acc[result.account].success++;
                      if (result.status === 'failed') {
                        acc[result.account].failed++;
                        if (result.reason?.toLowerCase().includes('nicht in whatsapp') || 
                            result.reason?.toLowerCase().includes('not registered')) {
                          acc[result.account].notWhatsApp++;
                        }
                      }
                      if (result.status === 'skipped') acc[result.account].skipped++;
                      return acc;
                    }, {} as Record<string, { success: number; failed: number; skipped: number; notWhatsApp: number }>);
                    
                    return (
                      <div className="grid gap-2">
                        {Object.entries(accountStats).map(([account, stats]) => (
                          <div key={account} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{account}</span>
                            </div>
                            <div className="flex gap-3 text-sm">
                              <span className="text-green-600 font-semibold">✓ {stats.success}</span>
                              <span className="text-red-600 font-semibold">✗ {stats.failed}</span>
                              {stats.notWhatsApp > 0 && (
                                <span className="text-orange-600 font-semibold">⚠ {stats.notWhatsApp} nicht in WA</span>
                              )}
                              {stats.skipped > 0 && (
                                <span className="text-yellow-600 font-semibold">⏭ {stats.skipped}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Tabs für verschiedene Ansichten */}
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all">
                      Alle ({sendResults.length})
                    </TabsTrigger>
                    <TabsTrigger value="success">
                      Erfolgreich ({sendResults.filter(r => r.status === 'success').length})
                    </TabsTrigger>
                    <TabsTrigger value="failed">
                      Fehler ({sendResults.filter(r => r.status === 'failed').length})
                    </TabsTrigger>
                    <TabsTrigger value="not-whatsapp">
                      Kein WhatsApp ({sendResults.filter(r => 
                        r.reason?.toLowerCase().includes('nicht in whatsapp') || 
                        r.reason?.toLowerCase().includes('not registered')
                      ).length})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="all">
                    <ScrollArea className="h-[400px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Kontakt</TableHead>
                            <TableHead>Telefon</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Fehlergrund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sendResults.map((result, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                {result.status === 'success' && (
                                  <Badge variant="default" className="gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Erfolg
                                  </Badge>
                                )}
                                {result.status === 'failed' && (
                                  <Badge variant="destructive" className="gap-1">
                                    <XCircle className="w-3 h-3" />
                                    Fehler
                                  </Badge>
                                )}
                                {result.status === 'skipped' && (
                                  <Badge variant="secondary" className="gap-1">
                                    <MinusCircle className="w-3 h-3" />
                                    Übersprungen
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{result.contact}</TableCell>
                              <TableCell className="font-mono text-sm">{result.phone}</TableCell>
                              <TableCell className="text-sm">{result.account}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {result.reason || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="success">
                    <ScrollArea className="h-[400px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kontakt</TableHead>
                            <TableHead>Telefon</TableHead>
                            <TableHead>Account</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sendResults
                            .filter(r => r.status === 'success')
                            .map((result, index) => (
                              <TableRow key={index} className="bg-green-50 dark:bg-green-950/20">
                                <TableCell className="font-medium">{result.contact}</TableCell>
                                <TableCell className="font-mono text-sm">{result.phone}</TableCell>
                                <TableCell className="text-sm">{result.account}</TableCell>
                              </TableRow>
                            ))}
                          {sendResults.filter(r => r.status === 'success').length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground">
                                Keine erfolgreichen Nachrichten
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="failed">
                    <ScrollArea className="h-[400px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kontakt</TableHead>
                            <TableHead>Telefon</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Fehlergrund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sendResults
                            .filter(r => r.status === 'failed')
                            .map((result, index) => (
                              <TableRow key={index} className="bg-red-50 dark:bg-red-950/20">
                                <TableCell className="font-medium">{result.contact}</TableCell>
                                <TableCell className="font-mono text-sm">{result.phone}</TableCell>
                                <TableCell className="text-sm">{result.account}</TableCell>
                                <TableCell className="text-sm text-red-600">{result.reason}</TableCell>
                              </TableRow>
                            ))}
                          {sendResults.filter(r => r.status === 'failed').length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Keine fehlgeschlagenen Nachrichten
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="not-whatsapp">
                    <ScrollArea className="h-[400px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kontakt</TableHead>
                            <TableHead>Telefon</TableHead>
                            <TableHead>Account</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sendResults
                            .filter(r => 
                              r.reason?.toLowerCase().includes('nicht in whatsapp') || 
                              r.reason?.toLowerCase().includes('not registered')
                            )
                            .map((result, index) => (
                              <TableRow key={index} className="bg-orange-50 dark:bg-orange-950/20">
                                <TableCell className="font-medium">{result.contact}</TableCell>
                                <TableCell className="font-mono text-sm">{result.phone}</TableCell>
                                <TableCell className="text-sm">{result.account}</TableCell>
                              </TableRow>
                            ))}
                          {sendResults.filter(r => 
                            r.reason?.toLowerCase().includes('nicht in whatsapp') || 
                            r.reason?.toLowerCase().includes('not registered')
                          ).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground">
                                Keine Nummern ohne WhatsApp
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Hinweis: Der Massenversand kann je nach Anzahl der Empfänger einige Minuten dauern. Bitte
              schließen Sie die Anwendung nicht während des Versands.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkSender;
