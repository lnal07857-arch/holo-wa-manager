import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";

const Dashboard = () => {
  const { accounts, isLoading } = useWhatsAppAccounts();

  const connectedAccounts = accounts.filter((a) => a.status === "connected").length;

  const stats = [
    { label: "Aktive Accounts", value: connectedAccounts.toString(), icon: Users, color: "text-primary" },
    { label: "Offene Chats", value: "0", icon: MessageSquare, color: "text-accent" },
    { label: "Gesendete Nachrichten", value: "0", icon: Send, color: "text-primary" },
    { label: "Erfolgsrate", value: "-", icon: CheckCircle2, color: "text-green-600" },
  ];

  if (isLoading) {
    return <div>Lädt...</div>;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-2xl blur-3xl -z-10" />
        <div className="relative">
          <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Dashboard
          </h2>
          <p className="text-muted-foreground mt-2 text-lg">Übersicht über alle Ihre WhatsApp-Konten</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={stat.label} 
              className="relative overflow-hidden group hover:shadow-xl transition-all duration-300 hover:scale-105 hover:-translate-y-1 border-2"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {stat.label}
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-2 shadow-lg overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary" />
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
          <CardTitle className="text-2xl flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            Aktive Accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {accounts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-10 h-10 text-primary/50" />
              </div>
              <p className="text-muted-foreground text-lg">
                Noch keine Accounts vorhanden
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Fügen Sie Ihren ersten Account hinzu!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.slice(0, 3).map((account, index) => (
                <div
                  key={account.id}
                  className="group relative flex items-center justify-between p-5 rounded-xl border-2 bg-card hover:bg-accent/5 hover:border-primary/50 hover:shadow-lg transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-lg group-hover:text-primary transition-colors">
                        {account.account_name}
                      </p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {account.phone_number}
                      </p>
                    </div>
                  </div>
                  <div className="relative flex items-center gap-4">
                    <Badge 
                      variant={account.status === "connected" ? "default" : "secondary"} 
                      className={`${
                        account.status === "connected" 
                          ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/30" 
                          : "bg-muted"
                      } px-4 py-2 text-sm font-semibold transition-all`}
                    >
                      {account.status === "connected" ? "Verbunden" : "Getrennt"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
