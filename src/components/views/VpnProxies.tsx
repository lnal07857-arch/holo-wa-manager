import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Globe, Server, Plus, Trash2, Wifi, Fingerprint, Monitor, Cpu, Clock, Upload, Activity, AlertTriangle, CheckCircle2, XCircle, Edit } from "lucide-react";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useWireGuardConfigs } from "@/hooks/useWireGuardConfigs";
import { useWireGuardManager } from "@/hooks/useWireGuardManager";
import { useWireGuardHealth } from "@/hooks/useWireGuardHealth";
import { useFingerprint } from "@/hooks/useFingerprint";
import { useMullvadConfigGenerator } from "@/hooks/useMullvadConfigGenerator";
import { useMullvadAccounts } from "@/hooks/useMullvadAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const ConfigHealthBadge = ({ configId, getConfigHealth }: { configId: string | null; getConfigHealth: (id: string) => any }) => {
  if (!configId) return <Badge variant="secondary">Nicht zugewiesen</Badge>;
  
  const health = getConfigHealth(configId);
  if (!health) return <Badge variant="secondary">Unbekannt</Badge>;

  if (health.is_healthy) {
    return (
      <Badge variant="default" className="bg-green-600 gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Gesund
      </Badge>
    );
  }

  if (health.consecutive_failures >= 3) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" />
        Ausgefallen ({health.consecutive_failures})
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="bg-orange-500 text-white gap-1">
      <AlertTriangle className="w-3 h-3" />
      Warnung ({health.consecutive_failures})
    </Badge>
  );
};

