import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Globe, Server, Plus, Trash2, Wifi, Fingerprint, Monitor, Cpu, Clock, Upload } from "lucide-react";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useWireGuardConfigs } from "@/hooks/useWireGuardConfigs";
import { useWireGuardManager } from "@/hooks/useWireGuardManager";
import { useFingerprint } from "@/hooks/useFingerprint";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AccountCard = ({ account, assignedConfig, onAssignConfig, assignPending }: { 
  account: any; 
  assignedConfig: any | null;
  onAssignConfig: (configId: string) => Promise<any>;
  assignPending: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: fingerprintData, isLoading } = useFingerprint(account.id, isOpen);

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
              {assignedConfig ? (
                <>
                  <p className="text-sm font-medium text-green-600">
                    {assignedConfig.config_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assignedConfig.server_location}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                    <Shield className="w-3 h-3" />
                    <span>WireGuard aktiv</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Kein VPN</p>
              )}
            </div>
            <Badge variant={account.status === "connected" ? "default" : "secondary"}>
              {account.status === "connected" ? "Verbunden" : "Getrennt"}
            </Badge>
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
                {/* VPN Information */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    VPN-Konfiguration
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs">Status</p>
                      <p className="font-mono">{assignedConfig ? 'WireGuard aktiv' : 'Nicht konfiguriert'}</p>
                    </div>
                    <div className="bg-background p-2 rounded border">
                      <p className="text-muted-foreground text-xs">Server-Standort</p>
                      <p className="font-mono">{assignedConfig?.server_location || '-'}</p>
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
  const { accounts, refetch: refetchAccounts } = useWhatsAppAccounts();
  const { configs, uploadConfig, deleteConfig } = useWireGuardConfigs();
  const { assignConfig } = useWireGuardManager();
  const [open, setOpen] = useState(false);
  const [configName, setConfigName] = useState("");
  const [serverLocation, setServerLocation] = useState("DE");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      if (!configName) {
        setConfigName(e.target.files[0].name.replace('.conf', ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Bitte wähle eine WireGuard-Konfigurationsdatei");
      return;
    }

    try {
      const configContent = await selectedFile.text();
      await uploadConfig.mutateAsync({
        configName,
        configContent,
        serverLocation
      });
      setSelectedFile(null);
      setConfigName("");
      setServerLocation("DE");
      setOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const handleAssignAllConfigs = async () => {
    if (configs.length === 0) {
      toast.error("Bitte lade zuerst WireGuard-Konfigurationen hoch");
      return;
    }

    toast.info("Weise WireGuard-Konfigurationen zu...");
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const config = configs[i % configs.length]; // Round-robin distribution
      await assignConfig.mutateAsync({ 
        accountId: account.id,
        configId: config.id 
      });
    }
    await refetchAccounts();
    toast.success("Alle WireGuard-Konfigurationen zugewiesen!");
  };

  const handleRemoveAllConfigs = async () => {
    toast.info("Entferne alle VPN-Zuweisungen...");
    
    for (const account of accounts) {
      const { error } = await supabase
        .from('whatsapp_accounts')
        .update({ 
          wireguard_config_id: null,
          proxy_country: null,
          proxy_server: null
        })
        .eq('id', account.id);
      
      if (error) {
        console.error('Error removing VPN:', error);
      }
    }
    
    await refetchAccounts();
    toast.success("Alle VPN-Zuweisungen entfernt!");
  };

  // Get assigned config for each account
  const getAssignedConfig = (account: any) => {
    if (!account.wireguard_config_id) return null;
    return configs.find(c => c.id === account.wireguard_config_id) || null;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">VPN & WireGuard</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie WireGuard VPN-Verbindungen für Ihre WhatsApp-Accounts
          </p>
        </div>
      </div>

      {/* WireGuard VPN Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>WireGuard VPN Konfiguration</CardTitle>
          </div>
          <CardDescription>
            Laden Sie Ihre WireGuard-Konfigurationsdateien (.conf) hoch und weisen Sie sie Ihren WhatsApp-Accounts zu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Account Verteilung
            </h3>
            <p className="text-sm text-muted-foreground">
              Jede WireGuard-Konfiguration kann beliebig vielen WhatsApp-Accounts zugewiesen werden. 
              Die Configs werden gleichmäßig auf alle Accounts verteilt.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">WhatsApp Accounts</p>
                <p className="text-2xl font-bold">{accounts.length}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">WireGuard Configs</p>
                <p className="text-2xl font-bold">{configs.length}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Zugewiesene Accounts</p>
                <p className="text-2xl font-bold">
                  {accounts.filter((a: any) => a.wireguard_config_id).length}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={handleAssignAllConfigs}
              disabled={configs.length === 0 || assignConfig.isPending}
              className="gap-2"
            >
              <Wifi className="w-4 h-4" />
              {assignConfig.isPending ? "Zuweisen..." : "VPN für alle Accounts aktivieren"}
            </Button>
            
            <Button 
              onClick={handleRemoveAllConfigs}
              variant="destructive"
              className="gap-2"
            >
              <Shield className="w-4 h-4" />
              Alle VPN-Zuweisungen entfernen
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Hochgeladene WireGuard-Konfigurationen</h3>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Config hochladen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>WireGuard-Konfiguration hochladen</DialogTitle>
                    <DialogDescription>
                      Laden Sie eine .conf Datei von Ihrem VPN-Anbieter (z.B. Mullvad) hoch
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="config-file">Konfigurationsdatei</Label>
                      <Input
                        id="config-file"
                        type="file"
                        accept=".conf"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="config-name">Config-Name</Label>
                      <Input
                        id="config-name"
                        placeholder="z.B. Mullvad DE Frankfurt"
                        value={configName}
                        onChange={(e) => setConfigName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="server-location">Server-Standort</Label>
                      <Input
                        id="server-location"
                        placeholder="z.B. DE, NL, SE"
                        value={serverLocation}
                        onChange={(e) => setServerLocation(e.target.value.toUpperCase())}
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || !configName || uploadConfig.isPending}
                    >
                      {uploadConfig.isPending ? "Hochladen..." : "Hochladen"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {configs.length === 0 ? (
              <div className="border rounded-lg p-4 bg-muted/20">
                <p className="text-sm text-muted-foreground text-center">
                  Noch keine WireGuard-Konfigurationen hochgeladen.
                  <br />
                  Laden Sie .conf Dateien von Ihrem VPN-Anbieter hoch.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{config.config_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {config.server_location} • {config.public_key?.substring(0, 20)}...
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteConfig.mutate(config.id)}
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

      {/* Account-to-Config Mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <CardTitle>WhatsApp Account Zuordnung</CardTitle>
          </div>
          <CardDescription>
            Übersicht über die Zuordnung von WhatsApp-Accounts zu WireGuard-Konfigurationen
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
              {accounts.map((account) => {
                const assignedConfig = getAssignedConfig(account);
                
                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    assignedConfig={assignedConfig}
                    onAssignConfig={async (configId) => {
                      await assignConfig.mutateAsync({ 
                        accountId: account.id,
                        configId 
                      });
                      await refetchAccounts();
                    }}
                    assignPending={assignConfig.isPending}
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
          <CardTitle className="text-lg">WireGuard VPN System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • <strong>Dedizierte IPs:</strong> Jede WireGuard-Config nutzt eine eigene IP-Adresse
          </p>
          <p>
            • <strong>Flexible Verteilung:</strong> Configs werden gleichmäßig auf Accounts verteilt
          </p>
          <p>
            • <strong>Mullvad Support:</strong> Optimiert für Mullvad VPN WireGuard-Konfigurationen
          </p>
          <p>
            • <strong>Geo-Diverse IPs:</strong> Nutzen Sie verschiedene Länder-Server für bessere Reputation
          </p>
          <p>
            • <strong>Einfaches Management:</strong> Hochladen, Zuweisen, Fertig!
          </p>
          <p>
            • <strong>Privacy-First:</strong> WireGuard bietet moderne Verschlüsselung und minimale Angriffsfläche
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
