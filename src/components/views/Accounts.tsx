import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Smartphone, CheckCircle, XCircle, Trash2, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import demoQR from "@/assets/whatsapp-qr-demo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Accounts = () => {
  const { accounts, isLoading, createAccount, deleteAccount } = useWhatsAppAccounts();
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [creatingDemo, setCreatingDemo] = useState(false);

  const createDemoData = async () => {
    setCreatingDemo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sie müssen angemeldet sein");
        return;
      }

      // WhatsApp Accounts erstellen
      const { error: accountsError } = await supabase.from('whatsapp_accounts').insert([
        { user_id: user.id, account_name: 'Business Account', phone_number: '+49 151 11111111', status: 'connected', last_connected_at: new Date().toISOString() },
        { user_id: user.id, account_name: 'Marketing Account', phone_number: '+49 160 22222222', status: 'connected', last_connected_at: new Date().toISOString() },
        { user_id: user.id, account_name: 'Sales Account', phone_number: '+49 170 33333333', status: 'connected', last_connected_at: new Date().toISOString() },
        { user_id: user.id, account_name: 'Support Account', phone_number: '+49 175 44444444', status: 'disconnected' },
        { user_id: user.id, account_name: 'Demo Gesperrt', phone_number: '+49 176 55555555', status: 'blocked' }
      ]);

      if (accountsError) throw accountsError;

      // Kontakte erstellen
      const { error: contactsError } = await supabase.from('contacts').insert([
        { user_id: user.id, name: 'Max Mustermann', phone_number: '+49 151 12345678', custom_fields: { firma: 'ABC GmbH', position: 'Geschäftsführer' } },
        { user_id: user.id, name: 'Anna Schmidt', phone_number: '+49 160 98765432', custom_fields: { firma: 'XYZ AG', position: 'Marketing Manager' } },
        { user_id: user.id, name: 'Peter Wagner', phone_number: '+49 170 55555555', custom_fields: { firma: 'Tech Solutions GmbH', position: 'IT-Leiter' } },
        { user_id: user.id, name: 'Lisa Müller', phone_number: '+49 175 44444444', custom_fields: { firma: 'Consulting Plus', position: 'Senior Beraterin' } },
        { user_id: user.id, name: 'Tom Weber', phone_number: '+49 151 66666666', custom_fields: { firma: 'Sales Pro', position: 'Vertriebsleiter' } }
      ]);

      if (contactsError) throw contactsError;

      // Vorlagen erstellen
      const { error: templatesError } = await supabase.from('message_templates').insert([
        { user_id: user.id, template_name: 'Begrüßung Neukunde', category: 'Vertrieb', template_text: 'Hallo {{name}}, vielen Dank für Ihr Interesse!', placeholders: ['name'], for_chats: true },
        { user_id: user.id, template_name: 'Termin Erinnerung', category: 'Service', template_text: 'Hallo {{name}}, Termin am {{datum}} um {{uhrzeit}} Uhr.', placeholders: ['name', 'datum', 'uhrzeit'], for_chats: false },
        { user_id: user.id, template_name: 'Meeting Anfrage', category: 'Allgemein', template_text: 'Hallo {{name}}, können wir ein Meeting vereinbaren?', placeholders: ['name'], for_chats: true }
      ]);

      if (templatesError) throw templatesError;

      toast.success('Demo-Daten erfolgreich erstellt! (5 Accounts, 5 Kontakte, 3 Vorlagen)');
    } catch (error: any) {
      console.error('Error creating demo data:', error);
      toast.error(error.message || 'Fehler beim Erstellen der Demo-Daten');
    } finally {
      setCreatingDemo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAccount.mutateAsync({
      account_name: accountName,
      phone_number: phoneNumber,
    });
    setAccountName("");
    setPhoneNumber("");
    setOpen(false);
  };

  if (isLoading) {
    return <div>Lädt...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Account-Verwaltung</h2>
          <p className="text-muted-foreground">Verwalten Sie Ihre WhatsApp-Konten</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={createDemoData}
            disabled={creatingDemo || accounts.length > 0}
          >
            <Database className="w-4 h-4" />
            {creatingDemo ? 'Erstelle...' : 'Demo-Daten erstellen'}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Neues Konto hinzufügen
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues WhatsApp-Konto hinzufügen</DialogTitle>
              <DialogDescription>
                Scannen Sie den QR-Code mit Ihrer WhatsApp-App
              </DialogDescription>
            </DialogHeader>
              <Alert className="mb-4">
                <AlertDescription className="text-sm">
                  <strong>Demo-Modus:</strong> Dies ist ein Demo-QR-Code. Für die echte WhatsApp Web Integration benötigen Sie zusätzliche Backend-Funktionen.
                </AlertDescription>
              </Alert>
              <div className="flex justify-center">
                <div className="w-64 h-64 border-2 rounded-lg flex items-center justify-center bg-background p-2">
                  <img 
                    src={demoQR} 
                    alt="WhatsApp Web QR Code" 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground mb-4">
                <p>1. Öffnen Sie WhatsApp auf Ihrem Handy</p>
                <p>2. Gehen Sie zu Einstellungen → Verknüpfte Geräte</p>
                <p>3. Scannen Sie diesen QR-Code</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account-Name</Label>
                  <Input
                    id="accountName"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="z.B. Kundenservice"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Telefonnummer</Label>
                  <Input
                    id="phoneNumber"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+49 170 1234567"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Account hinzufügen
                </Button>
              </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className="hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{account.account_name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    {account.phone_number}
                  </CardDescription>
                </div>
                {account.status === "connected" ? (
                  <Badge variant="default" className="bg-green-600 gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Verbunden
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="w-3 h-3" />
                    Getrennt
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => deleteAccount.mutate(account.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wichtige Hinweise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Sie können bis zu 10 WhatsApp-Konten gleichzeitig verbinden</p>
          <p>• Jedes Konto benötigt eine separate Authentifizierung über QR-Code</p>
          <p>• Die Verbindung bleibt aktiv, solange die App geöffnet ist</p>
          <p>• Stellen Sie sicher, dass Ihr Gerät mit dem Internet verbunden ist</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Accounts;
