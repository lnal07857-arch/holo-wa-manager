import { MessageSquare, Users, FileText, Send, LayoutDashboard, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar = ({ activeView, onViewChange }: SidebarProps) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "accounts", label: "Accounts", icon: Users },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "templates", label: "Vorlagen", icon: FileText },
    { id: "bulk", label: "Bulk Sender", icon: Send },
    { id: "settings", label: "Einstellungen", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary-foreground" />
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
          return (
            <Button
              key={item.id}
              variant={activeView === item.id ? "default" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 transition-all",
                activeView === item.id && "shadow-md"
              )}
              onClick={() => onViewChange(item.id)}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
