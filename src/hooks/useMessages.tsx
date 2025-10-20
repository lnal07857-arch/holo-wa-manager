import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Message {
  id: string;
  account_id: string;
  contact_phone: string;
  contact_name: string | null;
  message_text: string;
  direction: "inbound" | "outbound";
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

  useEffect(() => {
    if (!user) return;

    const fetchMessages = async () => {
      try {
        setLoading(true);
        
        // Fetch all messages with account info
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select(`
            *,
            whatsapp_accounts (
              account_name,
              status
            )
          `)
          .order("sent_at", { ascending: false });

        if (messagesError) throw messagesError;

        const typedMessages: Message[] = (messagesData || []).map((msg: any) => ({
          id: msg.id,
          account_id: msg.account_id,
          contact_phone: msg.contact_phone,
          contact_name: msg.contact_name,
          message_text: msg.message_text,
          direction: msg.direction as "inbound" | "outbound",
          sent_at: msg.sent_at,
          is_read: msg.is_read,
        }));

        setMessages(typedMessages);

        // Group messages by contact_phone + account_id
        const groups: Record<string, ChatGroup> = {};

        messagesData?.forEach((msg: any) => {
          const key = `${msg.contact_phone}_${msg.account_id}`;
          
          if (!groups[key]) {
            groups[key] = {
              contact_phone: msg.contact_phone,
              contact_name: msg.contact_name || msg.contact_phone,
              account_id: msg.account_id,
              account_name: msg.whatsapp_accounts?.account_name || "Unbekannter Account",
              last_message: msg.message_text,
              last_message_time: msg.sent_at,
              unread_count: 0,
              messages: [],
            };
          }

          groups[key].messages.push(msg);
          
          if (msg.direction === "inbound" && !msg.is_read) {
            groups[key].unread_count++;
          }
        });

        setChatGroups(Object.values(groups));
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Subscribe to realtime updates
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
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { messages, chatGroups, loading };
};
