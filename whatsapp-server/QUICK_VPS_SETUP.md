# 🚀 Quick VPS Setup - 5 Minuten Installation

## Schritt-für-Schritt Anleitung

### 1️⃣ Mullvad-Account vorbereiten (2 Min)

1. Gehe zu https://mullvad.net/ → "Get Mullvad"
2. Bezahle 5€/Monat → Erhalte Account-Nummer (z.B. `1720932174875701`)
3. Login: https://mullvad.net/account/
4. Generiere **3 WireGuard-Configs** (eine pro Account):
   - Click "WireGuard configuration" → "Generate key"
   - **Account 1:** Wähle Server `de-fra-wg-001` → Download → Umbenennen zu `account-1.conf`
   - **Account 2:** Neue Key generieren → `de-dus-wg-001` → `account-2.conf`
   - **Account 3:** Neue Key generieren → `de-ber-wg-001` → `account-3.conf`

### 2️⃣ VPS mieten & vorbereiten (3 Min)

**Empfehlung:** Hetzner CX31 (4 vCPU, 8GB RAM) - ~11€/Monat

```bash
# SSH zum VPS
ssh root@YOUR_VPS_IP

# System Update & Docker Installation
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# WireGuard-Modul laden
modprobe wireguard

# Projekt-Verzeichnis erstellen
mkdir -p /opt/whatsapp-server
cd /opt/whatsapp-server
```

### 3️⃣ Dateien hochladen (1 Min)

**Von deinem lokalen PC** (im `whatsapp-server/` Ordner):

```bash
# Alle Projektdateien hochladen
scp -r * root@YOUR_VPS_IP:/opt/whatsapp-server/

# WireGuard-Configs hochladen
scp account-1.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/
scp account-2.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/
scp account-3.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/
```

### 4️⃣ Konfiguration (1 Min)

**Zurück auf dem VPS:**

```bash
cd /opt/whatsapp-server

# .env Datei erstellen
cat > .env << 'EOF'
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
EOF

# WICHTIG: Ersetze YOUR_SUPABASE_SERVICE_ROLE_KEY mit dem echten Key!
nano .env
```

**Supabase Service Role Key finden:**
- Gehe zu deinem Supabase-Projekt
- Settings → API → Service Role Key (secret!) → Kopieren

### 5️⃣ Starten! (30 Sek)

```bash
# Container bauen & starten
docker-compose up -d

# Logs verfolgen (Ctrl+C zum Beenden)
docker-compose logs -f

# Status prüfen
docker-compose ps
```

**Erwartete Ausgabe:**
```
[WireGuard] ✅ Tunnel active
[WireGuard] Public IP: 185.x.x.x (DE)
[App] Starting WhatsApp server...
```

### 6️⃣ Test: IP-Adressen prüfen

```bash
# Prüfe, dass jeder Account eine andere IP hat
docker exec wa-account-1 curl -s ifconfig.me
docker exec wa-account-2 curl -s ifconfig.me
docker exec wa-account-3 curl -s ifconfig.me
```

**Erwartung:** Jede Zeile zeigt eine **andere IP**!

### 7️⃣ Firewall aktivieren

```bash
# UFW installieren & konfigurieren
apt install ufw -y
ufw allow 22/tcp    # SSH
ufw allow 3000/tcp  # WhatsApp API
ufw enable
```

## ✅ Fertig!

Deine WhatsApp-Server laufen jetzt auf:
- **Load Balancer:** `http://YOUR_VPS_IP:3000`
- **Account 1:** `http://YOUR_VPS_IP:3001` (via DE Frankfurt)
- **Account 2:** `http://YOUR_VPS_IP:3002` (via DE Düsseldorf)
- **Account 3:** `http://YOUR_VPS_IP:3003` (via DE Berlin)

## 🔍 Nützliche Befehle

```bash
# Logs einzelner Accounts
docker-compose logs -f whatsapp-account-1

# Container neu starten
docker-compose restart

# WireGuard-Status prüfen
docker exec wa-account-1 wg show

# Alle Container stoppen
docker-compose down

# Container mit neuen Änderungen neu bauen
docker-compose up -d --build
```

## 🆘 Probleme?

### WireGuard verbindet nicht
```bash
# Config prüfen
cat wireguard-configs/account-1.conf

# Ist NET_ADMIN aktiviert?
docker exec wa-account-1 ip link show wg0
```

### Container crashen
```bash
# Detaillierte Logs
docker-compose logs --tail=100

# Häufige Ursache: Falsche .env oder fehlende WireGuard-Config
ls -la wireguard-configs/
cat .env
```

## 📊 Mehr Accounts hinzufügen

1. Generiere neue Mullvad WireGuard-Config (anderer Server!)
2. Hochladen: `scp account-4.conf root@VPS:/opt/whatsapp-server/wireguard-configs/`
3. Editiere `docker-compose.yml` → Kopiere `whatsapp-account-3` Block → Anpassen auf `account-4`
4. Editiere `nginx.conf` → Füge `server whatsapp-account-4:3004;` hinzu
5. `docker-compose up -d`

## 💡 Tipps

- **Backup Sessions:** `docker run --rm -v whatsapp-server_wa-sessions-1:/data -v $(pwd):/backup busybox tar czf /backup/backup.tar.gz /data`
- **Auto-Restart:** Bereits aktiviert via `restart: unless-stopped`
- **Monitoring:** `watch -n 5 'docker-compose ps'`

## 🔗 Vollständige Dokumentation

- Siehe `VPS_DEPLOYMENT_GUIDE.md` für Details
- Siehe `MULLVAD_SETUP.md` für Mullvad-Configs

---

**Geschätzte Kosten:**
- VPS (Hetzner CX31): ~11€/Monat
- Mullvad VPN: 5€/Monat
- **Total: ~16€/Monat für unbegrenzte Accounts**
