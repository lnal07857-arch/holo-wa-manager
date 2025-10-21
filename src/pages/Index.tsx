import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/views/Dashboard";
import Accounts from "@/components/views/Accounts";
import Chats from "@/components/views/Chats";
import Templates from "@/components/views/Templates";
import BulkSender from "@/components/views/BulkSender";
import { FollowUp } from "@/components/views/FollowUp";
import Settings from "@/components/views/Settings";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import patternBg from "@/assets/whatsapp-pattern-bg.png";
import headerBg from "@/assets/header-bg.png";

const Index = () => {
  const [activeView, setActiveView] = useState("dashboard");
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Lädt...</p>
      </div>
    );
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
      case "followup":
        return <FollowUp />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        <div 
          className="border-b p-4 flex justify-between items-center relative overflow-hidden"
          style={{
            backgroundImage: `url(${headerBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" />
          <div className="relative z-10">
            <p className="text-sm text-muted-foreground">Angemeldet als</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="gap-2 relative z-10">
            <LogOut className="w-4 h-4" />
            Abmelden
          </Button>
        </div>
        <div 
          className="container mx-auto p-8 relative"
          style={{
            backgroundImage: `url(${patternBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div 
            className="absolute inset-0 bg-background/85 pointer-events-none"
            style={{ zIndex: 0 }}
          />
          <div className="relative" style={{ zIndex: 1 }}>
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
