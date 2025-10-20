import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Send, FileText, AlertCircle, X } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatisch nur verbundene Accounts auswählen
  useEffect(() => {
    const connectedAccounts = accounts.filter(acc => acc.status === 'connected');
    if (connectedAccounts.length > 0) {
      setSelectedAccounts(connectedAccounts.map(acc => acc.id));
    }
  }, [accounts]);

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
    
    // Ersetze alle Platzhalter im Format {field_name}
    const placeholderRegex = /\{([^}]+)\}/g;
    result = result.replace(placeholderRegex, (match, fieldName) => {
      // Suche den Wert im Contact-Objekt
      const value = contact[fieldName];
      return value !== undefined && value !== null ? String(value) : match;
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
          const hasName = "name" in firstRow || "Name" in firstRow || "namen" in firstRow;
          const hasPhone = "phone" in firstRow || "Phone" in firstRow || "telefon" in firstRow || "Telefon" in firstRow;
          
          if (!hasName || !hasPhone) {
            toast.error("Die Datei muss Spalten mit 'Name' und 'Phone' enthalten");
            return;
          }
          
          // Normalize column names
          const normalizedContacts = jsonData.map((row: any) => ({
            name: row.name || row.Name || row.namen || row.Namen || "",
            phone: row.phone || row.Phone || row.telefon || row.Telefon || "",
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
              <Label>WhatsApp-Accounts (Nur verbundene werden automatisch verwendet)</Label>
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

                  const total = contacts.length;
                  let created = 0;

                  for (let i = 0; i < contacts.length; i++) {
                    const contact = contacts[i];
                    const accountId = connectedAccountIds[i % connectedAccountIds.length];
                    const template = (textRotation && selectedTemplateObjects.length > 0)
                      ? selectedTemplateObjects[i % selectedTemplateObjects.length]
                      : selectedTemplateObjects[0];

                    const templateText = template?.template_text || "";
                    const message_text = replacePlaceholders(templateText, contact);
                    const contact_phone = sanitizePhone(String(contact.phone || ""));
                    const contact_name = contact.name || null;

                    if (!contact_phone) {
                      setProgress(Math.round(((i + 1) / total) * 100));
                      continue;
                    }

                    // Nachrichten werden immer gespeichert, auch bei gesperrten Accounts
                    const { error } = await supabase.from("messages").insert({
                      account_id: accountId,
                      contact_phone,
                      contact_name,
                      message_text,
                      direction: "outgoing",
                    });

                    if (!error) {
                      created += 1;
                    } else {
                      console.error("Fehler beim Anlegen der Nachricht:", error);
                    }

                    setProgress(Math.round(((i + 1) / total) * 100));
                  }

                  toast.success(`Versand abgeschlossen! ${created}/${total} Nachrichten angelegt`);
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
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Versand läuft...</span>
                <span className="font-semibold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                {Math.round((progress / 100) * contacts.length)} von {contacts.length} Nachrichten gesendet
              </p>
            </div>
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
