import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Server, Plus, Trash2, Wifi, Fingerprint, Monitor, Cpu, Clock, Upload, Activity, AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw } from "lucide-react";
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

const AccountCard = ({ 
  account, 
  activeConfig, 
  onSelectBestConfig, 
  selectPending, 
  getConfigHealth,
  availableConfigsCount 
}: { 
  account: any; 
  activeConfig: any | null;
  onSelectBestConfig: () => Promise<void>;
  selectPending: boolean;
  getConfigHealth: (id: string) => any;
  availableConfigsCount: number;
})  => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: fingerprintData, isLoading } = useFingerprint(account.id, isOpen);

  const hasMullvadAccount = Boolean((account as any).mullvad_account_id);

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
                <p className="text-xs text-muted-foreground">Auto-Switches</p>
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
            {/* VPN Auto-Selection */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Automatische VPN-Auswahl
              </h4>
              
              {!hasMullvadAccount ? (
                <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    Kein Mullvad Account zugewiesen. Bitte erst in der Account-Verwaltung einen zuweisen.
                  </p>
                </div>
              ) : availableConfigsCount === 0 ? (
                <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    Keine Configs für diesen Mullvad Account verfügbar. Bitte erst Configs generieren.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeConfig && (
                    <div className="bg-background p-3 rounded border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Aktuell aktiv:</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm">{activeConfig.config_name}</p>
                          <p className="text-xs text-muted-foreground">{activeConfig.server_location}</p>
                        </div>
                        <ConfigHealthBadge configId={activeConfig.id} getConfigHealth={getConfigHealth} />
                      </div>
                    </div>
                  )}
                  
                  <Button
                    onClick={onSelectBestConfig}
                    disabled={selectPending}
                    variant="default"
                    size="sm"
                    className="w-full gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {selectPending ? "Wähle beste Config..." : activeConfig ? "Neue Config auswählen" : "Config automatisch auswählen"}
                  </Button>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    {availableConfigsCount} verfügbare Config{availableConfigsCount !== 1 ? 's' : ''} • System wählt automatisch die gesündeste aus
                  </p>
                </div>
              )}

              {/* Failover History */}
              {account.last_failover_at && (
                <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800 mt-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <Zap className="w-3 h-3 inline mr-1" />
                    Letzter Auto-Switch: {format(new Date(account.last_failover_at), "dd.MM.yyyy HH:mm", { locale: de })}
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
                      {fingerprintData.fingerprint.resolution.width}x{fingerprintData.fingerprint.resolution.height}
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
  const { configs, uploadConfig, deleteConfig, refetch: refetchConfigs } = useWireGuardConfigs();
  const { selectBestConfig } = useWireGuardManager();
  const { healthStatus, getConfigHealth } = useWireGuardHealth();
  const { locations, locationsLoading, generateConfigs, isGenerating } = useMullvadConfigGenerator();
  const { accounts: mullvadAccounts, addAccount: addMullvadAccount, updateAccount: updateMullvadAccount, deleteAccount: deleteMullvadAccount } = useMullvadAccounts();
  
  const [open, setOpen] = useState(false);
  const [mullvadDialogOpen, setMullvadDialogOpen] = useState(false);
  const [editMullvadDialogOpen, setEditMullvadDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editingMullvadAccount, setEditingMullvadAccount] = useState<any>(null);
  const [selectedMullvadForGeneration, setSelectedMullvadForGeneration] = useState<any>(null);
  const [configName, setConfigName] = useState("");
  const [serverLocation, setServerLocation] = useState("DE");
  const [uploadMullvadAccountId, setUploadMullvadAccountId] = useState<string>("");
  const [newMullvadAccountNumber, setNewMullvadAccountNumber] = useState("");
  const [newMullvadAccountName, setNewMullvadAccountName] = useState("");
  const [editMullvadAccountNumber, setEditMullvadAccountNumber] = useState("");
  const [editMullvadAccountName, setEditMullvadAccountName] = useState("");
  const [generateCount, setGenerateCount] = useState(5);
  const [generateLocation, setGenerateLocation] = useState("de");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      
      if (!configName && filesArray.length === 1) {
        setConfigName(filesArray[0].name.replace('.conf', ''));
      } else if (filesArray.length > 1) {
        setConfigName("");
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

          if (uploadMullvadAccountId) {
            const mullvadAccount = mullvadAccounts.find(ma => ma.id === uploadMullvadAccountId);
            if (mullvadAccount) {
              await updateMullvadAccount.mutateAsync({
                id: uploadMullvadAccountId,
                devicesUsed: (mullvadAccount.devices_used || 0) + 1
              });
            }
          }
        } catch (error: any) {
          console.error(`Failed to upload ${file.name}:`, error);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} Config${successCount > 1 ? 's' : ''} erfolgreich hochgeladen!`);
      }

      setOpen(false);
      setSelectedFiles([]);
      setConfigName("");
      setUploadMullvadAccountId("");
      await refetchConfigs();
    } catch (error: any) {
      console.error('Error uploading configs:', error);
      toast.error(error.message || 'Fehler beim Hochladen');
    }
  };

  const handleDeleteAllConfigs = async () => {
    if (!confirm(`Möchtest du wirklich alle ${configs.length} WireGuard-Konfigurationen löschen?`)) {
      return;
    }

    try {
      for (const account of accounts) {
        await supabase
          .from('whatsapp_accounts')
          .update({ 
            active_config_id: null,
            proxy_country: null,
            proxy_server: null,
            failover_count: 0
          })
          .eq('id', account.id);
      }

      await supabase
        .from('wireguard_health')
        .delete()
        .in('config_id', configs.map(c => c.id));

      const { error } = await supabase
        .from('wireguard_configs')
        .delete()
        .in('id', configs.map(c => c.id));

      if (error) throw error;

      await refetchAccounts();
      await refetchConfigs();
      
      toast.success(`✅ Alle ${configs.length} WireGuard-Konfigurationen wurden gelöscht!`);
    } catch (error) {
      console.error('Error deleting configs:', error);
      toast.error('Fehler beim Löschen der Konfigurationen');
    }
  };

  const getActiveConfig = (account: any) => {
    return configs.find(c => c.id === account.active_config_id) || null;
  };

  const getAvailableConfigsForAccount = (account: any) => {
    const mullvadAccountId = (account as any).mullvad_account_id;
    if (!mullvadAccountId) return [];
    return configs.filter((c: any) => c.mullvad_account_id === mullvadAccountId);
  };

  const healthyConfigs = healthStatus.filter(h => h.is_healthy).length;
  const totalConfigs = configs.length;
  const healthPercentage = totalConfigs > 0 ? (healthyConfigs / totalConfigs) * 100 : 0;

  const getTotalConfigsForMullvad = (mullvadAccountId: string) => {
    return configs.filter((c: any) => c.mullvad_account_id === mullvadAccountId).length;
  };

  const getActiveConnectionsForMullvad = (mullvadAccountId: string) => {
    const configIdsFromMullvad = configs
      .filter((c: any) => c.mullvad_account_id === mullvadAccountId)
      .map(c => c.id);
    
    return accounts.filter((acc: any) => 
      acc.active_config_id && configIdsFromMullvad.includes(acc.active_config_id)
    ).length;
  };

  const getMullvadAccountName = (configId: string) => {
    const config = configs.find(c => c.id === configId) as any;
    if (!config?.mullvad_account_id) return 'Kein Mullvad Account';
    
    const mullvadAccount = mullvadAccounts.find(ma => ma.id === config.mullvad_account_id);
    return mullvadAccount?.account_name || 'Unbekannt';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">VPN & Proxies</h2>
          <p className="text-muted-foreground">
            WireGuard VPN-Konfigurationen verwalten - Automatische Auswahl der besten Config
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">WhatsApp Accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configs</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConfigs}</div>
            <p className="text-xs text-muted-foreground">WireGuard Konfigurationen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthyConfigs}/{totalConfigs}</div>
            <Progress value={healthPercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mullvad Accounts</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mullvadAccounts.length}</div>
            <p className="text-xs text-muted-foreground">Verfügbare Accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Accounts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                WhatsApp Accounts mit VPN
              </CardTitle>
              <CardDescription>
                System wählt automatisch die beste gesunde Config vom zugewiesenen Mullvad Account
              </CardDescription>
            </div>
            <Button
              onClick={async () => {
                let successCount = 0;
                let failCount = 0;
                
                for (const account of accounts) {
                  if ((account as any).mullvad_account_id) {
                    try {
                      await selectBestConfig.mutateAsync(account.id);
                      successCount++;
                    } catch (error) {
                      failCount++;
                    }
                  }
                }
                
                await refetchAccounts();
                
                if (successCount > 0) {
                  toast.success(`✅ ${successCount} Account${successCount > 1 ? 's' : ''} Config zugewiesen`);
                }
                if (failCount > 0) {
                  toast.error(`❌ ${failCount} Account${failCount > 1 ? 's' : ''} fehlgeschlagen`);
                }
              }}
              disabled={selectBestConfig.isPending || accounts.length === 0}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Allen Configs zuweisen
            </Button>
          </div>
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
                const active = getActiveConfig(account);
                const availableConfigs = getAvailableConfigsForAccount(account);
                
                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    activeConfig={active}
                    onSelectBestConfig={async () => {
                      await selectBestConfig.mutateAsync(account.id);
                      await refetchAccounts();
                    }}
                    selectPending={selectBestConfig.isPending}
                    getConfigHealth={getConfigHealth}
                    availableConfigsCount={availableConfigs.length}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                const totalConfigs = getTotalConfigsForMullvad(acc.id);
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
                        <Badge variant="outline">
                          {totalConfigs} Config{totalConfigs !== 1 ? 's' : ''} hochgeladen
                        </Badge>
                        <Badge variant={isAtLimit ? "destructive" : activeConnections >= 3 ? "secondary" : "default"}>
                          {activeConnections}/{connectionLimit} aktiv
                        </Badge>
                        {isAtLimit && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Limit erreicht
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedMullvadForGeneration(acc);
                          setGenerateDialogOpen(true);
                        }}
                        disabled={isGenerating}
                        className="gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Configs generieren
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUploadMullvadAccountId(acc.id);
                          setOpen(true);
                        }}
                        className="gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Manuell hochladen
                      </Button>
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
                        <Plus className="w-4 h-4" />
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

      {/* Upload Config Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WireGuard Config hochladen</DialogTitle>
            <DialogDescription>
              Lade eine oder mehrere .conf Dateien hoch
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mullvad-account-select">Mullvad Account</Label>
              <select
                id="mullvad-account-select"
                value={uploadMullvadAccountId}
                onChange={(e) => setUploadMullvadAccountId(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Keinem Account zuordnen</option>
                {mullvadAccounts.map(ma => (
                  <option key={ma.id} value={ma.id}>
                    {ma.account_name} ({ma.account_number.substring(0,4)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="server-location">Server Location</Label>
              <Input
                id="server-location"
                placeholder="z.B. DE, US, SE"
                value={serverLocation}
                onChange={(e) => setServerLocation(e.target.value)}
              />
            </div>

            {selectedFiles.length === 1 && (
              <div className="space-y-2">
                <Label htmlFor="config-name">Config Name</Label>
                <Input
                  id="config-name"
                  placeholder="z.B. Mullvad DE-1"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>WireGuard Konfiguration</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".conf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                {selectedFiles.length === 0 
                  ? 'Dateien auswählen'
                  : `${selectedFiles.length} Datei${selectedFiles.length > 1 ? 'en' : ''} ausgewählt`
                }
              </Button>
              {selectedFiles.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedFiles.map(f => f.name).join(', ')}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setSelectedFiles([]);
                setConfigName("");
                setUploadMullvadAccountId("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadConfig.isPending || selectedFiles.length === 0}
            >
              {uploadConfig.isPending ? "Lade hoch..." : "Hochladen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Configs Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WireGuard Configs generieren</DialogTitle>
            <DialogDescription>
              Automatisch {generateCount} WireGuard Keys für {selectedMullvadForGeneration?.account_name} generieren
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="generate-count">Anzahl Configs</Label>
              <Input
                id="generate-count"
                type="number"
                min={1}
                max={5}
                value={generateCount}
                onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Mullvad erlaubt max. 5 gleichzeitige Verbindungen pro Account
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="generate-location">Server Location</Label>
              <select
                id="generate-location"
                value={generateLocation}
                onChange={(e) => setGenerateLocation(e.target.value)}
                className="w-full p-2 border rounded"
                disabled={locationsLoading}
              >
                {locationsLoading ? (
                  <option>Lade Locations...</option>
                ) : locations.length === 0 ? (
                  <option>Keine Locations verfügbar</option>
                ) : (
                  locations.map(loc => (
                    <option key={loc.code} value={loc.code}>
                      {loc.country} - {loc.city} ({loc.code})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">ℹ️ Info</p>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Configs werden automatisch in Mullvad erstellt</li>
                <li>• Jede Config erhält einen eigenen Public Key</li>
                <li>• WhatsApp Accounts können dann automatisch die beste Config nutzen</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGenerateDialogOpen(false);
                setSelectedMullvadForGeneration(null);
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={async () => {
                if (!selectedMullvadForGeneration) return;
                
                await generateConfigs.mutateAsync({
                  mullvadAccountId: selectedMullvadForGeneration.id,
                  selectedLocations: [generateLocation],
                  count: generateCount
                });
                
                setGenerateDialogOpen(false);
                setSelectedMullvadForGeneration(null);
                await refetchConfigs();
              }}
              disabled={isGenerating || locationsLoading || locations.length === 0}
            >
              {isGenerating ? "Generiere..." : `${generateCount} Config${generateCount > 1 ? 's' : ''} generieren`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Mullvad Account Dialog */}
      <Dialog open={editMullvadDialogOpen} onOpenChange={setEditMullvadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mullvad Account bearbeiten</DialogTitle>
            <DialogDescription>
              Account-Daten aktualisieren
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-mullvad-name">Account-Name</Label>
              <Input
                id="edit-mullvad-name"
                value={editMullvadAccountName}
                onChange={(e) => setEditMullvadAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mullvad-number">Account Number</Label>
              <Input
                id="edit-mullvad-number"
                value={editMullvadAccountNumber}
                onChange={(e) => setEditMullvadAccountNumber(e.target.value)}
                maxLength={16}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditMullvadDialogOpen(false);
                setEditingMullvadAccount(null);
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={async () => {
                if (!editingMullvadAccount) return;
                
                await updateMullvadAccount.mutateAsync({
                  id: editingMullvadAccount.id,
                  accountName: editMullvadAccountName,
                  accountNumber: editMullvadAccountNumber
                });
                
                setEditMullvadDialogOpen(false);
                setEditingMullvadAccount(null);
              }}
              disabled={updateMullvadAccount.isPending}
            >
              {updateMullvadAccount.isPending ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
