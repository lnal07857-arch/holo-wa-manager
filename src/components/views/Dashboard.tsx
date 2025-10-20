import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Dashboard = () => {
  const stats = [
    { label: "Aktive Accounts", value: "3", icon: Users, color: "text-primary" },
    { label: "Offene Chats", value: "127", icon: MessageSquare, color: "text-accent" },
    { label: "Gesendete Nachrichten", value: "1,543", icon: Send, color: "text-primary" },
    { label: "Erfolgsrate", value: "98.5%", icon: CheckCircle2, color: "text-green-600" },
  ];

  const recentAccounts = [
    { name: "Account 1", phone: "+49 170 1234567", status: "Verbunden", chats: 45 },
    { name: "Account 2", phone: "+49 171 2345678", status: "Verbunden", chats: 38 },
    { name: "Account 3", phone: "+49 172 3456789", status: "Verbunden", chats: 44 },
  ];

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
          <div className="space-y-4">
            {recentAccounts.map((account, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="text-sm text-muted-foreground">{account.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{account.chats} Chats</p>
                  </div>
                  <Badge variant="default" className="bg-green-600">
                    {account.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
