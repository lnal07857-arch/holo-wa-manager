# WhatsApp Multi-Account VPS Deployment mit Mullvad WireGuard

## 🎯 Übersicht

Dieses Setup ermöglicht:
- **Jeden WhatsApp-Account** in eigenem Docker-Container mit eigenem WireGuard-Tunnel
- **Jeder Account** hat seine eigene Mullvad-IP (verschiedene Länder möglich)
- **Load Balancing** über Nginx
- **Automatisches Failover** bei Container-Ausfällen
- **Isolierte Sessions** pro Account

## 📋 Voraussetzungen

### VPS-Anforderungen
- **OS**: Ubuntu 22.04 LTS oder Debian 12
- **CPU**: Mind. 2 Cores (empfohlen: 4+ Cores für 5+ Accounts)
- **RAM**: Mind. 4GB (empfohlen: 8GB für 5+ Accounts)
- **Storage**: Mind. 20GB SSD
- **Root-Zugriff** erforderlich

### Mullvad VPN
1. Mullvad-Account erstellen: https://mullvad.net/
2. Pro WhatsApp-Account eine **separate WireGuard-Config** generieren:
   - Login auf https://mullvad.net/account/
   - "WireGuard configuration" → "Generate"
   - **Wichtig**: Für jeden Account einen anderen Server wählen!
   - Beispiel: Account 1 → DE (Deutschland), Account 2 → NL (Niederlande), Account 3 → SE (Schweden)

## 🚀 Installation

### 1. VPS vorbereiten

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose installieren
sudo apt install docker-compose-plugin -y

# WireGuard-Kernel-Module laden
sudo modprobe wireguard

# Projekt-Verzeichnis erstellen
mkdir -p /opt/whatsapp-server
cd /opt/whatsapp-server
```

### 2. Projektdateien hochladen

Kopiere alle Dateien aus dem `whatsapp-server/` Ordner auf deinen VPS:

```bash
# Von deinem lokalen PC (in whatsapp-server/ Ordner):
scp -r * root@YOUR_VPS_IP:/opt/whatsapp-server/
```

### 3. Mullvad WireGuard-Configs einrichten

```bash
# Verzeichnis für Configs erstellen
mkdir -p /opt/whatsapp-server/wireguard-configs

# WireGuard-Configs hochladen (von lokalem PC)
# Account 1 → Deutschland
scp mullvad-de1.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/account-1.conf

# Account 2 → Niederlande
scp mullvad-nl1.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/account-2.conf

# Account 3 → Schweden
scp mullvad-se1.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/account-3.conf
```

**Beispiel einer Mullvad WireGuard-Config:**
```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.x.x.x/32,fc00::/128
DNS = 10.64.0.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 0.0.0.0/0,::0/0
Endpoint = de1-wireguard.mullvad.net:51820
```

### 4. Environment-Variablen setzen

```bash
# .env Datei erstellen
cat > .env << EOF
SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
EOF
```

### 5. Container starten

```bash
cd /opt/whatsapp-server

# Alle Container bauen und starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Status prüfen
docker-compose ps
```

## 🔧 Konfiguration

### Mehr Accounts hinzufügen

1. **docker-compose.yml** erweitern:

```yaml
  whatsapp-account-4:
    build:
      context: .
      dockerfile: Dockerfile.wireguard
    container_name: wa-account-4
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    volumes:
      - ./wireguard-configs/account-4.conf:/etc/wireguard/wg0.conf:ro
      - wa-sessions-4:/app/.wwebjs_auth
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - PORT=3004
      - ACCOUNT_INDEX=4
    ports:
      - "3004:3004"
    networks:
      - wa-network
```

2. **nginx.conf** updaten (Backend hinzufügen):

```nginx
upstream whatsapp_backends {
    least_conn;
    server whatsapp-account-1:3001;
    server whatsapp-account-2:3002;
    server whatsapp-account-3:3003;
    server whatsapp-account-4:3004;  # Neu
}
```

3. **Mullvad-Config** für Account 4 hochladen:

```bash
scp mullvad-ch1.conf root@YOUR_VPS_IP:/opt/whatsapp-server/wireguard-configs/account-4.conf
```

4. **Container neu starten:**

```bash
docker-compose up -d
```

### IP-Adressen pro Account prüfen

```bash
# Account 1 IP
docker exec wa-account-1 curl -s https://api.mullvad.net/www/relays/all/ | head -n 1

# Account 2 IP
docker exec wa-account-2 curl -s https://api.mullvad.net/www/relays/all/ | head -n 1

# Account 3 IP
docker exec wa-account-3 curl -s https://api.mullvad.net/www/relays/all/ | head -n 1
```

Jeder Account sollte eine **unterschiedliche IP** haben!

## 🔍 Monitoring & Debugging

### Container-Logs

```bash
# Alle Container
docker-compose logs -f

