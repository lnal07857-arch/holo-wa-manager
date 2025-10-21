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

// Sync messages from last 72 hours
async function syncRecentMessages(client, accountId, supa) {
  try {
    const chats = await client.getChats();
    console.log(`Found ${chats.length} chats to sync`);
    
    const cutoffTime = Date.now() - (72 * 60 * 60 * 1000); // 72 hours ago
    let totalSynced = 0;
    let totalSkipped = 0;

    for (const chat of chats) {
      try {
        // Fetch messages from this chat
        const messages = await chat.fetchMessages({ limit: 100 });
        
        // Filter messages from last 72 hours
        const recentMessages = messages.filter(msg => msg.timestamp * 1000 >= cutoffTime);
        
        console.log(`Chat ${chat.name || chat.id.user}: ${recentMessages.length} recent messages`);

        for (const msg of recentMessages) {
          try {
            // Get contact info
            const contact = await msg.getContact();
            const contactName = contact.pushname || contact.name || null;
            const phoneNumber = msg.from.replace('@c.us', '');
            const messageTime = new Date(msg.timestamp * 1000).toISOString();
            
            // Determine direction
            const direction = msg.fromMe ? 'outgoing' : 'incoming';

            // Check if message already exists (to avoid duplicates)
            const { data: existing } = await supa
              .from('messages')
              .select('id')
              .eq('account_id', accountId)
              .eq('contact_phone', phoneNumber)
              .eq('message_text', msg.body)
              .eq('sent_at', messageTime)
              .eq('direction', direction)
              .single();

            if (existing) {
              totalSkipped++;
              continue; // Skip if already exists
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
                is_read: msg.fromMe || false
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
    console.error('Error in syncRecentMessages:', error);
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

    // Sync messages from last 72 hours
    console.log('Starting message sync for last 72 hours...');
    try {
      await syncRecentMessages(client, accountId, supa);
    } catch (error) {
      console.error('Error syncing messages:', error);
    }
  });

  // Message event - handle incoming messages
  client.on('message', async (msg) => {
    try {
      console.log('Incoming message:', msg.from, msg.body);
      
      // Get contact info
      const contact = await msg.getContact();
      const contactName = contact.pushname || contact.name || null;
      
      // Clean phone number (remove @c.us)
      const phoneNumber = msg.from.replace('@c.us', '');
      
      // Save message to database
      const { error } = await supa
        .from('messages')
        .insert({
          account_id: accountId,
          contact_phone: phoneNumber,
          contact_name: contactName,
          message_text: msg.body,
          direction: 'incoming',
          sent_at: new Date().toISOString(),
          is_read: false
        });
      
      if (error) {
        console.error('Error saving incoming message:', error);
      } else {
        console.log('Incoming message saved to database');
      }
    } catch (error) {
      console.error('Error handling incoming message:', error);
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

app.listen(PORT, () => {
  console.log(`WhatsApp server running on port ${PORT}`);
});
