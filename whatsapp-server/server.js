const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store active WhatsApp clients
const clients = new Map();

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

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: accountId }),
    puppeteer: {
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
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
        
        // Check if there are any clients left
        if (clients.size === 0) {
          console.log('[Shutdown] No active clients remaining after QR timeout. Shutting down Railway instance in 10 seconds...');
          setTimeout(() => {
            console.log('[Shutdown] Goodbye!');
            process.exit(0);
          }, 10000);
        }
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

    // Check if there are any clients left
    if (clients.size === 0) {
      console.log('[Shutdown] No active clients remaining. Shutting down Railway instance in 10 seconds...');
      setTimeout(() => {
        console.log('[Shutdown] Goodbye!');
        process.exit(0);
      }, 10000);
      return;
    }

    // Auto-reconnect logic only if there are still other clients
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
    
    // Check if there are any clients left
    if (clients.size === 0) {
      console.log('[Shutdown] No active clients remaining after auth failure. Shutting down Railway instance in 10 seconds...');
      setTimeout(() => {
        console.log('[Shutdown] Goodbye!');
        process.exit(0);
      }, 10000);
    }
  });

  clients.set(accountId, client);
  messageQueues.set(accountId, new MessageQueue());
  
  await client.initialize();
  
  return { success: true, message: 'Client initialized' };
}

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size });
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
        
        // Check if there are any clients left after cleanup
        if (clients.size === 0) {
          console.log('[Shutdown] No active clients remaining after idle cleanup. Shutting down Railway instance in 10 seconds...');
          setTimeout(() => {
            console.log('[Shutdown] Goodbye!');
            process.exit(0);
          }, 10000);
        }
      }
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Reset all accounts to disconnected on server start
async function resetAccountStatuses() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('Skipping account status reset: Supabase credentials not configured');
      return;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?status=eq.connected`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'disconnected',
        qr_code: null,
        updated_at: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log('Reset all connected accounts to disconnected status');
    } else {
      console.error('Failed to reset account statuses:', response.status);
    }
  } catch (error) {
    console.error('Error resetting account statuses:', error);
  }
}

// Check all client statuses periodically
async function checkClientStatuses() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return;
  }

  console.log(`Checking status of ${clients.size} active clients...`);
  
  for (const [accountId, client] of clients.entries()) {
    try {
      const state = await client.getState();
      console.log(`Account ${accountId}: ${state}`);
      
      // If client is not connected, update database and remove from map
      if (state !== 'CONNECTED') {
        console.log(`Account ${accountId} is disconnected, updating database...`);
        
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
        
        clients.delete(accountId);
        messageQueues.delete(accountId);
        console.log(`Removed disconnected client ${accountId}`);
      }
    } catch (error) {
      console.error(`Error checking status for ${accountId}:`, error);
      // If there's an error getting state, assume disconnected
      clients.delete(accountId);
      messageQueues.delete(accountId);
    }
  }
}

app.listen(PORT, async () => {
  console.log(`WhatsApp server running on port ${PORT}`);
  await resetAccountStatuses();
  
  // Check client statuses every 2 minutes
  setInterval(checkClientStatuses, 2 * 60 * 1000);
  console.log('Status check scheduled every 2 minutes');
});
