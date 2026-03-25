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
  is_warmup: boolean;
  media_url?: string | null;
  media_type?: string | null;
  media_mimetype?: string | null;
  ack_status?: number;
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
  const addOptimisticMessage = (message: Omit<Message, "id" | "sent_at" | "is_read" | "is_warmup">) => {
    const optimisticMessage: Message = {
      ...message,
      id: `temp-${Date.now()}`,
      sent_at: new Date().toISOString(),
      is_read: false,
      is_warmup: false,
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

    // Track own phone numbers for filtering (shared between fetch and realtime)
    let ownPhoneNumbers = new Set<string>();

    const fetchMessages = async (showLoadingState = true) => {
      try {
        if (showLoadingState) {
          setLoading(true);
        }
        
        // Fetch user's WhatsApp accounts to filter out chats between own accounts
        const { data: userAccounts } = await supabase
          .from("whatsapp_accounts")
          .select("phone_number");
        
        ownPhoneNumbers = new Set(
          (userAccounts || []).map(acc => acc.phone_number.replace(/\D/g, ''))
        );
        
        console.log(`[Filter] Loaded ${ownPhoneNumbers.size} own numbers to filter`);
        
        // Fetch messages from the last 30 days only (synced history)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select(`
            *,
            whatsapp_accounts (
              account_name,
              status
            )
          `)
          .gte("sent_at", thirtyDaysAgo.toISOString())
          .order("sent_at", { ascending: false });

        if (messagesError) {
          console.error('[Messages] Query error:', messagesError);
          throw messagesError;
        }

        console.log(`[Messages] Fetched ${messagesData?.length || 0} messages from DB`, 
          messagesData?.length ? `First: ${messagesData[0].contact_phone}` : 'EMPTY');

        const typedMessages: Message[] = (messagesData || []).map((msg: any) => ({
          id: msg.id,
          account_id: msg.account_id,
          contact_phone: msg.contact_phone,
          contact_name: msg.contact_name,
          message_text: msg.message_text,
          direction: msg.direction as "incoming" | "outgoing",
          sent_at: msg.sent_at,
          is_read: msg.is_read,
          is_warmup: msg.is_warmup || false,
          media_url: msg.media_url,
          media_type: msg.media_type,
          media_mimetype: msg.media_mimetype,
          ack_status: msg.ack_status ?? 0,
        }));

        // Merge with existing messages, removing optimistic (temp-) messages that now have real IDs
        setMessages((prevMessages) => {
          const realMessageIds = new Set(typedMessages.map(m => m.id));
          const optimisticMessages = prevMessages.filter(m => m.id.startsWith('temp-'));
          
          // Remove optimistic messages that have been replaced by real messages
          // We check if a real message exists with the same content, contact, and account
          const validOptimisticMessages = optimisticMessages.filter(optMsg => {
            return !typedMessages.some(realMsg => 
              realMsg.message_text === optMsg.message_text &&
              realMsg.contact_phone === optMsg.contact_phone &&
              realMsg.account_id === optMsg.account_id &&
              realMsg.direction === optMsg.direction &&
              Math.abs(new Date(realMsg.sent_at).getTime() - new Date(optMsg.sent_at).getTime()) < 5000 // within 5 seconds
            );
          });

          return typedMessages;
        });

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
          // CRITICAL: Skip all warm-up messages (first priority filter)
          if (msg.is_warmup === true) {
            return;
          }
          
          // CRITICAL: Skip chats from warmup phone numbers (system-wide blacklist)
          const cleanContactPhone = msg.contact_phone.replace(/\D/g, '');
          
          // CRITICAL: Skip chats between own accounts (second priority filter)
          if (ownPhoneNumbers.has(cleanContactPhone)) {
            return;
          }
          
          // ADDITIONAL: Skip if contact_name matches any account name (case-insensitive)
          const contactNameLower = (msg.contact_name || '').toLowerCase();
          const isOwnAccountByName = (userAccounts || []).some(acc => 
            acc.phone_number && contactNameLower.includes(acc.phone_number.toLowerCase().replace(/\D/g, ''))
          );
          
          if (isOwnAccountByName) {
            return;
          }
          
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

    // Debounced fetch to avoid multiple rapid reloads
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('[Realtime] Fetching messages after update');
        fetchMessages(false);
      }, 300);
    };

    // Subscribe to realtime updates - handle INSERT inline, others via refetch
    const messagesChannel = supabase
      .channel(`messages-changes-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          console.log('[Realtime] New message received:', payload.new?.direction);
          const msg = payload.new as any;
          if (!msg) return;

          // Skip warmup messages
          if (msg.is_warmup) return;

          // Skip chats between own accounts (same filter as initial fetch)
          const cleanContactPhone = (msg.contact_phone || '').replace(/\D/g, '');
          if (ownPhoneNumbers.has(cleanContactPhone)) {
            console.log('[Realtime] Skipping own-account message');
            return;
          }

          const newMessage: Message = {
            id: msg.id,
            account_id: msg.account_id,
            contact_phone: msg.contact_phone,
            contact_name: msg.contact_name,
            message_text: msg.message_text,
            direction: msg.direction as "incoming" | "outgoing",
            sent_at: msg.sent_at,
            is_read: msg.is_read,
            is_warmup: msg.is_warmup || false,
            media_url: msg.media_url,
            media_type: msg.media_type,
            media_mimetype: msg.media_mimetype,
            ack_status: msg.ack_status ?? 0,
          };

          // Update messages state
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [newMessage, ...prev];
          });

          // Update chat groups inline
          setChatGroups(prev => {
            const key = `${msg.contact_phone}_${msg.account_id}`;
            const idx = prev.findIndex(g => `${g.contact_phone}_${g.account_id}` === key);

            if (idx !== -1) {
              const updated = [...prev];
              const group = { ...updated[idx] };
              // Avoid duplicate
              if (group.messages.some(m => m.id === newMessage.id)) return prev;
              group.messages = [...group.messages, newMessage].sort(
                (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
              );
              group.last_message = msg.message_text;
              group.last_message_time = msg.sent_at;
              if (msg.direction === "incoming" && !msg.is_read) {
                group.unread_count = (group.unread_count || 0) + 1;
              }
              updated[idx] = group;
              return updated;
            }

            // New chat group – do a full refetch to get account name etc.
            debouncedFetch();
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          console.log('[Realtime] Message updated');
          const msg = payload.new as any;
          if (!msg) return;

          // Update is_read and ack_status inline
          setChatGroups(prev => prev.map(group => {
            if (group.account_id !== msg.account_id) return group;
            const hasMsg = group.messages.some(m => m.id === msg.id);
            if (!hasMsg) return group;
            return {
              ...group,
              messages: group.messages.map(m => m.id === msg.id ? { ...m, is_read: msg.is_read, ack_status: msg.ack_status ?? m.ack_status } : m),
              unread_count: group.messages.filter(m => m.id !== msg.id && m.direction === "incoming" && !m.is_read).length + (msg.direction === "incoming" && !msg.is_read ? 1 : 0),
            };
          }));
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Messages channel status:', status);
      });

    // Also listen to account status updates to refresh after connection
    const accountsChannel = supabase
      .channel(`whatsapp-accounts-changes-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_accounts" },
        (payload) => {
          console.log('[Realtime] Account update detected:', payload.new);
          debouncedFetch();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Accounts channel status:', status);
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(accountsChannel);
    };
  }, [user?.id]);

  return { messages, chatGroups, loading, addOptimisticMessage, markMessagesAsRead };
};
