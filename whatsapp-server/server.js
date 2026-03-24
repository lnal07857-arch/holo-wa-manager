import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 3000;
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || '1';
const WORKER_ID = process.env.WORKER_ID || `worker-${ACCOUNT_INDEX.padStart(2, '0')}`;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log(`✅ Worker ${WORKER_ID} | Port ${PORT} | Supabase: ${supabaseUrl}`);

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let waClient = null;
let currentAccountId = null;
let connectionStatus = 'disconnected'; // disconnected | initializing | pending | connected
let syncInProgress = false;
let syncStartedAt = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SYNC_MESSAGE_LIMIT = Math.max(10, Number(process.env.SYNC_MESSAGE_LIMIT || 60));
const SYNC_CHAT_PAUSE_MS = Math.max(0, Number(process.env.SYNC_CHAT_PAUSE_MS || 120));

// ═══════════════════════════════════════════════════════════════
// MESSAGE QUEUE (Rate Limiting: 50/hour, 2-5s delay)
// ═══════════════════════════════════════════════════════════════
class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.messageCount = 0;
    this.resetTime = Date.now() + 3600000;
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      if (!this.processing) this.process();
    });
  }

  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      if (Date.now() > this.resetTime) {
        this.messageCount = 0;
        this.resetTime = Date.now() + 3600000;
      }
      if (this.messageCount >= 50) {
        const wait = this.resetTime - Date.now();
        console.log(`⏳ Rate limit, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        this.messageCount = 0;
        this.resetTime = Date.now() + 3600000;
      }
      const { task, resolve, reject } = this.queue.shift();
      try {
        const result = await task();
        this.messageCount++;
        resolve(result);
        await sleep(2000 + Math.random() * 3000);
      } catch (err) {
        console.error('[Queue] Error:', err.message);
        reject(err);
      }
    }
    this.processing = false;
  }
}

const messageQueue = new MessageQueue();

// ═══════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════
async function updateAccount(accountId, data) {
  const { error } = await supabase
    .from('whatsapp_accounts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) {
    console.error(`❌ DB update failed [${accountId}]:`, error.message);
  } else {
    console.log(`✅ DB updated [${accountId}]:`, Object.keys(data).join(', '));
  }
  return error;
}

// Reset any accounts that claim to be on this worker to disconnected (startup cleanup)
async function resetWorkerAccounts() {
  try {
    const { error } = await supabase
      .from('whatsapp_accounts')
      .update({ status: 'disconnected', qr_code: null, updated_at: new Date().toISOString() })
      .eq('worker_id', WORKER_ID)
      .in('status', ['connected', 'initializing', 'pending']);

    if (error) {
      console.error('❌ Startup reset failed:', error.message);
    } else {
      console.log(`✅ Startup: reset accounts on ${WORKER_ID} to disconnected`);
    }
  } catch (e) {
    console.error('❌ Startup reset error:', e.message);
  }
}

// Sync messages from WhatsApp to Supabase
async function syncMessages(client, accountId) {
  if (syncInProgress) {
    console.log(`[Sync] Skipped: already running since ${syncStartedAt || 'unknown'}`);
    return { started: false, reason: 'already_running', startedAt: syncStartedAt };
  }

  syncInProgress = true;
  syncStartedAt = new Date().toISOString();

  try {
    const chats = await client.getChats();
    console.log(`[Sync] ${chats.length} chats found`);

    let synced = 0, skipped = 0;
    const thirtyDaysAgo = Date.now() / 1000 - 30 * 86400;

    for (const chat of chats) {
      try {
        if (connectionStatus !== 'connected') {
          console.warn('[Sync] Aborted: client is no longer connected');
          break;
        }

        if (chat.isGroup || chat.id?._serialized?.endsWith('@g.us')) {
          continue;
        }

        let chatPhone = '';
        if (chat.id?.user) {
          chatPhone = chat.id.user.replace(/\D/g, '');
        } else if (chat.id?._serialized) {
          chatPhone = chat.id._serialized.split('@')[0].replace(/\D/g, '');
        }
        if (!chatPhone) continue;

        const messages = await chat.fetchMessages({ limit: SYNC_MESSAGE_LIMIT });
        const recent = messages.filter(m => m.timestamp >= thirtyDaysAgo);
        if (recent.length === 0) continue;

        let chatContactName = chat.name || null;
        if (!chatContactName) {
          try {
            const chatContact = await chat.getContact();
            chatContactName = chatContact?.pushname || chatContact?.name || null;
          } catch (e) {
            chatContactName = null;
          }
        }

        // Determine unread messages
        const incoming = recent.filter(m => !m.fromMe);
        const unreadCount = chat.unreadCount || 0;
        const unreadIds = new Set();
        if (unreadCount > 0 && incoming.length > 0) {
          incoming.slice(-unreadCount).forEach(m => {
            if (m.id?._serialized) unreadIds.add(m.id._serialized);
          });
        }

        for (const msg of [...recent].reverse()) {
          try {
            const peerJid = msg.fromMe ? msg.to : msg.from;
            const direction = msg.fromMe ? 'outgoing' : 'incoming';
            const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');
            const messageTime = new Date(msg.timestamp * 1000).toISOString();

            const isRead = msg.fromMe || !unreadIds.has(msg.id?._serialized);

            // Check duplicate
            const { data: existing } = await supabase
              .from('messages')
              .select('id')
              .eq('account_id', accountId)
              .eq('contact_phone', phoneNumber)
              .eq('message_text', msg.body)
              .eq('sent_at', messageTime)
              .eq('direction', direction)
              .maybeSingle();

            if (existing) { skipped++; continue; }

            const { error } = await supabase.from('messages').insert({
              account_id: accountId,
              contact_phone: phoneNumber,
              contact_name: chatContactName,
              message_text: msg.body,
              direction,
              sent_at: messageTime,
              is_read: isRead,
              is_warmup: false,
            });

            if (!error) synced++;
            await sleep(50);
          } catch (e) { /* skip message */ }
        }

        if (SYNC_CHAT_PAUSE_MS > 0) {
          await sleep(SYNC_CHAT_PAUSE_MS);
        }
      } catch (e) { /* skip chat */ }
    }

    console.log(`[Sync] Done: ${synced} new, ${skipped} skipped`);
    return { started: true, synced, skipped };
  } catch (e) {
    console.error('[Sync] Error:', e.message);
    return { started: true, error: e.message };
  } finally {
    syncInProgress = false;
    syncStartedAt = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════
function destroyClient() {
  if (waClient) {
    try { waClient.destroy(); } catch (e) { /* ignore */ }
    waClient = null;
  }
  currentAccountId = null;
  connectionStatus = 'disconnected';
}

async function connectWhatsApp(accountId) {
  // Cleanup existing
  destroyClient();

  connectionStatus = 'initializing';
  currentAccountId = accountId;

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

  // QR Code
  client.on('qr', async (qr) => {
    console.log(`📱 QR received [${accountId}]`);
    qrcode.generate(qr, { small: true });
    connectionStatus = 'pending';
    await updateAccount(accountId, {
      qr_code: qr,
      status: 'pending',
      worker_id: WORKER_ID
    });
  });

  // Ready
  client.on('ready', async () => {
    console.log(`✅ WhatsApp connected [${accountId}]`);
    connectionStatus = 'connected';
    
    // Auto-detect phone number and push name
    const phoneNumber = waClient?.info?.wid?.user || null;
    const pushName = waClient?.info?.pushname || null;
    
    const updateData = {
      status: 'connected',
      qr_code: null,
      worker_id: WORKER_ID,
      last_connected_at: new Date().toISOString()
    };
    
    if (phoneNumber) {
      updateData.phone_number = '+' + phoneNumber;
      console.log(`📱 Auto-detected phone: +${phoneNumber}`);
    }
    if (pushName) {
      // Only update account_name if it's still the default placeholder
      const { data: currentAccount } = await supabase
        .from('whatsapp_accounts')
        .select('account_name')
        .eq('id', accountId)
        .single();
      
      if (!currentAccount?.account_name || currentAccount.account_name === 'Neues Konto') {
        updateData.account_name = pushName;
        console.log(`👤 Auto-detected name: ${pushName}`);
      }
    }
    
    await updateAccount(accountId, updateData);

    // Background sync
    syncMessages(client, accountId).catch(e => {
      console.error('[Sync] Background sync error:', e.message);
    });
  });

  // ALL messages (incoming + outgoing from phone) → save to DB
  client.on('message_create', async (msg) => {
    try {
      // Skip status broadcasts and group messages
      if (msg.isStatus || msg.from === 'status@broadcast') return;
      
      const direction = msg.fromMe ? 'outgoing' : 'incoming';
      const peerJid = msg.fromMe ? msg.to : msg.from;
      const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');
      
      // Skip group messages
      if (peerJid.includes('@g.us')) return;
      
      let contactName = null;
      try {
        const contact = msg.fromMe
          ? await client.getContactById(msg.to)
          : await msg.getContact();
        contactName = contact?.pushname || contact?.name || null;
      } catch (e) { /* ignore */ }

      // Handle media
      let mediaUrl = null;
      let mediaType = null;
      let mediaMimetype = null;
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) {
            mediaType = media.mimetype?.split('/')[0] || 'document';
            mediaMimetype = media.mimetype || null;
            mediaUrl = `data:${media.mimetype};base64,${media.data}`;
            // Truncate very large media to avoid DB issues
            if (mediaUrl.length > 5000000) {
              console.log(`[Media] Skipping large media (${Math.round(mediaUrl.length / 1024)}KB)`);
              mediaUrl = null;
            }
          }
        } catch (e) {
          console.warn('[Media] Download failed:', e.message);
        }
      }

      const messageText = msg.body || (msg.hasMedia ? `[${mediaType || 'media'}]` : '');
      if (!messageText && !mediaUrl) return;

      // Deduplicate: check if this exact message already exists (from sync or previous insert)
      const sentAt = msg.timestamp 
        ? new Date(msg.timestamp * 1000).toISOString() 
        : new Date().toISOString();
      
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_phone', phoneNumber)
        .eq('direction', direction)
        .eq('sent_at', sentAt)
        .maybeSingle();
      
      if (existing) return; // Already saved (e.g. from sync)

      const { error } = await supabase.from('messages').insert({
        account_id: accountId,
        contact_phone: phoneNumber,
        contact_name: contactName,
        message_text: messageText,
        direction,
        sent_at: sentAt,
        is_read: msg.fromMe ? true : false,
        is_warmup: false,
        media_url: mediaUrl,
        media_type: mediaType,
        media_mimetype: mediaMimetype,
      });
      
      if (error) {
        console.error('❌ DB insert error:', error.message);
      } else {
        console.log(`${direction === 'incoming' ? '📥' : '📤'} ${direction} message saved from ${phoneNumber}`);
      }
    } catch (e) {
      console.error('❌ Error saving message:', e.message);
    }
  });

  // Message ACK (delivery/read receipts)
  client.on('message_ack', async (msg, ack) => {
    try {
      // ack values: 0=PENDING, 1=SERVER, 2=DEVICE, 3=READ, 4=PLAYED
      if (!msg.fromMe) return; // Only track outgoing messages
      
      const peerJid = msg.to;
      const phoneNumber = peerJid.replace('@c.us', '').replace('@g.us', '');
      if (peerJid.includes('@g.us')) return;
      
      const sentAt = msg.timestamp 
        ? new Date(msg.timestamp * 1000).toISOString() 
        : null;
      
      if (!sentAt) return;
      
      // Find and update the message in DB
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id, ack_status')
        .eq('account_id', accountId)
        .eq('contact_phone', phoneNumber)
        .eq('direction', 'outgoing')
        .eq('sent_at', sentAt)
        .maybeSingle();
      
      if (existingMsg && ack > (existingMsg.ack_status || 0)) {
        await supabase
          .from('messages')
          .update({ ack_status: ack })
          .eq('id', existingMsg.id);
        
        const ackLabels = ['PENDING', 'SERVER', 'DELIVERED', 'READ', 'PLAYED'];
        console.log(`✓ ACK ${ackLabels[ack] || ack} for msg to ${phoneNumber}`);
      }
    } catch (e) {
      console.error('❌ ACK handler error:', e.message);
    }
  });

  // Disconnected
  client.on('disconnected', async (reason) => {
    console.log(`❌ Disconnected [${accountId}]: ${reason}`);
    connectionStatus = 'disconnected';
    await updateAccount(accountId, { status: 'disconnected', worker_id: null });
    waClient = null;
  });

  // Auth failure
  client.on('auth_failure', async (msg) => {
    console.error(`🔒 Auth failure [${accountId}]: ${msg}`);
    connectionStatus = 'disconnected';
    await updateAccount(accountId, { status: 'disconnected', qr_code: null });
    waClient = null;
  });

  waClient = client;
  await client.initialize();
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    workerId: WORKER_ID,
    accountId: currentAccountId,
    connectionStatus,
    uptime: Math.round(process.uptime()),
  });
});

// POST /connect — Initialize WhatsApp & generate QR
app.post('/connect', async (req, res) => {
  try {
    const { accountId, userId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    // Already connected to this account
    if (waClient && currentAccountId === accountId && connectionStatus === 'connected') {
      return res.json({ success: true, workerId: WORKER_ID, status: 'already_connected' });
    }

    // Worker busy with different account
    if (waClient && currentAccountId && currentAccountId !== accountId) {
      return res.status(409).json({
        error: 'Worker busy',
        message: `Worker handling account ${currentAccountId}`,
        workerId: WORKER_ID,
      });
    }

    // Start connection in background
    connectWhatsApp(accountId).catch(err => {
      console.error('❌ Connection error:', err.message);
      connectionStatus = 'disconnected';
    });

    await updateAccount(accountId, { status: 'initializing', worker_id: WORKER_ID });

    res.json({
      success: true,
      workerId: WORKER_ID,
      accountId,
      status: 'initializing',
      message: 'QR code will appear shortly',
    });
  } catch (error) {
    console.error('❌ Connect error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Legacy endpoint
app.post('/api/initialize', (req, res) => {
  req.url = '/connect';
  app.handle(req, res);
});

// POST /send-message
app.post('/send-message', async (req, res) => {
  try {
    const { accountId, phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber and message are required' });
    }

    if (!waClient || connectionStatus !== 'connected') {
      return res.status(503).json({
        error: 'Not connected',
        workerId: WORKER_ID,
        status: connectionStatus,
      });
    }

    if (accountId && accountId !== currentAccountId) {
      return res.status(404).json({
        error: 'Account not on this worker',
        workerId: WORKER_ID,
        currentAccount: currentAccountId,
      });
    }

    const formattedNumber = phoneNumber.includes('@c.us')
      ? phoneNumber
      : `${phoneNumber.replace(/[^0-9]/g, '')}@c.us`;

    await messageQueue.add(async () => {
      await waClient.sendMessage(formattedNumber, message);
      console.log(`📤 Sent to ${phoneNumber}`);

      // Save outgoing message to DB
      await supabase.from('messages').insert({
        account_id: currentAccountId,
        contact_phone: phoneNumber.replace(/[^0-9]/g, ''),
        message_text: message,
        direction: 'outgoing',
        sent_at: new Date().toISOString(),
        is_read: true,
        is_warmup: false,
      });
    });

    res.json({ success: true, workerId: WORKER_ID, message: 'Message sent' });
  } catch (error) {
    console.error('❌ Send error:', error.message);
    res.status(500).json({ error: error.message, workerId: WORKER_ID });
  }
});

app.post('/api/send-message', (req, res) => {
  req.url = '/send-message';
  app.handle(req, res);
});

// GET /status
app.get('/status', (req, res) => {
  res.json({
    workerId: WORKER_ID,
    accountId: currentAccountId,
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    syncInProgress,
    syncStartedAt,
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/status/:accountId?', (req, res) => {
  const { accountId } = req.params;
  if (accountId && accountId !== currentAccountId) {
    return res.json({ connected: false, workerId: WORKER_ID });
  }
  res.json({
    workerId: WORKER_ID,
    accountId: currentAccountId,
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    syncInProgress,
    syncStartedAt,
  });
});

// POST /disconnect
app.post('/disconnect', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (accountId && accountId !== currentAccountId) {
      return res.status(404).json({ error: 'Account not on this worker', workerId: WORKER_ID });
    }

    if (currentAccountId) {
      await updateAccount(currentAccountId, {
        status: 'disconnected',
        qr_code: null,
        worker_id: null,
      });
    }

    destroyClient();

    res.json({ success: true, workerId: WORKER_ID, message: 'Disconnected' });
  } catch (error) {
    console.error('❌ Disconnect error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disconnect', (req, res) => {
  req.url = '/disconnect';
  app.handle(req, res);
});

// POST /sync-messages — Manual sync trigger
app.post('/sync-messages', async (req, res) => {
  try {
    const { accountId } = req.body || {};

    if (!waClient || connectionStatus !== 'connected') {
      return res.status(503).json({ error: 'Not connected', workerId: WORKER_ID });
    }

    if (accountId && accountId !== currentAccountId) {
      return res.status(404).json({
        error: 'Account not on this worker',
        workerId: WORKER_ID,
        currentAccount: currentAccountId,
      });
    }

    if (syncInProgress) {
      return res.status(202).json({
        success: true,
        workerId: WORKER_ID,
        syncInProgress: true,
        startedAt: syncStartedAt,
        message: 'Sync already running',
      });
    }

    // Run sync in background
    syncMessages(waClient, currentAccountId).catch(e => {
      console.error('[Sync] Error:', e.message);
    });

    res.json({
      success: true,
      workerId: WORKER_ID,
      syncInProgress: true,
      startedAt: syncStartedAt,
      message: 'Sync started',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync-messages', (req, res) => {
  req.url = '/sync-messages';
  app.handle(req, res);
});

// POST /send-bulk
app.post('/send-bulk', async (req, res) => {
  try {
    const { accountId, contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'contacts array is required' });
    }

    if (!waClient || connectionStatus !== 'connected') {
      return res.status(503).json({ error: 'Not connected', workerId: WORKER_ID });
    }

    if (accountId && accountId !== currentAccountId) {
      return res.status(404).json({ error: 'Account not on this worker', workerId: WORKER_ID });
    }

    let sent = 0, failed = 0;
    for (const contact of contacts) {
      try {
        const phone = (contact.phone || contact.phoneNumber || '').replace(/[^0-9]/g, '');
        const text = contact.message || contact.text || '';
        if (!phone || !text) { failed++; continue; }

        const formatted = `${phone}@c.us`;
        await messageQueue.add(async () => {
          await waClient.sendMessage(formatted, text);
          await supabase.from('messages').insert({
            account_id: currentAccountId,
            contact_phone: phone,
            message_text: text,
            direction: 'outgoing',
            sent_at: new Date().toISOString(),
            is_read: true,
            is_warmup: false,
          });
        });
        sent++;
      } catch (e) {
        failed++;
        console.error(`[Bulk] Failed for ${contact.phone}:`, e.message);
      }
    }

    res.json({ success: true, workerId: WORKER_ID, sent, failed, total: contacts.length });
  } catch (error) {
    res.status(500).json({ error: error.message, workerId: WORKER_ID });
  }
});

app.post('/api/send-bulk', (req, res) => {
  req.url = '/send-bulk';
  app.handle(req, res);
});

// Debug endpoint
app.get('/api/debug/supabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('id, status, worker_id')
      .limit(5);

    res.json({
      ok: !error,
      workerId: WORKER_ID,
      supabaseUrl,
      rows: data,
      error: error?.message,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════
async function startup() {
  await resetWorkerAccounts();

  app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Worker ${WORKER_ID} running on port ${PORT}`);
  });
}

startup().catch(err => {
  console.error('❌ Startup failed:', err);
  process.exit(1);
});
