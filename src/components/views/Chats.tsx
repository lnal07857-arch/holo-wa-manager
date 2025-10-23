import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Paperclip, Phone, Video, ChevronLeft, ChevronRight, Star, StarOff, Users, UserCheck, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplates } from "@/hooks/useTemplates";
import { useMessagesContext } from "@/contexts/MessagesContext";
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";


const Chats = () => {
  const [selectedChatKey, setSelectedChatKey] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "favorites">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMessageKeys, setExpandedMessageKeys] = useState<Set<string>>(new Set());
  const [favoriteChatKeys, setFavoriteChatKeys] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("favoriteChatKeys");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [disabledFollowUpContacts, setDisabledFollowUpContacts] = useState<Set<string>>(new Set());
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { templates, isLoading: templatesLoading } = useTemplates();
  const { chatGroups, loading: messagesLoading, addOptimisticMessage, markMessagesAsRead } = useMessagesContext();
  const { accounts } = useWhatsAppAccounts();

  // Load disabled follow-up contacts
  useEffect(() => {
    const loadDisabledContacts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("follow_up_disabled_contacts")
          .select("contact_phone")
          .eq("user_id", user.id);

        if (error) throw error;

        setDisabledFollowUpContacts(new Set(data.map(d => d.contact_phone)));
      } catch (error) {
        console.error("Error loading disabled follow-up contacts:", error);
      }
    };

    loadDisabledContacts();
  }, []);

  // Filter templates for chats only
  const chatTemplates = templates.filter(t => t.for_chats);

  // Get selected chat group
  const selectedChat = selectedChatKey 
    ? chatGroups.find(g => `${g.contact_phone}_${g.account_id}` === selectedChatKey)
    : null;

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll when messages change or chat is selected
  useEffect(() => {
    if (selectedChat) {
      scrollToBottom();
    }
  }, [selectedChat?.messages, selectedChatKey]);

  // Mark incoming messages as read when chat is opened
  useEffect(() => {
    if (!selectedChat || !selectedChatKey) return;

    const markAsRead = async () => {
      const unreadIncomingMessages = selectedChat.messages.filter(
        msg => msg.direction === "incoming" && !msg.is_read
      );

      if (unreadIncomingMessages.length === 0) return;

      const messageIds = unreadIncomingMessages.map(msg => msg.id);

      // Optimistic update - update UI immediately
      markMessagesAsRead(selectedChatKey, messageIds);

      // Update database
      try {
        const { error } = await supabase
          .from("messages")
          .update({ is_read: true })
          .in("id", messageIds);

        if (error) {
          console.error("Error marking messages as read:", error);
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    };

    markAsRead();
  }, [selectedChatKey, selectedChat, markMessagesAsRead]);

  // Get account status
  const getAccountStatus = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account?.status || "disconnected";
  };

  const toggleFavorite = (chatKey: string) => {
    setFavoriteChatKeys((prev) => {
      const next = new Set(prev);
      if (next.has(chatKey)) {
        next.delete(chatKey);
        toast.success("Aus Favoriten entfernt");
      } else {
        next.add(chatKey);
        toast.success("Zu Favoriten hinzugefügt");
      }
      localStorage.setItem("favoriteChatKeys", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChat) return;
    
    // Check if account is disconnected
    const accountStatus = getAccountStatus(selectedChat.account_id);
    if (accountStatus === "disconnected") {
      toast.error("Dieser WhatsApp-Account ist nicht verbunden. Sie können keine Nachrichten senden.");
      return;
    }
    
    const messageText = messageInput;
    setMessageInput(""); // Clear input immediately for better UX
    
    // Add optimistic message to UI immediately
    addOptimisticMessage({
      account_id: selectedChat.account_id,
      contact_phone: selectedChat.contact_phone,
      contact_name: selectedChat.contact_name,
      message_text: messageText,
      direction: "outgoing",
    });
    
    try {
      // 1) Save message to database
      const { error: dbError } = await supabase
        .from("messages")
        .insert({
          account_id: selectedChat.account_id,
          contact_phone: selectedChat.contact_phone,
          contact_name: selectedChat.contact_name,
          message_text: messageText,
          direction: "outgoing",
        });

      if (dbError) throw dbError;

      // 2) Try to send via WhatsApp gateway
      const trySend = async () => {
        const { error } = await supabase.functions.invoke("whatsapp-gateway", {
          body: {
            action: "send-message",
            accountId: selectedChat.account_id,
            phoneNumber: selectedChat.contact_phone,
            message: messageText,
          },
        });
        return error;
      };

      let sendError = await trySend();

      // If client on Railway was restarted, auto-initialize and retry once
      if (sendError) {
        toast.message("Verbindung wird neu hergestellt…", { description: "WhatsApp-Client wird initialisiert" });
        await supabase.functions.invoke("whatsapp-gateway", {
          body: { action: "initialize", accountId: selectedChat.account_id },
        });
        // kurzer Delay, damit der Client starten kann
        await new Promise((r) => setTimeout(r, 1500));
        sendError = await trySend();
      }

      if (sendError) {
        console.error("Error sending WhatsApp message:", sendError);
        toast.error("Nachricht gespeichert, aber WhatsApp-Versand fehlgeschlagen");
        return;
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Fehler beim Senden der Nachricht");
      setMessageInput(messageText); // Restore message on error
    }
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      toast.success(`${files.length} Datei(en) ausgewählt`);
      // Hier später die Datei-Upload-Logik implementieren
    }
  };

  // Calculate unread counts for badges
  const unreadChatsCount = chatGroups.filter(chat => chat.unread_count > 0).length;

  // Filter chats based on selected filter and search query
  const filteredChats = chatGroups.filter(chat => {
    const chatKey = `${chat.contact_phone}_${chat.account_id}`;
    
    // Exclude chats that are in follow-up (disabled)
    if (disabledFollowUpContacts.has(chat.contact_phone)) {
      return false;
    }
    
    // Exclude chats between own WhatsApp accounts (warm-up chats)
    // Check if the contact_phone belongs to any of the user's WhatsApp accounts
    const isOwnAccount = accounts.some(acc => {
      // Remove all non-digit characters for comparison
      const cleanAccPhone = acc.phone_number.replace(/\D/g, '');
      const cleanContactPhone = chat.contact_phone.replace(/\D/g, '');
      return cleanAccPhone === cleanContactPhone;
    });
    
    if (isOwnAccount) {
      return false;
    }
    
    // Apply filter tabs
    let matchesFilter = true;
    switch (chatFilter) {
      case "unread":
        matchesFilter = chat.unread_count > 0;
        break;
      case "favorites":
        matchesFilter = favoriteChatKeys.has(chatKey);
        break;
    }
    
    if (!matchesFilter) return false;
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = chat.contact_name.toLowerCase().includes(query);
      const matchesPhone = chat.contact_phone.includes(query);
      const matchesLastMessage = chat.last_message.toLowerCase().includes(query);
      return matchesName || matchesPhone || matchesLastMessage;
    }
    
    return true;
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return format(date, "HH:mm", { locale: de });
    } else {
      return format(date, "dd.MM.yyyy", { locale: de });
    }
  };

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
              <div className="border-r flex flex-col h-full bg-muted/30 animate-in slide-in-from-left overflow-hidden">
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
                  {templatesLoading ? (
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
            <div className="border-r flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b space-y-3">
                <div className="flex gap-2">
                  {!showTemplates && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowTemplates(true)}
                      className="gap-2 shrink-0"
                      title="Vorlagen anzeigen"
                    >
                      <ChevronRight className="w-4 h-4" />
                      Vorlagen
                    </Button>
                  )}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Chats durchsuchen..." 
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                {/* Filter Tabs */}
                <Tabs value={chatFilter} onValueChange={(v) => setChatFilter(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-9">
                    <TabsTrigger value="all" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        Alle
                        {unreadChatsCount > 0 && (
                          <Badge className="rounded-full h-4 min-w-4 flex items-center justify-center px-1 text-[10px]">
                            {unreadChatsCount}
                          </Badge>
                        )}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="unread" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        Ungelesen
                        {unreadChatsCount > 0 && (
                          <Badge className="rounded-full h-4 min-w-4 flex items-center justify-center px-1 text-[10px]">
                            {unreadChatsCount}
                          </Badge>
                        )}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="favorites" className="text-xs">Favoriten</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <ScrollArea className="flex-1">
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    Lädt Chats...
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm px-4">
                    {chatFilter === "unread" 
                      ? "Keine ungelesenen Chats" 
                      : chatFilter === "favorites"
                      ? "Keine Favoriten vorhanden"
                      : "Keine Chats vorhanden"}
                    <p className="text-xs mt-2">Nachrichten erscheinen hier automatisch</p>
                  </div>
                ) : (
                  filteredChats.map((chat) => {
                    const chatKey = `${chat.contact_phone}_${chat.account_id}`;
                    return (
                      <div
                        key={chatKey}
                        className={`p-4 cursor-pointer hover:bg-muted transition-colors ${
                          selectedChatKey === chatKey ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedChatKey(chatKey)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <span className="font-semibold text-primary text-lg">{chat.contact_name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-semibold truncate">{chat.contact_name}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{formatTime(chat.last_message_time)}</span>
                                {chat.unread_count > 0 && (
                                  <Badge className="rounded-full h-5 min-w-5 flex items-center justify-center px-1.5">
                                    {chat.unread_count}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground truncate">{chat.last_message}</p>
                            </div>
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {chat.account_name}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </ScrollArea>
            </div>

            {/* Chat View */}
            {selectedChat ? (
              <div className="flex flex-col h-full overflow-hidden">
                {/* Header - Fixed at top */}
                <div className="sticky top-0 z-10 bg-background p-4 border-b flex items-center justify-between">
                  <Dialog>
                    <DialogTrigger asChild>
                      <div className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -ml-2 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-semibold text-primary">
                            {selectedChat.contact_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold">{selectedChat.contact_name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {selectedChat.account_name}
                          </Badge>
                        </div>
                      </div>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Kontaktdetails</DialogTitle>
                      </DialogHeader>
                      <DialogDescription className="sr-only">
                        Detaillierte Informationen über den ausgewählten Kontakt
                      </DialogDescription>
                      <div className="space-y-4 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="font-semibold text-primary text-2xl">
                              {selectedChat.contact_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{selectedChat.contact_name}</h3>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm text-muted-foreground">Telefonnummer</p>
                            <p className="font-medium">{selectedChat.contact_phone}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Account</p>
                            <p className="font-medium">{selectedChat.account_name}</p>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title={favoriteChatKeys.has(selectedChatKey!) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                      onClick={() => toggleFavorite(selectedChatKey!)}
                    >
                      {favoriteChatKeys.has(selectedChatKey!) ? (
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ) : (
                        <Star className="w-4 h-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Video className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages - Scrollable middle section */}
                <ScrollArea className="flex-1">
                  <div className="space-y-4 p-4">
                    {selectedChat.messages.sort((a, b) => 
                      new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
                    ).map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            message.direction === "outgoing"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                           {(() => {
                            const LONG_THRESHOLD = 400;
                            const key = `${selectedChatKey}-${message.id}`;
                            const isExpanded = expandedMessageKeys.has(key);
                            const isLong = message.message_text.length > LONG_THRESHOLD;
                            const displayText = !isExpanded && isLong
                              ? message.message_text.slice(0, LONG_THRESHOLD).trimEnd() + "…"
                              : message.message_text;
                            
                            return (
                              <>
                                {message.media_url && message.media_type === 'image' && (
                                  <img 
                                    src={message.media_url} 
                                    alt="WhatsApp Bild" 
                                    className="max-w-full rounded-lg mb-2 max-h-96 object-contain"
                                    loading="lazy"
                                  />
                                )}
                                {message.media_url && message.media_type === 'video' && (
                                  <video 
                                    src={message.media_url} 
                                    controls 
                                    className="max-w-full rounded-lg mb-2 max-h-96"
                                  />
                                )}
                                {message.media_url && message.media_type === 'audio' && (
                                  <audio 
                                    src={message.media_url} 
                                    controls 
                                    className="w-full mb-2"
                                  />
                                )}
                                {message.media_url && message.media_type === 'document' && (
                                  <a 
                                    href={message.media_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm underline mb-2"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Dokument öffnen
                                  </a>
                                )}
                                {message.message_text && (
                                  <p className="text-sm whitespace-pre-line leading-relaxed">{displayText}</p>
                                )}
                                {!isExpanded && isLong && (
                                  <button
                                    type="button"
                                    className={cn(
                                      "mt-2 text-xs font-medium underline underline-offset-2",
                                      message.direction === "outgoing" ? "text-primary-foreground" : "text-primary"
                                    )}
                                    onClick={() =>
                                      setExpandedMessageKeys((prev) => {
                                        const next = new Set(prev);
                                        next.add(key);
                                        return next;
                                      })
                                    }
                                  >
                                    Mehr lesen
                                  </button>
                                )}
                                <span className="text-xs opacity-70 mt-2 block">
                                  {format(new Date(message.sent_at), "HH:mm", { locale: de })}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input - Fixed at bottom */}
                <div className="sticky bottom-0 z-10 bg-background p-4 border-t">
                  {getAccountStatus(selectedChat.account_id) === "disconnected" && (
                    <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm text-destructive font-medium">
                        ⚠️ Dieser WhatsApp-Account ist nicht verbunden. Sie können keine neuen Nachrichten senden.
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                      multiple
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    />
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={getAccountStatus(selectedChat.account_id) === "disconnected"}
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Input
                      placeholder={
                        getAccountStatus(selectedChat.account_id) === "disconnected"
                          ? "Account ist nicht verbunden..."
                          : "Nachricht eingeben oder Vorlage hierher ziehen..."
                      }
                      className="flex-1"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      disabled={getAccountStatus(selectedChat.account_id) === "disconnected"}
                    />
                    <Button 
                      size="icon" 
                      onClick={handleSendMessage}
                      disabled={getAccountStatus(selectedChat.account_id) === "disconnected"}
                    >
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
