# 🔥 WhatsApp Account Warm-up - VPS Setup Guide

## Was ist Account Warm-up?

Account Warm-up ist ein **professionelles 3-Phasen-System über 21 Tage**, das neue WhatsApp Business Accounts langsam und sicher "einbrennt", bevor sie für Bulk-Messaging verwendet werden. Dies verhindert:

- ❌ Account-Blocks durch WhatsApp
- ❌ Spam-Markierung
- ❌ Niedrige Zustellraten

Das System lässt mehrere WhatsApp-Accounts **automatisch miteinander chatten** und simuliert dabei echtes, menschliches Verhalten.

## 📊 Das 3-Phasen-System

### Phase 1: Sanft (Tag 0-7)
- **Frequenz:** Alle 30-60 Minuten
- **Nachrichten:** 1-2 kurze Nachrichten pro Durchgang
- **Typing-Simulation:** 2-5 Sekunden
- **Ziel:** Grundlegende Account-Aktivität aufbauen

### Phase 2: Moderat (Tag 7-14)
- **Frequenz:** Alle 20-40 Minuten
- **Nachrichten:** 1-2 Nachrichten mit mehr Kontext
- **Typing-Simulation:** 3-8 Sekunden
- **Ziel:** Engagement-History aufbauen

### Phase 3: Intensiv (Tag 14+)
- **Frequenz:** Alle 10-20 Minuten
- **Nachrichten:** 1-2 professionellere Nachrichten
- **Typing-Simulation:** 5-12 Sekunden
- **Ziel:** Account für Bulk-Messaging vorbereiten

## 🎯 Bulk-Ready Kriterien

Ein Account gilt als "Bulk-Ready" wenn:
- ✅ **500+ Nachrichten** gesendet
- ✅ **15+ unique Kontakte** erreicht
- ✅ **Status:** `bulk_ready` in der Datenbank

---

## 🚀 VPS Implementation

### Architektur-Übersicht

```
┌─────────────────────────────────────────┐
│   Cron Job (alle 60 Sekunden)          │
│   → ruft warmup-service.js auf         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   warmup-service.js                     │
│   - Lädt Settings aus Supabase         │
│   - Prüft Aktiv-/Schlafzeiten          │
│   - Sendet Nachrichten via WA Server   │
│   - Updated Stats in Supabase          │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   WhatsApp Server (localhost:3000)     │
│   → POST /api/send-message              │
└─────────────────────────────────────────┘
```

---

## 📁 Dateistruktur

```
/opt/whatsapp-warmup/
├── warmup-service.js       # Haupt-Logik (Node.js Service)
├── package.json            # Dependencies
├── .env                    # Supabase Credentials
└── warmup.log              # Logfile (automatisch erstellt)
```

---

## 📝 Schritt-für-Schritt Installation

### 1️⃣ Verzeichnis erstellen

```bash
mkdir -p /opt/whatsapp-warmup
cd /opt/whatsapp-warmup
```

### 2️⃣ package.json erstellen

```bash
cat > package.json << 'EOF'
{
  "name": "whatsapp-warmup-service",
  "version": "1.0.0",
  "description": "WhatsApp Account Warm-up Service für VPS",
  "main": "warmup-service.js",
  "type": "module",
  "scripts": {
    "start": "node warmup-service.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.76.0",
    "node-fetch": "^3.3.2"
  }
}
EOF
```

### 3️⃣ Dependencies installieren

```bash
npm install
```

### 4️⃣ .env Datei erstellen

```bash
cat > .env << 'EOF'
# Supabase Credentials
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# WhatsApp Server URL (lokal auf VPS)
WA_SERVER_URL=http://localhost:3000

# Optional: Log Level
LOG_LEVEL=info
EOF
```

**WICHTIG:** Ersetze `your_service_role_key_here` mit dem echten Service Role Key!

### 5️⃣ warmup-service.js erstellen

