# 🚀 WhatsApp Multi-Account Server (Railway Optimized)

**Ein leichtgewichtiger, skalierbarer WhatsApp-Server, der bis zu 20 Accounts gleichzeitig in einem einzigen Node.js-Prozess verwaltet.**

---

## ✨ Features

- ✅ **Bis zu 20 parallele WhatsApp-Accounts** in einem Prozess
- ✅ **Railway-optimiert** - kein WireGuard, keine Kernel-Capabilities
- ✅ **Ressourcen-effizient** - ein Chromium-Prozess für alle Accounts
- ✅ **LocalAuth-Sessions** - persistente Authentifizierung
- ✅ **REST API** - einfache Integration
- ✅ **Live Status** - Echtzeit-Überwachung aller Accounts
- ✅ **Auto-Restart** - einzelne Accounts neu starten
- ✅ **Supabase Integration** - optionale Datenbankanbindung

---

## 📋 Systemanforderungen

### Empfohlene Railway-Konfiguration:
- **RAM:** 8 GB (für 15-20 Accounts)
- **CPU:** 8 vCPUs
- **Storage:** 10 GB (für Sessions)

### Minimum für Tests (3-5 Accounts):
- **RAM:** 2 GB
- **CPU:** 2 vCPUs
- **Storage:** 5 GB

---

## 🚀 Schnellstart

### 1️⃣ Lokale Entwicklung

```bash
cd whatsapp-server
npm install
cp .env.example .env
npm start
```

### 2️⃣ Railway Deployment

1. **GitHub Repository** vorbereiten:
   ```bash
   git add .
   git commit -m "WhatsApp multi-account server"
   git push
   ```

