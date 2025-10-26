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
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut, Menu, MessageSquare, Users, FileText, Send, LayoutDashboard, Clock, Zap, Server } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import bgImage from "@/assets/whatsapp-business-bg.png";
const Index = () => {
  const [activeView, setActiveView] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "accounts", label: "Accounts", icon: Users },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "templates", label: "Vorlagen", icon: FileText },
    { id: "bulk", label: "Bulk Sender", icon: Send },
    { id: "autochat", label: "Warm-up", icon: Zap },
    { id: "followup", label: "Follow-up", icon: Clock },
    { id: "server-status", label: "Server Status", icon: Server },
  ];

  return (
    <div className="flex h-screen w-full bg-background flex-col">
      {/* Desktop Header with Navigation */}
      <div className="border-b p-4 flex justify-between items-center gap-2">
        <div className="flex items-center gap-4 w-full">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarProvider defaultOpen={true}>
                <Sidebar 
                  collapsible="none"
                  className="h-full"
                  activeView={activeView} 
                  onViewChange={(view) => {
                    setActiveView(view);
                    setMobileMenuOpen(false);
                  }} 
                  unreadCount={totalUnreadCount} 
                />
              </SidebarProvider>
            </SheetContent>
          </Sheet>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              const showBadge = item.id === "chats" && totalUnreadCount > 0;
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  onClick={() => setActiveView(item.id)}
                  className="gap-2 relative"
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {showBadge && (
                    <Badge className="ml-1 rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
                      {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4 ml-auto">
            <div className="hidden md:block">
              <p className="text-sm text-muted-foreground">Angemeldet als</p>
              <p className="font-medium text-sm">{user.email}</p>
            </div>
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto w-full">
        <div 
          style={{
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
          }} 
          className="container mx-auto p-4 sm:p-8 relative rounded bg-zinc-50"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded" />
          <div className="relative z-10">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
};
export default Index;