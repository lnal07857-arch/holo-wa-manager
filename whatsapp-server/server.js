import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

// ═══════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS — catch silent Puppeteer crashes
// ═══════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason) => {
  console.error('🔥 Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught exception:', err.message, err.stack);
  // Don't exit — keep the server alive
});

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 3000;
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || '1';
const WORKER_ID = process.env.WORKER_ID || `worker-${ACCOUNT_INDEX.padStart(2, '0')}`;
const WORKER_SLOT = Number.isFinite(Number(process.env.WORKER_SLOT))
  ? Math.max(1, Number(process.env.WORKER_SLOT))
  : Math.max(1, Number(ACCOUNT_INDEX));
const WA_DATA_DIR = process.env.WA_DATA_DIR || '/app/data';

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
let connectionStatus = 'disconnected'; // disconnected | initializing | qr_required | connected
let syncInProgress = false;
let syncStartedAt = null;
let runtimeHealthInterval = null;
let runtimeHealthCheckInFlight = false;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SYNC_MESSAGE_LIMIT = Math.max(10, Number(process.env.SYNC_MESSAGE_LIMIT || 60));
const SYNC_CHAT_PAUSE_MS = Math.max(0, Number(process.env.SYNC_CHAT_PAUSE_MS || 120));
const RUNTIME_HEALTHCHECK_MS = Math.max(5000, Number(process.env.RUNTIME_HEALTHCHECK_MS || 15000));

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