```javascript
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// ============= KONFIGURATION =============
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WA_SERVER_URL = process.env.WA_SERVER_URL || 'http://localhost:3000';
const LOG_FILE = path.join(process.cwd(), 'warmup.log');

// ============= MESSAGE POOLS =============
const MESSAGE_POOLS = {
  phase1: [
    "Hey 👋",
    "Wie läuft dein Tag so?",
    "Alles klar bei dir?",
    "Kleiner Check-in: alles okay?",
    "Bin gleich wieder da, kurze Pause.",
    "Na, was geht?",
    "Alles fit?",
    "Kurze Frage: bist du erreichbar?",
    "Hey! Wie siehts aus?",
    "Moin!",
    "Servus 👋",
    "Hallo! Kurz Zeit?",
    "Yo, alles gut?",
    "Was machst du gerade?",
    "Bist du noch wach?",
    "Kurzes Update von mir",
    "Mal melden wollte ich",
    "Lange nichts gehört!",
    "Grüße!"
  ],
  phase2: [
    "Haha das war wirklich lustig 😂",
    "Schickst du mir mal das Foto von gestern?",
    "Ich probier's gleich nochmal — hat bei mir funktioniert.",
    "Welchen Kaffee trinkst du heute?",
    "Das Meeting wurde verschoben, kein Stress.",
    "Hast du die Nachricht bekommen?",
    "Perfekt, genau so machen wir das!",
    "Wie lief dein Termin?",
    "Das Wetter ist ja heute mega gut ☀️",
    "Hab grade an dich gedacht",
    "Kennst du das auch? 😅",
    "Bin gespannt was du dazu sagst",
    "Lass mal telefonieren die Tage",
    "Schau dir das mal an wenn du Zeit hast",
    "Genau mein Ding!",
    "Das passt perfekt",
    "Hätte nicht gedacht dass das klappt",
    "Mega interessant",
    "Hast du schon gehört?",
    "Weißt du noch von neulich?",
    "Das müssen wir nochmal machen",
    "War ne coole Sache"
  ],
  phase3: [
    "Hier der Link, den ich meinte: https://example.com",
    "Ich hab das jetzt getestet und es lief stabil.",
    "Können wir das morgen kurz durchgehen?",
    "Ich schicke dir mal die Info.",
    "Top, danke für die schnelle Rückmeldung!",
    "Das klingt nach einem guten Plan.",
    "Lass uns das so umsetzen wie besprochen.",
    "Hab dir ne Mail geschickt dazu",
    "Schau mal in die Gruppe rein",
    "Können wir das diese Woche noch klären?",
    "Passt mir gut, sag Bescheid",
    "Ich meld mich dann nochmal",
    "Lass uns das finalisieren",
    "Bin dabei, kein Problem",
    "Verstehe ich gut",
    "Macht absolut Sinn"
  ],
  emojis: ["😊", "👍", "😂", "🙌", "👌", "🔥", "✌️", "💪", "🤝", "⭐"],
  smallReplies: ["Ok", "Cool", "Klar", "Danke!", "Perfekt", "Super", "👍", "Genau"],
  responses: ["Ja genau", "Seh ich auch so", "Bei mir auch", "Stimmt total", "Auf jeden Fall"]
};

// ============= HELPER FUNCTIONS =============
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${level.toUpperCase()}] ${args.join(' ')}`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, message + '\n');
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function computePhase(startDate) {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (24 * 3600 * 1000));
  
  if (diffDays < 7) return 'phase1';
  if (diffDays < 14) return 'phase2';
  return 'phase3';
}

function inActiveHours(settings) {
  const hour = new Date().getHours();
  return hour >= settings.active_start_hour && hour < settings.active_end_hour;
}

