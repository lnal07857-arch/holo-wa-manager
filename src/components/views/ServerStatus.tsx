import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server, Activity, Clock } from "lucide-react";

export function ServerStatus() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["server-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("wa-gateway", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const formatMemory = (bytes: number) => {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Server Status</h2>
        <p className="text-muted-foreground">
          Überwachung der WhatsApp-Server-Ressourcen
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktive Clients</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.activeClients || 0}</div>
            <p className="text-xs text-muted-foreground">
              Verbundene WhatsApp-Instanzen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Speicher</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.memory ? formatMemory(status.memory.heapUsed) : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              Heap: {status?.memory ? formatMemory(status.memory.heapTotal) : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.uptime ? formatUptime(status.uptime) : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Server-Laufzeit</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Details</CardTitle>
          <CardDescription>
            Liste aller aktiven WhatsApp-Verbindungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!status?.clients || status.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine aktiven Clients</p>
          ) : (
            <div className="space-y-3">
              {status.clients.map((client: any) => (
                <div
                  key={client.accountId}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{client.accountId}</p>
                    <p className="text-xs text-muted-foreground">
                      Inaktiv seit: {client.idleMinutes} Minuten
                    </p>
                  </div>
                  <Badge
                    variant={
                      client.idleMinutes > 20 ? "destructive" : "default"
                    }
                  >
                    {client.idleMinutes > 20 ? "Inaktiv" : "Aktiv"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