# Nur Account 1
docker-compose logs -f whatsapp-account-1

# Letzten 100 Zeilen
docker-compose logs --tail=100
```

### WireGuard-Status prüfen

```bash
# WireGuard-Interface in Container prüfen
docker exec wa-account-1 wg show

# Routing-Tabelle
docker exec wa-account-1 ip route

# DNS-Test
docker exec wa-account-1 nslookup google.com
```

### Container neu starten

```bash
# Einzelner Container
docker-compose restart whatsapp-account-1

# Alle Container
docker-compose restart

# Container neu bauen
docker-compose up -d --build
```

## 🔐 Sicherheit

### Firewall einrichten (UFW)

```bash
# UFW installieren
sudo apt install ufw -y

# Nur notwendige Ports öffnen
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3000/tcp  # WhatsApp API

# Aktivieren
sudo ufw enable
```

### Automatische Updates

```bash
# Watchtower für Auto-Updates (optional)
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600
```

## 📊 Performance-Tuning

### Für viele Accounts (10+)

```yaml
# docker-compose.yml - Resource-Limits setzen
services:
  whatsapp-account-1:
    # ... keep existing code
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

### Nginx-Optimierung

```nginx
# nginx.conf - Worker-Prozesse erhöhen
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
}
```

## 🆘 Troubleshooting

### Problem: Container startet nicht

```bash
# Logs prüfen
docker-compose logs whatsapp-account-1

# Häufige Ursachen:
# 1. WireGuard-Config fehlt oder fehlerhaft
# 2. Keine NET_ADMIN-Capability
# 3. Kernel-Modul nicht geladen

# Lösung prüfen:
ls -la wireguard-configs/
lsmod | grep wireguard
```

### Problem: WireGuard verbindet nicht

```bash
# Config prüfen
cat wireguard-configs/account-1.conf

# Mullvad-Server erreichbar?
ping de1-wireguard.mullvad.net

# DNS-Problem?
docker exec wa-account-1 cat /etc/resolv.conf
```

### Problem: Zu hohe Last

```bash
# Ressourcen-Verbrauch pro Container
docker stats

# Container skalieren (mehr CPU/RAM):
# docker-compose.yml anpassen und neu starten
docker-compose up -d
```

## 🔄 Backup & Migration

### Sessions sichern

```bash
# Alle Sessions sichern
docker run --rm -v whatsapp-server_wa-sessions-1:/data \
  -v $(pwd)/backup:/backup \
  busybox tar czf /backup/sessions-$(date +%Y%m%d).tar.gz /data

# Wiederherstellen
docker run --rm -v whatsapp-server_wa-sessions-1:/data \
  -v $(pwd)/backup:/backup \
  busybox tar xzf /backup/sessions-20250127.tar.gz -C /
```

## 📈 Skalierung

### Neue Region hinzufügen

1. Mullvad-Config für neue Region generieren (z.B. Schweiz)
2. `docker-compose.yml` erweitern
3. `nginx.conf` updaten
4. `docker-compose up -d`

### Load Balancer vor VPS schalten

Für sehr große Deployments (50+ Accounts):
- Mehrere VPS aufsetzen
- Cloudflare Load Balancer oder HAProxy davor schalten
- Supabase-URL in Edge-Function auf Load-Balancer umleiten

## 📝 Wartung

```bash
# Alte Images aufräumen
docker system prune -a --volumes

# Container neu starten (wöchentlich)
0 3 * * 0 cd /opt/whatsapp-server && docker-compose restart

# Logs rotieren
docker-compose logs --no-log-prefix > /dev/null
```

## 💰 Kosten-Beispiel

**VPS (Hetzner CX31):**
- 4 vCPU, 8GB RAM, 160GB SSD
- ~11€/Monat
- Unterstützt ~10-15 WhatsApp-Accounts

**Mullvad VPN:**
- 5€/Monat (unbegrenzte Geräte)
- Unterstützt beliebig viele WireGuard-Configs

**Total für 10 Accounts:** ~16€/Monat

## 🎓 Best Practices

1. **Eine IP pro Account** → Bessere WhatsApp-Reputation
2. **Verschiedene Länder** → Diversifikation
3. **Auto-Restart** aktivieren → Hohe Verfügbarkeit
4. **Monitoring** einrichten → Frühwarnung bei Problemen
5. **Backups** automatisieren → Kein Datenverlust

## 🔗 Nützliche Links

- Mullvad WireGuard Guide: https://mullvad.net/help/wireguard/
- Docker Compose Docs: https://docs.docker.com/compose/
- WireGuard Official: https://www.wireguard.com/

## 📞 Support

Bei Fragen zum Setup:
1. Container-Logs prüfen: `docker-compose logs -f`
2. WireGuard-Status: `docker exec wa-account-1 wg show`
3. Mullvad-Status: https://mullvad.net/check
