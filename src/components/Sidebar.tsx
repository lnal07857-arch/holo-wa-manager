import { MessageSquare, Users, FileText, Send, LayoutDashboard, Settings, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logo from "@/assets/whatsapp-business-logo.png";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  unreadCount?: number;
}

const Sidebar = ({ activeView, onViewChange, unreadCount = 0 }: SidebarProps) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "accounts", label: "Accounts", icon: Users },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "templates", label: "Vorlagen", icon: FileText },
    { id: "bulk", label: "Bulk Sender", icon: Send },
    { id: "autochat", label: "Warm-up", icon: Zap },
    { id: "followup", label: "Follow-up", icon: Clock },
    { id: "settings", label: "Einstellungen", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
            <img src={logo} alt="WhatsApp Business" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <h1 className="font-bold text-lg">WhatsApp Manager</h1>
            <p className="text-xs text-muted-foreground">Multi-Account Tool</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const showBadge = item.id === "chats" && unreadCount > 0;
          
          return (
            <Button
              key={item.id}
              variant={activeView === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 transition-all relative",
                activeView === item.id && "shadow-md"
              )}
              onClick={() => onViewChange(item.id)}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {showBadge && (
                <Badge className="ml-auto rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
