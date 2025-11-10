# Vollständige Debian VPS Setup-Anleitung
## WhatsApp-Server Backend + React Frontend

Diese Anleitung zeigt dir, wie du sowohl den WhatsApp-Server (aktuell auf Railway) als auch das React Frontend auf einem Debian VPS einrichtest.

---

## 📋 Voraussetzungen

- **VPS mit Debian 11/12** (min. 4GB RAM, 2 CPU Cores, 20GB SSD)
- **Root-Zugriff** oder sudo-Berechtigungen
- **Domain-Name** (z.B. `example.com` und `wa-api.example.com`)
- **Supabase-Projekt** mit den Zugangsdaten:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` (für Frontend)
  - `SUPABASE_SERVICE_ROLE_KEY` (für Backend)

---

## 🚀 Teil 1: VPS Grundeinrichtung

### 1.1 System aktualisieren

```bash
# Als root einloggen
ssh root@your-vps-ip

# System aktualisieren
apt update && apt upgrade -y

# Firewall installieren
apt install -y ufw

# Firewall konfigurieren
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8080/tcp  # WhatsApp-Server (temporär für Tests)
ufw enable
```

### 1.2 Node.js installieren

```bash
# Node.js 20.x installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Überprüfen
node --version  # sollte v20.x.x anzeigen
npm --version
```

### 1.3 Nginx installieren

```bash
apt install -y nginx

# Nginx starten und auto-start aktivieren
systemctl start nginx
systemctl enable nginx
```

### 1.4 Certbot für SSL-Zertifikate installieren

```bash
apt install -y certbot python3-certbot-nginx
```

---

## 🤖 Teil 2: WhatsApp-Server Backend einrichten

### 2.1 Projektverzeichnis erstellen

```bash
# Verzeichnis erstellen
mkdir -p /opt/whatsapp-server
cd /opt/whatsapp-server

# Git installieren (falls nicht vorhanden)
apt install -y git
```

### 2.2 WhatsApp-Server Code hochladen

**Option A: Via Git (empfohlen)**
```bash
# Repository klonen
git clone https://github.com/DEIN-USERNAME/DEIN-REPO.git .

# Nur WhatsApp-Server Ordner behalten
cd whatsapp-server
```

**Option B: Via SCP/SFTP**
```bash
# Lokal auf deinem Computer (im Projektverzeichnis):
scp -r whatsapp-server root@your-vps-ip:/opt/
```

### 2.3 Dependencies installieren

```bash
cd /opt/whatsapp-server

# Dependencies installieren
npm install --omit=dev

# Chrome/Chromium für Puppeteer installieren
apt install -y chromium

# Puppeteer Chrome installieren
npx puppeteer browsers install chrome
```

### 2.4 Umgebungsvariablen konfigurieren

```bash
# .env Datei erstellen
nano /opt/whatsapp-server/.env
```

**Inhalt der `.env` Datei:**
```env
# Server Port
PORT=8080

# Supabase Konfiguration
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=your_supabase_service_role_key_here

# Optional: Max Accounts (Standard: 20)
MAX_ACCOUNTS=20

# Production Mode
NODE_ENV=production
```

**WICHTIG:** Verwende den **SERVICE ROLE KEY**, nicht den ANON KEY!

### 2.5 Systemd Service erstellen

```bash
nano /etc/systemd/system/whatsapp-server.service
```

**Inhalt:**
```ini
[Unit]
Description=WhatsApp Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/whatsapp-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/whatsapp-server.log
StandardError=append:/var/log/whatsapp-server-error.log

# Resource Limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### 2.6 Service starten

```bash
# Service neu laden
systemctl daemon-reload

# Service starten
systemctl start whatsapp-server

# Auto-Start aktivieren
systemctl enable whatsapp-server

# Status prüfen
systemctl status whatsapp-server

# Logs anzeigen
tail -f /var/log/whatsapp-server.log
```

### 2.7 Backend-API testen

```bash
# Health-Check
curl http://localhost:8080/health

# Sollte zurückgeben:
# {"status":"ok","activeClients":0}
```

---

## 🎨 Teil 3: React Frontend einrichten

### 3.1 Frontend bauen

**Auf deinem lokalen Computer:**

```bash
# Im Projekt-Root-Verzeichnis
cd /pfad/zu/deinem/projekt

# Environment-Variablen setzen (falls nicht vorhanden)
echo "VITE_SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co" > .env
echo "VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here" >> .env

# Dependencies installieren
npm install

# Production Build erstellen
npm run build

# dist Ordner sollte jetzt erstellt sein
```

### 3.2 Frontend auf VPS hochladen

**Auf deinem lokalen Computer:**

```bash
# dist Ordner auf VPS hochladen
scp -r dist root@your-vps-ip:/var/www/whatsapp-frontend

# ODER via rsync (schneller bei Updates)
rsync -avz --delete dist/ root@your-vps-ip:/var/www/whatsapp-frontend/
```

**Auf dem VPS:**

```bash
# Verzeichnis erstellen (falls nicht vorhanden)
mkdir -p /var/www/whatsapp-frontend

# Berechtigungen setzen
chown -R www-data:www-data /var/www/whatsapp-frontend
chmod -R 755 /var/www/whatsapp-frontend
```

