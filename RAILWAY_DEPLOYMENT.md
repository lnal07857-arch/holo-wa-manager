# 🚂 Railway Deployment (Ohne VPN/Proxy)

## ✅ Diese Konfiguration ist optimiert für Railway

Die App läuft jetzt **ohne VPN/Proxy-Pflicht** auf Railway. Das bedeutet:
- ✅ Kein `ERR_TUNNEL_CONNECTION_FAILED` mehr
- ✅ Direkter Zugriff auf WhatsApp Web
- ✅ Sofortige Initialisierung ohne VPN-Setup
- ℹ️ Accounts nutzen Railway's Standard-IP (keine individuellen IPs pro Account)

## 🔧 Was wurde geändert?

### Vorher (mit VPN-Pflicht):
```typescript
// ❌ Erzwang VPN-Zuweisung → Fehler auf Railway
if (!accountData?.proxy_server) {
  await assignProxy(); // Schlug fehl weil Mullvad nur über WireGuard erreichbar
  throw new Error('VPN-Zuweisung fehlgeschlagen');
}
```

### Jetzt (VPN optional):
```typescript
// ✅ VPN optional, läuft auch ohne
if (accountData?.proxy_server) {
  console.log('✅ Using VPN');
} else {
  console.log('ℹ️ Direct connection (Railway mode)');
}
```

## 📋 Deployment-Schritte

### 1. Railway-Projekt erstellen

1. Gehe zu https://railway.app/
2. "New Project" → "Deploy from GitHub repo"
3. Wähle dieses Repository

### 2. Environment Variables setzen

In Railway Dashboard → "Variables":

```bash
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=your_service_role_key_here
PORT=3000
NODE_ENV=production
```

**Wichtig:** `SUPABASE_KEY` muss der **Service Role Key** sein (nicht der anon key)!  
Finde ihn in: Supabase Dashboard → Settings → API → Service Role Key

### 3. Build-Konfiguration

Railway erkennt automatisch:
- `railway.json` (bereits konfiguriert)
- `whatsapp-server/Dockerfile` wird verwendet
- Port 3000 wird exponiert

### 4. Deployment starten

```bash
# Railway CLI (optional)
railway up
```

Oder einfach pushen:
```bash
git push origin main
# Railway deployed automatisch
```

### 5. Railway-URL in Edge Function setzen

Nach dem ersten Deployment:

1. Kopiere die Railway-URL (z.B. `https://your-app.railway.app`)
2. Gehe zu Supabase → Edge Functions → `wa-gateway`
3. Setze Environment Variable:
   ```
   RAILWAY_SERVER_URL=https://your-app.railway.app
   ```

## 🔍 Testing

### Health Check:
```bash
curl https://your-app.railway.app/health
# Erwartete Antwort:
# {"status":"OK","activeClients":0,"timestamp":"2025-10-27T..."}
```

### Account initialisieren:
1. Gehe zur "Accounts" Ansicht
2. Klicke "Account hinzufügen"
3. QR-Code erscheint direkt (kein VPN-Setup nötig!)

## ⚠️ Bekannte Einschränkungen auf Railway

### Railway's Ressourcen-Limits:
- **Gleichzeitige Accounts:** ~5-8 Accounts pro Railway-Instanz
- **RAM:** 512MB-1GB (abhängig vom Plan)
- **CPU:** Shared vCPU
- **Timeout:** 10 Minuten HTTP Request Timeout

### Wenn "Server überlastet" Error:
1. **Trenne ungenutzte Accounts:**
   - Gehe zu "Accounts" → Klicke "Alle Instanzen trennen"
   
2. **Initialisiere sequenziell:**
   - Verbinde einen Account nach dem anderen
   - Warte bis Status "connected" bevor du den nächsten initialisierst

3. **Upgrade Railway Plan:**
   - Railway Pro: 8GB RAM, bessere CPU
   - Erlaubt mehr gleichzeitige Accounts

## 📊 Railway vs. VPS Vergleich

| Feature | Railway (aktuell) | VPS mit WireGuard |
|---------|-------------------|-------------------|
| **Setup-Zeit** | 5 Minuten | 15 Minuten |
| **Kosten** | $5-20/Monat | ~16€/Monat (VPS+Mullvad) |
| **Max Accounts** | 5-8 | 10-50+ |
| **IP pro Account** | ❌ Shared IP | ✅ Eigene IP |
| **VPN/Proxy** | ❌ Nicht möglich | ✅ Mullvad WireGuard |
| **Wartung** | Automatisch | Manuell |
| **Skalierung** | Vertical only | Horizontal möglich |

## 🚀 Migration zu VPS (später)

Wenn du später mehr Accounts oder individuelle IPs brauchst:

1. Folge `QUICK_VPS_SETUP.md`
2. Exportiere Sessions von Railway:
   ```bash
   # Von Railway Service → Connect → Run Command
   tar czf /tmp/sessions.tar.gz /app/.wwebjs_auth
   # Download über Railway CLI
   ```
3. Importiere auf VPS (siehe `VPS_DEPLOYMENT_GUIDE.md`)

## 🆘 Troubleshooting

### Problem: "Error initializing client"
**Lösung:** Railway-Service neu starten
```bash
railway restart
```

### Problem: QR-Code lädt nicht
**Prüfe:**
1. Railway-Logs: `railway logs`
2. Edge Function Logs: Supabase Dashboard → Edge Functions → wa-gateway
3. Ist `RAILWAY_SERVER_URL` korrekt gesetzt?

### Problem: Accounts disconnecten ständig
**Ursachen:**
- Zu viele gleichzeitige Accounts (>8)
- Railway RAM-Limit erreicht
- Netzwerk-Instabilität

**Lösung:** Upgrade auf Railway Pro oder migriere zu VPS

## 📝 Logs überwachen

```bash
# Railway CLI
railway logs --follow

# Im Browser
railway.app → Project → Deployments → View Logs
```

## 💰 Kosten-Rechnung

### Railway Starter ($5/Monat):
- 512MB RAM
- ~3-5 WhatsApp Accounts
- Shared CPU
- **Best for:** Testing, kleine Projekte

### Railway Pro ($20/Monat):
- 8GB RAM
- ~8-12 WhatsApp Accounts  
- Priority CPU
- **Best for:** Production, mehr Accounts

### Wann zu VPS wechseln?
- Mehr als 10 Accounts benötigt
- Individuelle IPs pro Account wichtig
- Budget < 20€/Monat (VPS ist günstiger bei Scale)

## 🔗 Nützliche Links

- Railway Docs: https://docs.railway.app/
- Railway Status: https://railway.statuspage.io/
- Dieser Guide: `RAILWAY_DEPLOYMENT.md`
- VPS Alternative: `QUICK_VPS_SETUP.md`
