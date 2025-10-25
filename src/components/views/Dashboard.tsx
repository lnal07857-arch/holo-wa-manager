import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Send, CheckCircle2, Zap, TrendingUp, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { useWarmupStats, useWarmupDailyHistory, computeAvgDaily, isBulkReady } from "@/hooks/useWarmupStats";
import { Progress } from "@/components/ui/progress";

const Dashboard = () => {
  const { accounts, isLoading } = useWhatsAppAccounts();
  const { data: warmupStats, isLoading: isLoadingWarmup } = useWarmupStats();

  const connectedAccounts = accounts.filter((a) => a.status === "connected").length;

  // Calculate warmup statistics without using hooks inside
  const warmupMetrics = warmupStats?.reduce((acc, stat) => {
    const uniqueContactsCount = Object.keys(stat.unique_contacts || {}).length;
    
    // Simple bulk ready check without daily history for dashboard overview
    const bulkReady = stat.sent_messages >= 500 && 
                      uniqueContactsCount >= 15 && 
                      stat.blocks === 0;

    // Determine phase
    let phase = 1;
    if (stat.sent_messages >= 150) phase = 3;
    else if (stat.sent_messages >= 50) phase = 2;

    // Calculate readiness
    const messagesProgress = Math.min((stat.sent_messages / 500) * 100, 100);
    const contactsProgress = Math.min((uniqueContactsCount / 15) * 100, 100);
    const readinessScore = Math.round((messagesProgress + contactsProgress) / 2);

    return {
      phase1Count: acc.phase1Count + (phase === 1 ? 1 : 0),
      phase2Count: acc.phase2Count + (phase === 2 ? 1 : 0),
      phase3Count: acc.phase3Count + (phase === 3 ? 1 : 0),
      bulkReadyCount: acc.bulkReadyCount + (bulkReady ? 1 : 0),
      totalReadiness: acc.totalReadiness + readinessScore,
      accountCount: acc.accountCount + 1,
    };
  }, {
    phase1Count: 0,
    phase2Count: 0,
    phase3Count: 0,
    bulkReadyCount: 0,
    totalReadiness: 0,
    accountCount: 0,
  }) || { phase1Count: 0, phase2Count: 0, phase3Count: 0, bulkReadyCount: 0, totalReadiness: 0, accountCount: 0 };

  const avgReadiness = warmupMetrics.accountCount > 0 
    ? Math.round(warmupMetrics.totalReadiness / warmupMetrics.accountCount) 
    : 0;

  const stats = [
    { label: "Aktive Accounts", value: connectedAccounts.toString(), icon: Users, color: "text-primary" },
    { label: "Offene Chats", value: "0", icon: MessageSquare, color: "text-accent" },
    { label: "Gesendete Nachrichten", value: "0", icon: Send, color: "text-primary" },
    { label: "Erfolgsrate", value: "-", icon: CheckCircle2, color: "text-green-600" },
  ];

  if (isLoading) {
    return <div>Lädt...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Übersicht über alle Ihre WhatsApp-Konten</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Warmup Stats Overview */}
      {!isLoadingWarmup && warmupStats && warmupStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Warm-up Übersicht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Phase Distribution */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  Phasen-Verteilung
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Phase 1 (Sanft)</span>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                      {warmupMetrics.phase1Count}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Phase 2 (Moderat)</span>
                    <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
                      {warmupMetrics.phase2Count}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Phase 3 (Intensiv)</span>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                      {warmupMetrics.phase3Count}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Bulk Ready */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  Bulk-Bereitschaft
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-green-600">
                    {warmupMetrics.bulkReadyCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    von {warmupMetrics.accountCount} Accounts
                  </div>
                </div>
                <Progress 
                  value={warmupMetrics.accountCount > 0 ? (warmupMetrics.bulkReadyCount / warmupMetrics.accountCount) * 100 : 0} 
                  className="h-2"
                />
              </div>

              {/* Average Readiness */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Ø Bereitschaft
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold">
                    {avgReadiness}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    über alle Accounts
                  </div>
                </div>
                <Progress value={avgReadiness} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aktive Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Noch keine Accounts vorhanden. Fügen Sie Ihren ersten Account hinzu!
            </p>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{account.account_name}</p>
                      <p className="text-sm text-muted-foreground">{account.phone_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={account.status === "connected" ? "default" : "secondary"} className={account.status === "connected" ? "bg-green-600" : ""}>
                      {account.status === "connected" ? "Verbunden" : "Getrennt"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
