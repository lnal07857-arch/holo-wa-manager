import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/views/Dashboard";
import Accounts from "@/components/views/Accounts";
import Chats from "@/components/views/Chats";
import Templates from "@/components/views/Templates";
import BulkSender from "@/components/views/BulkSender";

const Index = () => {
  const [activeView, setActiveView] = useState("dashboard");

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
        <div className="container mx-auto p-8">{renderView()}</div>
      </main>
    </div>
  );
};

export default Index;
