import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Message {
  id: string;
  account_id: string;
  contact_phone: string;
  contact_name: string | null;
  message_text: string;
  direction: "incoming" | "outgoing";
  sent_at: string;
  is_read: boolean;
}

export interface ChatGroup {
  contact_phone: string;
  contact_name: string;
  account_id: string;
  account_name: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  messages: Message[];
}

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Function to add optimistic message
  const addOptimisticMessage = (message: Omit<Message, "id" | "sent_at" | "is_read">) => {
    const optimisticMessage: Message = {
      ...message,
      id: `temp-${Date.now()}`,
      sent_at: new Date().toISOString(),
      is_read: false,
    };

    setChatGroups((prev) => {
      const key = `${message.contact_phone}_${message.account_id}`;
      const existingGroupIndex = prev.findIndex(
        (g) => `${g.contact_phone}_${g.account_id}` === key
      );

      if (existingGroupIndex !== -1) {
        const updated = [...prev];
        updated[existingGroupIndex] = {
          ...updated[existingGroupIndex],
          messages: [...updated[existingGroupIndex].messages, optimisticMessage],
          last_message: message.message_text,
          last_message_time: optimisticMessage.sent_at,
        };
        return updated;
      }

      return prev;
    });

    return optimisticMessage.id;
  };

  // Function to mark messages as read
  const markMessagesAsRead = (chatKey: string, messageIds: string[]) => {
    setChatGroups((prev) => prev.map(group => {
      if (`${group.contact_phone}_${group.account_id}` === chatKey) {
        return {
          ...group,
          unread_count: 0,
          messages: group.messages.map(msg => 
            messageIds.includes(msg.id) ? { ...msg, is_read: true } : msg
          )
        };
      }
      return group;
    }));
  };

  useEffect(() => {
    if (!user) return;

    const fetchMessages = async (showLoadingState = true) => {
      try {
        if (showLoadingState) {
          setLoading(true);
        }
        
        // Fetch all messages with account info, excluding warm-up messages
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select(`
            *,
            whatsapp_accounts (
              account_name,
              status
            )
          `)
          .eq("is_warmup", false)
          .order("sent_at", { ascending: false });

        if (messagesError) throw messagesError;

        const typedMessages: Message[] = (messagesData || []).map((msg: any) => ({
          id: msg.id,
          account_id: msg.account_id,
          contact_phone: msg.contact_phone,
          contact_name: msg.contact_name,
          message_text: msg.message_text,
          direction: msg.direction as "incoming" | "outgoing",
          sent_at: msg.sent_at,
          is_read: msg.is_read,
        }));

        setMessages(typedMessages);

        // Fetch contacts to override display names when available
        let contactNameMap = new Map<string, string>();
        try {
          const { data: contactsData, error: contactsError } = await supabase
            .from("contacts")
            .select("phone_number,name");
          if (contactsError) {
            console.error("Error fetching contacts for name mapping:", contactsError);
          } else {
            contactsData?.forEach((c: any) => {
              // Basic normalization: strip spaces and leading '+'
              const normalized = (c.phone_number || "").toString().replace(/\s+/g, "").replace(/^\+/, "");
              if (normalized) contactNameMap.set(normalized, c.name);
            });
          }
        } catch (e) {
          console.error("Contacts fetch exception:", e);
        }

        // Group messages by contact_phone + account_id
        const groups: Record<string, ChatGroup> = {};

        messagesData?.forEach((msg: any) => {
          const key = `${msg.contact_phone}_${msg.account_id}`;
          const effectiveName = contactNameMap.get(msg.contact_phone) || msg.contact_name || msg.contact_phone;
          if (!groups[key]) {
            groups[key] = {
              contact_phone: msg.contact_phone,
              contact_name: effectiveName,
              account_id: msg.account_id,
              account_name: msg.whatsapp_accounts?.account_name || "Unbekannter Account",
              last_message: msg.message_text,
              last_message_time: msg.sent_at,
              unread_count: 0,
              messages: [],
            };
          }

          groups[key].messages.push(msg);
          
          if (msg.direction === "incoming" && !msg.is_read) {
            groups[key].unread_count++;
          }
        });

        setChatGroups(Object.values(groups));
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        if (showLoadingState) {
          setLoading(false);
        }
      }
    };

    fetchMessages(true);

    // Subscribe to realtime updates - don't show loading state on updates
    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchMessages(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { messages, chatGroups, loading, addOptimisticMessage, markMessagesAsRead };
};
