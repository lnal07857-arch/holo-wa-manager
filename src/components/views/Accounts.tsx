import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Smartphone, CheckCircle, XCircle, Trash2, Loader2, Power, PowerOff, GripVertical, Shield, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useMullvadProxy } from "@/hooks/useMullvadProxy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
const Accounts = () => {
  const {
    accounts,
    isLoading,
    createAccount,
    deleteAccount,
    refetch
  } = useWhatsAppAccounts();
  const { assignProxy } = useMullvadProxy();
  const [sortedAccounts, setSortedAccounts] = useState<any[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort accounts by display_order
  useEffect(() => {
    const sorted = [...accounts].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    setSortedAccounts(sorted);
  }, [accounts]);

  
  // Validate account status on mount
  useEffect(() => {
    const validateAccountStatuses = async () => {
      for (const account of sortedAccounts) {
        if (account.status === 'connected') {
          try {
            const { data, error } = await supabase.functions.invoke('wa-gateway', {
              body: { action: 'status', accountId: account.id }
            });
            
            if (!error && data && !data.connected) {
              // Update status to disconnected if not actually connected
              await supabase
                .from('whatsapp_accounts')
                .update({ status: 'disconnected', qr_code: null })
                .eq('id', account.id);
            }
          } catch (err) {
            console.error(`Failed to validate status for ${account.account_name}:`, err);
          }
        }
      }
    };
    
    if (sortedAccounts.length > 0) {
      validateAccountStatuses();
    }
  }, [sortedAccounts.length]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedAccounts.findIndex((acc) => acc.id === active.id);
      const newIndex = sortedAccounts.findIndex((acc) => acc.id === over.id);

      const newOrder = arrayMove(sortedAccounts, oldIndex, newIndex);
      setSortedAccounts(newOrder);

      // Update display_order in database
      try {
        const updates = newOrder.map((account, index) => 
          supabase
            .from('whatsapp_accounts')
            .update({ display_order: index })
            .eq('id', account.id)
        );

        await Promise.all(updates);
        toast.success("Reihenfolge gespeichert");
      } catch (error) {
        console.error('Error updating order:', error);
        toast.error("Fehler beim Speichern der Reihenfolge");
        // Revert on error
        const sorted = [...accounts].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        setSortedAccounts(sorted);
      }
    }
  };
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [initializingAccount, setInitializingAccount] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [disconnectingAll, setDisconnectingAll] = useState(false);
  const createDemoData = async () => {
    setCreatingDemo(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sie müssen angemeldet sein");
        return;
      }

      // WhatsApp Accounts erstellen
      const {
        error: accountsError
      } = await supabase.from('whatsapp_accounts').insert([{
        user_id: user.id,
        account_name: 'Business Account',
        phone_number: '+49 151 11111111',
        status: 'connected',
        last_connected_at: new Date().toISOString()
      }, {
        user_id: user.id,
        account_name: 'Marketing Account',
        phone_number: '+49 160 22222222',
        status: 'connected',
        last_connected_at: new Date().toISOString()
      }, {
        user_id: user.id,
        account_name: 'Sales Account',
        phone_number: '+49 170 33333333',
        status: 'connected',
        last_connected_at: new Date().toISOString()
      }, {
        user_id: user.id,
        account_name: 'Support Account',
        phone_number: '+49 175 44444444',
        status: 'disconnected'
      }, {
        user_id: user.id,
        account_name: 'Demo Gesperrt',
        phone_number: '+49 176 55555555',
        status: 'blocked'
      }]);
      if (accountsError) throw accountsError;

      // Kontakte erstellen
      const {
        error: contactsError
      } = await supabase.from('contacts').insert([{
        user_id: user.id,
        name: 'Max Mustermann',
        phone_number: '+49 151 12345678',
        custom_fields: {
          firma: 'ABC GmbH',
          position: 'Geschäftsführer'
        }
      }, {
        user_id: user.id,
        name: 'Anna Schmidt',
        phone_number: '+49 160 98765432',
        custom_fields: {
          firma: 'XYZ AG',
          position: 'Marketing Manager'
        }
      }, {
        user_id: user.id,
        name: 'Peter Wagner',
        phone_number: '+49 170 55555555',
        custom_fields: {
          firma: 'Tech Solutions GmbH',
          position: 'IT-Leiter'
        }
      }, {
        user_id: user.id,
        name: 'Lisa Müller',
        phone_number: '+49 175 44444444',
        custom_fields: {
          firma: 'Consulting Plus',
          position: 'Senior Beraterin'
        }
      }, {
        user_id: user.id,
        name: 'Tom Weber',
        phone_number: '+49 151 66666666',
        custom_fields: {
          firma: 'Sales Pro',
          position: 'Vertriebsleiter'
        }
      }]);
      if (contactsError) throw contactsError;

      // Vorlagen erstellen
      const {
        error: templatesError
      } = await supabase.from('message_templates').insert([{
        user_id: user.id,
        template_name: 'Begrüßung Neukunde',
        category: 'Vertrieb',
        template_text: 'Hallo {{name}}, vielen Dank für Ihr Interesse!',
        placeholders: ['name'],
        for_chats: true
      }, {
        user_id: user.id,
        template_name: 'Termin Erinnerung',
        category: 'Service',
        template_text: 'Hallo {{name}}, Termin am {{datum}} um {{uhrzeit}} Uhr.',
        placeholders: ['name', 'datum', 'uhrzeit'],
        for_chats: false
      }, {
        user_id: user.id,
        template_name: 'Meeting Anfrage',
        category: 'Allgemein',
        template_text: 'Hallo {{name}}, können wir ein Meeting vereinbaren?',
        placeholders: ['name'],
        for_chats: true
      }]);
      if (templatesError) throw templatesError;
      toast.success('Demo-Daten erfolgreich erstellt! (5 Accounts, 5 Kontakte, 3 Vorlagen)');
    } catch (error: any) {
      console.error('Error creating demo data:', error);
      toast.error(error.message || 'Fehler beim Erstellen der Demo-Daten');
    } finally {
      setCreatingDemo(false);
    }
  };
  const initializeWhatsApp = async (accountId: string) => {
    setLoadingQR(true);
    setInitializingAccount(accountId);
    
    // Timeout nach 2 Minuten (entspricht Server QR-Timeout)
    const timeoutId = setTimeout(() => {
      setLoadingQR(false);
      setInitializingAccount(null);
      toast.error('QR-Code wurde nicht rechtzeitig gescannt. Die Session wurde automatisch beendet.');
    }, 120000);
    
    try {
      // Smart Retry with exponential backoff for server overload
      let lastError: any = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const {
            data,
            error
          } = await supabase.functions.invoke('wa-gateway', {
            body: {
              action: 'initialize',
              accountId: accountId
            }
          });
          
          // Timeout clearen wenn erfolgreich
          clearTimeout(timeoutId);
          
          if (error) {
            console.error(`[WhatsApp Init Error - Attempt ${attempt}/${maxRetries}]`, error);
            
            // Check if it's a server overload (non-2xx status)
            if (error.message?.includes('non-2xx status code') || error.message?.includes('überlastet')) {
              lastError = error;
              
              if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                toast.info(`Server ausgelastet. Neuer Versuch in ${waitTime/1000}s... (${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // Try again
              }
              
              throw new Error('Railway Server überlastet. Bitte trennen Sie einen Account, bevor Sie einen neuen verbinden, oder versuchen Sie es später erneut.');
            }
            
            throw new Error(error.message || 'Edge Function Fehler');
          }

          // Fehler vom Railway-Server behandeln
          if (data?.error) {
            console.error('[WhatsApp Init Error from Railway]', data.error);
            if (typeof data.error === 'string' && (data.error.includes('Failed to launch the browser') || data.error.includes('pthread_create'))) {
              throw new Error('Server-Ressourcen erschöpft. Bitte trennen Sie einen bestehenden Account, bevor Sie einen neuen hinzufügen.');
            }
            throw new Error(data.error);
          }

          // Success! Exit retry loop
          if (data?.message === 'Client already initialized') {
            try {
              const { data: statusData } = await supabase.functions.invoke('wa-gateway', {
                body: { action: 'status', accountId }
              });

              if (statusData?.connected) {
                setInitializingAccount(null);
                setLoadingQR(false);
                toast.success('Account ist bereits verbunden.');
                return;
              }

              console.log('[WhatsApp Init] Instance present but not connected. Forcing reconnect...');
              await supabase.functions.invoke('wa-gateway', {
                body: { action: 'disconnect', accountId }
              });

              await new Promise(r => setTimeout(r, 500));
              await supabase.functions.invoke('wa-gateway', {
                body: { action: 'initialize', accountId }
              });
            } catch (reInitErr) {
              console.error('[WhatsApp Re-Init Error]', reInitErr);
            }
          }

          toast.success('WhatsApp wird initialisiert... Warte auf QR-Code');
          return; // Success, exit function
          
        } catch (attemptError: any) {
          lastError = attemptError;
          
          // If not server overload or last attempt, throw immediately
          if (attempt === maxRetries || !attemptError.message?.includes('überlastet')) {
            throw attemptError;
          }
        }
      }
      
      // If we get here, all retries failed
      throw lastError || new Error('Alle Verbindungsversuche fehlgeschlagen');
      
    } catch (error: any) {
      console.error('[WhatsApp Init Error]', error);
      setInitializingAccount(null);
      setLoadingQR(false);
      toast.error(error.message || 'Fehler bei der Initialisierung');
    }
  };
  const disconnectAccount = async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      const { error } = await supabase.functions.invoke('wa-gateway', {
        body: { action: 'disconnect', accountId }
      });
      
      if (error) {
        console.error('[Disconnect Error]', error);
        toast.error('Fehler beim Trennen der Instanz');
      } else {
        // Update status in database
        await supabase
          .from('whatsapp_accounts')
          .update({ status: 'disconnected', qr_code: null })
          .eq('id', accountId);
        
        toast.success('Instanz erfolgreich getrennt');
      }
    } catch (error: any) {
      console.error('[Disconnect Error]', error);
      toast.error(error.message || 'Fehler beim Trennen der Instanz');
    } finally {
      setDisconnecting(null);
    }
  };

  const disconnectAllAccounts = async () => {
    setDisconnectingAll(true);
    try {
      if (sortedAccounts.length === 0) {
        toast.info('Keine Accounts vorhanden');
        return;
      }

      toast.info(`Trenne ${sortedAccounts.length} Instanzen auf Railway...`);

      let successCount = 0;
      let errorCount = 0;

      // Trenne ALLE Accounts, unabhängig vom Status
      for (const account of sortedAccounts) {
        try {
          const { error } = await supabase.functions.invoke('wa-gateway', {
            body: { action: 'disconnect', accountId: account.id }
          });
          
          // Update status in database
          await supabase
            .from('whatsapp_accounts')
            .update({ status: 'disconnected', qr_code: null })
            .eq('id', account.id);
          
          if (!error) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error(`[Disconnect Error] ${account.account_name}:`, err);
          errorCount++;
        }
      }

      if (errorCount === 0) {
        toast.success(`Alle ${successCount} Instanzen erfolgreich getrennt`);
      } else {
        toast.warning(`${successCount} Instanzen getrennt, ${errorCount} Fehler`);
      }
    } catch (error: any) {
      console.error('[Disconnect All Error]', error);
      toast.error('Fehler beim Trennen der Instanzen');
    } finally {
      setDisconnectingAll(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('[Account Create] Starting account creation...');
      const result = await createAccount.mutateAsync({
        account_name: accountName,
        phone_number: phoneNumber
      });
      console.log('[Account Create] Account created:', result);

      // Nach dem Erstellen des Accounts, VPN zuweisen und dann initialisieren
      if (result) {
        // VPN zuweisen vor der Initialisierung
        console.log('[Account Create] Assigning VPN...');
        await assignProxy.mutateAsync(result.id);
        console.log('[Account Create] VPN assigned, now initializing WhatsApp...');
        
        await initializeWhatsApp(result.id);
      }
      setAccountName("");
      setPhoneNumber("");
    } catch (error: any) {
      console.error('[Create Account Error]', error);
      toast.error(error.message || 'Fehler beim Erstellen des Accounts');
      setInitializingAccount(null);
      setLoadingQR(false);
    }
  };

  // Realtime-Subscription für QR-Code Updates
  useEffect(() => {
    if (!initializingAccount) return;
    const channel = supabase.channel(`account-${initializingAccount}`).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'whatsapp_accounts',
      filter: `id=eq.${initializingAccount}`
    }, (payload: any) => {
      console.log('[Account Update]', payload);
      if (payload.new.qr_code) {
        setQrCode(payload.new.qr_code);
        setLoadingQR(false); // QR-Code erhalten, Loading beenden
      }
      if (payload.new.status === 'connected') {
        toast.success('WhatsApp erfolgreich verbunden!');
        setOpen(false);
        setInitializingAccount(null);
        setQrCode(null);
        setLoadingQR(false);
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [initializingAccount]);

  // Reset states when dialog is closed
  useEffect(() => {
    if (!open) {
      setInitializingAccount(null);
      setQrCode(null);
      setLoadingQR(false);
      setAccountName("");
      setPhoneNumber("");
    }
  }, [open]);

  // Fallback-Polling, falls Realtime nicht verfügbar ist
  useEffect(() => {
    if (!initializingAccount || qrCode) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const {
          data,
          error
        } = await supabase.from('whatsapp_accounts').select('qr_code,status').eq('id', initializingAccount).single();
        if (!error && data) {
          if (data.qr_code) {
            setQrCode(data.qr_code);
            setLoadingQR(false); // QR-Code erhalten, Loading beenden
          }
          if (data.status === 'connected') {
            toast.success('WhatsApp erfolgreich verbunden!');
            setOpen(false);
            setInitializingAccount(null);
            setQrCode(null);
            setLoadingQR(false);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('[QR Polling Error]', err);
      }
      if (attempts > 60) {
        clearInterval(interval);
        setLoadingQR(false);
        setInitializingAccount(null);
        toast.error('Timeout: Kein QR-Code empfangen. Bitte versuchen Sie es erneut.');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [initializingAccount, qrCode]);
  if (isLoading) {
    return <div>Lädt...</div>;
  }
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Account-Verwaltung</h2>
          <p className="text-muted-foreground">Verwalten Sie Ihre WhatsApp-Konten</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2 text-destructive border-destructive hover:bg-destructive/10"
            onClick={disconnectAllAccounts}
            disabled={disconnectingAll}
          >
            {disconnectingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Trenne...
              </>
            ) : (
              <>
                <PowerOff className="w-4 h-4" />
                Alle Instanzen trennen
              </>
            )}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Neues Konto hinzufügen
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Neues WhatsApp-Konto hinzufügen</DialogTitle>
              <DialogDescription>
                {qrCode ? 'Scannen Sie den QR-Code mit Ihrer WhatsApp-App' : 'Geben Sie die Account-Details ein'}
              </DialogDescription>
            </DialogHeader>
            
            {!initializingAccount ? <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account-Name</Label>
                  <Input id="accountName" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="z.B. Kundenservice" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Telefonnummer</Label>
                  <Input 
                    id="phoneNumber" 
                    value={phoneNumber} 
                    onChange={e => setPhoneNumber(e.target.value)} 
                    placeholder="z.B. +49 151 12345678" 
                    required 
                  />
                  <p className="text-xs text-muted-foreground">
                    Die Telefonnummer ist wichtig für das Warm-up, damit die Accounts sich gegenseitig anschreiben können.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loadingQR}>
                  {loadingQR ? <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Initialisiere...
                    </> : 'WhatsApp verbinden'}
                </Button>
              </form> : <div className="space-y-4">
                <Alert>
                  <AlertDescription className="text-sm">
                    {loadingQR ? 'Warte auf QR-Code...' : 'Scannen Sie diesen QR-Code mit WhatsApp auf Ihrem Handy'}
                  </AlertDescription>
                </Alert>
                <div className="flex justify-center">
                  <div className="w-64 h-64 border-2 rounded-lg flex items-center justify-center bg-white p-4">
                    {loadingQR && !qrCode ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-12 h-12 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">QR-Code wird generiert...</p>
                      </div>
                    ) : qrCode ? (
                      <img src={qrCode} alt="WhatsApp Web QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <p className="text-sm text-muted-foreground">Kein QR-Code verfügbar</p>
                    )}
                  </div>
                </div>
                <div className="text-center text-sm text-muted-foreground space-y-1">
                  <p>1. Öffnen Sie WhatsApp auf Ihrem Handy</p>
                  <p>2. Gehen Sie zu Einstellungen → Verknüpfte Geräte</p>
                  <p>3. Tippen Sie auf "Gerät verknüpfen"</p>
                  <p>4. Scannen Sie diesen QR-Code</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => {
                setQrCode(null);
                setInitializingAccount(null);
                setOpen(false);
              }}>
                  Abbrechen
                </Button>
              </div>}
          </DialogContent>
         </Dialog>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedAccounts.map(acc => acc.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedAccounts.map(account => (
              <SortableAccountCard
                key={account.id}
                account={account}
                disconnecting={disconnecting}
                initializeWhatsApp={initializeWhatsApp}
                disconnectAccount={disconnectAccount}
                deleteAccount={deleteAccount}
                setQrCode={setQrCode}
                setInitializingAccount={setInitializingAccount}
                setOpen={setOpen}
                assignProxy={assignProxy}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Card>
        <CardHeader>
          <CardTitle>Wichtige Hinweise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Jedes Konto benötigt eine separate Authentifizierung über QR-Code</p>
          <p>• Die Verbindung bleibt aktiv, solange die App geöffnet ist</p>
          <p>• Stellen Sie sicher, dass Ihr Gerät mit dem Internet verbunden ist</p>
        </CardContent>
      </Card>
    </div>;
};

interface SortableAccountCardProps {
  account: any;
  disconnecting: string | null;
  initializeWhatsApp: (accountId: string) => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  deleteAccount: any;
  setQrCode: (qrCode: string | null) => void;
  setInitializingAccount: (accountId: string | null) => void;
  setOpen: (open: boolean) => void;
  assignProxy: any;
}

const SortableAccountCard = ({
  account,
  disconnecting,
  initializeWhatsApp,
  disconnectAccount,
  deleteAccount,
  setQrCode,
  setInitializingAccount,
  setOpen,
  assignProxy,
}: SortableAccountCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="hover:shadow-lg transition-all">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1">
              <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1 flex-1">
                <CardTitle className="text-lg">{account.account_name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <Smartphone className="w-3 h-3" />
                  {account.phone_number}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-col gap-1 items-end">
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
              {/* VPN Status Badge */}
              {account.proxy_server ? (
                <Badge variant="outline" className="gap-1 text-green-700 border-green-700 bg-green-50">
                  <Shield className="w-3 h-3" />
                  VPN aktiv
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-orange-600 border-orange-600 bg-orange-50">
                  <AlertTriangle className="w-3 h-3" />
                  Kein VPN
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {/* VPN Zuweisung nur wenn kein VPN aktiv */}
            {!account.proxy_server && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full gap-2 text-blue-600 border-blue-600 hover:bg-blue-50"
                onClick={async () => {
                  try {
                    toast.loading('VPN wird zugewiesen...', { id: `vpn-${account.id}` });
                    await assignProxy.mutateAsync(account.id);
                    toast.success('VPN erfolgreich zugewiesen!', { id: `vpn-${account.id}` });
                  } catch (error: any) {
                    toast.error(error.message || 'VPN-Zuweisung fehlgeschlagen', { id: `vpn-${account.id}` });
                  }
                }}
              >
                <Shield className="w-4 h-4" />
                VPN zuweisen
              </Button>
            )}
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                onClick={() => disconnectAccount(account.id)}
                disabled={disconnecting === account.id || account.status !== "connected"}
                title={account.status !== "connected" ? "Nur verbundene Accounts können getrennt werden" : "Instanz trennen"}
              >
                {disconnecting === account.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1" 
                onClick={() => {
                  setQrCode(null);
                  setInitializingAccount(account.id);
                  setOpen(true);
                  initializeWhatsApp(account.id);
                }}
              >
                {account.status === "connected" ? "Neu verbinden" : "Verbinden"}
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
    </div>
  );
};

export default Accounts;