import { MessageSquare, Users, FileText, Send, Clock, Zap, Server, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/whatsapp-business-logo.png";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  unreadCount?: number;
  collapsible?: "offcanvas" | "icon" | "none";
  variant?: "sidebar" | "floating" | "inset";
  side?: "left" | "right";
  className?: string;
}

const Sidebar = ({ activeView, onViewChange, unreadCount = 0, collapsible = "offcanvas", variant = "sidebar", side = "left", className }: SidebarProps) => {
  const sidebar = useSidebar();
  const open = sidebar?.open ?? true; // Default to true for mobile Sheet context
  
  const menuItems = [
    { id: "accounts", label: "Accounts", icon: Users },
    { id: "chats", label: "Chats", icon: MessageSquare },
    { id: "templates", label: "Vorlagen", icon: FileText },
    { id: "bulk", label: "Bulk Sender", icon: Send },
    { id: "autochat", label: "Warm-up", icon: Zap },
    { id: "followup", label: "Follow-up", icon: Clock },
    { id: "vpn-proxies", label: "VPN & Proxies", icon: Shield },
    { id: "server-status", label: "Server Status", icon: Server },
  ];

  return (
    <SidebarRoot collapsible={collapsible} variant={variant} side={side} className={className}>
      <SidebarContent>
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center">
              <img src={logo} alt="WhatsApp Business" className="w-10 h-10 rounded-lg" />
            </div>
            {open && (
              <div>
                <h1 className="font-bold text-lg">WhatsApp Manager</h1>
                <p className="text-xs text-muted-foreground">Multi-Account Tool</p>
              </div>
            )}
          </div>
        </div>
        
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const showBadge = item.id === "chats" && unreadCount > 0;
                
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => onViewChange(item.id)}
                      isActive={activeView === item.id}
                      className={cn(
                        "w-full gap-3 transition-all relative",
                        activeView === item.id && "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {open && <span>{item.label}</span>}
                      {showBadge && open && (
                        <Badge className="ml-auto rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                      {showBadge && !open && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  );
};

export default Sidebar;
