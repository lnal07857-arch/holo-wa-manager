# 🔄 Migration Guide: WireGuard Multi-Container → Single Process

## Überblick

Diese Anleitung hilft dir, von der alten WireGuard-basierten Multi-Container-Architektur zur neuen Single-Process-Lösung zu migrieren.

---

## 🆚 Vergleich: Alt vs. Neu

| Aspekt | Alt (WireGuard) | Neu (Single Process) |
|--------|----------------|----------------------|
| **Container** | 20 separate | 1 Container |
| **Prozesse** | 20× Node.js + Chromium | 1× Node.js, shared Chromium |
| **RAM-Bedarf** | ~20 GB (1 GB pro Account) | ~6-8 GB (shared resources) |
| **VPN/Proxy** | WireGuard pro Container | Nicht implementiert |
| **Kernel-Rechte** | `NET_ADMIN`, `SYS_MODULE` | Keine |
| **Railway-Support** | ❌ Nicht möglich | ✅ Vollständig |
| **Setup-Zeit** | ~30 Minuten | ~5 Minuten |
| **Port-Range** | 3001-3020 (20 Ports) | 8080 (1 Port) |
| **Load Balancer** | Nginx erforderlich | Nicht nötig |

---

## 📋 Migrations-Schritte

### Phase 1: Backup & Vorbereitung

#### 1. Sessions sichern (falls vorhanden)
```bash
# Alte Sessions aus Docker-Volumes exportieren
docker cp wa-account-1:/app/.wwebjs_auth ./backup/sessions/account-1
docker cp wa-account-2:/app/.wwebjs_auth ./backup/sessions/account-2
# ... für alle Accounts
```

#### 2. Alte Umgebungsvariablen notieren
```bash
# Aus .env oder docker-compose.yml
SUPABASE_URL=...
SUPABASE_KEY=...
```

#### 3. Alte Services stoppen
```bash
docker-compose down
# oder
docker stop $(docker ps -q --filter "name=wa-account-")
```

---

### Phase 2: Neue Version deployen

#### 1. Code aktualisieren
```bash
# Alte Dateien archivieren
mkdir -p archive/old-wireguard
mv docker-compose.yml archive/old-wireguard/
mv Dockerfile.wireguard archive/old-wireguard/
mv docker-entrypoint.sh archive/old-wireguard/
mv nginx.conf archive/old-wireguard/

# Git-Status prüfen
git status
git add .
git commit -m "Migrate to single-process architecture"
git push
```

#### 2. Railway neu deployen
1. **Railway Dashboard** öffnen
2. **"Deploy"** → automatischer Build mit neuem Dockerfile
3. **Umgebungsvariablen setzen:**
   ```env
   PORT=8080
   MAX_ACCOUNTS=20
   AUTO_INIT_ACCOUNTS=0
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   ```
4. **Deployment abwarten** (~3-5 Minuten)

---

### Phase 3: Accounts migrieren

#### Option A: Sessions wiederherstellen (empfohlen)

```bash
# Sessions in neue Struktur kopieren
mkdir -p whatsapp-server/sessions
cp -r backup/sessions/account-1 whatsapp-server/sessions/
cp -r backup/sessions/account-2 whatsapp-server/sessions/
# ... für alle Accounts

# Per Railway CLI hochladen (oder via Git)
railway up
```

**Dann:**
```bash
# Accounts initialisieren (nutzt vorhandene Sessions)
curl -X POST https://your-app.railway.app/initialize/1
curl -X POST https://your-app.railway.app/initialize/2
# ...
```

#### Option B: Neu verbinden (einfacher)

```bash
# Alle Accounts neu initialisieren (generiert neue QR Codes)
curl -X POST https://your-app.railway.app/initialize-all \
  -H "Content-Type: application/json" \
  -d '{"count": 15}'

# Status abrufen
curl https://your-app.railway.app/status
```

**QR Codes scannen:**
```bash
# QR Code für Account 1 abrufen
curl https://your-app.railway.app/status/1
# Enthält: qrCode (Data URL), qrText (String)
```

---

### Phase 4: Edge Function anpassen

#### Alte wa-gateway/index.ts:
```typescript
// Alter Load-Balancer-Ansatz
const servers = [
  'http://wa-account-1:3001',
  'http://wa-account-2:3002',
  // ... 20 URLs
];
```

