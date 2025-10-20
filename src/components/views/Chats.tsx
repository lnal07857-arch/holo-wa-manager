import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Paperclip, Phone, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const Chats = () => {
  const [selectedChat, setSelectedChat] = useState<number | null>(0);

  const chats = [
    { id: 0, name: "Max Mustermann", account: "Account 1", lastMessage: "Vielen Dank für die Info!", time: "10:30", unread: 2 },
    { id: 1, name: "Anna Schmidt", account: "Account 2", lastMessage: "Wann können wir uns treffen?", time: "09:15", unread: 0 },
    { id: 2, name: "Peter Wagner", account: "Account 1", lastMessage: "Die Rechnung ist angekommen", time: "Gestern", unread: 1 },
    { id: 3, name: "Lisa Müller", account: "Account 3", lastMessage: "Perfekt, bis dann!", time: "Gestern", unread: 0 },
  ];

  const messages = [
    { id: 1, text: "Hallo, wann ist mein nächster Termin?", sender: "contact", time: "10:25" },
    { id: 2, text: "Guten Tag! Ihr Termin ist am Montag, 15. Januar um 14:00 Uhr.", sender: "me", time: "10:27" },
    { id: 3, text: "Vielen Dank für die Info!", sender: "contact", time: "10:30" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Chats</h2>
        <p className="text-muted-foreground">Alle Konversationen im Überblick</p>
      </div>

      <Card className="h-[calc(100vh-200px)]">
        <CardContent className="p-0 h-full">
          <div className="grid grid-cols-[350px_1fr] h-full">
            {/* Chat List */}
            <div className="border-r flex flex-col">
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Chats durchsuchen..." className="pl-9" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`p-4 cursor-pointer hover:bg-muted transition-colors ${
                      selectedChat === chat.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedChat(chat.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-semibold text-primary">{chat.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold truncate">{chat.name}</p>
                          <span className="text-xs text-muted-foreground">{chat.time}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                          {chat.unread > 0 && (
                            <Badge className="ml-2 rounded-full">{chat.unread}</Badge>
                          )}
                        </div>
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {chat.account}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>

            {/* Chat View */}
            {selectedChat !== null ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-semibold text-primary">
                        {chats[selectedChat].name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold">{chats[selectedChat].name}</p>
                      <Badge variant="secondary" className="text-xs">
                        {chats[selectedChat].account}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Video className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender === "me" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            message.sender === "me"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm">{message.text}</p>
                          <span className="text-xs opacity-70 mt-1 block">{message.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Input placeholder="Nachricht eingeben..." className="flex-1" />
                    <Button size="icon">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Wählen Sie einen Chat aus
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Chats;
