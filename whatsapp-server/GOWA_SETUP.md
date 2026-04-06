# go-whatsapp-web-multidevice — VPS Setup

Dieses Setup ersetzt den bisherigen whatsapp-web.js + Puppeteer/Chrome Worker durch
[go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice),
das **kein Chrome/Puppeteer** benötigt und direkt das WhatsApp-Protokoll nutzt.

## Vorteile gegenüber whatsapp-web.js

- **Kein Chrome nötig** → kein D-Bus, kein SingletonLock, kein Browser-Crash
- **~30MB RAM** statt ~350MB pro Account
- **Multi-Device nativ** → ein Container für alle Accounts
- **Built-in Webhooks** → eingehende Nachrichten automatisch an Supabase
- **REST API + Swagger UI** → einfach zu debuggen

## Schnellstart

### 1. Auf den VPS verbinden

```bash
ssh root@DEIN_VPS_IP
```

### 2. Projektverzeichnis erstellen

```bash
mkdir -p /root/go-whatsapp && cd /root/go-whatsapp
```

### 3. docker-compose.yml kopieren

Kopiere die Datei `docker-compose.gowa.yml` als `docker-compose.yml`:

```bash
# Inhalt der docker-compose.gowa.yml hierher kopieren oder per scp übertragen
```

### 4. .env erstellen

```bash
cat > .env << 'EOF'
# Supabase Edge Function Webhook URL
# Format: https://<project-ref>.supabase.co/functions/v1/wa-webhook
WEBHOOK_URL=https://umizkegxybjhqucbhgth.supabase.co/functions/v1/wa-webhook

# Webhook Secret (muss mit go-whatsapp --webhook-secret übereinstimmen)
WEBHOOK_SECRET=secret

# Optional: Basic Auth für die REST API
# BASIC_AUTH_PASSWORD=dein-sicheres-passwort
EOF
```

### 5. Container starten

```bash
docker compose up -d
```

### 6. Prüfen

```bash
# Health Check
curl http://localhost:3000/app/status

# Swagger UI öffnen
# http://DEIN_VPS_IP:3000 im Browser

# Logs ansehen
docker logs go-whatsapp -f --since 5m
```

## Firewall

```bash
# Port 3000 für die API öffnen (oder hinter Nginx/Caddy mit HTTPS)
ufw allow 3000/tcp
```

## HTTPS mit Caddy (empfohlen)

```bash
apt install caddy

cat > /etc/caddy/Caddyfile << 'EOF'
wa.deine-domain.de {
    reverse_proxy localhost:3000
}
EOF

systemctl restart caddy
```

Dann in Lovable Cloud die `VPS_SERVER_URL` auf `https://wa.deine-domain.de` setzen.

## VPS_SERVER_URL in Lovable Cloud setzen

Die Edge Function braucht die URL des VPS als Secret `VPS_SERVER_URL`:

```
http://DEIN_VPS_IP:3000
```

Oder mit HTTPS:
```
https://wa.deine-domain.de
```

## Migration vom alten whatsapp-web.js Worker

1. Alten Worker stoppen: `docker compose -f docker-compose.yml down`
2. go-whatsapp starten: `docker compose -f docker-compose.gowa.yml up -d`
3. Alte Session-Daten können gelöscht werden (nicht kompatibel)
4. Alle Accounts müssen neu per QR verbunden werden

## Troubleshooting

### Container startet nicht
```bash
docker logs go-whatsapp --since 5m
```

### QR-Code erscheint nicht
```bash
# Manuell testen:
curl http://localhost:3000/devices
curl http://localhost:3000/devices/ACCOUNT_ID/login
```

### Webhook kommt nicht an
```bash
# Webhook-URL testen:
curl -X POST https://umizkegxybjhqucbhgth.supabase.co/functions/v1/wa-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","device_id":"test","payload":{}}'
```
