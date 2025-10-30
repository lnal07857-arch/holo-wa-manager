const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ProxyChain = require('proxy-chain');
require('dotenv').config();

// Configure stealth plugin with all evasions
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase credentials helper
function getSupabaseCreds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  return { url, key };
}

// Startup self-check for Supabase access
async function verifySupabaseAccess() {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) {
    console.log('[SB check] Missing credentials, skipping verification');
    return false;
  }
  
  try {
    const response = await fetch(`${url}/rest/v1/whatsapp_accounts?select=id&limit=1`, {
      headers: { 
        'apikey': key, 
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });
    const text = await response.text();
    console.log(`[SB check] REST access test: status=${response.status}, body=${text.slice(0, 200)}`);
    return response.ok;
  } catch (error) {
    console.error('[SB check] Connection error:', error.message);
    return false;
  }
}

// Reset all connected accounts to disconnected on startup
async function resetAccountStatuses() {
  try {
    const { url, key } = getSupabaseCreds();
    if (!url || !key) {
      console.log('Skipping account status reset: Supabase credentials not configured');
      return;
    }

    const supabase = createClient(url, key);
    const { data, error, count } = await supabase
      .from('whatsapp_accounts')
      .update({
        status: 'disconnected',
        qr_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'connected')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('Failed to reset account statuses via SDK:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    } else {
      console.log(`✅ Reset all connected accounts to disconnected status (updated ${count ?? 0} rows)`);
    }
  } catch (error) {
    console.error('Error resetting account statuses (SDK):', error);
  }
}

// Periodic status check for disconnected clients
async function checkClientStatuses() {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) return;

  const supabase = createClient(url, key);

  for (const [accountId, client] of clients.entries()) {
    try {
      const state = await client.getState();
      
      if (state !== 'CONNECTED') {
        console.log(`Account ${accountId} is not connected (state: ${state}), updating DB...`);
        
        const { error } = await supabase
          .from('whatsapp_accounts')
          .update({
            status: 'disconnected',
            qr_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', accountId);

        if (error) {
          console.error(`Failed to update status for ${accountId}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Error checking status for ${accountId}:`, error.message);
    }
  }
}

// Store active WhatsApp clients
const clients = new Map();
// Local HTTP proxy bridges per account (proxy-chain)
const proxyServers = new Map();

// Message queue for rate limiting
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.messageCount = 0;
    this.resetTime = Date.now() + 3600000; // Reset after 1 hour
  }

  async add(task) {
    this.queue.push(task);
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Reset counter every hour
      if (Date.now() > this.resetTime) {
        this.messageCount = 0;
        this.resetTime = Date.now() + 3600000;
      }

      // Check rate limit (50 messages per hour)
      if (this.messageCount >= 50) {
        const waitTime = this.resetTime - Date.now();
        console.log(`Rate limit reached. Waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.messageCount = 0;
        this.resetTime = Date.now() + 3600000;
      }

      const task = this.queue.shift();
      try {
        await task();
        this.messageCount++;
        // Random delay between 2-5 seconds
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }
    
    this.processing = false;
  }
}

const messageQueues = new Map();
const lastActivity = new Map(); // Track last activity timestamp per client
const reconnectAttempts = new Map(); // Track reconnect attempts
const qrTimeouts = new Map(); // Track QR code timeouts
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 30000; // 30 seconds

// Idle timeout in milliseconds (30 minutes)
const IDLE_TIMEOUT = 30 * 60 * 1000;
// QR code timeout in milliseconds (2 minutes)
const QR_TIMEOUT = 2 * 60 * 1000;

// Sync all messages (no time limit)
async function syncAllMessages(client, accountId, supa) {
  try {
    // Fetch warmup contacts to exclude them from sync
    const { data: accountData } = await supa
      .from('whatsapp_accounts')
      .select('user_id')
      .eq('id', accountId)
      .maybeSingle();
    
    let warmupPhones = new Set();
    if (accountData?.user_id) {
      const { data: warmupSettings } = await supa
        .from('warmup_settings')
        .select('all_pairs')
        .eq('user_id', accountData.user_id)
        .maybeSingle();
      
      if (warmupSettings?.all_pairs) {
        // Extract phone numbers from all_pairs
        const pairs = Array.isArray(warmupSettings.all_pairs) ? warmupSettings.all_pairs : [];
        pairs.forEach(pair => {
          if (pair.account1 === accountId && pair.phone2) {
            warmupPhones.add(pair.phone2.replace(/\D/g, ''));
          }
          if (pair.account2 === accountId && pair.phone1) {
            warmupPhones.add(pair.phone1.replace(/\D/g, ''));
          }
        });
        console.log(`[Sync] Found ${warmupPhones.size} warmup contacts to exclude:`, Array.from(warmupPhones));
      }
    }
    
    const chats = await client.getChats();
    console.log(`[Sync] Found ${chats.length} total chats to process`);
    
    let totalSynced = 0;
    let totalSkipped = 0;
    let totalWarmupSkipped = 0;
    let totalProcessed = 0;

    for (const chat of chats) {
      try {
        // Extract phone number safely
        let chatPhone = '';
        if (chat.id && chat.id.user) {
          chatPhone = chat.id.user.replace(/\D/g, '');
        } else if (chat.id && chat.id._serialized) {
          chatPhone = chat.id._serialized.split('@')[0].replace(/\D/g, '');
        }
        
        if (!chatPhone) {
          console.log(`[Sync] Skipping chat without valid phone number:`, chat.id);
          continue;
        }
        
        // Check if this is a warmup chat and skip it
        if (warmupPhones.has(chatPhone)) {
          console.log(`[Sync] Skipping warmup chat: ${chat.name || chatPhone}`);
          totalWarmupSkipped++;
          continue;
        }
        
        totalProcessed++;
        console.log(`[Sync] Processing chat ${totalProcessed}: ${chat.name || chatPhone}`);
        
        // Fetch messages from this chat
        const messages = await chat.fetchMessages({ limit: 100 });
        
        // Get unread count from WhatsApp
        const unreadCount = chat.unreadCount || 0;
        console.log(`[Sync] Chat "${chat.name || chatPhone}": ${messages.length} messages, ${unreadCount} unread`);

        if (messages.length === 0) {
          console.log(`[Sync] No messages in chat, skipping`);
          continue;
        }

        // Filter messages: only sync messages from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoTimestamp = Math.floor(thirtyDaysAgo.getTime() / 1000);
        
        const recentMessages = messages.filter(msg => msg.timestamp >= thirtyDaysAgoTimestamp);
        console.log(`[Sync] Filtered to ${recentMessages.length} messages from last 30 days`);
        
        if (recentMessages.length === 0) {
          console.log(`[Sync] No recent messages in chat, skipping`);
          continue;
        }

        // Get all incoming messages to determine which are unread
        const incomingMessages = recentMessages.filter(msg => !msg.fromMe);
        console.log(`[Sync] Found ${incomingMessages.length} incoming messages, ${unreadCount} should be unread`);
        
        // The last N incoming messages are unread (where N = unreadCount)
        const unreadMessageIds = new Set();
        if (unreadCount > 0 && incomingMessages.length > 0) {
          const unreadIncoming = incomingMessages.slice(-unreadCount);
          unreadIncoming.forEach(msg => {
            if (msg.id && msg.id._serialized) {
              unreadMessageIds.add(msg.id._serialized);
            }
          });
          console.log(`[Sync] Marked ${unreadMessageIds.size} messages as unread`);
        }

        // Process messages in reverse order (oldest first)
        const sortedMessages = [...recentMessages].reverse();
        
        for (let i = 0; i < sortedMessages.length; i++) {
          const msg = sortedMessages[i];
          try {
            // Determine correct peer and direction
            const peerJid = msg.fromMe ? msg.to : msg.from;
            const direction = msg.fromMe ? 'outgoing' : 'incoming';
            
            // Clean phone number
            const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');
            const messageTime = new Date(msg.timestamp * 1000).toISOString();
            
            // Get contact info
            let contactName = null;
            try {
              if (msg.fromMe) {
                const recipientJid = msg.to;
                const recipient = await client.getContactById(recipientJid);
                contactName = recipient.pushname || recipient.name || null;
              } else {
                const contact = await msg.getContact();
                contactName = contact.pushname || contact.name || null;
              }
            } catch (e) {
              console.error('Error fetching contact name during sync:', e);
            }

            // Determine if message is read
            // Outgoing messages are always read
            // Incoming messages are unread if they're in the unreadMessageIds set
            let isRead = true;
            if (!msg.fromMe && msg.id && msg.id._serialized) {
              isRead = !unreadMessageIds.has(msg.id._serialized);
            }

            // Check if message already exists
            const { data: existing } = await supa
              .from('messages')
              .select('id, is_read')
              .eq('account_id', accountId)
              .eq('contact_phone', phoneNumber)
              .eq('message_text', msg.body)
              .eq('sent_at', messageTime)
              .eq('direction', direction)
              .maybeSingle();

            if (existing) {
              // Update read status if it changed
              if (existing.is_read !== isRead) {
                const { error: updateError } = await supa
                  .from('messages')
                  .update({ is_read: isRead })
                  .eq('id', existing.id);
                if (updateError) {
                  console.error('Error updating message read status:', updateError);
                }
              }
              totalSkipped++;
              continue;
            }

            // Insert message (explicitly set is_warmup to false)
            const { error } = await supa
              .from('messages')
              .insert({
                account_id: accountId,
                contact_phone: phoneNumber,
                contact_name: contactName,
                message_text: msg.body,
                direction: direction,
                sent_at: messageTime,
                is_read: isRead,
                is_warmup: false
              });

            if (error) {
              console.error('Error inserting message:', error);
            } else {
              totalSynced++;
            }

            // Small delay to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (msgError) {
            console.error('Error processing message:', msgError);
          }
        }
      } catch (chatError) {
        console.error(`Error syncing chat ${chat.id.user}:`, chatError);
      }
    }

    console.log(`[Sync] Complete: ${totalSynced} new messages imported, ${totalSkipped} duplicates skipped, ${totalWarmupSkipped} warmup chats excluded, ${totalProcessed} chats processed`);
  } catch (error) {
    console.error('[Sync] Error in syncAllMessages:', error);
  }
}

// Generate unique fingerprint for each instance
function generateFingerprint(accountId) {
  // Seeded PRNG for deterministic but diverse fingerprints per account
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let seed = 0;
  for (let i = 0; i < accountId.length; i++) {
    seed = (seed * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  const rnd = mulberry32(seed || 1);

  // Larger pools to reduce collisions across many accounts
  const userAgents = [
    // Windows 11 Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    
    // Windows 11 Firefox
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
    
    // Windows 11 Edge
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    
    // Mac OS Sonoma Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Mac OS Ventura Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    
    // Mac OS Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
    
    // Mac OS Firefox
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:121.0) Gecko/20100101 Firefox/121.0',
    
    // Ubuntu Chrome
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    
    // Ubuntu Firefox
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
    
    // Fedora Chrome
    'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    
    // Debian Chrome
    'Mozilla/5.0 (X11; Debian; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Debian; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Debian; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    
    // Windows 10 Chrome
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    
    // Windows 10 Firefox
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    
    // Mac OS Monterey Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    
    // Mac OS Big Sur Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    
    // Additional Windows Edge variations
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.0.0',
    
    // Additional Mac variations
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    
    // Chromium on Linux
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Chromium/125.0.0.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Chromium/124.0.0.0',
    
    // Opera variations
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0',
    
    // Brave variations
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Brave/124.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Brave/124.0.0.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Brave/124.0.0.0',
  ];

  const resolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1600, height: 900 },
    { width: 1680, height: 1050 },
    { width: 1280, height: 800 },
    { width: 2736, height: 1824 },
  ];

  const timezones = [
    'Europe/Berlin',
    'Europe/Paris',
    'Europe/Amsterdam',
    'Europe/Stockholm',
    'Europe/Warsaw',
    'Europe/Madrid',
    'UTC',
    'America/New_York',
    'Asia/Dubai',
  ];

  const hardwareConcurrency = [2, 4, 6, 8, 10, 12, 16];

  // Deterministic picks using PRNG
  const ua = userAgents[Math.floor(rnd() * userAgents.length)];
  const resolution = resolutions[Math.floor(rnd() * resolutions.length)];
  const timezone = timezones[Math.floor(rnd() * timezones.length)];
  const cores = hardwareConcurrency[Math.floor(rnd() * hardwareConcurrency.length)];

  return { userAgent: ua, resolution, timezone, cores };
}

// Initialize WhatsApp client
async function initializeClient(accountId, userId, supabaseUrl, supabaseKey) {
  // If a client exists, verify its state. If not connected, clean up and re-init to emit a fresh QR.
  if (clients.has(accountId)) {
    try {
      const existing = clients.get(accountId);
      const state = await existing.getState().catch(() => null);
      console.log(`[Init] Existing client for ${accountId} with state:`, state);
      if (state !== 'CONNECTED') {
        console.log(`[Init] Existing client not connected for ${accountId}. Destroying and re-initializing to regenerate QR...`);
        // Clear QR timeout if exists
        const existingTimeout = qrTimeouts.get(accountId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          qrTimeouts.delete(accountId);
        }
        // Destroy and cleanup
        try { await existing.destroy(); } catch (e) { console.warn('[Init] Error destroying existing client:', e?.message || e); }
        clients.delete(accountId);
        messageQueues.delete(accountId);
        lastActivity.delete(accountId);
        reconnectAttempts.delete(accountId);
        // Proceed to create a new client below
      } else {
        return { success: true, message: 'Client already initialized' };
      }
    } catch (e) {
      console.warn('[Init] Error checking existing client state, proceeding with re-init:', e?.message || e);
      // Best-effort cleanup
      clients.delete(accountId);
      messageQueues.delete(accountId);
      lastActivity.delete(accountId);
      reconnectAttempts.delete(accountId);
    }
  }

  // Supabase client using service role key for privileged updates
  const supa = createClient(supabaseUrl, supabaseKey);

  // Generate unique fingerprint for this account
  const fingerprint = generateFingerprint(accountId);
  console.log(`[Fingerprint] Generated unique fingerprint for ${accountId}:`, {
    userAgent: fingerprint.userAgent.substring(0, 50) + '...',
    resolution: fingerprint.resolution,
    timezone: fingerprint.timezone,
    cores: fingerprint.cores
  });

  // Fetch proxy configuration for this account
  // Ensure no system proxy is used by Chromium
  try {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.ALL_PROXY;
    process.env.NO_PROXY = '*';
  } catch (e) {
    console.warn('[Proxy] Could not clear proxy env vars:', e?.message || e);
  }

  let puppeteerConfig = {
    headless: true,
    executablePath: puppeteer.executablePath(),
    // Improve stability over flaky networks
    ignoreHTTPSErrors: true,
    protocolTimeout: 90000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--proxy-bypass-list=<-loopback>',
      '--no-proxy-server',
      `--window-size=${fingerprint.resolution.width},${fingerprint.resolution.height}`,
      `--user-agent=${fingerprint.userAgent}`,
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ]
  };

  try {
    const { data: accountData } = await supa
      .from('whatsapp_accounts')
      .select('proxy_server')
      .eq('id', accountId)
      .maybeSingle();

    if (accountData?.proxy_server) {
      const proxyConfig = JSON.parse(accountData.proxy_server);
      console.log(`[Proxy] ✅ Mullvad SOCKS5 proxy configured for ${accountId}`);
      console.log(`[Proxy] Server: ${proxyConfig.host}:${proxyConfig.port}`);
      console.log(`[Proxy] Protocol: ${proxyConfig.protocol}`);
      
      // Upstream SOCKS5 URL with credentials
      const upstreamUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;

      // Remove flags that disable/bypass proxies
      puppeteerConfig.args = puppeteerConfig.args.filter(arg => arg !== '--no-proxy-server' && arg !== '--proxy-bypass-list=<-loopback>');

      // Start local HTTP->SOCKS5 bridge (proxy-chain)
      const localPort = 18000 + Math.floor(Math.random() * 1000);
      const server = new ProxyChain.Server({
        port: localPort,
        verbose: false,
        prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl })
      });

      await new Promise((resolve) => server.listen(resolve));
      proxyServers.set(accountId, server);

      // Point Chromium to local HTTP proxy
      puppeteerConfig.args.push(`--proxy-server=http://127.0.0.1:${localPort}`);
      console.log(`[Proxy] ✅ Using local HTTP bridge at 127.0.0.1:${localPort} -> ${proxyConfig.host}`);
    } else {
      console.log(`[Proxy] No proxy configured for ${accountId}, using direct connection`);
    }
  } catch (proxyError) {
    console.error('[Proxy] Error setting up proxy:', proxyError);
  }

  // Create custom browser instance with stealth
  const browser = await puppeteer.launch({
    ...puppeteerConfig,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Get the first page and inject anti-detection scripts
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // Advanced anti-detection injection
  await page.evaluateOnNewDocument((fp) => {
    // 1. Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // 2. Override navigator properties from fingerprint
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => fp.cores,
    });

    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => [4, 8, 16][Math.floor(Math.random() * 3)],
    });

    // Determine platform from user agent
    const ua = navigator.userAgent;
    let platform = 'Win32';
    if (ua.includes('Mac')) platform = 'MacIntel';
    else if (ua.includes('Linux')) platform = 'Linux x86_64';
    
    Object.defineProperty(navigator, 'platform', {
      get: () => platform,
    });

    // 3. Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['de-DE', 'de', 'en-US', 'en'],
    });

    // 4. Add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        },
        {
          0: { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
          description: "Portable Document Format",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          length: 1,
          name: "Chrome PDF Viewer"
        },
        {
          0: { type: "application/x-nacl", suffixes: "", description: "Native Client Executable" },
          1: { type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable" },
          description: "",
          filename: "internal-nacl-plugin",
          length: 2,
          name: "Native Client"
        }
      ],
    });

    // 5. Override chrome runtime
    if (window.chrome) {
      Object.defineProperty(window, 'chrome', {
        get: () => ({
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        }),
      });
    }

    // 6. Override permissions
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // 7. WebGL fingerprinting protection
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
        return 'Intel Inc.';
      }
      if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.call(this, parameter);
    };

    // 8. Canvas fingerprinting protection
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png' && this.width === 16 && this.height === 16) {
        // Fingerprinting attempt detected, add noise
        const ctx = this.getContext('2d');
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += Math.floor(Math.random() * 10) - 5;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, arguments);
    };

    // 9. AudioContext fingerprinting protection
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function() {
        const analyser = originalCreateAnalyser.call(this);
        const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
        analyser.getFloatFrequencyData = function(array) {
          originalGetFloatFrequencyData.call(this, array);
          for (let i = 0; i < array.length; i++) {
            array[i] += Math.random() * 0.01;
          }
          return array;
        };
        return analyser;
      };
    }

    // 10. Battery API spoofing
    if (navigator.getBattery) {
      const originalGetBattery = navigator.getBattery;
      navigator.getBattery = function() {
        return originalGetBattery.call(this).then(battery => {
          Object.defineProperty(battery, 'charging', { value: true });
          Object.defineProperty(battery, 'chargingTime', { value: 0 });
          Object.defineProperty(battery, 'dischargingTime', { value: Infinity });
          Object.defineProperty(battery, 'level', { value: 1.0 });
          return battery;
        });
      };
    }

    // 11. Media devices spoofing
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
      navigator.mediaDevices.enumerateDevices = function() {
        return originalEnumerateDevices.call(this).then(devices => {
          return devices.length > 0 ? devices : [
            { deviceId: "default", kind: "audioinput", label: "Default - Microphone", groupId: "default" },
            { deviceId: "default", kind: "audiooutput", label: "Default - Speaker", groupId: "default" },
            { deviceId: "default", kind: "videoinput", label: "Default - Camera", groupId: "default" }
          ];
        });
      };
    }

    // 12. Screen resolution from fingerprint
    Object.defineProperty(screen, 'width', {
      get: () => fp.resolution.width,
    });
    Object.defineProperty(screen, 'height', {
      get: () => fp.resolution.height,
    });
    Object.defineProperty(screen, 'availWidth', {
      get: () => fp.resolution.width,
    });
    Object.defineProperty(screen, 'availHeight', {
      get: () => fp.resolution.height - 40,
    });

    // 13. Timezone override
    try {
      Intl.DateTimeFormat = function() {
        return {
          resolvedOptions: () => ({ timeZone: fp.timezone })
        };
      };
    } catch (e) {}

    // 14. Date.now precision reduction (prevent timing attacks)
    const originalDateNow = Date.now;
    Date.now = function() {
      return Math.floor(originalDateNow() / 100) * 100;
    };

    // 15. Performance timing randomization
    if (window.performance && window.performance.now) {
      const originalPerformanceNow = performance.now;
      let performanceOffset = Math.random() * 10;
      performance.now = function() {
        return originalPerformanceNow.call(this) + performanceOffset;
      };
    }

    console.log('[Anti-Detection] All evasion scripts injected successfully');
  }, fingerprint);

  // Close the initialization page
  await page.close();

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: accountId }),
    puppeteer: {
      browserWSEndpoint: browser.wsEndpoint(),
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
  });

  // QR Code event
  client.on('qr', async (qr) => {
    console.log('QR RECEIVED for', accountId);
    qrcode.generate(qr, { small: true });
    
    // Convert QR to data URL for display in browser
    const QRCode = require('qrcode');
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(qr);
    } catch (err) {
      console.error('Error generating QR data URL:', err);
    }
    
    // Update status in Supabase
    try {
      const { error: upErr } = await supa
        .from('whatsapp_accounts')
        .update({
          qr_code: qrDataUrl,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);
      if (upErr) {
        console.error('Failed to save QR (supabase-js):', upErr);
      } else {
        console.log('QR code saved to Supabase with supabase-js');
      }
    } catch (error) {
      console.error('Error saving QR to Supabase (supabase-js):', error);
    }
    
    // Set QR timeout - destroy client if not scanned within 2 minutes
    const existingTimeout = qrTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeout = setTimeout(async () => {
      console.log(`[QR Timeout] QR code not scanned for ${accountId}, cleaning up...`);
      
      try {
        // Destroy the client
        if (clients.has(accountId)) {
          const client = clients.get(accountId);
          await client.destroy();
          clients.delete(accountId);
        }
        
        // Clean up maps
        messageQueues.delete(accountId);
        lastActivity.delete(accountId);
        qrTimeouts.delete(accountId);

        // Stop local proxy bridge if running
        const srv = proxyServers.get(accountId);
        if (srv) {
          try { await srv.close(); } catch (e) { console.warn('[QR Timeout] Error closing proxy server:', e?.message || e); }
          proxyServers.delete(accountId);
        }
        
        // Update status in database
        await supa
          .from('whatsapp_accounts')
          .update({
            status: 'disconnected',
            qr_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', accountId);
          
        console.log(`[QR Timeout] Cleaned up session for ${accountId}`);
      } catch (err) {
        console.error(`[QR Timeout] Error cleaning up ${accountId}:`, err);
      }
    }, QR_TIMEOUT);
    
    qrTimeouts.set(accountId, timeout);
    console.log(`[QR Timeout] Set ${QR_TIMEOUT / 1000}s timeout for ${accountId}`);
  });

  // Ready event
  client.on('ready', async () => {
    console.log('Client is ready!', accountId);
    lastActivity.set(accountId, Date.now());
    
    // Clear QR timeout since client is now connected
    const existingTimeout = qrTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      qrTimeouts.delete(accountId);
      console.log(`[QR Timeout] Cleared timeout for connected client ${accountId}`);
    }
    
    // Reset reconnect attempts on successful connection
    reconnectAttempts.set(accountId, 0);
    
    // Update status in Supabase and get last sync time
    let lastSyncTime = null;
    try {
      // First, get the current last_connected_at to check if we need a full sync
      const { data: accountData } = await supa
        .from('whatsapp_accounts')
        .select('last_connected_at')
        .eq('id', accountId)
        .maybeSingle();
      
      lastSyncTime = accountData?.last_connected_at;
      
      const response = await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          status: 'connected',
          qr_code: null,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      console.log('Status updated to connected', response.status);
    } catch (error) {
      console.error('Error updating status:', error);
    }

    // Apply global profile settings
    try {
      console.log('[Profile Sync] Starting profile settings sync...');
      const { data: accountData, error: accountError } = await supa
        .from('whatsapp_accounts')
        .select('user_id')
        .eq('id', accountId)
        .maybeSingle();
      
      if (accountError) {
        console.error('[Profile Sync] Error fetching account data:', accountError);
        return;
      }
      
      if (!accountData || !accountData.user_id) {
        console.log('[Profile Sync] No account data found');
        return;
      }
      
      console.log('[Profile Sync] Found user_id:', accountData.user_id);
      
      const { data: profileData, error: profileError } = await supa
        .from('profiles')
        .select('global_profile_name, global_profile_info, global_profile_description, global_profile_image')
        .eq('id', accountData.user_id)
        .maybeSingle();
      
      if (profileError) {
        console.error('[Profile Sync] Error fetching profile data:', profileError);
        return;
      }
      
      if (!profileData) {
        console.log('[Profile Sync] No profile data found for user');
        return;
      }
      
      console.log('[Profile Sync] Profile data:', {
        name: profileData.global_profile_name || 'none',
        info: profileData.global_profile_info || 'none',
        description: profileData.global_profile_description || 'none',
        image: profileData.global_profile_image || 'none'
      });
      
      // Set profile status/info if available
      if (profileData.global_profile_info) {
        try {
          console.log('[Profile Sync] Setting status (Info) to:', profileData.global_profile_info);
          await client.setStatus(profileData.global_profile_info);
          console.log('[Profile Sync] ✓ Status (Info) set successfully');
        } catch (err) {
          console.error('[Profile Sync] ✗ Error setting status:', err.message || err);
        }
      } else {
        console.log('[Profile Sync] No info to set');
      }
      
      // Note: Business description cannot be set via whatsapp-web.js
      // It requires WhatsApp Business API
      if (profileData.global_profile_description) {
        console.log('[Profile Sync] ⚠ Business description found but cannot be set via whatsapp-web.js');
        console.log('[Profile Sync] Tip: Use WhatsApp Business API for full business profile control');
      }
      
      // Set profile picture if available (only for HTTP URLs)
      if (profileData.global_profile_image) {
        if (profileData.global_profile_image.startsWith('http')) {
          try {
            console.log('[Profile Sync] Downloading image from:', profileData.global_profile_image);
            const imageResponse = await fetch(profileData.global_profile_image);
            if (!imageResponse.ok) {
              throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
            }
            const imageBuffer = await imageResponse.buffer();
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            console.log('[Profile Sync] Setting profile picture...');
            await client.setProfilePicture(base64Image);
            console.log('[Profile Sync] ✓ Profile picture set successfully');
          } catch (err) {
            console.error('[Profile Sync] ✗ Error setting profile picture:', err.message || err);
          }
        } else {
          console.log('[Profile Sync] ⚠ Skipping profile image - not a public URL:', profileData.global_profile_image);
          console.log('[Profile Sync] Tip: Upload images to Supabase Storage for automatic syncing');
        }
      } else {
        console.log('[Profile Sync] No profile image to set');
      }
      
      console.log('[Profile Sync] Profile sync completed');
    } catch (error) {
      console.error('[Profile Sync] Unexpected error:', error.message || error);
    }

    // Sync all messages - always do a full sync to catch any missed messages
    console.log('[Init] Starting full message sync for account:', accountId);
    if (lastSyncTime) {
      console.log('[Init] Last sync was at:', lastSyncTime);
    } else {
      console.log('[Init] First time sync for this account');
    }
    
    try {
      await syncAllMessages(client, accountId, supa);
      console.log('[Init] Message sync completed for account:', accountId);
      
      // Trigger a database update to notify frontend via realtime
      await supa
        .from('whatsapp_accounts')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', accountId);
      console.log('[Init] Notified frontend about sync completion');
    } catch (error) {
      console.error('[Init] Error syncing messages for account:', accountId, error);
    }
  });

  // Message event - handle new messages (incoming and outgoing from device)
  client.on('message_create', async (msg) => {
    lastActivity.set(accountId, Date.now());
    try {
      // Determine correct peer JID and direction
      const peerJid = msg.fromMe ? msg.to : msg.from;
      const direction = msg.fromMe ? 'outgoing' : 'incoming';

      // Clean phone number (remove @c.us / @g.us)
      const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');

      // Check if this message is from a warmup contact - if so, skip saving to messages table
      // We need to fetch warmup settings to check
      const { data: accountData } = await supa
        .from('whatsapp_accounts')
        .select('user_id')
        .eq('id', accountId)
        .maybeSingle();
      
      let isWarmupMessage = false;
      if (accountData?.user_id) {
        const { data: warmupSettings } = await supa
          .from('warmup_settings')
          .select('all_pairs')
          .eq('user_id', accountData.user_id)
          .maybeSingle();
        
        if (warmupSettings?.all_pairs) {
          const pairs = Array.isArray(warmupSettings.all_pairs) ? warmupSettings.all_pairs : [];
          const cleanPhone = phoneNumber.replace(/\D/g, '');
          
          for (const pair of pairs) {
            const phone1 = pair.phone1 ? pair.phone1.replace(/\D/g, '') : '';
            const phone2 = pair.phone2 ? pair.phone2.replace(/\D/g, '') : '';
            
            if ((pair.account1 === accountId && phone2 === cleanPhone) ||
                (pair.account2 === accountId && phone1 === cleanPhone)) {
              isWarmupMessage = true;
              console.log('[Message] Skipping warmup message from:', phoneNumber);
              break;
            }
          }
        }
      }
      
      // Skip saving warmup messages to the messages table entirely
      if (isWarmupMessage) {
        return;
      }

      // Prefer WhatsApp timestamp if available
      const sentAt = msg.timestamp
        ? new Date(msg.timestamp * 1000).toISOString()
        : new Date().toISOString();

      console.log('Message created:', {
        fromMe: msg.fromMe,
        peerJid,
        phoneNumber,
        direction,
        sentAt,
        preview: (msg.body || '').slice(0, 50)
      });

      // Get contact info - for outgoing messages, get the recipient's contact
      // For incoming messages, get the sender's contact
      let contactName = null;
      try {
        if (msg.fromMe) {
          // For outgoing messages, get the recipient's contact by their JID
          const recipientContact = await client.getContactById(peerJid);
          contactName = recipientContact.pushname || recipientContact.name || null;
        } else {
          // For incoming messages, get the sender's contact
          const contact = await msg.getContact();
          contactName = contact.pushname || contact.name || null;
        }
      } catch (err) {
        console.error('Error fetching contact name:', err);
      }

      // Check if message already exists to avoid duplicates
      const { data: existing } = await supa
        .from('messages')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_phone', phoneNumber)
        .eq('message_text', msg.body || '')
        .eq('sent_at', sentAt)
        .eq('direction', direction)
        .maybeSingle();

      if (existing) {
        console.log('Message already exists, skipping');
        return;
      }

      // Handle media if present
      let mediaUrl = null;
      let mediaType = null;
      let mediaMimetype = null;

      if (msg.hasMedia) {
        try {
          console.log('Message has media, downloading...');
          const media = await msg.downloadMedia();
          
          if (media) {
            const buffer = Buffer.from(media.data, 'base64');
            const fileExt = media.mimetype.split('/')[1].split(';')[0];
            const fileName = `${accountId}/${Date.now()}.${fileExt}`;
            
            console.log(`Uploading media to Supabase Storage: ${fileName}`);
            
            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supa.storage
              .from('whatsapp-media')
              .upload(fileName, buffer, {
                contentType: media.mimetype,
                upsert: false
              });

            if (uploadError) {
              console.error('Error uploading media:', uploadError);
            } else {
              const { data: publicUrlData } = supa.storage
                .from('whatsapp-media')
                .getPublicUrl(fileName);
              
              mediaUrl = publicUrlData.publicUrl;
              mediaMimetype = media.mimetype;
              
              // Determine media type
              if (media.mimetype.startsWith('image/')) {
                mediaType = 'image';
              } else if (media.mimetype.startsWith('video/')) {
                mediaType = 'video';
              } else if (media.mimetype.startsWith('audio/')) {
                mediaType = 'audio';
              } else {
                mediaType = 'document';
              }
              
              console.log(`Media uploaded successfully: ${mediaUrl}`);
            }
          }
        } catch (mediaError) {
          console.error('Error processing media:', mediaError);
        }
      }

      // Save message to database
      const { error } = await supa
        .from('messages')
        .insert({
          account_id: accountId,
          contact_phone: phoneNumber,
          contact_name: contactName,
          message_text: msg.body || (mediaType ? `[${mediaType}]` : ''),
          direction,
          sent_at: sentAt,
          is_read: msg.fromMe ? true : false,
          is_warmup: false,
          media_url: mediaUrl,
          media_type: mediaType,
          media_mimetype: mediaMimetype
        });

      if (error) {
        console.error('Error saving message:', error);
      } else {
        console.log('Message saved to database');
      }
    } catch (error) {
      console.error('Error handling message_create event:', error);
    }
  });

  // Disconnected event with Auto-Reconnect
  client.on('disconnected', async (reason) => {
    console.log('Client disconnected:', reason, 'for account:', accountId);
    clients.delete(accountId);
    messageQueues.delete(accountId);
    lastActivity.delete(accountId);
    
    // Clear QR timeout if exists
    const existingTimeout = qrTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      qrTimeouts.delete(accountId);
    }

    // Stop local proxy bridge if running
    const srv = proxyServers.get(accountId);
    if (srv) {
      try { await srv.close(); } catch (e) { console.warn('[Disconnect] Error closing proxy server:', e?.message || e); }
      proxyServers.delete(accountId);
    }
    
    // Update status in Supabase
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          status: 'disconnected',
          updated_at: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }

    // Auto-reconnect logic
    const attempts = reconnectAttempts.get(accountId) || 0;
    if (attempts < MAX_RECONNECT_ATTEMPTS) {
      console.log(`[Auto-Reconnect] Scheduling reconnect attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS} for ${accountId} in ${RECONNECT_DELAY}ms`);
      reconnectAttempts.set(accountId, attempts + 1);
      
      setTimeout(async () => {
        console.log(`[Auto-Reconnect] Attempting to reconnect ${accountId}...`);
        try {
          await initializeClient(accountId, userId, supabaseUrl, supabaseKey);
        } catch (error) {
          console.error(`[Auto-Reconnect] Failed to reconnect ${accountId}:`, error);
        }
      }, RECONNECT_DELAY);
    } else {
      console.log(`[Auto-Reconnect] Max reconnect attempts reached for ${accountId}`);
      reconnectAttempts.delete(accountId);
    }
  });

  // Authentication failure event
  client.on('auth_failure', async (msg) => {
    console.error(`[Auth Failure] Authentication failed for ${accountId}:`, msg);
    
    // Clear QR timeout if exists
    const existingTimeout = qrTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      qrTimeouts.delete(accountId);
    }

    // Stop local proxy bridge if running
    const srv = proxyServers.get(accountId);
    if (srv) {
      try { await srv.close(); } catch (e) { console.warn('[Auth Failure] Error closing proxy server:', e?.message || e); }
      proxyServers.delete(accountId);
    }
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          status: 'disconnected',
          qr_code: null,
          updated_at: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('[Auth Failure] Error updating status:', error);
    }
    
    clients.delete(accountId);
    messageQueues.delete(accountId);
    lastActivity.delete(accountId);
    reconnectAttempts.delete(accountId);
  });

  clients.set(accountId, client);
  messageQueues.set(accountId, new MessageQueue());
  
  await client.initialize();
  
  // Apply fingerprint overrides IMMEDIATELY after initialization, before WhatsApp loads
  console.log(`[Fingerprint] Applying fingerprint overrides for ${accountId} BEFORE WhatsApp loads`);
  try {
    // Wait a moment for browser to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const browser = await client.pupBrowser;
    const pages = await browser.pages();
    
    // Apply to all existing pages
    for (const page of pages) {
      await applyFingerprintOverrides(page, fingerprint, accountId);
    }
    
    // Listen for new pages and apply overrides immediately
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const page = await target.page();
        if (page) {
          await applyFingerprintOverrides(page, fingerprint, accountId);
        }
      }
    });
    
    console.log(`[Fingerprint] ✅ Fingerprint overrides applied successfully for ${accountId}`);
  } catch (err) {
    console.error(`[Fingerprint] ❌ Error applying overrides for ${accountId}:`, err);
  }
  
  return { success: true, message: 'Client initialized' };
}

