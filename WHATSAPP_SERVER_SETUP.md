# WhatsApp Server Setup für Railway

Dieser Guide hilft dir, einen WhatsApp-Server mit whatsapp-web.js auf Railway zu deployen.

## 🚀 Schritt 1: Projekt-Struktur erstellen

Erstelle lokal einen neuen Ordner für deinen WhatsApp-Server:

```bash
mkdir whatsapp-server
cd whatsapp-server
```

## 📁 Dateien erstellen

### 1. `package.json`

```json
{
  "name": "whatsapp-server",
  "version": "1.0.0",
  "description": "WhatsApp Web Server with rate limiting and security",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "qrcode-terminal": "^0.12.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "node-fetch": "^2.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2. `server.js`

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store für WhatsApp Clients
const clients = new Map();

// Rate Limiting Config
const RATE_LIMIT = {
  MAX_MESSAGES_PER_HOUR: 50,
  MIN_DELAY: 2000, // 2 Sekunden
  MAX_DELAY: 5000, // 5 Sekunden
};

// Message Queue für Rate Limiting
class MessageQueue {
  constructor(accountId) {
    this.accountId = accountId;
    this.queue = [];
    this.processing = false;
    this.messageCount = 0;
    this.lastReset = Date.now();
  }

  async add(message) {
    // Reset counter jede Stunde
    if (Date.now() - this.lastReset > 3600000) {
      this.messageCount = 0;
      this.lastReset = Date.now();
    }

    // Rate Limit Check
    if (this.messageCount >= RATE_LIMIT.MAX_MESSAGES_PER_HOUR) {
      throw new Error('Hourly rate limit exceeded');
    }

    this.queue.push(message);
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const message = this.queue.shift();
      try {
        await this.sendMessage(message);
        this.messageCount++;
        
        // Zufällige Verzögerung (menschliches Verhalten)
        const delay = RATE_LIMIT.MIN_DELAY + 
          Math.random() * (RATE_LIMIT.MAX_DELAY - RATE_LIMIT.MIN_DELAY);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Pause nach jeweils 20 Nachrichten
        if (this.messageCount % 20 === 0) {
          console.log(`[${this.accountId}] Pause nach 20 Nachrichten (5 Min)`);
          await new Promise(resolve => setTimeout(resolve, 300000)); // 5 Min
        }
      } catch (error) {
        console.error(`[${this.accountId}] Fehler beim Senden:`, error);
      }
    }
    this.processing = false;
  }

  async sendMessage(message) {
    const client = clients.get(this.accountId);
    if (!client) throw new Error('Client not found');

    const chatId = message.phone.includes('@c.us') 
      ? message.phone 
      : `${message.phone.replace(/[^0-9]/g, '')}@c.us`;

    await client.sendMessage(chatId, message.text);
    console.log(`[${this.accountId}] Nachricht gesendet an ${chatId}`);
  }
}

const messageQueues = new Map();

// WhatsApp Client initialisieren
async function initializeClient(accountId, supabaseUrl, supabaseKey) {
  if (clients.has(accountId)) {
    console.log(`[${accountId}] Client bereits initialisiert`);
    return;
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

  // QR Code Event
  client.on('qr', async (qr) => {
    console.log(`[${accountId}] QR Code generiert`);
    qrcode.generate(qr, { small: true });

    // QR Code in Supabase speichern
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          qr_code: qr,
          status: 'disconnected'
        })
      });
    } catch (error) {
      console.error(`[${accountId}] Fehler beim QR-Speichern:`, error);
    }
  });

  // Ready Event
  client.on('ready', async () => {
    console.log(`[${accountId}] Client bereit!`);

    // Status in Supabase aktualisieren
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: 'connected',
          qr_code: null,
          last_connected_at: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error(`[${accountId}] Fehler beim Status-Update:`, error);
    }
  });

  // Disconnected Event
  client.on('disconnected', async (reason) => {
    console.log(`[${accountId}] Getrennt:`, reason);
    clients.delete(accountId);
    messageQueues.delete(accountId);

    // Status aktualisieren
    try {
      await fetch(`${supabaseUrl}/rest/v1/whatsapp_accounts?id=eq.${accountId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: 'disconnected'
        })
      });
    } catch (error) {
      console.error(`[${accountId}] Fehler beim Status-Update:`, error);
    }
  });

  await client.initialize();
  clients.set(accountId, client);
  messageQueues.set(accountId, new MessageQueue(accountId));
}