2. **Railway Projekt erstellen**:
   - Gehe zu [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Wähle dein Repository

3. **Umgebungsvariablen setzen**:
   ```env
   PORT=8080
   MAX_ACCOUNTS=20
   AUTO_INIT_ACCOUNTS=5
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

4. **Deployment starten** - Railway baut automatisch mit dem Dockerfile

---

## 📡 API Endpoints

### Health Check
```bash
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "activeAccounts": 5,
  "totalAccounts": 20,
  "maxAccounts": 20,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### Status aller Accounts
```bash
GET /status
```
**Response:**
```json
{
  "accounts": [
    {
      "id": "account-1",
      "index": 1,
      "status": "connected",
      "lastUpdate": "2025-01-01T12:00:00.000Z",
      "connectedAt": "2025-01-01T11:55:00.000Z"
    },
    {
      "id": "account-2",
      "index": 2,
      "status": "qr_required",
      "qrCode": "data:image/png;base64,...",
      "lastUpdate": "2025-01-01T12:00:00.000Z"
    }
  ],
  "total": 20,
  "connected": 15,
  "qr_required": 3,
  "disconnected": 2,
  "error": 0
}
```

### Status eines spezifischen Accounts
```bash
GET /status/:id
```
**Beispiel:** `GET /status/5`

### Account initialisieren
```bash
POST /initialize/:id
```
**Beispiel:** `POST /initialize/3`

**Response:**
```json
{
  "success": true,
  "message": "Client initialized"
}
```

### Account neu starten
```bash
POST /restart/:id
```
**Beispiel:** `POST /restart/7`

### Nachricht senden
```bash
POST /send/:id
Content-Type: application/json

{
  "phoneNumber": "+4915012345678",
  "message": "Hello from Account 5!"
}
```

### Alle Accounts initialisieren
```bash
POST /initialize-all
Content-Type: application/json

{
  "count": 15
}
```

---

## 🗂️ Projektstruktur

```
whatsapp-server/
├── server.js              # Hauptserver (alle Accounts)
├── package.json           # Dependencies
├── Dockerfile             # Railway-optimiert
├── .env.example           # Beispiel-Konfiguration
├── sessions/              # LocalAuth Sessions
│   ├── account-1/
│   ├── account-2/
│   └── ...
└── README.md
```

---

## 📊 Resource Usage (Erwartung)

| Accounts | RAM (geschätzt) | CPU (idle) | CPU (aktiv) |
|----------|-----------------|------------|-------------|
| 5        | ~2 GB          | 10%        | 30-50%      |
| 10       | ~4 GB          | 15%        | 40-60%      |
| 15       | ~6 GB          | 20%        | 50-70%      |
| 20       | ~8 GB          | 25%        | 60-80%      |

**Hinweis:** Tatsächlicher Verbrauch hängt von der Nachrichtenlast ab.

---

## 🔧 Umgebungsvariablen

| Variable | Beschreibung | Standard | Erforderlich |
|----------|--------------|----------|--------------|
| `PORT` | Server-Port | `8080` | ✅ |
| `MAX_ACCOUNTS` | Maximale Anzahl Accounts | `20` | ✅ |
| `AUTO_INIT_ACCOUNTS` | Auto-Start beim Boot (0-20) | `0` | ❌ |
| `SUPABASE_URL` | Supabase-Projekt-URL | - | ❌ |
| `SUPABASE_KEY` | Supabase Anon Key | - | ❌ |

---

## 🐛 Troubleshooting

### Account bleibt bei "initializing"
```bash
POST /restart/:id
```

### QR Code wird nicht generiert
- Prüfe Logs: `[Account X] 📱 QR Code generated`
- Rufe Status ab: `GET /status/:id`
- Der `qrCode` enthält den Data URL

### "Out of Memory" Fehler
- Reduziere `MAX_ACCOUNTS`
- Erhöhe Railway RAM auf 8 GB
- Prüfe: `GET /health`

### Sessions gehen verloren
- Railway benötigt **persistente Volumes** für `./sessions`
- Alternativ: Sessions in Supabase Storage speichern

---

## 🔄 Migration von alter Architektur

### Alt (WireGuard + Docker Compose):
- ❌ 20 separate Container
- ❌ WireGuard pro Container
- ❌ Nginx Load Balancer
- ❌ Kernel-Capabilities erforderlich

### Neu (Single Process):
- ✅ 1 Container, 20 Accounts
- ✅ Kein WireGuard
- ✅ Direkter API-Zugriff
- ✅ Railway-kompatibel

### Migrations-Schritte:
1. Alte Sessions sichern (falls vorhanden)
2. Neue Version deployen
3. Accounts einzeln initialisieren: `POST /initialize/:id`
4. QR Codes scannen

---

## 📈 Performance-Tipps

### Für 15-20 Accounts:
1. **Railway Plan:** Pro Plan mit 8 GB RAM
2. **Sessions:** Nutze Railway-Volumes oder S3/Supabase Storage
3. **Auto-Init:** Setze `AUTO_INIT_ACCOUNTS=0` und starte manuell
4. **Monitoring:** Nutze `GET /status` regelmäßig

### Ressourcen-Optimierung:
```javascript
// In server.js bereits implementiert:
// - Ein Chromium-Prozess für alle
// - Headless-Mode
// - Minimale Puppeteer-Args
// - Shared LocalAuth
```

---

## 🆘 Support

### Logs prüfen:
```bash
# Railway Dashboard → Logs
# Jeder Account loggt mit [Account X] Prefix
```

### API-Test:
```bash
curl https://your-app.railway.app/health
curl https://your-app.railway.app/status
```

---

## 📄 Lizenz

MIT License - siehe Repository

---

## 🎯 Nächste Schritte

1. ✅ Server deployen
2. ✅ `POST /initialize-all` mit `count: 5` (zum Testen)
3. ✅ QR Codes über `GET /status` abrufen
4. ✅ Nachrichten senden über `POST /send/:id`
5. ✅ Production: Erhöhe auf 15-20 Accounts

**Viel Erfolg! 🚀**