---

## 🌐 Teil 4: Nginx Konfiguration

### 4.1 Frontend Nginx Config

```bash
nano /etc/nginx/sites-available/whatsapp-frontend
```

**Inhalt:**
```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    root /var/www/whatsapp-frontend;
    index index.html;

    # Gzip Kompression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend Routing (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache statische Assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4.2 Backend API Nginx Config (Reverse Proxy)

```bash
nano /etc/nginx/sites-available/whatsapp-api
```

**Inhalt:**
```nginx
server {
    listen 80;
    server_name wa-api.example.com;

    client_max_body_size 50M;

    # Reverse Proxy zum WhatsApp-Server
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts für WhatsApp-Operationen
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Health-Check Endpoint
    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        access_log off;
    }
}
```

### 4.3 Nginx Konfiguration aktivieren

```bash
# Symlinks erstellen
ln -s /etc/nginx/sites-available/whatsapp-frontend /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/whatsapp-api /etc/nginx/sites-enabled/

# Default Config entfernen (optional)
rm /etc/nginx/sites-enabled/default

# Nginx Konfiguration testen
nginx -t

# Nginx neu laden
systemctl reload nginx
```

---

## 🔒 Teil 5: SSL-Zertifikate einrichten

### 5.1 DNS-Einträge konfigurieren

**Bei deinem Domain-Provider:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | your-vps-ip | 300 |
| A | www | your-vps-ip | 300 |
| A | wa-api | your-vps-ip | 300 |

**Warte 5-10 Minuten, bis DNS propagiert ist.**

### 5.2 SSL-Zertifikate generieren

```bash
# Frontend (example.com)
certbot --nginx -d example.com -d www.example.com

# Backend API (wa-api.example.com)
certbot --nginx -d wa-api.example.com

# Folge den Anweisungen:
# - E-Mail eingeben
# - Terms of Service akzeptieren
# - Redirect auf HTTPS wählen (Option 2)
```

### 5.3 Auto-Renewal testen

```bash
# Dry-run Test
certbot renew --dry-run

# Sollte erfolgreich sein!
```

**Certbot richtet automatisch einen Cron-Job für Auto-Renewal ein.**

---

## 🔧 Teil 6: Railway Server URL aktualisieren

### 6.1 Supabase Secret aktualisieren

Da dein WhatsApp-Server jetzt auf dem VPS läuft statt auf Railway, musst du die URL aktualisieren:

**In deiner Lovable Cloud Datenbank:**

```sql
-- Secret aktualisieren (nutze Lovable UI: Settings > Secrets)
-- ODER via Supabase Dashboard
```

**Neuer Wert für `RAILWAY_SERVER_URL`:**
```
https://wa-api.example.com
```

### 6.2 Frontend neu bauen und hochladen

```bash
# Lokal
npm run build
rsync -avz --delete dist/ root@your-vps-ip:/var/www/whatsapp-frontend/
```

---

## 📊 Teil 7: Monitoring & Logs

### 7.1 Backend Logs anzeigen

```bash
# Echtzeit-Logs
tail -f /var/log/whatsapp-server.log

# Fehler-Logs
tail -f /var/log/whatsapp-server-error.log

# Systemd Journal
journalctl -u whatsapp-server -f

# Letzte 100 Zeilen
journalctl -u whatsapp-server -n 100
```

### 7.2 Nginx Logs

```bash
# Access Logs
tail -f /var/log/nginx/access.log

# Error Logs
tail -f /var/log/nginx/error.log
```

### 7.3 Systemressourcen überwachen

```bash
# htop installieren
apt install -y htop

# htop starten
htop

# Alternativ: top
top
```

### 7.4 Log-Rotation einrichten

```bash
nano /etc/logrotate.d/whatsapp-server
```

**Inhalt:**
```
/var/log/whatsapp-server*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

---

## 🔄 Teil 8: Wartung & Updates

### 8.1 WhatsApp-Server aktualisieren

```bash
cd /opt/whatsapp-server

# Code pullen (wenn Git verwendet wird)
git pull

# Dependencies aktualisieren
npm install --omit=dev

# Service neu starten
systemctl restart whatsapp-server

# Status prüfen
systemctl status whatsapp-server
```

### 8.2 Frontend aktualisieren

```bash
# Lokal bauen
npm run build

# Auf VPS hochladen
rsync -avz --delete dist/ root@your-vps-ip:/var/www/whatsapp-frontend/

# Nginx Cache leeren (optional)
nginx -s reload
```

### 8.3 System-Updates

```bash
# Regelmäßig ausführen
apt update && apt upgrade -y

# Optional: Automatische Security Updates
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 🛠️ Teil 9: Troubleshooting

### 9.1 WhatsApp-Server startet nicht

```bash
# Logs prüfen
journalctl -u whatsapp-server -n 50

# Port prüfen
netstat -tulpn | grep 8080

# Manuell starten (für Debugging)
cd /opt/whatsapp-server
node server.js
```

### 9.2 Frontend zeigt Fehler

```bash
# Nginx-Konfiguration testen
nginx -t

