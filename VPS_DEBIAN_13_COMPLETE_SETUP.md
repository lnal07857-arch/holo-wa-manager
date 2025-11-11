# 🚀 Vollständiges VPS Setup für Debian 13

## 📋 Inhaltsverzeichnis
- [System-Voraussetzungen](#system-voraussetzungen)
- [Supabase Credentials](#supabase-credentials)
- [1. Server Vorbereitung](#1-server-vorbereitung)
- [2. WhatsApp Server Setup](#2-whatsapp-server-setup)
- [3. Frontend Setup](#3-frontend-setup)
- [4. Nginx Reverse Proxy](#4-nginx-reverse-proxy)
- [5. SSL/TLS Zertifikat](#5-ssltls-zertifikat)
- [6. Systemd Services](#6-systemd-services)
- [Wartung & Monitoring](#wartung--monitoring)

---

## System-Voraussetzungen

- **OS**: Debian 13 (Bookworm)
- **RAM**: Minimum 4GB (empfohlen 8GB für 15-20 WhatsApp Accounts)
- **CPU**: 2+ Cores
- **Storage**: 20GB+
- **Domain**: Optional (für SSL)

---

## 🔑 Supabase Credentials

```bash
# Backend (Service Role Key - GEHEIM!)
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDk3MzQyNCwiZXhwIjoyMDc2NTQ5NDI0fQ.H78RZwpgVxJaWJnt-9JkfJaoyPvw8kQdD8u3sZccbPY

# Frontend (Public/Anon Key - OK für öffentlich)
VITE_SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4
VITE_SUPABASE_PROJECT_ID=umizkegxybjhqucbhgth
```

⚠️ **WICHTIG**: Der `SUPABASE_KEY` (Service Role) hat Admin-Rechte und darf NIEMALS öffentlich sein!

---

## 1. Server Vorbereitung

### 1.1 System Update & Basis-Pakete

```bash
# Als root oder mit sudo
apt update && apt upgrade -y

# Basis-Tools installieren
apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw
```

### 1.2 Firewall konfigurieren

```bash
# UFW aktivieren
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 1.3 Node.js installieren (v20 LTS)

```bash
# NodeSource Repository
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node --version  # sollte v20.x.x zeigen
npm --version
```

### 1.4 PM2 installieren (Process Manager)

```bash
npm install -g pm2

# PM2 beim Systemstart aktivieren
pm2 startup systemd
# Führe den vom Befehl generierten Befehl aus!
```

---

## 2. WhatsApp Server Setup

### 2.1 Projekt klonen & Abhängigkeiten

```bash
# Arbeitsverzeichnis erstellen
mkdir -p /opt/whatsapp-manager
cd /opt/whatsapp-manager

# Von GitHub klonen (falls vorhanden) ODER Dateien hochladen
# git clone <your-repo-url> .

# whatsapp-server Ordner erstellen wenn nicht vorhanden
mkdir -p whatsapp-server
cd whatsapp-server
```

### 2.2 package.json erstellen

```bash
cat > package.json << 'EOF'
{
  "name": "whatsapp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "whatsapp-web.js": "^1.23.0",
    "qrcode-terminal": "^0.12.0",
    "cors": "^2.8.5"
  }
}
EOF
```

### 2.3 server.js hochladen

Kopiere dein `server.js` in `/opt/whatsapp-manager/whatsapp-server/server.js`

Oder nutze das existierende File aus dem Projekt.

### 2.4 .env Datei erstellen

```bash
cat > .env << 'EOF'
# WhatsApp Server Configuration
PORT=3000
MAX_ACCOUNTS=20

# Supabase Backend (Service Role Key!)
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDk3MzQyNCwiZXhwIjoyMDc2NTQ5NDI0fQ.H78RZwpgVxJaWJnt-9JkfJaoyPvw8kQdD8u3sZccbPY

# Node Environment
NODE_ENV=production
EOF

chmod 600 .env  # Nur owner kann lesen
```

### 2.5 NPM Pakete installieren

```bash
npm install --production
```

### 2.6 Mit PM2 starten

```bash
pm2 start server.js --name whatsapp-server

# Logs anschauen
pm2 logs whatsapp-server

# Status checken
pm2 status
```

### 2.7 PM2 Config speichern

```bash
pm2 save
```

---

## 3. Frontend Setup

### 3.1 Frontend Ordner vorbereiten

```bash
cd /opt/whatsapp-manager

# Frontend bauen (lokal auf Entwicklungsrechner)
# npm run build

# dist/ Ordner auf VPS hochladen nach:
# /opt/whatsapp-manager/dist
```

**Alternativ**: Frontend direkt auf VPS bauen:

```bash
# Projekt-Root hochladen
cd /opt/whatsapp-manager

# .env Datei erstellen
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4
VITE_SUPABASE_PROJECT_ID=umizkegxybjhqucbhgth
EOF

# Abhängigkeiten installieren und bauen
npm install
npm run build

# dist/ Ordner sollte jetzt existieren
```

### 3.2 Frontend mit PM2 serve (Optional)

Falls du das Frontend separat serven willst:

```bash
npm install -g serve
pm2 serve /opt/whatsapp-manager/dist 8080 --name frontend --spa
pm2 save
```

---

## 4. Nginx Reverse Proxy

### 4.1 Nginx Konfiguration

```bash
cat > /etc/nginx/sites-available/whatsapp-manager << 'EOF'
# Frontend
server {
    listen 80;
    server_name your-domain.com;  # ANPASSEN!

    root /opt/whatsapp-manager/dist;
    index index.html;

    # SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy zu WhatsApp Server
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts für lange Operationen
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Health Check
    location /health {
        proxy_pass http://localhost:3000/health;
    }

    # Client max body size für Uploads
    client_max_body_size 50M;
}
EOF

# Symlink erstellen
ln -s /etc/nginx/sites-available/whatsapp-manager /etc/nginx/sites-enabled/

# Default Site deaktivieren (optional)
rm /etc/nginx/sites-enabled/default

# Nginx testen
nginx -t

# Nginx neustarten
systemctl restart nginx
```

### 4.2 Domain DNS konfigurieren

Setze einen **A-Record** für deine Domain auf die VPS IP:

```
Type: A
Name: @ (oder subdomain)
Value: <VPS_IP_ADRESSE>
TTL: 300
```

---

## 5. SSL/TLS Zertifikat

### 5.1 Let's Encrypt mit Certbot

```bash
# Certbot für Nginx
certbot --nginx -d your-domain.com

# Auto-Renewal testen
certbot renew --dry-run

# Certbot Timer ist automatisch aktiviert
systemctl status certbot.timer
```

Nach SSL sollte Nginx automatisch auf HTTPS umleiten.

---

## 6. Systemd Services (Alternative zu PM2)

Falls du lieber Systemd nutzen möchtest:

### 6.1 WhatsApp Server Service

```bash
cat > /etc/systemd/system/whatsapp-server.service << 'EOF'
[Unit]
Description=WhatsApp Multi-Account Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/whatsapp-manager/whatsapp-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable whatsapp-server
systemctl start whatsapp-server
systemctl status whatsapp-server
```

---

## 🔍 Wartung & Monitoring

### PM2 Befehle

```bash
# Status aller Services
pm2 status

# Logs anschauen
pm2 logs whatsapp-server
pm2 logs frontend

# Service neustarten
pm2 restart whatsapp-server

# Service stoppen
pm2 stop whatsapp-server

# Memory/CPU monitoring
pm2 monit
```

### Logs Rotation

```bash
# PM2 Logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### System Monitoring

```bash
# Ressourcen checken
htop
df -h
free -h

# Nginx Access Logs
tail -f /var/log/nginx/access.log

# Nginx Error Logs
tail -f /var/log/nginx/error.log
```

---

## 🐛 Troubleshooting

### WhatsApp Server startet nicht

```bash
# Logs checken
pm2 logs whatsapp-server --lines 100

# Manuelle Ausführung zum Debuggen
cd /opt/whatsapp-manager/whatsapp-server
node server.js
```

### Frontend lädt nicht

```bash
# Nginx Config testen
nginx -t

# Nginx Error Logs
tail -f /var/log/nginx/error.log

# Permissions prüfen
ls -la /opt/whatsapp-manager/dist
```

### Port bereits in Benutzung

```bash
# Welcher Prozess nutzt Port 3000?
lsof -i :3000

# Prozess beenden
kill -9 <PID>
```

### Sessions gehen verloren

```bash
# Sessions Ordner Permissions
ls -la /opt/whatsapp-manager/whatsapp-server/sessions

# Ordner neu erstellen falls nötig
mkdir -p /opt/whatsapp-manager/whatsapp-server/sessions
chmod 755 /opt/whatsapp-manager/whatsapp-server/sessions
```

---

## 📝 Wichtige Pfade

```
/opt/whatsapp-manager/                    # Projekt Root
├── whatsapp-server/                      # Backend
│   ├── server.js                         # Express Server
│   ├── package.json                      # Dependencies
│   ├── .env                              # Secrets (NICHT committen!)
│   └── sessions/                         # WhatsApp Sessions
│       ├── account-1/
│       ├── account-2/
│       └── ...
├── dist/                                 # Frontend Build
│   ├── index.html
│   └── assets/
└── .env                                  # Frontend Env Vars
```

---

## 🔐 Sicherheitshinweise

1. **NIEMALS** den `SUPABASE_SERVICE_ROLE_KEY` ins Frontend oder öffentliche Repos!
2. `.env` Dateien immer in `.gitignore`
3. Firewall (UFW) aktiv lassen
4. Regelmäßige System-Updates: `apt update && apt upgrade`
5. SSH mit Key-Auth absichern, Password-Auth deaktivieren
6. Fail2Ban installieren für Brute-Force Schutz
7. Sessions Ordner regelmäßig backupen

---

## 🎉 Setup abgeschlossen!

Dein WhatsApp Manager sollte jetzt unter `https://your-domain.com` erreichbar sein!

**Nächste Schritte:**
1. WhatsApp Accounts im Frontend hinzufügen
2. QR-Codes scannen
3. Accounts warmup starten
4. Bulk-Messages versenden

Bei Fragen: Logs checken mit `pm2 logs` oder `journalctl -u whatsapp-server -f`
