import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Globe, Server, Plus, Trash2, Wifi, Fingerprint, Monitor, Cpu, Clock } from "lucide-react";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useMullvadAccounts } from "@/hooks/useMullvadAccounts";
import { useMullvadProxy } from "@/hooks/useMullvadProxy";
import { useFingerprint } from "@/hooks/useFingerprint";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AccountCard = ({ account, mullvadAccountIndex, serverNumber, onAssignProxy, assignPending }: { 
  account: any; 
  mullvadAccountIndex: number; 
  serverNumber: number;
  onAssignProxy: () => Promise<any>;
  assignPending: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: fingerprintData, isLoading } = useFingerprint(account.id, isOpen);

  const proxyInfo = account.proxy_server ? JSON.parse(account.proxy_server) : null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center justify-between p-3">
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
              {account.proxy_server && (
                <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                  <Shield className="w-3 h-3" />
                  <span>VPN aktiv</span>
                </div>
              )}
            </div>
            <Badge variant={account.status === "connected" ? "default" : "secondary"}>
              {account.status === "connected" ? "Verbunden" : "Getrennt"}
            </Badge>
            {!account.proxy_server && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onAssignProxy}
                disabled={assignPending}
              >
                <Wifi className="w-4 h-4" />
                {assignPending ? 'Zuweisen...' : 'VPN zuweisen'}
              </Button>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Fingerprint className="w-4 h-4" />
                Details
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t p-4 bg-muted/20 space-y-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center">Lade Fingerprint-Daten...</p>
            ) : fingerprintData ? (
              <>
                {/* Proxy/IP Information */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    VPN & IP-Adresse
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs">Proxy Server</p>
                      <p className="font-mono">{(fingerprintData.proxy?.host || (account.proxy_server ? JSON.parse(account.proxy_server).host : null)) || 'Nicht konfiguriert'}</p>
                    </div>
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs">Port</p>
                      <p className="font-mono">{(fingerprintData.proxy?.port || (account.proxy_server ? JSON.parse(account.proxy_server).port : null)) || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Fingerprint Information */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-primary" />
                    Browser Fingerprint
                  </h4>
                  <div className="space-y-2">
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs flex items-center gap-1">
                        <Monitor className="w-3 h-3" />
                        Bildschirmauflösung
                      </p>
                      <p className="font-mono text-sm">
                        {fingerprintData.fingerprint.resolution.width} x {fingerprintData.fingerprint.resolution.height}
                      </p>
                    </div>
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        CPU Kerne
                      </p>
                      <p className="font-mono text-sm">{fingerprintData.fingerprint.cores}</p>
                    </div>
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Zeitzone
                      </p>
                      <p className="font-mono text-sm">{fingerprintData.fingerprint.timezone}</p>
                    </div>
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs">User-Agent</p>
                      <p className="font-mono text-xs break-all">{fingerprintData.fingerprint.userAgent}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center">Keine Fingerprint-Daten verfügbar</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export const VpnProxies = () => {
  const { accounts } = useWhatsAppAccounts();
  const { accounts: mullvadAccounts, createAccount, deleteAccount } = useMullvadAccounts();
  const { assignProxy } = useMullvadProxy();
  const [open, setOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");

  const handleAssignAllProxies = async () => {
    if (mullvadAccounts.length === 0) {
      toast.error("Bitte füge zuerst Mullvad-Accounts hinzu");
      return;
    }

    toast.info("Weise Mullvad VPN-Server zu...");
    for (const account of accounts) {
      await assignProxy.mutateAsync(account.id);
    }
    toast.success("Alle Proxies zugewiesen!");
  };

  const handleRemoveAllProxies = async () => {
    toast.info("Entferne alle VPN-Zuweisungen...");
    
    for (const account of accounts) {
      const { error } = await supabase
        .from('whatsapp_accounts')
        .update({ 
          proxy_server: null,
          proxy_country: null 
        })
        .eq('id', account.id);
      
      if (error) {
        console.error('Error removing proxy:', error);
      }
    }
    
    toast.success("Alle VPN-Zuweisungen entfernt!");
    window.location.reload();
  };

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

          <div className="flex gap-3">
            <Button 
              onClick={handleAssignAllProxies}
              disabled={mullvadAccounts.length === 0 || assignProxy.isPending}
              className="gap-2"
            >
              <Wifi className="w-4 h-4" />
              {assignProxy.isPending ? "Zuweisen..." : "VPN für alle Accounts aktivieren"}
            </Button>
            
            <Button 
              onClick={handleRemoveAllProxies}
              variant="destructive"
              className="gap-2"
            >
              <Shield className="w-4 h-4" />
              Alle VPN für alle Accounts deaktivieren
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Konfigurierte Mullvad Accounts</h3>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Account hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mullvad Account hinzufügen</DialogTitle>
                    <DialogDescription>
                      Geben Sie Ihre Mullvad Account-Nummer ein (16-stellig)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="account-number">Account-Nummer</Label>
                      <Input
                        id="account-number"
                        placeholder="1234567890123456"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        maxLength={16}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        if (accountNumber.length === 16) {
                          createAccount.mutate({ account_number: accountNumber });
                          setAccountNumber("");
                          setOpen(false);
                        }
                      }}
                      disabled={accountNumber.length !== 16}
                    >
                      Hinzufügen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {mullvadAccounts.length === 0 ? (
              <div className="border rounded-lg p-4 bg-muted/20">
                <p className="text-sm text-muted-foreground text-center">
                  Noch keine Mullvad Accounts konfiguriert. 
                  <br />
                  Fügen Sie Ihre Account-Nummern hinzu, um fortzufahren.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mullvadAccounts.map((account, index) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Mullvad Account #{index + 1}</p>
                        <p className="text-sm text-muted-foreground">
                          {account.account_number}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAccount.mutate(account.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
                  <AccountCard
                    key={account.id}
                    account={account}
                    mullvadAccountIndex={mullvadAccountIndex}
                    serverNumber={serverNumber}
                    onAssignProxy={() => assignProxy.mutateAsync(account.id)}
                    assignPending={assignProxy.isPending}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Automatisches Failover-System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • <strong>Automatische Health-Checks:</strong> Alle VPN-Server werden regelmäßig auf Erreichbarkeit geprüft
          </p>
          <p>
            • <strong>Intelligente Server-Auswahl:</strong> Nur gesunde Server werden für neue Verbindungen verwendet
          </p>
          <p>
            • <strong>Automatische Neuzuweisung:</strong> Bei Server-Ausfall werden Accounts automatisch auf funktionierende Server umgeleitet
          </p>
          <p>
            • <strong>Echtzeit-Monitoring:</strong> Server-Status wird alle 30 Sekunden aktualisiert
          </p>
          <p>
            • <strong>SOCKS5 Proxy:</strong> Optimale Kompatibilität mit WhatsApp Web
          </p>
          <p>
            • <strong>Load Balancing:</strong> Server mit bester Response-Zeit werden priorisiert
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
