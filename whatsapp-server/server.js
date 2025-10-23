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

// Sync all messages (no time limit)
async function syncAllMessages(client, accountId, supa) {
  try {
    const chats = await client.getChats();
    console.log(`Found ${chats.length} chats to sync`);
    
    let totalSynced = 0;
    let totalSkipped = 0;

    for (const chat of chats) {
      try {
        // Fetch messages from this chat (limit can be adjusted)
        const messages = await chat.fetchMessages({ limit: 100 });
        
        // Get unread count from WhatsApp
        const unreadCount = chat.unreadCount || 0;
        console.log(`Chat ${chat.name || chat.id.user}: ${messages.length} messages, ${unreadCount} unread`);

        // Process messages in reverse order (oldest first)
        const sortedMessages = [...messages].reverse();
        
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

            // Determine if message is read based on WhatsApp status
            // For outgoing: always read
            // For incoming: read if not in the last 'unreadCount' messages
            let isRead = false;
            if (msg.fromMe) {
              isRead = true; // Outgoing messages are always marked as read
            } else {
              // Incoming message: check if it's in the unread range
              const positionFromEnd = sortedMessages.length - 1 - i;
              isRead = positionFromEnd >= unreadCount; // If beyond unread count, it's read
            }

            // Check if message already exists
            const { data: existing } = await supa
              .from('messages')
              .select('id')
              .eq('account_id', accountId)
              .eq('contact_phone', phoneNumber)
              .eq('message_text', msg.body)
              .eq('sent_at', messageTime)
              .eq('direction', direction)
              .maybeSingle();

            if (existing) {
              totalSkipped++;
              continue;
            }

            // Insert message
            const { error } = await supa
              .from('messages')
              .insert({
                account_id: accountId,
                contact_phone: phoneNumber,
                contact_name: contactName,
                message_text: msg.body,
                direction: direction,
                sent_at: messageTime,
                is_read: isRead
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

    console.log(`Sync complete: ${totalSynced} new messages imported, ${totalSkipped} duplicates skipped`);
  } catch (error) {
    console.error('Error in syncAllMessages:', error);
  }
}

// Initialize WhatsApp client
async function initializeClient(accountId, userId, supabaseUrl, supabaseKey) {
  if (clients.has(accountId)) {
    return { success: true, message: 'Client already initialized' };
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
  });

  // Ready event
  client.on('ready', async () => {
    console.log('Client is ready!', accountId);
    
    // Update status in Supabase
    try {
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

    // Sync all messages
    console.log('Starting full message sync...');
    try {
      await syncAllMessages(client, accountId, supa);
    } catch (error) {
      console.error('Error syncing messages:', error);
    }
  });

  // Message event - handle new messages (incoming and outgoing from device)
  client.on('message_create', async (msg) => {
    try {
      // Determine correct peer JID and direction
      const peerJid = msg.fromMe ? msg.to : msg.from;
      const direction = msg.fromMe ? 'outgoing' : 'incoming';

      // Clean phone number (remove @c.us / @g.us)
      const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');

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

  // Disconnected event
  client.on('disconnected', async (reason) => {
    console.log('Client disconnected:', reason);
    clients.delete(accountId);
    messageQueues.delete(accountId);
    
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
    
    // Destroy the client and clean up resources
    try {
      await client.destroy();
    } catch (err) {
      console.error('Error destroying client:', err);
    }
    
    clients.delete(accountId);
    messageQueues.delete(accountId);
    
    console.log(`Client ${accountId} successfully disconnected and removed`);
    res.json({ success: true, message: 'Client disconnected' });
  } catch (error) {
    console.error('Error disconnecting client:', error);
    res.status(500).json({ error: error.message });
  }
});

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
