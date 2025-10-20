import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Send, FileText, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

const BulkSender = () => {
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

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
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                {uploadedFile ? uploadedFile : "Datei hier ablegen oder klicken"}
              </p>
              <p className="text-xs text-muted-foreground">CSV oder Excel (max. 10MB)</p>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadedFile(file.name);
                }}
              />
            </div>
            {uploadedFile && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Datei erfolgreich hochgeladen: {uploadedFile}
                  <br />
                  <span className="text-xs text-muted-foreground">125 Kontakte gefunden</span>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Vorlage auswählen</CardTitle>
            <CardDescription>Wählen Sie eine Nachrichtenvorlage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nachrichtenvorlage</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Vorlage auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Terminbestätigung</SelectItem>
                  <SelectItem value="2">Rechnungserinnerung</SelectItem>
                  <SelectItem value="3">Willkommensnachricht</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>WhatsApp-Account</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Account auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Account 1 (+49 170 1234567)</SelectItem>
                  <SelectItem value="2">Account 2 (+49 171 2345678)</SelectItem>
                  <SelectItem value="3">Account 3 (+49 172 3456789)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preview">Vorschau</Label>
              <Textarea
                id="preview"
                placeholder="Die Vorschau wird hier angezeigt..."
                className="min-h-[150px] font-mono text-sm"
                readOnly
              />
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
                Variiert den Text automatisch, um Spam-Erkennung zu vermeiden
              </p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Verzögerung zwischen Nachrichten</Label>
              <p className="text-sm text-muted-foreground">2-5 Sekunden pro Nachricht (empfohlen)</p>
            </div>
            <Select defaultValue="2-5">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-2">1-2 Sek.</SelectItem>
                <SelectItem value="2-5">2-5 Sek.</SelectItem>
                <SelectItem value="5-10">5-10 Sek.</SelectItem>
              </SelectContent>
            </Select>
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
              onClick={() => {
                setSending(true);
                // Simulate sending
                let p = 0;
                const interval = setInterval(() => {
                  p += 2;
                  setProgress(p);
                  if (p >= 100) {
                    clearInterval(interval);
                    setSending(false);
                  }
                }, 100);
              }}
            >
              <Send className="w-4 h-4" />
              Versand starten (125 Empfänger)
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Versand läuft...</span>
                <span className="font-semibold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                {Math.round((progress / 100) * 125)} von 125 Nachrichten gesendet
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