# Nginx Error Logs prüfen
tail -f /var/log/nginx/error.log

# Browser-Console überprüfen (F12)
# - Netzwerk-Tab: Failed requests?
# - Console-Tab: JavaScript-Fehler?
```

### 9.3 SSL-Zertifikat Probleme

```bash
# Zertifikat-Status prüfen
certbot certificates

# Manuell erneuern
certbot renew

# Nginx neu laden
systemctl reload nginx
```

### 9.4 Hoher RAM-Verbrauch

```bash
# Prozesse prüfen
ps aux --sort=-%mem | head -10

# WhatsApp-Server RAM-Limit setzen
nano /etc/systemd/system/whatsapp-server.service

# Hinzufügen unter [Service]:
# MemoryLimit=3G

systemctl daemon-reload
systemctl restart whatsapp-server
```

---

## 🔒 Teil 10: Sicherheit (Best Practices)

### 10.1 SSH absichern

```bash
nano /etc/ssh/sshd_config
```

**Änderungen:**
```
# Root-Login deaktivieren (nach Ersteinrichtung)
PermitRootLogin no

# Nur Key-basierte Auth erlauben
PasswordAuthentication no

# Port ändern (optional)
Port 2222
```

```bash
# SSH neu starten
systemctl restart sshd

# Firewall anpassen (wenn Port geändert)
ufw allow 2222/tcp
ufw delete allow 22/tcp
```

### 10.2 Fail2Ban installieren

```bash
# Fail2Ban installiert
apt install -y fail2ban

# Konfiguration
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
nano /etc/fail2ban/jail.local

# [sshd] aktivieren
systemctl enable fail2ban
systemctl start fail2ban
```

### 10.3 Regelmäßige Backups

```bash
# Backup-Script erstellen
nano /root/backup.sh
```

**Inhalt:**
```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backup"

mkdir -p $BACKUP_DIR

# WhatsApp-Server Sessions sichern
tar -czf $BACKUP_DIR/sessions-$DATE.tar.gz /opt/whatsapp-server/sessions

# Alte Backups löschen (älter als 7 Tage)
find $BACKUP_DIR -name "sessions-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Ausführbar machen
chmod +x /root/backup.sh

# Cron-Job einrichten (täglich um 3 Uhr)
crontab -e

# Hinzufügen:
0 3 * * * /root/backup.sh >> /var/log/backup.log 2>&1
```

---

## ✅ Teil 11: Checkliste nach Setup

- [ ] WhatsApp-Server läuft auf Port 8080
- [ ] `systemctl status whatsapp-server` zeigt "active (running)"
- [ ] `curl http://localhost:8080/health` gibt Status zurück
- [ ] Frontend ist unter `https://example.com` erreichbar
- [ ] Backend API ist unter `https://wa-api.example.com` erreichbar
- [ ] SSL-Zertifikate sind installiert (Schloss-Symbol im Browser)
- [ ] Firewall ist aktiv (`ufw status`)
- [ ] Logs werden geschrieben (`tail -f /var/log/whatsapp-server.log`)
- [ ] Backup-Script läuft (`/root/backup.sh`)
- [ ] `RAILWAY_SERVER_URL` in Supabase ist aktualisiert

---

## 📞 Wichtige Befehle auf einen Blick

```bash
# WhatsApp-Server Status
systemctl status whatsapp-server

# WhatsApp-Server neu starten
systemctl restart whatsapp-server

# Logs anzeigen
tail -f /var/log/whatsapp-server.log

# Nginx neu laden
systemctl reload nginx

# SSL-Zertifikat erneuern
certbot renew

# System-Update
apt update && apt upgrade -y

# Disk-Space prüfen
df -h

# RAM-Nutzung prüfen
free -h
```

---

## 🎯 Performance-Tipps

### Für 20 WhatsApp-Accounts:

- **Empfohlene VPS-Specs:**
  - CPU: 4+ Cores
  - RAM: 8GB+
  - Disk: 40GB+ SSD
  - Bandwidth: 1TB+

### RAM-Optimierung:

```bash
# Swap aktivieren (falls nicht vorhanden)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Permanent machen
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 📚 Zusätzliche Ressourcen

- **Nginx Docs:** https://nginx.org/en/docs/
- **Certbot Docs:** https://certbot.eff.org/
- **Node.js Best Practices:** https://nodejs.org/en/docs/guides/
- **whatsapp-web.js Docs:** https://docs.wwebjs.dev/

---

## 🆘 Support

Bei Problemen:

1. **Logs prüfen** (`journalctl -u whatsapp-server -n 100`)
2. **Nginx-Fehler prüfen** (`tail -f /var/log/nginx/error.log`)
3. **Browser-Console prüfen** (F12 → Console-Tab)
4. **Netzwerk-Tab prüfen** (F12 → Network-Tab)

---

**Setup abgeschlossen! 🎉**

Dein WhatsApp-Server und Frontend laufen jetzt professionell auf deinem eigenen VPS mit SSL, Monitoring und automatischen Backups.