#### Neue wa-gateway/index.ts:
```typescript
// Neuer Single-Server-Ansatz
const SERVER_URL = Deno.env.get('RAILWAY_SERVER_URL') || 'http://localhost:8080';

// Account-basiertes Routing
const accountId = 1; // oder dynamisch ermitteln
const response = await fetch(`${SERVER_URL}/send/${accountId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: '+4915012345678',
    message: 'Hello!'
  })
});
```

**Edge Function aktualisieren:**
```bash
# In Lovable/Supabase
supabase functions deploy wa-gateway
```

---

### Phase 5: Testen & Validieren

#### 1. Health Check
```bash
curl https://your-app.railway.app/health

# Expected:
# {
#   "status": "ok",
#   "activeAccounts": 15,
#   "totalAccounts": 20,
#   "maxAccounts": 20
# }
```

#### 2. Status Check
```bash
curl https://your-app.railway.app/status

# Prüfe:
# - connected: Anzahl verbundener Accounts
# - qr_required: Accounts mit QR
# - error: Fehlerhafte Accounts
```

#### 3. Nachricht senden (Test)
```bash
curl -X POST https://your-app.railway.app/send/1 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+4915012345678",
    "message": "Test von neuem Server!"
  }'

# Expected:
# {
#   "success": true,
#   "message": "Message sent"
# }
```

---

## 🔍 Troubleshooting

### Problem: Sessions werden nicht geladen
**Lösung:**
```bash
# Railway Volume prüfen
railway volumes

# Sessions-Ordner manuell erstellen
railway run bash
cd sessions
ls -la
```

### Problem: "Out of Memory"
**Lösung:**
1. Railway Plan upgraden (8 GB RAM)
2. `MAX_ACCOUNTS` reduzieren: `MAX_ACCOUNTS=10`
3. Nicht verwendete Accounts stoppen

### Problem: Account bleibt bei "initializing"
**Lösung:**
```bash
# Account neu starten
curl -X POST https://your-app.railway.app/restart/5

# Logs prüfen
railway logs
# Suche nach: [Account 5] ...
```

### Problem: QR Code erscheint nicht
**Lösung:**
```bash
# Status abrufen (enthält QR als Data URL)
curl https://your-app.railway.app/status/3 | jq '.qrCode'

# QR Code als Bild anzeigen:
# Kopiere qrDataUrl und öffne in Browser
```

---

## 📊 Performance-Vergleich

### Alte Architektur (20 Container):
```
RAM:  ~20 GB (1 GB pro Container)
CPU:  ~40% idle (20× Node.js)
Boot: ~10 Minuten (sequentiell)
```

### Neue Architektur (1 Container):
```
RAM:  ~6-8 GB (shared Chromium)
CPU:  ~15% idle (1× Node.js)
Boot: ~2 Minuten (alle parallel)
```

**Einsparung:** ~60% RAM, ~40% schnellerer Start

---

## 🎯 Nächste Schritte nach Migration

1. ✅ **Monitoring einrichten:**
   ```bash
   # Status-Endpoint regelmäßig abrufen
   */5 * * * * curl https://your-app.railway.app/status
   ```

2. ✅ **Auto-Restart konfigurieren:**
   ```bash
   # Bei Bedarf automatisch neu starten
   # (z.B. via Cron-Job oder Supabase Edge Function)
   ```

3. ✅ **Sessions Backup:**
   ```bash
   # Railway Volume-Backup aktivieren
   railway volumes backup
   ```

4. ✅ **Skalierung testen:**
   ```bash
   # Schrittweise auf 20 Accounts erhöhen
   curl -X POST .../initialize-all -d '{"count": 20}'
   ```

---

## ❓ FAQ

### Kann ich zurück zur alten Architektur?
Ja, die Dateien sind in `archive/old-wireguard/` gesichert:
```bash
cp archive/old-wireguard/* ./
docker-compose up -d
```

### Funktionieren alte QR-Sessions?
Ja, wenn du die `.wwebjs_auth`-Ordner korrekt nach `sessions/` kopierst.

### Brauche ich noch WireGuard?
Nein, die neue Architektur nutzt **keine VPNs**. Alle Accounts teilen sich die gleiche Railway-IP.

### Kann ich trotzdem separate IPs verwenden?
Nicht direkt. Für separate IPs pro Account benötigst du:
1. Mehrere Railway-Services (je 1 Account)
2. Oder einen externen Proxy-Provider (z.B. via Puppeteer-Proxy-Plugin)

---

## 📞 Support

Bei Problemen:
1. **Logs prüfen:** `railway logs` oder Railway Dashboard
2. **Status abrufen:** `GET /status`
3. **GitHub Issues:** Erstelle ein Issue im Repository

---

**Migration abgeschlossen? Super! 🎉**

**Nächster Schritt:** Teste mit 3-5 Accounts, dann skaliere auf 15-20.