// API Endpoints

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// Client initialisieren
app.post('/api/initialize', async (req, res) => {
  try {
    const { accountId, supabaseUrl, supabaseKey } = req.body;
    
    if (!accountId || !supabaseUrl || !supabaseKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await initializeClient(accountId, supabaseUrl, supabaseKey);
    res.json({ success: true, message: 'Client initialization started' });
  } catch (error) {
    console.error('Initialize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Nachricht senden
app.post('/api/send-message', async (req, res) => {
  try {
    const { accountId, phone, text } = req.body;
    
    if (!accountId || !phone || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const queue = messageQueues.get(accountId);
    if (!queue) {
      return res.status(404).json({ error: 'Account not initialized' });
    }

    await queue.add({ phone, text });
    res.json({ success: true, message: 'Message queued' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Client Status abrufen
app.get('/api/status/:accountId', (req, res) => {
  const { accountId } = req.params;
  const client = clients.get(accountId);
  
  if (!client) {
    return res.json({ connected: false });
  }

  res.json({ 
    connected: true,
    state: client.pupPage ? 'ready' : 'initializing'
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`WhatsApp Server läuft auf Port ${PORT}`);
  console.log(`Railway URL wird automatisch zugewiesen`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM empfangen, beende Clients...');
  for (const [accountId, client] of clients.entries()) {
    console.log(`Beende Client: ${accountId}`);
    await client.destroy();
  }
  process.exit(0);
});
```

### 3. `.env` (für lokale Tests)

```env
PORT=3000
SUPABASE_URL=dein-supabase-url
SUPABASE_KEY=dein-supabase-anon-key
```

### 4. `.gitignore`

```
node_modules/
.wwebjs_auth/
.wwebjs_cache/
.env
*.log
```

### 5. `Dockerfile` (Optional, Railway kann auch ohne deployen)

```dockerfile
FROM node:18-slim

# Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

## 🚂 Schritt 2: Auf Railway deployen

### 1. **Railway Account erstellen**
- Gehe zu https://railway.app
- Registriere dich (GitHub Login empfohlen)

### 2. **Neues Projekt erstellen**
- Klicke auf "New Project"
- Wähle "Deploy from GitHub repo"
- Oder: "Empty Project" → "Deploy from GitHub repo" später

### 3. **GitHub Repository erstellen**
```bash
# In deinem whatsapp-server Ordner
git init
git add .
git commit -m "Initial WhatsApp server setup"

# Erstelle ein neues Repo auf GitHub und:
git remote add origin https://github.com/DEIN-USERNAME/whatsapp-server.git
git push -u origin main
```

### 4. **Repository mit Railway verbinden**
- Wähle dein GitHub Repository
- Railway erkennt automatisch Node.js
- Start Command: `npm start`

### 5. **Environment Variables setzen**
In Railway unter "Variables":
```
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4
```

### 6. **Deployment**
- Railway deployed automatisch bei jedem Git Push
- Kopiere die Railway-URL (z.B. `https://dein-projekt.up.railway.app`)

## 🔗 Schritt 3: Supabase Edge Function erstellen

Diese Edge Function verbindet deine Lovable-App mit dem Railway-Server.

Ich erstelle sie gleich im nächsten Schritt für dich!

## 📊 Monitoring

- **Railway Dashboard**: Logs & Metriken
- **Kosten**: ~$5-10/Monat (abhängig von Traffic)
- **Logs anschauen**: Railway Dashboard → Deployments → Logs

## 🔒 Wichtige Sicherheitshinweise

1. **Niemals** Supabase Keys in GitHub committen
2. Nutze Railway Environment Variables
3. Setze Rate Limits (bereits im Code)
4. Überwache die Logs regelmäßig

## ⚠️ Nächste Schritte

1. ✅ Server-Code lokal testen: `npm install && npm start`
2. ✅ Auf Railway deployen
3. ⏳ Ich erstelle jetzt die Supabase Edge Function
4. ⏳ Frontend-Integration anpassen
