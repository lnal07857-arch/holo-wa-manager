import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Paperclip, Phone, Video, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplates } from "@/hooks/useTemplates";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Chats = () => {
  const [selectedChat, setSelectedChat] = useState<number | null>(0);
  const [messageInput, setMessageInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "favorites" | "groups">("all");
  const [messages, setMessages] = useState([
    { id: 1, text: "Hallo, wann ist mein nächster Termin?", sender: "contact", time: "10:25" },
    { id: 2, text: "Guten Tag! Ihr Termin ist am Montag, 15. Januar um 14:00 Uhr.", sender: "me", time: "10:27" },
    { id: 3, text: "Vielen Dank für die Info!", sender: "contact", time: "10:30" },
  ]);
  const { templates, isLoading } = useTemplates();

  // Filter templates for chats only
  const chatTemplates = templates.filter(t => t.for_chats);

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newMessage = {
      id: messages.length + 1,
      text: messageInput,
      sender: "me",
      time: timeString,
    };
    
    setMessages([...messages, newMessage]);
    setMessageInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTemplateClick = (templateText: string) => {
    setMessageInput(templateText);
  };

  const handleDragStart = (e: React.DragEvent, templateText: string) => {
    e.dataTransfer.setData("text/plain", templateText);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const templateText = e.dataTransfer.getData("text/plain");
    setMessageInput(templateText);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const chats = [
    { id: 0, name: "Max Mustermann", account: "Account 1", lastMessage: "Vielen Dank für die Info!", time: "10:30", unread: 2, isFavorite: false, isGroup: false },
    { id: 1, name: "Anna Schmidt", account: "Account 2", lastMessage: "Wann können wir uns treffen?", time: "09:15", unread: 0, isFavorite: true, isGroup: false },
    { id: 2, name: "Peter Wagner", account: "Account 1", lastMessage: "Die Rechnung ist angekommen", time: "Gestern", unread: 1, isFavorite: false, isGroup: false },
    { id: 3, name: "Lisa Müller", account: "Account 3", lastMessage: "Perfekt, bis dann!", time: "Gestern", unread: 0, isFavorite: true, isGroup: false },
    { id: 4, name: "Team Verkauf", account: "Account 1", lastMessage: "Meeting um 15 Uhr", time: "Gestern", unread: 3, isFavorite: false, isGroup: true },
  ];

  // Filter chats based on selected filter
  const filteredChats = chats.filter(chat => {
    switch (chatFilter) {
      case "unread":
        return chat.unread > 0;
      case "favorites":
        return chat.isFavorite;
      case "groups":
        return chat.isGroup;
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Chats</h2>
        <p className="text-muted-foreground">Alle Konversationen im Überblick</p>
      </div>

      <Card className="h-[calc(100vh-200px)]">
        <CardContent className="p-0 h-full">
          <div className={cn(
            "grid h-full transition-all duration-300",
            showTemplates ? "grid-cols-[300px_350px_1fr]" : "grid-cols-[350px_1fr]"
          )}>
            {/* Templates List - Collapsible */}
            {showTemplates && (
              <div className="border-r flex flex-col bg-muted/30 animate-in slide-in-from-left">
                <div className="p-4 border-b bg-background flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Vorlagen für Chats</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ziehen Sie eine Vorlage ins Chat-Fenster
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTemplates(false)}
                    className="shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  {isLoading ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">Lädt...</div>
                  ) : chatTemplates.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 text-sm px-4">
                      Keine Chat-Vorlagen vorhanden.<br />
                      Aktivieren Sie Vorlagen unter "Vorlagen"
                    </div>
                  ) : (
                    <div className="space-y-2 p-3">
                      {chatTemplates.map((template) => (
                        <Card
                          key={template.id}
                          className="cursor-move hover:shadow-md transition-all hover:scale-[1.02]"
                          draggable
                          onDragStart={(e) => handleDragStart(e, template.template_text)}
                          onClick={() => handleTemplateClick(template.template_text)}
                        >
                          <CardHeader className="p-3 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <CardTitle className="text-xs font-semibold truncate">
                                  {template.template_name}
                                </CardTitle>
                                <CardDescription className="text-xs truncate">
                                  {template.category}
                                </CardDescription>
                              </div>
                              {template.placeholders.length > 0 && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {template.placeholders.length}
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {template.template_text}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {/* Chat List */}
            <div className="border-r flex flex-col relative">
              <div className="p-4 border-b space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Chats durchsuchen..." className="pl-9" />
                </div>
                
                {/* Filter Tabs */}
                <Tabs value={chatFilter} onValueChange={(v) => setChatFilter(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-4 h-9">
                    <TabsTrigger value="all" className="text-xs">Alle</TabsTrigger>
                    <TabsTrigger value="unread" className="text-xs">Ungelesen</TabsTrigger>
                    <TabsTrigger value="favorites" className="text-xs">Favoriten</TabsTrigger>
                    <TabsTrigger value="groups" className="text-xs">Gruppen</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {!showTemplates && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowTemplates(true)}
                  className="absolute top-[120px] left-2 z-10 gap-2"
                  title="Vorlagen anzeigen"
                >
                  <ChevronRight className="w-4 h-4" />
                  Vorlagen
                </Button>
              )}
              <ScrollArea className="flex-1">
                {filteredChats.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    Keine Chats gefunden
                  </div>
                 ) : (
                   filteredChats.map((chat) => (
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
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{chat.name}</p>
                            {chat.isFavorite && (
                              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                            )}
                          </div>
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
                 ))
                 )}
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
                          <p className="text-sm whitespace-pre-line leading-relaxed">{message.text}</p>
                          <span className="text-xs opacity-70 mt-2 block">{message.time}</span>
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
                    <Input
                      placeholder="Nachricht eingeben oder Vorlage hierher ziehen..."
                      className="flex-1"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                    />
                    <Button size="icon" onClick={handleSendMessage}>
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
