import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWarmupStats, useWarmupDailyHistory, computeAvgDaily, isBulkReady } from "@/hooks/useWarmupStats";
import { 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Clock,
  Shield,
  Activity
} from "lucide-react";

export const WarmupAccountStats = () => {
  const { data: warmupStats, isLoading } = useWarmupStats();

  if (isLoading) {
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

  if (!warmupStats || warmupStats.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Keine Warm-up Statistiken verfügbar. Starte den Auto-Chat um Daten zu sammeln.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Account Warm-up Status</h2>
        <p className="text-muted-foreground">
          Detaillierte Statistiken und Bulk-Readiness für jeden Account
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {warmupStats.map((stat) => (
          <AccountStatCard key={stat.id} stat={stat} />
        ))}
      </div>
    </div>
  );
};

interface AccountStatCardProps {
  stat: any;
}

const AccountStatCard = ({ stat }: AccountStatCardProps) => {
  const { data: dailyHistory } = useWarmupDailyHistory(stat.account_id);
  const avgDaily = dailyHistory ? computeAvgDaily(dailyHistory, 7) : 0;
  const uniqueContactsCount = Object.keys(stat.unique_contacts || {}).length;
  const bulkReady = isBulkReady(stat, avgDaily);

  // Calculate progress percentages
  const messagesProgress = Math.min((stat.sent_messages / 500) * 100, 100);
  const contactsProgress = Math.min((uniqueContactsCount / 15) * 100, 100);
  const avgDailyProgress = Math.min((avgDaily / 50) * 100, 100);
  
  // Overall readiness score
  const readinessScore = Math.round((messagesProgress + contactsProgress + avgDailyProgress) / 3);

  // Determine phase based on messages sent
  let phase = "phase1";
  let phaseLabel = "Phase 1: Sanft";
  let phaseColor = "bg-blue-500";
  
  if (stat.sent_messages >= 150) {
    phase = "phase3";
    phaseLabel = "Phase 3: Intensiv";
    phaseColor = "bg-green-500";
  } else if (stat.sent_messages >= 50) {
    phase = "phase2";
    phaseLabel = "Phase 2: Moderat";
    phaseColor = "bg-yellow-500";
  }

  return (
    <Card className={bulkReady ? "border-green-500 border-2" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <CardTitle className="text-xl">{stat.account_name}</CardTitle>
            
            {/* Phase Indicator - Prominent */}
            <div className="flex items-center gap-3">
              <Badge className={phaseColor}>{phase.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">{phaseLabel}</span>
            </div>
            <Progress 
              value={phase === 'phase1' ? 33 : phase === 'phase2' ? 66 : 100} 
              className="h-2 w-48"
            />
          </div>
          
          {bulkReady ? (
            <Badge className="bg-green-500 text-white">
              <CheckCircle className="w-3 h-3 mr-1" />
              Bulk Ready
            </Badge>
          ) : stat.status === 'blocked' ? (
            <Badge variant="destructive">
              <AlertCircle className="w-3 h-3 mr-1" />
              Blockiert
            </Badge>
          ) : (
            <Badge variant="secondary">
              <Clock className="w-3 h-3 mr-1" />
              Warming
            </Badge>
          )}
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

          {/* Average Daily */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Ø täglich (7d)
              </span>
              <span className="text-xs font-medium">
                {avgDaily} / 50
              </span>
            </div>
            <Progress value={avgDailyProgress} className="h-2" />
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
                {avgDaily >= 50 ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                )}
                <span className={avgDaily >= 50 ? "text-green-600" : ""}>
                  50+ Ø täglich ({avgDaily}/50)
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
