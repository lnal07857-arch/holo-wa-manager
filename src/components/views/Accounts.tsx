import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, QrCode, Smartphone, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import demoQR from "@/assets/whatsapp-qr-demo.png";

const Accounts = () => {
  const [accounts] = useState([
    { id: 1, name: "Account 1", phone: "+49 170 1234567", status: "connected", chats: 45 },
    { id: 2, name: "Account 2", phone: "+49 171 2345678", status: "connected", chats: 38 },
    { id: 3, name: "Account 3", phone: "+49 172 3456789", status: "connected", chats: 44 },
    { id: 4, name: "Account 4", phone: "+49 173 4567890", status: "disconnected", chats: 0 },
  ]);

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
            <div className="space-y-4 py-4">
              <Alert className="mb-4">
                <AlertDescription className="text-sm">
                  <strong>Demo-Modus:</strong> Dies ist ein Demo-QR-Code. Für die echte WhatsApp Web Integration benötigen Sie Lovable Cloud (Backend-Anbindung).
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
              <div className="space-y-2">
                <Label htmlFor="accountName">Account-Name</Label>
                <Input id="accountName" placeholder="z.B. Kundenservice" />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className="hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    {account.phone}
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Aktive Chats:</span>
                  <span className="font-semibold">{account.chats}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Details
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Trennen
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
