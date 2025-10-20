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
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Übersicht über alle Ihre WhatsApp-Konten</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktive Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Noch keine Accounts vorhanden. Fügen Sie Ihren ersten Account hinzu!
            </p>
          ) : (
            <div className="space-y-4">
              {accounts.slice(0, 3).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{account.account_name}</p>
                      <p className="text-sm text-muted-foreground">{account.phone_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={account.status === "connected" ? "default" : "secondary"} className={account.status === "connected" ? "bg-green-600" : ""}>
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