function inSleepWindow(settings) {
  const hour = new Date().getHours();
  if (settings.sleep_start_hour < settings.sleep_end_hour) {
    return hour >= settings.sleep_start_hour && hour < settings.sleep_end_hour;
  } else {
    return hour >= settings.sleep_start_hour || hour < settings.sleep_end_hour;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= WHATSAPP API FUNCTIONS =============
async function checkAccountStatus(accountId) {
  try {
    const response = await fetch(`${WA_SERVER_URL}/api/status/${accountId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.ready === true || data.status === 'connected' || data.state === 'CONNECTED';
  } catch (error) {
    log('error', `Status check failed for ${accountId}:`, error.message);
    return false;
  }
}

async function sendMessage(accountId, phoneNumber, message) {
  try {
    const response = await fetch(`${WA_SERVER_URL}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId,
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        message
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    log('error', `Send message failed:`, error.message);
    throw error;
  }
}

// ============= MAIN WARMUP LOGIC =============
async function runWarmupCycle() {
  log('info', '🔥 Starting warmup cycle');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // 1. Load active warmup settings
    const { data: warmupSettings, error: settingsError } = await supabase
      .from('warmup_settings')
      .select('*')
      .eq('is_running', true);

    if (settingsError) throw settingsError;

    if (!warmupSettings || warmupSettings.length === 0) {
      log('info', 'No active warmup sessions found');
      return;
    }

    log('info', `Found ${warmupSettings.length} active session(s)`);

    // 2. Process each user's settings
    for (const settings of warmupSettings) {
      log('info', `Processing user ${settings.user_id}`);
      
      // Check sleep window
      if (inSleepWindow(settings)) {
        log('info', 'In sleep window, skipping');
        continue;
      }

      // Check interval
      const now = new Date();
      const lastRun = settings.last_run_at ? new Date(settings.last_run_at) : null;
      const minutesSinceLastRun = lastRun
        ? (now.getTime() - lastRun.getTime()) / (1000 * 60)
        : Infinity;

      // Allow some activity outside active hours (5% chance)
      if (!inActiveHours(settings) && Math.random() > 0.05) {
        log('info', 'Outside active hours, skipping');
        continue;
      }

      // 3. Fetch connected accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('whatsapp_accounts')
        .select('*')
        .eq('user_id', settings.user_id)
        .eq('status', 'connected');

      if (accountsError) throw accountsError;

      // 4. Verify live status
      const activeAccounts = [];
      for (const acc of accounts || []) {
        const isLive = await checkAccountStatus(acc.id);
        if (isLive) activeAccounts.push(acc);
      }

      log('info', `Active accounts: ${activeAccounts.length}/${accounts?.length || 0}`);

      if (activeAccounts.length < 2) {
        log('warn', 'Not enough live accounts (need at least 2)');
        continue;
      }

      // Check interval AFTER verifying accounts
      if (minutesSinceLastRun < settings.interval_minutes) {
        log('info', `Interval not reached (${minutesSinceLastRun.toFixed(1)}m < ${settings.interval_minutes}m)`);
        continue;
      }

      // 5. Compute current phase
      const phase = computePhase(settings.started_at ? new Date(settings.started_at) : now);
      log('info', `Current phase: ${phase}`);
      
      if (settings.phase !== phase) {
        await supabase
          .from('warmup_settings')
          .update({ phase })
          .eq('user_id', settings.user_id);
      }

      // 6. Generate/manage account pairs
      const activeIds = new Set(activeAccounts.map(a => a.id));
      let accountPairs = (settings.all_pairs || []);
      let currentPairIndex = settings.current_pair_index || 0;

      // Filter pairs to active accounts only
      accountPairs = accountPairs.filter(
        p => activeIds.has(p[0]) && activeIds.has(p[1])
      );
      
      const expectedPairs = (activeAccounts.length * (activeAccounts.length - 1)) / 2;
      
      // Regenerate if needed
      if (!accountPairs || accountPairs.length !== expectedPairs || currentPairIndex >= accountPairs.length) {
        accountPairs = [];
        
        for (let i = 0; i < activeAccounts.length; i++) {
          for (let j = i + 1; j < activeAccounts.length; j++) {
            accountPairs.push([activeAccounts[i].id, activeAccounts[j].id]);
          }
        }
        
        accountPairs.sort(() => Math.random() - 0.5);
        currentPairIndex = 0;
        
        log('info', `Generated ${accountPairs.length} pairs`);
      }

      const currentPair = accountPairs[currentPairIndex];
      
      if (!currentPair || currentPair.length !== 2) {
        log('warn', 'Invalid pair, skipping');
        continue;
      }

      const [senderId, receiverId] = currentPair;
      const senderAccount = activeAccounts.find(a => a.id === senderId);
      const receiverAccount = activeAccounts.find(a => a.id === receiverId);

      if (!senderAccount || !receiverAccount) {
        log('warn', 'Accounts not found in active set');
        continue;
      }

      // 7. Send messages
      const messagesToSend = Math.random() < 0.7 ? 1 : 2;
      const shouldReceiverRespond = Math.random() < 0.5;
      const actualSender = shouldReceiverRespond ? receiverAccount : senderAccount;
      const actualReceiver = shouldReceiverRespond ? senderAccount : receiverAccount;
      
      log('info', `${actualSender.account_name} → ${actualReceiver.account_name} (${messagesToSend} msg)`);

      let sentCount = 0;
      
      for (let i = 0; i < messagesToSend; i++) {
        // Select message
        let message;
        const r = Math.random();
        
        if (r < 0.15) {
          message = pick(MESSAGE_POOLS.smallReplies);
        } else if (r < 0.25) {
          message = pick(MESSAGE_POOLS.responses);
        } else if (r < 0.35) {
          message = `${pick(MESSAGE_POOLS.emojis)} ${pick(MESSAGE_POOLS[phase])}`;
        } else if (r < 0.45) {
          message = pick(MESSAGE_POOLS.emojis);
        } else {
          message = pick(MESSAGE_POOLS[phase]);
        }

        try {
          // Typing simulation
          const typingMs = randInt(settings.min_typing_ms, settings.max_typing_ms);
          await sleep(typingMs);

          // Delay between messages
          const delaySec = randInt(settings.min_delay_sec, Math.min(settings.max_delay_sec, 20));
          await sleep(delaySec * 1000);

          // Send message
          await sendMessage(actualSender.id, actualReceiver.phone_number, message);

          // Store in database
          await supabase.from('messages').insert({
            account_id: actualSender.id,
            contact_phone: actualReceiver.phone_number,
            contact_name: actualReceiver.account_name,
            message_text: message,
            direction: 'outgoing',
            is_warmup: true,
            sent_at: now.toISOString()
          });

          await supabase.from('messages').insert({
            account_id: actualReceiver.id,
            contact_phone: actualSender.phone_number,
            contact_name: actualSender.account_name,
            message_text: message,
            direction: 'incoming',
            is_warmup: true,
            sent_at: now.toISOString()
          });

          // Update stats
          await supabase.rpc('increment_warmup_stats', {
            p_account_id: actualSender.id,
            p_to_phone: actualReceiver.phone_number.replace(/\D/g, ''),
            p_count: 1
          });
          
          const { data: receiverStats } = await supabase
            .from('account_warmup_stats')
            .select('received_messages')
            .eq('account_id', actualReceiver.id)
            .single();
          
          await supabase
            .from('account_warmup_stats')
            .upsert({
              user_id: settings.user_id,
              account_id: actualReceiver.id,
              received_messages: (receiverStats?.received_messages || 0) + 1
            }, {
              onConflict: 'account_id'
            });

          sentCount++;
          log('info', `✓ Sent ${i + 1}/${messagesToSend}: "${message.substring(0, 40)}"`);
          
        } catch (error) {
          log('error', `Failed to send message:`, error.message);
          
          // Increment blocks counter
          const { data: statsData } = await supabase
            .from('account_warmup_stats')
            .select('blocks')
            .eq('account_id', actualSender.id)
            .single();
          
          await supabase
            .from('account_warmup_stats')
            .upsert({
              user_id: settings.user_id,
              account_id: actualSender.id,
              blocks: (statsData?.blocks || 0) + 1
            }, {
              onConflict: 'account_id'
            });
          
          break;
        }
      }

      // 8. Update settings
      const nextPairIndex = currentPairIndex + 1;
      const completedRounds = nextPairIndex >= accountPairs.length 
        ? (settings.completed_rounds || 0) + 1 
        : settings.completed_rounds;

      await supabase
        .from('warmup_settings')
        .update({
          last_run_at: now.toISOString(),
          messages_sent: (settings.messages_sent || 0) + sentCount,
          all_pairs: accountPairs,
          current_pair_index: nextPairIndex >= accountPairs.length ? 0 : nextPairIndex,
          completed_rounds: completedRounds,
          last_message: sentCount > 0 ? `${actualSender.account_name} → ${actualReceiver.account_name}` : settings.last_message
        })
        .eq('user_id', settings.user_id);

      log('info', `✅ Cycle complete: ${sentCount} sent | Phase ${phase} | Round ${completedRounds}`);
    }

    log('info', '✅ Warmup cycle finished successfully');

  } catch (error) {
    log('error', 'Warmup cycle error:', error.message);
    console.error(error);
  }
}

// ============= MAIN EXECUTION =============
(async () => {
  log('info', '🚀 Warmup service started');
  await runWarmupCycle();
  log('info', '👋 Warmup service finished');
  process.exit(0);
})();
```

Speichere die Datei:
```bash
nano warmup-service.js
# Füge den Code ein und speichere mit Ctrl+X, dann Y, dann Enter
```

---

## ⏰ Cron Job einrichten

### Option A: User Cron (empfohlen)

```bash
# Crontab öffnen
crontab -e

# Folgende Zeile hinzufügen (läuft jede Minute)
* * * * * cd /opt/whatsapp-warmup && /usr/bin/node warmup-service.js >> /opt/whatsapp-warmup/warmup.log 2>&1

# Speichern und beenden (Ctrl+X, Y, Enter)
```

### Option B: Systemd Service (für Produktion)

```bash
# Service-Datei erstellen
sudo nano /etc/systemd/system/whatsapp-warmup.timer

# Inhalt:
[Unit]
Description=WhatsApp Warmup Timer
Requires=whatsapp-warmup.service

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
```

```bash
# Service-Datei erstellen
sudo nano /etc/systemd/system/whatsapp-warmup.service

# Inhalt:
[Unit]
Description=WhatsApp Warmup Service
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/whatsapp-warmup
Environment=NODE_ENV=production
EnvironmentFile=/opt/whatsapp-warmup/.env
ExecStart=/usr/bin/node /opt/whatsapp-warmup/warmup-service.js
StandardOutput=append:/opt/whatsapp-warmup/warmup.log
StandardError=append:/opt/whatsapp-warmup/warmup.log

[Install]
WantedBy=multi-user.target
```

```bash
# Timer aktivieren
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-warmup.timer
sudo systemctl start whatsapp-warmup.timer

# Status prüfen
sudo systemctl status whatsapp-warmup.timer
```

---

## 🧪 Testing

### Manuell testen

```bash
cd /opt/whatsapp-warmup
node warmup-service.js
```

**Erwartete Ausgabe:**
```
[2025-01-11T10:30:00.000Z] [INFO] 🚀 Warmup service started
[2025-01-11T10:30:00.100Z] [INFO] 🔥 Starting warmup cycle
[2025-01-11T10:30:00.500Z] [INFO] Found 1 active session(s)
[2025-01-11T10:30:00.600Z] [INFO] Processing user 24847a23-9067-45a6-9596-08ed5daf79fc
[2025-01-11T10:30:01.200Z] [INFO] Active accounts: 3/3
[2025-01-11T10:30:01.300Z] [INFO] Current phase: phase1
[2025-01-11T10:30:01.400Z] [INFO] Account-1 → Account-2 (1 msg)
[2025-01-11T10:30:05.000Z] [INFO] ✓ Sent 1/1: "Hey 👋"
[2025-01-11T10:30:05.100Z] [INFO] ✅ Cycle complete: 1 sent | Phase phase1 | Round 0
[2025-01-11T10:30:05.200Z] [INFO] ✅ Warmup cycle finished successfully
[2025-01-11T10:30:05.300Z] [INFO] 👋 Warmup service finished
```

### Logs überwachen

```bash
# Live logs verfolgen
tail -f /opt/whatsapp-warmup/warmup.log

# Letzte 50 Zeilen
tail -n 50 /opt/whatsapp-warmup/warmup.log

# Nach Errors suchen
grep -i error /opt/whatsapp-warmup/warmup.log
```

### Cron Job prüfen

```bash
# Cron logs anzeigen
grep CRON /var/log/syslog | tail -n 20

# Oder bei Systemd
journalctl -u whatsapp-warmup.timer -f
```

---

## 📊 Frontend Integration

Das Frontend (AutoChat.tsx) muss **NICHT geändert werden**! Es funktioniert bereits mit der Datenbank:

1. **Frontend startet/stoppt** über `warmup_settings.is_running`
2. **Service liest** diese Einstellung jede Minute
3. **Stats werden live angezeigt** via Realtime Subscriptions

### Deployment-Schritte

```bash
# Frontend bauen (lokal auf deinem PC)
cd /pfad/zu/deinem/projekt
npm run build

# Build hochladen
scp -r dist/* root@YOUR_VPS_IP:/var/www/html/

# Nginx neu laden
ssh root@YOUR_VPS_IP
systemctl reload nginx
```

---

## 🔍 Monitoring & Wartung

### Wichtige Commands

```bash
# Service Status (Systemd)
sudo systemctl status whatsapp-warmup.timer
sudo journalctl -u whatsapp-warmup.service -f

# Logs rotieren (falls Datei zu groß wird)
sudo logrotate -f /etc/logrotate.d/whatsapp-warmup

# Log-Rotation Config erstellen
sudo nano /etc/logrotate.d/whatsapp-warmup
```

**Inhalt:**
```
/opt/whatsapp-warmup/warmup.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

### Health Check Script

```bash
cat > /opt/whatsapp-warmup/check-health.sh << 'EOF'
#!/bin/bash
LOGFILE="/opt/whatsapp-warmup/warmup.log"
RECENT_LOGS=$(tail -n 50 "$LOGFILE")

if echo "$RECENT_LOGS" | grep -q "ERROR"; then
    echo "⚠️  ERRORS detected in warmup logs!"
    echo "$RECENT_LOGS" | grep ERROR
    exit 1
else
    echo "✅ Warmup service healthy"
    exit 0
fi
EOF

chmod +x /opt/whatsapp-warmup/check-health.sh

# Ausführen
/opt/whatsapp-warmup/check-health.sh
```

---

## 🆘 Troubleshooting

### Problem: "No active warmup sessions found"

**Lösung:**
- Prüfe ob `is_running = true` in der Datenbank: `warmup_settings` Tabelle
- Starte Warmup im Frontend über den "Warm-up Starten" Button

### Problem: "Not enough live accounts"

**Lösung:**
```bash
# Prüfe WhatsApp Server Status
curl http://localhost:3000/api/status/account-1
curl http://localhost:3000/api/status/account-2

# Accounts neu initialisieren
curl -X POST http://localhost:3000/api/initialize/account-1
```

### Problem: Cron Job läuft nicht

**Lösung:**
```bash
# Cron Service prüfen
sudo systemctl status cron

# Crontab anzeigen
crontab -l

# Logs prüfen
grep CRON /var/log/syslog | tail -n 20
```

### Problem: "Send message failed"

**Lösung:**
- Prüfe ob WhatsApp Server läuft: `pm2 status`
- Prüfe Netzwerk: `curl http://localhost:3000/health`
- Prüfe Account-Status in WhatsApp Web (QR-Code scannen)

---

## 🎯 Best Practices

### 1. **Starte mit wenigen Accounts**
- Beginne mit 2-3 Accounts
- Erhöhe nach erfolgreichen Tests

### 2. **Überwache die ersten 24h intensiv**
```bash
watch -n 10 'tail -n 20 /opt/whatsapp-warmup/warmup.log'
```

### 3. **Backup der Sessions**
```bash
# Täglich um 2 Uhr nachts
0 2 * * * tar -czf /opt/backups/wa-sessions-$(date +\%Y\%m\%d).tar.gz /opt/whatsapp-server/sessions/
```

### 4. **Monitoring via Telegram/Email**
```bash
# Bei Errors Benachrichtigung senden
*/5 * * * * /opt/whatsapp-warmup/check-health.sh || curl -X POST https://api.telegram.org/botTOKEN/sendMessage -d chat_id=CHATID -d text="Warmup Error!"
```

---

## 📈 Performance-Tipps

- **RAM-Nutzung:** ~50-100 MB pro Warmup-Zyklus
- **CPU:** Minimal (<5% auf 2-Core VPS)
- **Netzwerk:** ~1-2 KB pro Nachricht
- **Empfohlener VPS:** Hetzner CX21 (2 vCPU, 4GB RAM) oder besser

---

## ✅ Checkliste vor Go-Live

- [ ] Supabase Credentials korrekt in `.env`
- [ ] WhatsApp Server läuft und ist erreichbar
- [ ] Mindestens 2 Accounts verbunden (Status: `connected`)
- [ ] Cron Job aktiv (`crontab -l` zeigt Eintrag)
- [ ] Logs zeigen erfolgreiche Zyklen
- [ ] Frontend zeigt Live-Stats korrekt an
- [ ] Backup-Strategie für Sessions eingerichtet

---

## 🔗 Weitere Ressourcen

- [Supabase RPC Functions Docs](https://supabase.com/docs/guides/database/functions)
- [Node.js Cron Best Practices](https://nodejs.org/en/docs/)
- [PM2 Process Manager](https://pm2.keymetrics.io/)

---

**Viel Erfolg mit deinem Account Warm-up System! 🔥**

Bei Fragen: Logfile prüfen → Troubleshooting-Section → Support
