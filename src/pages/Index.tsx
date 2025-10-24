import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/views/Dashboard";
import Accounts from "@/components/views/Accounts";
import Chats from "@/components/views/Chats";
import Templates from "@/components/views/Templates";
import BulkSender from "@/components/views/BulkSender";
import { AutoChat } from "@/components/views/AutoChat";
import { FollowUp } from "@/components/views/FollowUp";
import { ServerStatus } from "@/components/views/ServerStatus";
import { useAuth } from "@/hooks/useAuth";
import { useMessagesContext } from "@/contexts/MessagesContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import bgImage from "@/assets/whatsapp-business-bg.png";
const Index = () => {
  const [activeView, setActiveView] = useState("dashboard");
  const {
    user,
    loading,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const { chatGroups } = useMessagesContext();
  
  // Calculate total unread chat count (not message count)
  const totalUnreadCount = useMemo(() => {
    return chatGroups.filter(chat => chat.unread_count > 0).length;
  }, [chatGroups]);
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Lädt...</p>
      </div>;
  }
  if (!user) {
    return null;
  }
  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <Dashboard />;
      case "accounts":
        return <Accounts />;
      case "chats":
        return <Chats />;
      case "templates":
        return <Templates />;
      case "bulk":
        return <BulkSender />;
      case "autochat":
        return <AutoChat />;
      case "followup":
        return <FollowUp />;
      case "server-status":
        return <ServerStatus />;
      default:
        return <Dashboard />;
    }
  };
  return <div className="flex h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} unreadCount={totalUnreadCount} />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b p-4 flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">Angemeldet als</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            Abmelden
          </Button>
        </div>
        <div style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }} className="container mx-auto p-8 relative rounded bg-zinc-50">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded" />
          <div className="relative z-10">
            {renderView()}
          </div>
        </div>
      </main>
    </div>;
};
export default Index;