// Remove stale session folders while keeping current account + default folder
async function cleanupOldAccounts(keepAccountId) {
  try {
    const entries = await fs.readdir(WA_DATA_DIR, { withFileTypes: true });
    const keepNames = new Set([
      'wa-001',
      String(keepAccountId || ''),
      `session-${String(keepAccountId || '')}`,
      String(currentAccountId || ''),
      `session-${String(currentAccountId || '')}`,
    ]);

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirName = entry.name;
      const looksLikeSessionDir =
        dirName.startsWith('session-') ||
        dirName.startsWith('LocalAuth-') ||
        dirName.startsWith('RemoteAuth-') ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dirName);

      if (!looksLikeSessionDir) continue;
      if (keepNames.has(dirName)) continue;

      await fs.rm(path.join(WA_DATA_DIR, dirName), { recursive: true, force: true });
      removed++;
      console.log(`🧹 Removed stale session dir: ${dirName}`);
    }

    if (removed > 0) {
      console.log(`🧹 cleanupOldAccounts done: removed ${removed} stale session dir(s)`);
    }
  } catch (e) {
    if (e?.code === 'ENOENT') {
      console.log(`ℹ️ WA_DATA_DIR not found (${WA_DATA_DIR}) - skipping cleanup`);
      return;
    }
    console.warn(`⚠️ cleanupOldAccounts warning: ${e.message}`);
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
        if (messages.length === 0) continue;

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
        const incoming = messages.filter(m => !m.fromMe);
        const unreadCount = chat.unreadCount || 0;
        const unreadIds = new Set();
        if (unreadCount > 0 && incoming.length > 0) {
          incoming.slice(-unreadCount).forEach(m => {
            if (m.id?._serialized) unreadIds.add(m.id._serialized);
          });
        }

        for (const msg of [...messages].reverse()) {
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
function stopRuntimeHealthWatchdog() {
  if (runtimeHealthInterval) {
    clearInterval(runtimeHealthInterval);
    runtimeHealthInterval = null;
  }
  runtimeHealthCheckInFlight = false;
}

function destroyClient() {
  stopRuntimeHealthWatchdog();
  if (waClient) {
    try { waClient.destroy(); } catch (e) { /* ignore */ }
    waClient = null;
  }
  currentAccountId = null;
  connectionStatus = 'disconnected';
}

async function isClientActuallyConnected(client) {
  if (!client) return false;
  try {
    // Check 1: Runtime state from WhatsApp
    const state = await client.getState();
    if (String(state || '').toUpperCase() !== 'CONNECTED') return false;

    // Check 2: Verify WID exists (proves phone is actually linked)
    if (!client.info || !client.info.wid || !client.info.wid.user) {
      console.warn('[StatusCheck] getState()=CONNECTED but no WID → ghost session');
      return false;
    }

    // Check 3: Browser page must still be alive
    if (client.pupPage?.isClosed?.()) {
      console.warn('[StatusCheck] Puppeteer page is closed → disconnected');
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[StatusCheck] Error checking connection:', e.message);
    return false;
  }
}

function startRuntimeHealthWatchdog(client, accountId) {
  stopRuntimeHealthWatchdog();

  runtimeHealthInterval = setInterval(async () => {
    if (runtimeHealthCheckInFlight) return;
    if (!waClient || waClient !== client) return;
    if (!currentAccountId || currentAccountId !== accountId) return;

    runtimeHealthCheckInFlight = true;
    try {
      const runtimeConnected = await isClientActuallyConnected(client);
      if (!runtimeConnected) {
        console.warn(`[Watchdog] Connection lost for ${accountId}. Marking disconnected.`);
        connectionStatus = 'disconnected';
        await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
        try { await client.destroy(); } catch (_) {}
        if (waClient === client) waClient = null;
        stopRuntimeHealthWatchdog();
      }
    } catch (e) {
      console.warn('[Watchdog] Health check error:', e.message);
    } finally {
      runtimeHealthCheckInFlight = false;
    }
  }, RUNTIME_HEALTHCHECK_MS);
}

async function getRuntimeStatus() {
  if (!waClient) return 'not_found';

  const runtimeConnected = await isClientActuallyConnected(waClient);
  if (runtimeConnected) {
    connectionStatus = 'connected';
    return 'connected';
  }

  // Ghost session detected: client exists but not truly connected
  if (connectionStatus === 'connected') {
    console.warn('[getRuntimeStatus] Ghost session detected → setting qr_required');
    connectionStatus = 'qr_required';
    if (currentAccountId) {
      updateAccount(currentAccountId, { status: 'pending', qr_code: null }).catch(() => {});
    }
    return 'qr_required';
  }

  if (connectionStatus === 'qr_required' || connectionStatus === 'pending') {
    return 'qr_required';
  }

  if (connectionStatus === 'disconnected') {
    return 'disconnected';
  }

  return 'initializing';
}

async function connectWhatsApp(accountId) {
  // Cleanup existing
  destroyClient();

  connectionStatus = 'initializing';
  currentAccountId = accountId;

  const resolvedExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
  console.log(`[Browser] Using executablePath: ${resolvedExecutablePath}`);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: accountId, dataPath: WA_DATA_DIR }),
    puppeteer: {
      headless: true,
      executablePath: resolvedExecutablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update',
      ]
    }
  });

  // QR scan timeout: if no 'authenticated' event within 90s after QR, clean up
  let qrScanTimeout = null;

  function clearQrTimeout() {
    if (qrScanTimeout) {
      clearTimeout(qrScanTimeout);
      qrScanTimeout = null;
    }
  }

  // QR Code
  client.on('qr', async (qr) => {
    console.log(`📱 QR received [${accountId}]`);
    qrcode.generate(qr, { small: true });
    connectionStatus = 'qr_required';

    // Reset timeout every time a new QR is generated
    clearQrTimeout();
    qrScanTimeout = setTimeout(async () => {
      if (connectionStatus === 'connected' || connectionStatus === 'disconnected') {
        return;
      }
      console.warn(`⏰ [QR Timeout] No auth event after 90s for ${accountId}. Cleaning up.`);
      connectionStatus = 'disconnected';
      await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
      destroyClient();
    }, 90000);

    await updateAccount(accountId, {
      qr_code: qr,
      status: 'pending',
      worker_id: WORKER_ID
    });
  });

  // Authenticated (fires AFTER QR scan, BEFORE ready)
  client.on('authenticated', async () => {
    console.log(`🔑 Authenticated [${accountId}] — QR scan successful, loading session...`);
    clearQrTimeout();
    connectionStatus = 'initializing';
    await updateAccount(accountId, {
      status: 'initializing',
      qr_code: null,
      worker_id: WORKER_ID,
    });
  });

  // Loading screen (shows WhatsApp web loading progress)
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading [${accountId}]: ${percent}% — ${message}`);
  });

  // Capture puppeteer page errors
  client.on('change_state', (state) => {
    console.log(`🔄 State change [${accountId}]: ${state}`);
  });

  // Ready
  client.on('ready', async () => {
    clearQrTimeout();
    console.log(`✅ WhatsApp ready event [${accountId}] — validating session...`);

    // ── Post-ready validation: prove session is real ──
    await sleep(2000); // Give WA web time to fully hydrate
    try {
      const state = await client.getState();
      const wid = client.info?.wid?.user;
      console.log(`[ReadyCheck] state=${state}, wid=${wid}`);

      if (String(state || '').toUpperCase() !== 'CONNECTED' || !wid) {
        console.warn(`⚠️ [ReadyCheck] Ghost session detected (state=${state}, wid=${wid}). Destroying...`);
        connectionStatus = 'disconnected';
        await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
        try { await client.destroy(); } catch (_) {}
        waClient = null;
        return;
      }
    } catch (validationErr) {
      console.warn(`⚠️ [ReadyCheck] Validation error: ${validationErr.message}. Destroying...`);
      connectionStatus = 'disconnected';
      await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
      try { await client.destroy(); } catch (_) {}
      waClient = null;
      return;
    }

    // ── Session is real ──
    console.log(`✅ WhatsApp VERIFIED connected [${accountId}]`);
    connectionStatus = 'connected';
    
    // Auto-detect phone number and push name (use closure `client` + retry)
    let phoneNumber = client?.info?.wid?.user || waClient?.info?.wid?.user || null;
    let pushName = client?.info?.pushname || waClient?.info?.pushname || null;
    
    // Retry once after short delay if info not yet populated
    if (!phoneNumber) {
      console.log(`[ReadyCheck] wid not available yet, retrying in 3s...`);
      await sleep(3000);
      phoneNumber = client?.info?.wid?.user || waClient?.info?.wid?.user || null;
      pushName = client?.info?.pushname || waClient?.info?.pushname || null;
      console.log(`[ReadyCheck] Retry result: wid=${phoneNumber}, pushname=${pushName}`);
    }
    
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

    // Keep runtime status honest even if WhatsApp stops sending disconnected events
    startRuntimeHealthWatchdog(client, accountId);

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
    clearQrTimeout();
    stopRuntimeHealthWatchdog();
    connectionStatus = 'disconnected';
    currentAccountId = null;
    await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
    waClient = null;
  });

  // Auth failure
  client.on('auth_failure', async (msg) => {
    console.error(`🔒 Auth failure [${accountId}]: ${msg}`);
    clearQrTimeout();
    stopRuntimeHealthWatchdog();
    connectionStatus = 'disconnected';
    currentAccountId = null;
    await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
    waClient = null;
  });

  waClient = client;

  try {
    await client.initialize();

    // Attach page-level crash detection AFTER initialize (pupPage exists now)
    if (client.pupPage) {
      client.pupPage.on('error', (err) => {
        console.error(`💥 [PupPage] Page crashed [${accountId}]: ${err.message}`);
        connectionStatus = 'disconnected';
        updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID }).catch(() => {});
        destroyClient();
      });
      client.pupPage.on('close', () => {
        console.error(`💥 [PupPage] Page closed unexpectedly [${accountId}]`);
        if (connectionStatus !== 'connected') {
          connectionStatus = 'disconnected';
          updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID }).catch(() => {});
          if (waClient === client) waClient = null;
        }
      });
      console.log(`[PupPage] Error handlers attached for ${accountId}`);
    }

    if (client.pupBrowser) {
      client.pupBrowser.on('disconnected', () => {
        console.error(`💥 [PupBrowser] Browser process disconnected [${accountId}]`);
        connectionStatus = 'disconnected';
        updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID }).catch(() => {});
        if (waClient === client) {
          waClient = null;
          currentAccountId = null;
        }
        stopRuntimeHealthWatchdog();
      });
    }
  } catch (initErr) {
    console.error(`❌ client.initialize() failed [${accountId}]: ${initErr.message}`);
    connectionStatus = 'disconnected';
    await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
    waClient = null;
    currentAccountId = null;
  }
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

    // Validate existing runtime session (prevents stale "connected" states)
    if (waClient && currentAccountId === accountId) {
      const runtimeConnected = await isClientActuallyConnected(waClient);
      if (runtimeConnected && connectionStatus === 'connected') {
        return res.json({ success: true, workerId: WORKER_ID, status: 'already_connected' });
      }

      console.warn(`⚠️ Stale client for ${accountId}; rebuilding...`);
      await updateAccount(accountId, {
        status: 'disconnected',
        qr_code: null,
        worker_id: WORKER_ID,
      });
      destroyClient();
    }

    if (waClient && currentAccountId && currentAccountId !== accountId) {
      const runtimeConnected = await isClientActuallyConnected(waClient);
      if (!runtimeConnected) {
        console.warn(`⚠️ Stale client for ${currentAccountId}; clearing worker state...`);
        await updateAccount(currentAccountId, {
          status: 'disconnected',
          qr_code: null,
          worker_id: WORKER_ID,
        });
        destroyClient();
      }
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
    await cleanupOldAccounts(accountId);

    connectWhatsApp(accountId).catch(async (err) => {
      console.error('❌ Connection error:', err.message);
      connectionStatus = 'disconnected';
      await updateAccount(accountId, { status: 'disconnected', qr_code: null, worker_id: WORKER_ID });
      destroyClient();
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
  (async () => {
    const status = await getRuntimeStatus();
    res.json({
      workerId: WORKER_ID,
      workerSlot: WORKER_SLOT,
      accountId: currentAccountId,
      connected: status === 'connected',
      status,
      syncInProgress,
      syncStartedAt,
      uptime: Math.round(process.uptime()),
    });
  })().catch(() => {
    res.status(500).json({ workerId: WORKER_ID, workerSlot: WORKER_SLOT, error: 'status_check_failed' });
  });
});

app.get('/api/status', (req, res) => {
  (async () => {
    const status = await getRuntimeStatus();
    const accounts = currentAccountId
      ? [{ accountId: currentAccountId, status, workerSlot: WORKER_SLOT }]
      : [];

    res.json({
      workerId: WORKER_ID,
      workerSlot: WORKER_SLOT,
      accounts,
      total: accounts.length,
      syncInProgress,
      syncStartedAt,
    });
  })().catch(() => {
    res.status(500).json({ workerId: WORKER_ID, workerSlot: WORKER_SLOT, error: 'status_check_failed' });
  });
});

app.get('/api/status/:accountId', (req, res) => {
  (async () => {
    const { accountId } = req.params;
    const status = await getRuntimeStatus();

    if (!currentAccountId || accountId !== currentAccountId) {
      return res.json({
        workerId: WORKER_ID,
        workerSlot: WORKER_SLOT,
        accountId,
        connected: false,
        status: 'not_found',
      });
    }

    res.json({
      workerId: WORKER_ID,
      workerSlot: WORKER_SLOT,
      accountId: currentAccountId,
      connected: status === 'connected',
      status,
      syncInProgress,
      syncStartedAt,
    });
  })().catch(() => {
    res.status(500).json({
      workerId: WORKER_ID,
      workerSlot: WORKER_SLOT,
      accountId: req.params.accountId,
      connected: false,
      status: 'error',
    });
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
        worker_id: WORKER_ID,
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
