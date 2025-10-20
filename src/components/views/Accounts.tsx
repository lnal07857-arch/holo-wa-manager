import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Smartphone, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import demoQR from "@/assets/whatsapp-qr-demo.png";

const Accounts = () => {
  const { accounts, isLoading, createAccount, deleteAccount } = useWhatsAppAccounts();
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

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
