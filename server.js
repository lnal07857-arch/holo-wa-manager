import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase client with service role key (bypasses RLS)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase client initialized:', supabaseUrl);

// Store active WhatsApp clients
const clients = new Map();

// Message queue for rate limiting
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.messageCount = 0;
    this.resetTime = Date.now() + 3600000;
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
      if (Date.now() > this.resetTime) {
        this.messageCount = 0;
        this.resetTime = Date.now() + 3600000;
      }

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
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }
    
    this.processing = false;
  }
}

const messageQueues = new Map();

// Helper: Update account in Supabase
async function updateAccount(accountId, data) {
  const { error } = await supabase
    .from('whatsapp_accounts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', accountId);
  
  if (error) {
    console.error(`❌ [Supabase] Update failed for ${accountId}:`, error.message);
  } else {
    console.log(`✅ [Supabase] Updated ${accountId}:`, Object.keys(data).join(', '));
  }
  return error;
}

// Initialize WhatsApp client
async function initializeClient(accountId, userId) {
  if (clients.has(accountId)) {
    return { success: true, message: 'Client already initialized' };
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: accountId }),
    puppeteer: {
      headless: true,
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
    console.log('📱 QR RECEIVED for', accountId);
    qrcode.generate(qr, { small: true });
    await updateAccount(accountId, { qr_code: qr, status: 'qr_generated' });
  });

  // Ready event
  client.on('ready', async () => {
    console.log('✅ Client is ready!', accountId);
    await updateAccount(accountId, { 
      status: 'connected', 
      qr_code: null, 
      last_connected_at: new Date().toISOString() 
    });
  });

  // Disconnected event
  client.on('disconnected', async (reason) => {
    console.log('❌ Client disconnected:', reason);
    clients.delete(accountId);
    messageQueues.delete(accountId);
    await updateAccount(accountId, { status: 'disconnected' });
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
    const { accountId, userId } = req.body;
    
    if (!accountId || !userId) {
      return res.status(400).json({ error: 'accountId and userId are required' });
    }

    // Start initialization in background (non-blocking)
    initializeClient(accountId, userId).catch(err => {
      console.error('Background init error:', err);
    });

    res.json({ 
      success: true, 
      accountId,
      status: 'initializing',
      message: 'Client initializing in background' 
    });
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

// Debug endpoint - test Supabase connection
app.get('/api/debug/supabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('id, status, qr_code')
      .limit(1);
    
    if (error) {
      return res.json({ ok: false, error: error.message });
    }
    res.json({ ok: true, supabaseUrl, rowCount: data.length, sample: data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp server running on port ${PORT}`);
});