// Helper function to apply fingerprint overrides to a page
async function applyFingerprintOverrides(page, fp, accountId) {
  try {
    await page.evaluateOnNewDocument((fp) => {
      // Override hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => fp.cores
      });
      
      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => {
          if (fp.userAgent.includes('Windows')) return 'Win32';
          if (fp.userAgent.includes('Macintosh')) return 'MacIntel';
          return 'Linux x86_64';
        }
      });
      
      // Override webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['de-DE', 'de', 'en-US', 'en']
      });
      
      // Canvas fingerprint noise
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          // Add minimal noise based on accountId
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ (fp.cores % 2);
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, args);
      };
      
      // WebGL fingerprint variation
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
          return 'Intel Inc.';
        }
        if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
          const renderers = [
            'Intel Iris OpenGL Engine',
            'ANGLE (Intel, Intel(R) UHD Graphics 620, OpenGL 4.1)',
            'Intel(R) HD Graphics 620'
          ];
          return renderers[fp.cores % renderers.length];
        }
        return getParameter.call(this, parameter);
      };
      
      // Screen resolution override
      Object.defineProperty(screen, 'width', {
        get: () => fp.resolution.width
      });
      Object.defineProperty(screen, 'height', {
        get: () => fp.resolution.height
      });
      Object.defineProperty(screen, 'availWidth', {
        get: () => fp.resolution.width
      });
      Object.defineProperty(screen, 'availHeight', {
        get: () => fp.resolution.height - 40
      });
      
    }, fp);
    
    console.log(`[Fingerprint] ✅ Overrides applied to page for ${accountId}`);
  } catch (err) {
    console.error(`[Fingerprint] ❌ Error applying overrides to page:`, err);
  }
}

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size });
});

