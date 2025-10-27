#!/bin/bash
set -e

# WhatsApp Multi-Account VPS Setup Script
# Dieses Script automatisiert die Installation auf einem frischen Ubuntu/Debian VPS

echo "=================================================="
echo "WhatsApp Multi-Account VPS Setup"
echo "=================================================="
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Prüfe ob als root ausgeführt
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Dieses Script muss als root ausgeführt werden${NC}"
   echo "Führe aus: sudo bash setup-vps.sh"
   exit 1
fi

echo -e "${GREEN}✓${NC} Root-Zugriff bestätigt"

# System-Update
echo ""
echo -e "${YELLOW}[1/6]${NC} System wird aktualisiert..."
apt update > /dev/null 2>&1
apt upgrade -y > /dev/null 2>&1
echo -e "${GREEN}✓${NC} System aktualisiert"

# Docker installieren
echo ""
echo -e "${YELLOW}[2/6]${NC} Docker wird installiert..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Docker installiert"
else
    echo -e "${GREEN}✓${NC} Docker bereits installiert"
fi

# Docker Compose installieren
echo ""
echo -e "${YELLOW}[3/6]${NC} Docker Compose wird installiert..."
if ! command -v docker-compose &> /dev/null; then
    apt install docker-compose-plugin -y > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Docker Compose installiert"
else
    echo -e "${GREEN}✓${NC} Docker Compose bereits installiert"
fi

# WireGuard-Modul laden
echo ""
echo -e "${YELLOW}[4/6]${NC} WireGuard-Kernel-Modul wird geladen..."
if ! lsmod | grep -q wireguard; then
    modprobe wireguard
    echo "wireguard" >> /etc/modules-load.d/wireguard.conf
    echo -e "${GREEN}✓${NC} WireGuard-Modul geladen"
else
    echo -e "${GREEN}✓${NC} WireGuard-Modul bereits geladen"
fi

# Projekt-Verzeichnis erstellen
echo ""
echo -e "${YELLOW}[5/6]${NC} Projekt-Verzeichnis wird erstellt..."
mkdir -p /opt/whatsapp-server/wireguard-configs
cd /opt/whatsapp-server
echo -e "${GREEN}✓${NC} Verzeichnis erstellt: /opt/whatsapp-server"

# Firewall konfigurieren
echo ""
echo -e "${YELLOW}[6/6]${NC} Firewall wird konfiguriert..."
if ! command -v ufw &> /dev/null; then
    apt install ufw -y > /dev/null 2>&1
fi

# UFW-Regeln setzen (nicht aktivieren, da SSH unterbrochen werden könnte)
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow 22/tcp > /dev/null 2>&1   # SSH
ufw allow 3000/tcp > /dev/null 2>&1 # WhatsApp API

echo -e "${GREEN}✓${NC} Firewall konfiguriert (noch nicht aktiviert)"

# Abschluss-Informationen
echo ""
echo "=================================================="
echo -e "${GREEN}✅ VPS-Setup abgeschlossen!${NC}"
echo "=================================================="
echo ""
echo "📋 Nächste Schritte:"
echo ""
echo "1️⃣  Kopiere deine Projektdateien hierher:"
echo "    ${YELLOW}scp -r * root@$(hostname -I | awk '{print $1}'):/opt/whatsapp-server/${NC}"
echo ""
echo "2️⃣  Lade deine Mullvad WireGuard-Configs hoch:"
echo "    ${YELLOW}scp account-1.conf root@$(hostname -I | awk '{print $1}'):/opt/whatsapp-server/wireguard-configs/${NC}"
echo "    ${YELLOW}scp account-2.conf root@$(hostname -I | awk '{print $1}'):/opt/whatsapp-server/wireguard-configs/${NC}"
echo "    ${YELLOW}scp account-3.conf root@$(hostname -I | awk '{print $1}'):/opt/whatsapp-server/wireguard-configs/${NC}"
echo ""
echo "3️⃣  Erstelle .env Datei:"
echo "    ${YELLOW}cd /opt/whatsapp-server${NC}"
echo "    ${YELLOW}nano .env${NC}"
echo ""
echo "    Inhalt:"
echo "    ${YELLOW}SUPABASE_URL=https://umizkegxybjhqucbhgth.supabase.co${NC}"
echo "    ${YELLOW}SUPABASE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY${NC}"
echo ""
echo "4️⃣  Starte die Container:"
echo "    ${YELLOW}cd /opt/whatsapp-server${NC}"
echo "    ${YELLOW}docker-compose up -d${NC}"
echo ""
echo "5️⃣  Aktiviere die Firewall (⚠️ Nur wenn SSH auf Port 22 läuft!):"
echo "    ${YELLOW}ufw enable${NC}"
echo ""
echo "📊 Status-Befehle:"
echo "  - Logs: ${YELLOW}docker-compose logs -f${NC}"
echo "  - Status: ${YELLOW}docker-compose ps${NC}"
echo "  - IP prüfen: ${YELLOW}docker exec wa-account-1 curl ifconfig.me${NC}"
echo ""
echo "🔗 Vollständige Anleitung: ${YELLOW}QUICK_VPS_SETUP.md${NC}"
echo ""
