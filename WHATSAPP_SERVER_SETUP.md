# WhatsApp Server Setup (VPS)

Dieser Guide zeigt den empfohlenen Setup-Flow für den WhatsApp-Server auf einem VPS.

## 1) Server vorbereiten

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 2) Projekt deployen

```bash
git clone <dein-repo-url>
cd whatsapp-server
docker compose up -d --build
```

## 3) Environment konfigurieren

Beispiel `.env`:

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<service_role_key>
PORT=3000
NODE_ENV=production
```

## 4) Health prüfen

```bash
curl http://localhost:3000/health
```

## 5) Reverse Proxy + TLS (empfohlen)

- Nginx auf `wa-api.<deine-domain>`
- TLS mit Certbot
- Proxy auf `http://127.0.0.1:3000`

## 6) Backend-Funktion konfigurieren

Setze in den Backend-Funktions-Secrets:

```bash
VPS_SERVER_URL=https://wa-api.example.com
```

(Optional kompatibel: `RAILWAY_SERVER_URL` als Legacy-Fallback.)

## 7) Betrieb & Logs

```bash
docker compose ps
docker compose logs -f
```

## Hinweise

- Für Multi-Account + individuelle IPs nutze WireGuard/Mullvad (`MULLVAD_SETUP.md`).
- Für vollständige Produktionshärtung siehe `VPS_DEPLOYMENT_GUIDE.md` und `DEBIAN_VPS_COMPLETE_SETUP.md`.
