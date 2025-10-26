import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Globe, Server, Plus, Trash2 } from "lucide-react";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";

export const VpnProxies = () => {
  const { accounts } = useWhatsAppAccounts();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">VPN & Proxies</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie VPN-Verbindungen und Proxy-Server für Ihre WhatsApp-Accounts
          </p>
        </div>
      </div>

      {/* Mullvad VPN Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>Mullvad VPN Konfiguration</CardTitle>
          </div>
          <CardDescription>
            Konfigurieren Sie Ihre Mullvad VPN-Accounts für sicheren WhatsApp-Zugriff
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Account Verteilung
            </h3>
            <p className="text-sm text-muted-foreground">
              Pro Mullvad-Account können maximal 5 WhatsApp-Accounts verbunden werden.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Gesamt Accounts</p>
                <p className="text-2xl font-bold">{accounts.length}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Benötigte Mullvad Accounts</p>
                <p className="text-2xl font-bold">{Math.ceil(accounts.length / 5)}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Server Region</p>
                <p className="text-2xl font-bold">DE 🇩🇪</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Konfigurierte Mullvad Accounts</h3>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Account hinzufügen
              </Button>
            </div>
            
            <div className="border rounded-lg p-4 bg-muted/20">
              <p className="text-sm text-muted-foreground text-center">
                Noch keine Mullvad Accounts konfiguriert. 
                <br />
                Fügen Sie Ihre Account-Nummern hinzu, um fortzufahren.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account-to-Proxy Mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <CardTitle>WhatsApp Account Zuordnung</CardTitle>
          </div>
          <CardDescription>
            Übersicht über die Zuordnung von WhatsApp-Accounts zu VPN-Servern
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Keine WhatsApp-Accounts vorhanden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account, index) => {
                const mullvadAccountIndex = Math.floor(index / 5);
                const serverNumber = (index % 5) + 1;
                
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{account.account_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.phone_number}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Mullvad Account #{mullvadAccountIndex + 1}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          DE Server #{serverNumber}
                        </p>
                      </div>
                      <Badge variant={account.status === "connected" ? "default" : "secondary"}>
                        {account.status === "connected" ? "Verbunden" : "Getrennt"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Wichtige Hinweise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • Jeder Mullvad-Account kann maximal 5 gleichzeitige Verbindungen verwalten
          </p>
          <p>
            • Alle Verbindungen werden über deutsche Server (DE) geleitet
          </p>
          <p>
            • Die Server-Auswahl erfolgt automatisch und rotierend
          </p>
          <p>
            • SOCKS5 Proxy wird für optimale Kompatibilität mit WhatsApp Web verwendet
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
