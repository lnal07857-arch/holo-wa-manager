import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWarmupStats, useWarmupDailyHistory, computeAvgDaily, computeAccountAge, getPhaseFromAge, isBulkReady } from "@/hooks/useWarmupStats";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { PhaseSelector } from "@/components/PhaseSelector";
import { 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Clock,
  Shield,
  Activity,
  PlayCircle
} from "lucide-react";

export const WarmupAccountStats = () => {
  const { data: warmupStats, isLoading: statsLoading, refetch: refetchWarmupStats } = useWarmupStats();
  const { accounts, isLoading: accountsLoading } = useWhatsAppAccounts();

  if (statsLoading || accountsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Keine WhatsApp Accounts gefunden. Füge zuerst Accounts hinzu.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Merge accounts with their warmup stats
  const accountsWithStats = accounts.map(account => {
    const stats = warmupStats?.find(s => s.account_id === account.id);
    return {
      ...account,
      warmup_stats: stats || null
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Account Warm-up Status</h2>
        <p className="text-muted-foreground">
          Detaillierte Statistiken und Bulk-Readiness für jeden Account
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {accountsWithStats.map((account) => (
          <AccountStatCard key={account.id} account={account} onPhaseChange={refetchWarmupStats} />
        ))}
      </div>
    </div>
  );
};

interface AccountStatCardProps {
  account: any;
  onPhaseChange: () => void;
}

const AccountStatCard = ({ account, onPhaseChange }: AccountStatCardProps) => {
  const stat = account.warmup_stats;
  
  // If no warmup stats exist yet, show a starter card
  if (!stat) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-gray-50 dark:bg-gray-950/30 border-b-4 border-gray-400">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{account.account_name}</CardTitle>
              <Badge className="bg-gray-500 text-white">NICHT GESTARTET</Badge>
            </div>
            <PlayCircle className="w-8 h-8 text-gray-400" />
          </div>
          
          <CardDescription className="font-medium mb-3">
            Noch keine Warm-up Aktivität
          </CardDescription>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-background rounded-lg border">
              <div className="text-2xl font-bold text-gray-400">0</div>
              <div className="text-xs text-muted-foreground mt-1">Nachrichten</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <div className="text-2xl font-bold text-gray-400">0</div>
              <div className="text-xs text-muted-foreground mt-1">Kontakte</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <div className="text-2xl font-bold text-gray-400">0%</div>
              <div className="text-xs text-muted-foreground mt-1">Bereitschaft</div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
            <PlayCircle className="w-10 h-10 mx-auto mb-2 text-blue-600" />
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
              Starte den Auto-Chat
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Dieser Account benötigt Warm-up bevor er für Bulk-Kampagnen verwendet werden kann.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { data: dailyHistory } = useWarmupDailyHistory(stat.account_id);
  const avgDaily = dailyHistory ? computeAvgDaily(dailyHistory, 7) : 0;
  const accountAge = computeAccountAge(stat.created_at);
  const uniqueContactsCount = Object.keys(stat.unique_contacts || {}).length;
  const bulkReady = isBulkReady(stat, accountAge);

  // Calculate progress percentages
  const messagesProgress = Math.min((stat.sent_messages / 500) * 100, 100);
  const contactsProgress = Math.min((uniqueContactsCount / 15) * 100, 100);
  const ageProgress = Math.min((accountAge / 21) * 100, 100);
  
  // Overall readiness score
  const readinessScore = Math.round((messagesProgress + contactsProgress + ageProgress) / 3);

  // Use phase from DB or calculate based on messages sent
  const currentPhase = stat.phase || "phase1";
  let phaseLabel = "Phase 1: Sanft";
  let phaseColor = "bg-blue-500";
  
  if (currentPhase === "phase3") {
    phaseLabel = "Phase 3: Intensiv";
    phaseColor = "bg-green-500";
  } else if (currentPhase === "phase2") {
    phaseLabel = "Phase 2: Moderat";
    phaseColor = "bg-yellow-500";
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`${
        bulkReady ? 'bg-green-50 dark:bg-green-950/30 border-b-4 border-green-500' :
        readinessScore >= 66 ? 'bg-yellow-50 dark:bg-yellow-950/30 border-b-4 border-yellow-500' :
        readinessScore >= 33 ? 'bg-blue-50 dark:bg-blue-950/30 border-b-4 border-blue-500' :
        'bg-red-50 dark:bg-red-950/30 border-b-4 border-red-500'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">{account.account_name}</CardTitle>
            <Badge className={`${phaseColor} text-white`}>
              {currentPhase.toUpperCase()}
            </Badge>
          </div>
          {bulkReady && (
            <CheckCircle className="w-8 h-8 text-green-600" />
          )}
        </div>
        
        <div className="mb-3">
          <PhaseSelector
            accountId={account.id}
            accountName={account.account_name}
            currentPhase={currentPhase}
            onPhaseChange={onPhaseChange}
          />
        </div>
        
        <CardDescription className="font-medium mb-3">{phaseLabel}</CardDescription>
        
        {/* Nachrichtenanzahl und Bereitschaft prominent */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-background rounded-lg border">
            <div className="text-2xl font-bold">{stat.sent_messages}</div>
            <div className="text-xs text-muted-foreground mt-1">Nachrichten</div>
          </div>
          <div className="text-center p-3 bg-background rounded-lg border">
            <div className="text-2xl font-bold">{uniqueContactsCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Kontakte</div>
          </div>
          <div className="text-center p-3 bg-background rounded-lg border">
            <div className={`text-2xl font-bold ${
              bulkReady ? 'text-green-600' :
              readinessScore >= 66 ? 'text-yellow-600' :
              readinessScore >= 33 ? 'text-blue-600' :
              'text-red-600'
            }`}>{readinessScore}%</div>
            <div className="text-xs text-muted-foreground mt-1">Bereitschaft</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Messages Sent */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                Nachrichten
              </span>
              <span className="text-xs font-medium">
                {stat.sent_messages} / 500
              </span>
            </div>
            <Progress value={messagesProgress} className="h-2" />
          </div>

          {/* Unique Contacts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                Kontakte
              </span>
              <span className="text-xs font-medium">
                {uniqueContactsCount} / 15
              </span>
            </div>
            <Progress value={contactsProgress} className="h-2" />
          </div>

          {/* Account Age */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Age
              </span>
              <span className="text-xs font-medium">
                {accountAge} / 21
              </span>
            </div>
            <Progress value={ageProgress} className="h-2" />
          </div>

          {/* Blocks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {stat.blocks > 0 ? (
                  <AlertCircle className="w-3 h-3 text-destructive" />
                ) : (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                )}
                Blocks
              </span>
              <span className={`text-xs font-medium ${stat.blocks > 0 ? 'text-destructive' : 'text-green-500'}`}>
                {stat.blocks}
              </span>
            </div>
            <Progress 
              value={stat.blocks === 0 ? 100 : 0} 
              className="h-2"
            />
          </div>
        </div>

        {/* Bulk Ready Checklist */}
        {!bulkReady && (
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <p className="text-xs font-medium mb-2">Bulk-Ready Anforderungen:</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                {stat.sent_messages >= 500 ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={stat.sent_messages >= 500 ? "text-green-600" : ""}>
                  500+ Nachrichten ({stat.sent_messages}/500)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {uniqueContactsCount >= 15 ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={uniqueContactsCount >= 15 ? "text-green-600" : ""}>
                  15+ Kontakte ({uniqueContactsCount}/15)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {stat.blocks === 0 ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={stat.blocks === 0 ? "text-green-600" : ""}>
                  Keine Blocks (aktuell: {stat.blocks})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {accountAge >= 21 ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={accountAge >= 21 ? "text-green-600" : ""}>
                  21+ Tage alt ({accountAge}/21)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {bulkReady && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Bereit für Bulk-Kampagnen!</p>
                <p className="text-xs text-green-700 mt-1">
                  Dieser Account hat alle Anforderungen erfüllt und kann für größere Kampagnen verwendet werden.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