const AccountCard = ({ account, primaryConfig, backupConfig, tertiaryConfig, activeConfig, onAssignConfig, assignPending, getConfigHealth }: { 
  account: any; 
  primaryConfig: any | null;
  backupConfig: any | null;
  tertiaryConfig: any | null;
  activeConfig: any | null;
  onAssignConfig: (configId: string) => Promise<any>;
  assignPending: boolean;
  getConfigHealth: (id: string) => any;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: fingerprintData, isLoading } = useFingerprint(account.id, isOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex items-center justify-between p-4">
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
            {/* Failover Stats */}
            {account.failover_count > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Failover</p>
                <p className="text-sm font-medium">{account.failover_count}x</p>
              </div>
            )}

            {/* Active Config */}
            <div className="text-right">
              {activeConfig ? (
                <>
                  <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {activeConfig.config_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeConfig.server_location}
                  </p>
                  <ConfigHealthBadge configId={activeConfig.id} getConfigHealth={getConfigHealth} />
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
            {/* Config Overview */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                WireGuard Konfigurationen
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {/* Primary */}
                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-blue-600">PRIMARY</p>
                    {account.active_config_id === account.wireguard_config_id && (
                      <Badge variant="default" className="text-xs">Aktiv</Badge>
                    )}
                  </div>
                  {primaryConfig ? (
                    <>
                      <p className="font-mono text-sm">{primaryConfig.config_name}</p>
                      <p className="text-xs text-muted-foreground">{primaryConfig.server_location}</p>
                      <div className="mt-2">
                        <ConfigHealthBadge configId={primaryConfig.id} getConfigHealth={getConfigHealth} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nicht konfiguriert</p>
                  )}
                </div>

                {/* Backup */}
                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-orange-600">BACKUP</p>
                    {account.active_config_id === account.wireguard_backup_config_id && (
                      <Badge variant="default" className="text-xs">Aktiv</Badge>
                    )}
                  </div>
                  {backupConfig ? (
                    <>
                      <p className="font-mono text-sm">{backupConfig.config_name}</p>
                      <p className="text-xs text-muted-foreground">{backupConfig.server_location}</p>
                      <div className="mt-2">
                        <ConfigHealthBadge configId={backupConfig.id} getConfigHealth={getConfigHealth} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nicht konfiguriert</p>
                  )}
                </div>

                {/* Tertiary */}
                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-purple-600">TERTIARY</p>
                    {account.active_config_id === account.wireguard_tertiary_config_id && (
                      <Badge variant="default" className="text-xs">Aktiv</Badge>
                    )}
                  </div>
                  {tertiaryConfig ? (
                    <>
                      <p className="font-mono text-sm">{tertiaryConfig.config_name}</p>
                      <p className="text-xs text-muted-foreground">{tertiaryConfig.server_location}</p>
                      <div className="mt-2">
                        <ConfigHealthBadge configId={tertiaryConfig.id} getConfigHealth={getConfigHealth} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nicht konfiguriert</p>
                  )}
                </div>
              </div>

              {/* Failover History */}
              {account.last_failover_at && (
                <div className="bg-orange-50 dark:bg-orange-950 p-2 rounded border border-orange-200 dark:border-orange-800 mt-2">
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Letzter Failover: {format(new Date(account.last_failover_at), "dd.MM.yyyy HH:mm", { locale: de })}
                  </p>
                </div>
              )}
            </div>

            {/* Fingerprint Information */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center">Lade Fingerprint-Daten...</p>
            ) : fingerprintData ? (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-primary" />
                  Browser Fingerprint
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-background p-2 rounded border">
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <Monitor className="w-3 h-3" />
                      Auflösung
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
                  <div className="bg-background p-2 rounded border col-span-2">
                    <p className="text-muted-foreground text-xs">User-Agent</p>
                    <p className="font-mono text-xs break-all">{fingerprintData.fingerprint.userAgent}</p>
                  </div>
                </div>
              </div>
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
  const { healthStatus, getConfigHealth } = useWireGuardHealth();
  const { locations, locationsLoading, generateConfigs, isGenerating } = useMullvadConfigGenerator();
  const { accounts: mullvadAccounts, addAccount: addMullvadAccount, updateAccount: updateMullvadAccount, deleteAccount: deleteMullvadAccount } = useMullvadAccounts();
  
  const [open, setOpen] = useState(false);
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [mullvadDialogOpen, setMullvadDialogOpen] = useState(false);
  const [editMullvadDialogOpen, setEditMullvadDialogOpen] = useState(false);
  const [editingMullvadAccount, setEditingMullvadAccount] = useState<any>(null);
  const [configName, setConfigName] = useState("");
  const [serverLocation, setServerLocation] = useState("DE");
  const [configCount, setConfigCount] = useState(15);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedMullvadAccountId, setSelectedMullvadAccountId] = useState<string>("");
  const [uploadMullvadAccountId, setUploadMullvadAccountId] = useState<string>("");
  const [newMullvadAccountNumber, setNewMullvadAccountNumber] = useState("");
  const [newMullvadAccountName, setNewMullvadAccountName] = useState("");
  const [configFiles, setConfigFiles] = useState<FileList | null>(null);
  const [editMullvadAccountNumber, setEditMullvadAccountNumber] = useState("");
  const [editMullvadAccountName, setEditMullvadAccountName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      
      // Auto-fill config name from first file if empty
      if (!configName && filesArray.length === 1) {
        setConfigName(filesArray[0].name.replace('.conf', ''));
      } else if (filesArray.length > 1) {
        setConfigName(""); // Clear for batch upload
      }
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Bitte wähle mindestens eine WireGuard-Konfigurationsdatei");
      return;
    }

    if (selectedFiles.length === 1 && !configName) {
      toast.error("Bitte gib einen Config-Namen ein");
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const file of selectedFiles) {
        try {
          const configContent = await file.text();
          const fileName = file.name.replace('.conf', '');
          const finalConfigName = selectedFiles.length === 1 ? configName : fileName;
          
          await uploadConfig.mutateAsync({
            configName: finalConfigName,
            configContent,
            serverLocation,
            mullvadAccountId: uploadMullvadAccountId || undefined
          });

          successCount++;

          // Update device count for selected Mullvad account
          if (uploadMullvadAccountId) {
            const selectedAccount = mullvadAccounts.find(acc => acc.id === uploadMullvadAccountId);
            if (selectedAccount) {
              await updateMullvadAccount.mutateAsync({
                id: uploadMullvadAccountId,
                devicesUsed: (selectedAccount.devices_used || 0) + 1
              });
            }
          }
        } catch (error) {
          console.error(`Upload error for ${file.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`✅ ${successCount} Config(s) erfolgreich hochgeladen${failCount > 0 ? ` (${failCount} fehlgeschlagen)` : ''}`);
      }

      setSelectedFiles([]);
      setConfigName("");
      setServerLocation("DE");
      setUploadMullvadAccountId("");
      setOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Fehler beim Hochladen");
    }
  };

  const handleAssignAllConfigs = async () => {
    if (configs.length === 0) {
      toast.error("Bitte lade zuerst WireGuard-Konfigurationen hoch");
      return;
    }

    if (configs.length < 3) {
      toast.warning("Empfehlung: Lade mindestens 3 Configs pro Account hoch (Primary + Backup + Tertiary)");
    }

    toast.info("Weise WireGuard-Konfigurationen zu...");
    
    // Assign configs in order: Primary → Backup → Tertiary
    for (const account of accounts) {
      // Determine which slot to fill (cast to any for new fields)
      const acc = account as any;
      const needsPrimary = !acc.wireguard_config_id;
      const needsBackup = acc.wireguard_config_id && !acc.wireguard_backup_config_id;
      const needsTertiary = acc.wireguard_backup_config_id && !acc.wireguard_tertiary_config_id;

      if (needsPrimary || needsBackup || needsTertiary) {
        // Round-robin config selection
        const accountIndex = accounts.indexOf(account);
        let configIndex;
        
        if (needsPrimary) {
          configIndex = accountIndex % configs.length;
        } else if (needsBackup) {
          configIndex = (accountIndex + 1) % configs.length;
        } else {
          configIndex = (accountIndex + 2) % configs.length;
        }
        
        const config = configs[configIndex];
        await assignConfig.mutateAsync({ 
          accountId: account.id,
          configId: config.id 
        });
      }
    }
    
    await refetchAccounts();
    toast.success("WireGuard-Konfigurationen zugewiesen!");
  };

  const handleRemoveAllConfigs = async () => {
    toast.info("Entferne alle VPN-Zuweisungen...");
    
    for (const account of accounts) {
      const { error } = await supabase
        .from('whatsapp_accounts')
        .update({ 
          wireguard_config_id: null,
          wireguard_backup_config_id: null,
          wireguard_tertiary_config_id: null,
          active_config_id: null,
          proxy_country: null,
          proxy_server: null,
          failover_count: 0
        })
        .eq('id', account.id);
      
      if (error) {
        console.error('Error removing VPN:', error);
      }
    }
    
    await refetchAccounts();
    toast.success("Alle VPN-Zuweisungen entfernt!");
  };

  // Get configs for account
  const getAccountConfigs = (account: any) => {
    const primary = configs.find(c => c.id === account.wireguard_config_id) || null;
    const backup = configs.find(c => c.id === account.wireguard_backup_config_id) || null;
    const tertiary = configs.find(c => c.id === account.wireguard_tertiary_config_id) || null;
    const active = configs.find(c => c.id === account.active_config_id) || null;
    return { primary, backup, tertiary, active };
  };

  // Calculate health statistics
  const healthyConfigs = healthStatus.filter(h => h.is_healthy).length;
  const totalConfigs = configs.length;
  const healthPercentage = totalConfigs > 0 ? Math.round((healthyConfigs / totalConfigs) * 100) : 0;

  // Calculate active connections per Mullvad account
  const getActiveConnectionsForMullvad = (mullvadAccountId: string): number => {
    const configsFromAccount = configs.filter(c => (c as any).mullvad_account_id === mullvadAccountId);
    const configIds = configsFromAccount.map(c => c.id);
    
    let activeCount = 0;
    for (const account of accounts) {
      const acc = account as any;
      const activeConfigId = acc.active_config_id;
      if (activeConfigId && configIds.includes(activeConfigId)) {
        activeCount++;
      }
    }
    return activeCount;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">VPN & WireGuard</h1>
          <p className="text-muted-foreground mt-2">
            Multi-Config Failover-System mit automatischem Health-Monitoring
          </p>
        </div>
      </div>

      {/* Health Overview */}
      {configs.length > 0 && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>System Health</CardTitle>
              </div>
              <Badge variant={healthPercentage >= 80 ? "default" : healthPercentage >= 50 ? "secondary" : "destructive"} className="text-lg px-3 py-1">
                {healthPercentage}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Progress value={healthPercentage} className="h-3" />
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{healthyConfigs}</p>
                  <p className="text-xs text-muted-foreground">Gesund</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalConfigs}</p>
                  <p className="text-xs text-muted-foreground">Gesamt</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{totalConfigs - healthyConfigs}</p>
                  <p className="text-xs text-muted-foreground">Ausgefallen</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mullvad Accounts Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              <CardTitle>Mullvad Accounts</CardTitle>
            </div>
            <Dialog open={mullvadDialogOpen} onOpenChange={setMullvadDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Account hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Mullvad Account hinzufügen</DialogTitle>
                  <DialogDescription>
                    Gib deine Mullvad Account-Daten ein. WireGuard Keys werden später automatisch generiert oder können manuell hochgeladen werden.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="mullvad-name">Account-Name</Label>
                    <Input
                      id="mullvad-name"
                      placeholder="z.B. Mullvad Account 1"
                      value={newMullvadAccountName}
                      onChange={(e) => setNewMullvadAccountName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mullvad-number">Account Number</Label>
                    <Input
                      id="mullvad-number"
                      placeholder="1234567890123456"
                      value={newMullvadAccountNumber}
                      onChange={(e) => setNewMullvadAccountNumber(e.target.value)}
                      maxLength={16}
                    />
                    <p className="text-xs text-muted-foreground">
                      16-stellige Mullvad Account Number (findest du unter mullvad.net/account)
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">💡 Nächste Schritte</p>
                    <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                      <li>• Nach dem Erstellen kannst du WireGuard Configs automatisch generieren</li>
                      <li>• Oder manuell .conf Dateien hochladen</li>
                      <li>• Jeder WhatsApp Account bekommt dann seine eigenen Keys</li>
                    </ul>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewMullvadAccountName("");
                      setNewMullvadAccountNumber("");
                      setMullvadDialogOpen(false);
                    }}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!newMullvadAccountName || !newMullvadAccountNumber) {
                        toast.error("Bitte fülle alle Felder aus");
                        return;
                      }
                      if (newMullvadAccountNumber.length !== 16) {
                        toast.error("Account Number muss 16 Zeichen lang sein");
                        return;
                      }
                      await addMullvadAccount.mutateAsync({
                        accountNumber: newMullvadAccountNumber,
                        accountName: newMullvadAccountName
                      });
                      setNewMullvadAccountName("");
                      setNewMullvadAccountNumber("");
                      setMullvadDialogOpen(false);
                      toast.success("Mullvad Account erstellt! Du kannst jetzt WireGuard Configs generieren oder hochladen.");
                    }}
                    disabled={addMullvadAccount.isPending}
                  >
                    {addMullvadAccount.isPending ? "Erstelle..." : "Account hinzufügen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Verwalte deine Mullvad VPN Account Numbers (je Account = 5 WireGuard Devices)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mullvadAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Noch keine Mullvad Accounts hinzugefügt</p>
              <p className="text-sm mt-1">
                Füge deine Mullvad Account Numbers hinzu, um automatisch WireGuard Configs zu generieren
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mullvadAccounts.map((acc) => {
                const activeConnections = getActiveConnectionsForMullvad(acc.id);
                const connectionLimit = 5;
                const isAtLimit = activeConnections >= connectionLimit;
                
                return (
                  <div key={acc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{acc.account_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Account: {acc.account_number.substring(0, 4)}...{acc.account_number.substring(12)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">
                          {acc.devices_used}/{acc.max_devices} Configs generiert
                        </Badge>
                        <Badge variant={isAtLimit ? "destructive" : activeConnections >= 3 ? "secondary" : "default"}>
                          {activeConnections}/{connectionLimit} aktive Verbindungen
                        </Badge>
                        {isAtLimit && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Verbindungslimit erreicht
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMullvadAccount(acc);
                          setEditMullvadAccountName(acc.account_name);
                          setEditMullvadAccountNumber(acc.account_number);
                          setEditMullvadDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMullvadAccount.mutate(acc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Mullvad Account Dialog */}
      <Dialog open={editMullvadDialogOpen} onOpenChange={setEditMullvadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mullvad Account bearbeiten</DialogTitle>
            <DialogDescription>
              Aktualisiere die Account-Details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-mullvad-name">Account-Name</Label>
              <Input
                id="edit-mullvad-name"
                placeholder="z.B. Mullvad Account 1"
                value={editMullvadAccountName}
                onChange={(e) => setEditMullvadAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mullvad-number">Account Number</Label>
              <Input
                id="edit-mullvad-number"
                placeholder="1234567890123456"
                value={editMullvadAccountNumber}
                onChange={(e) => setEditMullvadAccountNumber(e.target.value)}
                maxLength={16}
              />
              <p className="text-xs text-muted-foreground">
                16-stellige Mullvad Account Number
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditMullvadDialogOpen(false);
                setEditingMullvadAccount(null);
                setEditMullvadAccountName("");
                setEditMullvadAccountNumber("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={async () => {
                if (!editMullvadAccountName || !editMullvadAccountNumber) {
                  toast.error("Bitte fülle alle Felder aus");
                  return;
                }
                if (editMullvadAccountNumber.length !== 16) {
                  toast.error("Account Number muss 16 Zeichen lang sein");
                  return;
                }
                await updateMullvadAccount.mutateAsync({
                  id: editingMullvadAccount.id,
                  accountNumber: editMullvadAccountNumber,
                  accountName: editMullvadAccountName
                });
                setEditMullvadDialogOpen(false);
                setEditingMullvadAccount(null);
                setEditMullvadAccountName("");
                setEditMullvadAccountNumber("");
              }}
              disabled={updateMullvadAccount.isPending}
            >
              {updateMullvadAccount.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WireGuard VPN Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>WireGuard VPN Konfiguration</CardTitle>
          </div>
          <CardDescription>
            Triple-Config Failover: Jeder Account erhält Primary + Backup + Tertiary Config
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Account Verteilung
            </h3>
            <p className="text-sm text-muted-foreground">
              Jeder Account benötigt 3 Configs für optimales Failover. 
              Für 20 Accounts = 60 Configs empfohlen (4 Mullvad-Accounts à 5€).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">WhatsApp Accounts</p>
                <p className="text-2xl font-bold">{accounts.length}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Hochgeladene Configs</p>
                <p className="text-2xl font-bold">{configs.length}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Empfohlene Configs</p>
                <p className="text-2xl font-bold">{accounts.length * 3}</p>
              </div>
              <div className="bg-background p-3 rounded border">
                <p className="text-sm text-muted-foreground">Mullvad Accounts</p>
                <p className="text-2xl font-bold">{Math.ceil(accounts.length / 5)}</p>
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
              {assignConfig.isPending ? "Zuweisen..." : "Configs zuweisen"}
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
              <div className="flex gap-2">
                {/* Auto-Generate Dialog */}
                <Dialog open={autoGenOpen} onOpenChange={setAutoGenOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" variant="default">
                      <Plus className="w-4 h-4" />
                      Automatisch generieren
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>WireGuard-Configs automatisch generieren</DialogTitle>
                      <DialogDescription>
                        Generiert automatisch WireGuard-Konfigurationen über die Mullvad API
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="mullvad-account">Mullvad Account</Label>
                        <select
                          id="mullvad-account"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          value={selectedMullvadAccountId}
                          onChange={(e) => setSelectedMullvadAccountId(e.target.value)}
                        >
                          <option value="">Account auswählen...</option>
                          {mullvadAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.devices_used}/{acc.max_devices} Devices)
                            </option>
                          ))}
                        </select>
                        {mullvadAccounts.length === 0 && (
                          <p className="text-xs text-orange-500">
                            ⚠️ Keine Mullvad Accounts vorhanden. Füge zuerst einen Account hinzu.
                          </p>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="config-count">Anzahl der Configs</Label>
                        <Input
                          id="config-count"
                          type="number"
                          min="1"
                          max="60"
                          value={configCount}
                          onChange={(e) => setConfigCount(parseInt(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Empfohlen: {accounts.length * 3} Configs für {accounts.length} Accounts (3 pro Account)
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Server-Standorte (optional)</Label>
                        <div className="border rounded-md p-4 max-h-60 overflow-y-auto">
                          {locationsLoading ? (
                            <p className="text-sm text-muted-foreground">Lade verfügbare Standorte...</p>
                          ) : locations.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {locations.map((location: string) => (
                                <label key={location} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedLocations.includes(location)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedLocations([...selectedLocations, location]);
                                      } else {
                                        setSelectedLocations(selectedLocations.filter(l => l !== location));
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className="text-sm">{location}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Keine Standorte verfügbar</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leer lassen für automatische Server-Auswahl
                        </p>
                      </div>

                      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                        <p className="text-sm font-medium">ℹ️ Info</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          <li>• Verwendet deinen ausgewählten Mullvad Account</li>
                          <li>• Generiert automatisch neue WireGuard Keys</li>
                          <li>• Erstellt .conf Dateien und lädt sie in die Datenbank</li>
                          <li>• Rate-Limiting: 1 Config alle 500ms (~2 pro Sekunde)</li>
                          <li>• Device-Counter wird automatisch erhöht</li>
                        </ul>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={async () => {
                          if (!selectedMullvadAccountId) {
                            toast.error("Bitte wähle einen Mullvad Account aus");
                            return;
                          }
                          await generateConfigs.mutateAsync({
                            count: configCount,
                            selectedLocations: selectedLocations,
                            mullvadAccountId: selectedMullvadAccountId
                          });
                          setAutoGenOpen(false);
                        }}
                        disabled={isGenerating || !selectedMullvadAccountId}
                      >
                        {isGenerating ? "Generiere..." : `${configCount} Configs generieren`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Manual Upload Dialog */}
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" variant="outline">
                      <Upload className="w-4 h-4" />
                      Manuell hochladen
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>WireGuard-Konfiguration hochladen</DialogTitle>
                      <DialogDescription>
                        Laden Sie eine .conf Datei von Mullvad hoch
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="upload-mullvad-account">Mullvad Account (optional)</Label>
                        <select
                          id="upload-mullvad-account"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          value={uploadMullvadAccountId}
                          onChange={(e) => setUploadMullvadAccountId(e.target.value)}
                        >
                          <option value="">Keinen Account zuordnen</option>
                          {mullvadAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_name} ({acc.devices_used}/{acc.max_devices} Devices)
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Wähle den Mullvad Account aus, zu dem dieser Key gehört
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="config-file">Konfigurationsdatei(en)</Label>
                        <Input
                          id="config-file"
                          type="file"
                          accept=".conf"
                          multiple
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                        />
                        {selectedFiles.length > 0 && (
                          <div className="text-sm text-muted-foreground">
                            {selectedFiles.length} Datei(en) ausgewählt
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="config-name">Config-Name {selectedFiles.length > 1 && "(optional - verwendet Dateinamen)"}</Label>
                        <Input
                          id="config-name"
                          placeholder="z.B. Mullvad DE Frankfurt"
                          value={configName}
                          onChange={(e) => setConfigName(e.target.value)}
                          disabled={selectedFiles.length > 1}
                        />
                        {selectedFiles.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            Bei mehreren Dateien werden die Dateinamen als Config-Namen verwendet
                          </p>
                        )}
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
                        disabled={selectedFiles.length === 0 || (selectedFiles.length === 1 && !configName) || uploadConfig.isPending}
                      >
                        {uploadConfig.isPending ? "Hochladen..." : selectedFiles.length > 1 ? `${selectedFiles.length} Configs hochladen` : "Hochladen"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            {configs.length === 0 ? (
              <div className="border rounded-lg p-4 bg-muted/20">
                <p className="text-sm text-muted-foreground text-center">
                  Noch keine WireGuard-Konfigurationen hochgeladen.
                  <br />
                  Laden Sie .conf Dateien von Mullvad hoch.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config) => {
                  const health = getConfigHealth(config.id);
                  return (
                    <div
                      key={config.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-background"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{config.config_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {config.server_location} • {config.public_key?.substring(0, 20)}...
                          </p>
                        </div>
                        <ConfigHealthBadge configId={config.id} getConfigHealth={getConfigHealth} />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteConfig.mutate(config.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
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
            Live-Status: Primary (blau) • Backup (orange) • Tertiary (lila) • Aktiv (grün Badge)
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
                const { primary, backup, tertiary, active } = getAccountConfigs(account);
                
                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    primaryConfig={primary}
                    backupConfig={backup}
                    tertiaryConfig={tertiary}
                    activeConfig={active}
                    onAssignConfig={async (configId) => {
                      await assignConfig.mutateAsync({ 
                        accountId: account.id,
                        configId 
                      });
                      await refetchAccounts();
                    }}
                    assignPending={assignConfig.isPending}
                    getConfigHealth={getConfigHealth}
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
          <CardTitle className="text-lg">🚀 Automatisches Failover-System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • <strong>Triple-Redundanz:</strong> Jeder Account hat Primary + Backup + Tertiary Config
          </p>
          <p>
            • <strong>Health-Monitoring:</strong> Alle 30 Sekunden automatische Prüfung aller Configs
          </p>
          <p>
            • <strong>Auto-Failover:</strong> Bei 3 Fehlern → Automatischer Wechsel zur Backup-Config (~30 Sek)
          </p>
          <p>
            • <strong>Unlimited Scale:</strong> 1 Mullvad = 5 simultane Verbindungen (20 Accounts = 4 Mullvad à 5€)
          </p>
          <p>
            • <strong>Geo-Diverse IPs:</strong> Verschiedene Länder (DE, NL, SE, CH) für beste Reputation
          </p>
          <p>
            • <strong>Zero-Downtime:</strong> Transparentes Failover ohne Connection-Loss
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
