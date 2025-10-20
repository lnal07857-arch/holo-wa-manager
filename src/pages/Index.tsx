import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/views/Dashboard";
import Accounts from "@/components/views/Accounts";
import Chats from "@/components/views/Chats";
import Templates from "@/components/views/Templates";
import BulkSender from "@/components/views/BulkSender";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

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
      case "settings":
        return (
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-4">Einstellungen</h2>
            <p className="text-muted-foreground">Einstellungen werden demnächst verfügbar sein.</p>
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
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
        <div className="container mx-auto p-8">{renderView()}</div>
      </main>
    </div>
  );
};

export default Index;
