import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWarmupStats, useWarmupDailyHistory, computeAvgDaily, computeAccountAge, getPhaseFromAge, isBulkReady } from "@/hooks/useWarmupStats";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { PhaseSelector } from "@/components/PhaseSelector";
import { 
  CheckCircle, 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Clock,
  Shield,
  Activity,
  PlayCircle,
  GripVertical
} from "lucide-react";
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const WarmupAccountStats = () => {
  const { data: warmupStats, isLoading: statsLoading, refetch: refetchWarmupStats } = useWarmupStats();
  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useWhatsAppAccounts();
  const [sortedAccounts, setSortedAccounts] = useState<any[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Merge accounts with their warmup stats and sort by display_order
  const accountsWithStats = accounts
    ? accounts
        .map(account => {
          const stats = warmupStats?.find(s => s.account_id === account.id);
          return {
            ...account,
            warmup_stats: stats || null
          };
        })
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    : [];

  // Sync sortedAccounts with accountsWithStats when accounts change
  useEffect(() => {
    if (accounts) {
      setSortedAccounts(accountsWithStats);
    }
  }, [accounts, warmupStats]);

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
        setSortedAccounts(accountsWithStats);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Account Warm-up Status</h2>
        <p className="text-muted-foreground">
          Detaillierte Statistiken und Bulk-Readiness für jeden Account. Ziehe die Accounts, um sie neu anzuordnen.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedAccounts.map(acc => acc.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-6 md:grid-cols-2">
            {sortedAccounts.map((account) => (
              <SortableAccountCard key={account.id} account={account} onPhaseChange={refetchWarmupStats} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

interface AccountStatCardProps {
  account: any;
  onPhaseChange: () => void;
}

const SortableAccountCard = ({ account, onPhaseChange }: AccountStatCardProps) => {
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
      <AccountStatCard 
        account={account} 
        onPhaseChange={onPhaseChange}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};

interface AccountStatCardProps {
  account: any;
  onPhaseChange: () => void;
  dragHandleProps?: any;
}

const AccountStatCard = ({ account, onPhaseChange, dragHandleProps }: AccountStatCardProps) => {
  const stat = account.warmup_stats;
  const { data: dailyHistory } = useWarmupDailyHistory(stat?.account_id || '');
  
  // If no warmup stats exist yet, show a starter card
  if (!stat) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-gray-50 dark:bg-gray-950/30 border-b-4 border-gray-400">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {dragHandleProps && (
                <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <CardTitle className="text-xl">{account.account_name}</CardTitle>
              <Badge className="bg-gray-500 text-white">NICHT GESTARTET</Badge>
            </div>
            <PlayCircle className="w-8 h-8 text-gray-400" />
          </div>
          
          <CardDescription>
            Noch keine Warm-up Aktivität
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
            <PlayCircle className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Starte den Auto-Chat um Warm-up zu beginnen
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgDaily = dailyHistory ? computeAvgDaily(dailyHistory, 7) : 0;
  const accountAge = computeAccountAge(stat.created_at);
  const uniqueContactsCount = Object.keys(stat.unique_contacts || {}).length;
  const bulkReady = isBulkReady(stat);

  // Calculate progress percentages
  const messagesProgress = Math.min((stat.sent_messages / 500) * 100, 100);
  const contactsProgress = Math.min((uniqueContactsCount / 15) * 100, 100);
  
  // Overall readiness score (only messages and contacts)
  const readinessScore = Math.round((messagesProgress + contactsProgress) / 2);

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
            {dragHandleProps && (
              <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
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
        
        <CardDescription className="font-medium">{phaseLabel}</CardDescription>
      </CardHeader>
      
      <CardContent className="pt-4 space-y-3">
        {/* Main Stats with Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4" />
              Nachrichten
            </span>
            <span className="font-semibold">{stat.sent_messages} / 500</span>
          </div>
          <Progress value={messagesProgress} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Kontakte
            </span>
            <span className="font-semibold">{uniqueContactsCount} / 15</span>
          </div>
          <Progress value={contactsProgress} className="h-2" />
        </div>

        <div className="flex items-center justify-between text-sm pt-1 border-t">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Alter
          </span>
          <span className="font-semibold">{accountAge} Tage</span>
        </div>

        <div className="flex items-center justify-between text-sm border-t pt-2">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Bereitschaft
          </span>
          <span className={`font-bold text-lg ${
            bulkReady ? 'text-green-600' :
            readinessScore >= 66 ? 'text-yellow-600' :
            readinessScore >= 33 ? 'text-blue-600' :
            'text-red-600'
          }`}>{readinessScore}%</span>
        </div>

        {bulkReady && (
          <div className="p-2.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm font-medium text-green-900 dark:text-green-100">Bereit für Bulk-Kampagnen!</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