// Get fingerprint info for an account
app.post('/api/fingerprint', async (req, res) => {
  const { accountId, supabaseUrl, supabaseKey } = req.body;
  
  if (!accountId || !supabaseUrl || !supabaseKey) {
    return res.status(400).json({
      success: false,
      error: 'accountId, supabaseUrl, and supabaseKey are required.'
    });
  }
  
  try {
    const fingerprint = generateFingerprint(accountId);
    
    // Get proxy info from database
    const supa = createClient(supabaseUrl, supabaseKey);
    
    const { data: accountData } = await supa
      .from('whatsapp_accounts')
      .select('proxy_server')
      .eq('id', accountId)
      .maybeSingle();
    
    let proxyInfo = null;
    if (accountData?.proxy_server) {
      try {
        proxyInfo = JSON.parse(accountData.proxy_server);
      } catch (e) {
        console.error('Error parsing proxy config:', e);
      }
    }
    
    res.json({
      success: true,
      fingerprint: {
        userAgent: fingerprint.userAgent,
        resolution: fingerprint.resolution,
        timezone: fingerprint.timezone,
        cores: fingerprint.cores
      },
      proxy: proxyInfo
    });
  } catch (error) {
    console.error('Error getting fingerprint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Heartbeat endpoint to keep connections alive and trigger reconnects
app.post('/api/heartbeat', async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[Heartbeat] Received at ${timestamp}, checking ${clients.size} clients...`);
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'Supabase credentials not configured' 
      });
    }

    const results = [];
    
    for (const [accountId, client] of clients.entries()) {
      try {
        const state = await client.getState();
        console.log(`[Heartbeat] Account ${accountId} state: ${state}`);
        
        results.push({
          accountId,
          state,
          isReady: state === 'CONNECTED',
        });

        // If disconnected, update database and remove from map
        if (state !== 'CONNECTED') {
          console.log(`[Heartbeat] Account ${accountId} not connected, updating database...`);
          
          await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              status: 'disconnected',
              updated_at: new Date().toISOString(),
            })
          });
          
          clients.delete(accountId);
          messageQueues.delete(accountId);
        } else {
          // Update last activity for active clients
          lastActivity.set(accountId, Date.now());
        }
      } catch (error) {
        console.error(`[Heartbeat] Error checking account ${accountId}:`, error);
        results.push({
          accountId,
          error: error.message,
          isReady: false,
        });
        
        // Remove problematic client
        clients.delete(accountId);
        messageQueues.delete(accountId);
      }
    }
    
    res.json({
      success: true,
      timestamp,
      checkedClients: results.length,
      activeClients: clients.size,
      results,
    });
  } catch (error) {
    console.error('[Heartbeat] Error during heartbeat check:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/initialize', async (req, res) => {
  try {
    const { accountId, userId, supabaseUrl, supabaseKey } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_KEY;

    console.log(`Initializing WhatsApp client for account: ${accountId}`);
    const result = await initializeClient(accountId, userId || accountId, url, key);
    res.json(result);
  } catch (error) {
    console.error('Error initializing client:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { accountId, phoneNumber, message } = req.body;
    lastActivity.set(accountId, Date.now());
    
    if (!accountId || !phoneNumber || !message) {
      return res.status(400).json({ error: 'accountId, phoneNumber and message are required' });
    }

    const client = clients.get(accountId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found or not initialized' });
    }

    const queue = messageQueues.get(accountId);
    
    queue.add(async () => {
      const formattedNumber = phoneNumber.includes('@c.us') 
        ? phoneNumber 
        : `${phoneNumber}@c.us`;
      
      await client.sendMessage(formattedNumber, message);
      console.log(`Message sent to ${phoneNumber}`);
    });

    res.json({ success: true, message: 'Message queued' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:accountId', (req, res) => {
  const { accountId } = req.params;
  const client = clients.get(accountId);
  
  if (!client) {
    return res.json({ connected: false });
  }
  
  res.json({ connected: true });
});

// Disconnect endpoint to properly clean up client instances
app.post('/api/disconnect', async (req, res) => {
  try {
    const { accountId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const client = clients.get(accountId);
    if (!client) {
      return res.json({ success: true, message: 'Client not found or already disconnected' });
    }

    console.log(`Disconnecting client for account: ${accountId}`);
    
    // Clear QR timeout if exists
    const existingTimeout = qrTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      qrTimeouts.delete(accountId);
    }
    
    // Destroy the client and clean up resources
    try {
      await client.destroy();
    } catch (err) {
      console.error('Error destroying client:', err);
    }
    
    clients.delete(accountId);
    messageQueues.delete(accountId);
    lastActivity.delete(accountId);
    reconnectAttempts.delete(accountId);
    
    console.log(`Client ${accountId} successfully disconnected and removed`);
    res.json({ success: true, message: 'Client disconnected' });
  } catch (error) {
    console.error('Error disconnecting client:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server status endpoint
app.get('/api/status', (req, res) => {
  try {
    const status = {
      activeClients: clients.size,
      clients: Array.from(clients.keys()).map(accountId => ({
        accountId,
        lastActivity: lastActivity.get(accountId) || null,
        idleMinutes: lastActivity.get(accountId) 
          ? Math.floor((Date.now() - lastActivity.get(accountId)) / 60000)
          : null
      })),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-cleanup idle clients every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [accountId, timestamp] of lastActivity.entries()) {
    const idleTime = now - timestamp;
    if (idleTime > IDLE_TIMEOUT) {
      console.log(`Auto-cleanup: Client ${accountId} idle for ${Math.floor(idleTime / 60000)} minutes`);
      const client = clients.get(accountId);
      if (client) {
        client.destroy().catch(err => console.error('Error destroying idle client:', err));
        clients.delete(accountId);
        messageQueues.delete(accountId);
        lastActivity.delete(accountId);
      }
    }
  }
}, 5 * 60 * 1000);

// Server status endpoint
app.get('/api/status', (req, res) => {
  try {
    const status = {
      activeClients: clients.size,
      clients: Array.from(clients.keys()).map(accountId => ({
        accountId,
        lastActivity: lastActivity.get(accountId) || null,
        idleMinutes: lastActivity.get(accountId) 
          ? Math.floor((Date.now() - lastActivity.get(accountId)) / 60000)
          : null
      })),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-cleanup idle clients
setInterval(async () => {
  const now = Date.now();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  
  for (const [accountId, timestamp] of lastActivity.entries()) {
    const idleTime = now - timestamp;
    if (idleTime > IDLE_TIMEOUT) {
      console.log(`[Auto-cleanup] Client ${accountId} idle for ${Math.floor(idleTime / 60000)} minutes, cleaning up...`);
      const client = clients.get(accountId);
      if (client) {
        try {
          await client.destroy();
          console.log(`[Auto-cleanup] Destroyed client ${accountId}`);
        } catch (err) {
          console.error(`[Auto-cleanup] Error destroying idle client ${accountId}:`, err);
        }
        
        // Update database status
        if (supabaseUrl && supabaseKey) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                status: 'disconnected',
                qr_code: null,
                updated_at: new Date().toISOString()
              })
            });
            console.log(`[Auto-cleanup] Updated database status for ${accountId} to disconnected`);
          } catch (dbErr) {
            console.error(`[Auto-cleanup] Error updating database for ${accountId}:`, dbErr);
          }
        }
        
        clients.delete(accountId);
        messageQueues.delete(accountId);
        lastActivity.delete(accountId);
      }
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

app.listen(PORT, async () => {
  console.log(`WhatsApp server running on port ${PORT}`);
  
  // Verify Supabase access on startup
  await verifySupabaseAccess();
  
  // Reset all connected accounts to disconnected
  await resetAccountStatuses();
  
  // Schedule periodic status checks every 2 minutes
  setInterval(checkClientStatuses, 120000);
  console.log('Status check scheduled every 2 minutes');
});
