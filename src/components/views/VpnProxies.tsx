import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Globe, Server, Plus, Trash2 } from "lucide-react";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useMullvadAccounts } from "@/hooks/useMullvadAccounts";
import { PhaseSelector } from "@/components/PhaseSelector";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

export const VpnProxies = () => {
  const { accounts } = useWhatsAppAccounts();
  const { accounts: mullvadAccounts, createAccount, deleteAccount } = useMullvadAccounts();
  const [open, setOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");

  const { data: warmupStats = [], refetch: refetchWarmupStats } = useQuery({
    queryKey: ["warmup-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_warmup_stats")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const getAccountPhase = (accountId: string) => {
    const stats = warmupStats.find(s => s.account_id === accountId);
    return stats?.phase || "phase1";
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
                    
                    <div className="flex items-center gap-4">
                      <PhaseSelector
                        accountId={account.id}
                        accountName={account.account_name}
                        currentPhase={getAccountPhase(account.id)}
                        onPhaseChange={refetchWarmupStats}
                      />
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
