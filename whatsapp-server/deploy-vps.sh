#!/bin/bash
set -e

# ============================================
# WhatsApp Server - VPS Deploy Script
# Zieht den aktuellen Code und startet neu
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/opt/whatsapp-server"
REPO_DIR="/opt/whatsapp-repo"

echo ""
echo -e "${CYAN}=================================================${NC}"
echo -e "${CYAN}  WhatsApp Server - Deploy Script${NC}"
echo -e "${CYAN}=================================================${NC}"
echo ""

# Prüfe ob als root ausgeführt
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Bitte als root ausführen: sudo bash deploy-vps.sh${NC}"
   exit 1
fi

# ── Schritt 1: Git Repo aktualisieren ──
echo -e "${YELLOW}[1/6]${NC} Code aktualisieren..."

if [ -d "$REPO_DIR/.git" ]; then
    cd "$REPO_DIR"
    git fetch origin
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
    echo -e "${GREEN}  ✓ Git Pull erfolgreich${NC}"
else
    echo -e "${YELLOW}  ⚠ Kein Git-Repo gefunden unter $REPO_DIR${NC}"
    echo -e "${YELLOW}    Bitte zuerst klonen:${NC}"
    echo -e "${CYAN}    git clone <REPO_URL> $REPO_DIR${NC}"
    echo ""
    read -p "Git-Repo-URL eingeben (oder Enter zum Überspringen): " REPO_URL
    if [ -n "$REPO_URL" ]; then
        git clone "$REPO_URL" "$REPO_DIR"
        cd "$REPO_DIR"
        echo -e "${GREEN}  ✓ Repo geklont${NC}"
    else
        echo -e "${YELLOW}  → Übersprungen, verwende bestehende Dateien${NC}"
    fi
fi

# ── Schritt 2: Server-Dateien kopieren ──
echo -e "${YELLOW}[2/6]${NC} Server-Dateien synchronisieren..."

mkdir -p "$APP_DIR"

if [ -d "$REPO_DIR/whatsapp-server" ]; then
    # Wichtige Dateien kopieren (ohne .env und Sessions zu überschreiben)
    cp "$REPO_DIR/whatsapp-server/server.js" "$APP_DIR/server.js"
    cp "$REPO_DIR/whatsapp-server/package.json" "$APP_DIR/package.json"
    
    # Docker-Dateien kopieren falls vorhanden
    [ -f "$REPO_DIR/whatsapp-server/Dockerfile" ] && cp "$REPO_DIR/whatsapp-server/Dockerfile" "$APP_DIR/Dockerfile"
    [ -f "$REPO_DIR/whatsapp-server/Dockerfile.wireguard" ] && cp "$REPO_DIR/whatsapp-server/Dockerfile.wireguard" "$APP_DIR/Dockerfile.wireguard"
    [ -f "$REPO_DIR/whatsapp-server/docker-compose.yml" ] && cp "$REPO_DIR/whatsapp-server/docker-compose.yml" "$APP_DIR/docker-compose.yml"
    [ -f "$REPO_DIR/whatsapp-server/docker-entrypoint.sh" ] && cp "$REPO_DIR/whatsapp-server/docker-entrypoint.sh" "$APP_DIR/docker-entrypoint.sh"
    [ -f "$REPO_DIR/whatsapp-server/nginx.conf" ] && cp "$REPO_DIR/whatsapp-server/nginx.conf" "$APP_DIR/nginx.conf"
    
    echo -e "${GREEN}  ✓ Dateien synchronisiert${NC}"
else
    echo -e "${YELLOW}  → Kein whatsapp-server Ordner im Repo, verwende $APP_DIR direkt${NC}"
fi

cd "$APP_DIR"

# ── Schritt 3: .env prüfen ──
echo -e "${YELLOW}[3/6]${NC} Umgebungsvariablen prüfen..."

if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${RED}  ⚠ Keine .env Datei gefunden!${NC}"
    echo ""
    read -p "  SUPABASE_URL: " SB_URL
    read -p "  SUPABASE_KEY (Service Role): " SB_KEY
    
    cat > "$APP_DIR/.env" << EOF
SUPABASE_URL=${SB_URL}
SUPABASE_KEY=${SB_KEY}
PORT=3000
NODE_ENV=production
EOF
    echo -e "${GREEN}  ✓ .env erstellt${NC}"
else
    echo -e "${GREEN}  ✓ .env vorhanden${NC}"
    # Zeige konfigurierte URL (ohne Key)
    grep "SUPABASE_URL" "$APP_DIR/.env" 2>/dev/null | head -1 | sed 's/^/    /'
fi

# ── Schritt 4: Deployment-Modus erkennen ──
echo -e "${YELLOW}[4/6]${NC} Deployment-Modus erkennen..."

USE_DOCKER=false
USE_PM2=false

if [ -f "$APP_DIR/docker-compose.yml" ] && command -v docker &>/dev/null; then
    USE_DOCKER=true
    echo -e "${CYAN}  → Docker-Modus erkannt${NC}"
elif command -v pm2 &>/dev/null; then
    USE_PM2=true
    echo -e "${CYAN}  → PM2-Modus erkannt${NC}"
else
    echo -e "${CYAN}  → Direkt-Modus (Node.js)${NC}"
fi

# ── Schritt 5: Dependencies installieren (nur bei Non-Docker) ──
echo -e "${YELLOW}[5/6]${NC} Dependencies..."

if [ "$USE_DOCKER" = true ]; then
    echo -e "${GREEN}  ✓ Docker-Build übernimmt Dependencies${NC}"
else
    echo "  npm install läuft..."
    npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1
    echo -e "${GREEN}  ✓ Dependencies installiert${NC}"
fi

# ── Schritt 6: Server neu starten ──
echo -e "${YELLOW}[6/6]${NC} Server neu starten..."

if [ "$USE_DOCKER" = true ]; then
    echo "  Docker Container werden neu gebaut und gestartet..."
    docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
    docker compose up -d --build 2>/dev/null || docker-compose up -d --build 2>/dev/null
    echo -e "${GREEN}  ✓ Docker Container gestartet${NC}"
    
    # Warte kurz und zeige Status
    sleep 3
    echo ""
    echo -e "${CYAN}  Container-Status:${NC}"
    docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null

elif [ "$USE_PM2" = true ]; then
    # PM2: Restart oder Start
    if pm2 describe whatsapp-server &>/dev/null; then
        pm2 restart whatsapp-server
        echo -e "${GREEN}  ✓ PM2 Prozess neugestartet${NC}"
    else
        pm2 start server.js --name whatsapp-server
        pm2 save
        echo -e "${GREEN}  ✓ PM2 Prozess gestartet${NC}"
    fi
    
    sleep 2
    pm2 status whatsapp-server

else
    # Direkter Node-Start (im Hintergrund)
    echo "  Stoppe alte Prozesse..."
    pkill -f "node server.js" 2>/dev/null || true
    sleep 1
    
    echo "  Starte Server..."
    nohup node server.js > /var/log/whatsapp-server.log 2>&1 &
    echo -e "${GREEN}  ✓ Server gestartet (PID: $!)${NC}"
    echo -e "${CYAN}  Logs: tail -f /var/log/whatsapp-server.log${NC}"
fi

# ── Health Check ──
echo ""
echo -e "${CYAN}  Health-Check...${NC}"
sleep 3

PORT=$(grep "^PORT=" "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3000")
PORT=${PORT:-3000}

HEALTH=$(curl -s --max-time 5 "http://localhost:${PORT}/health" 2>/dev/null || echo "FAILED")

if echo "$HEALTH" | grep -qi "ok\|healthy\|running"; then
    echo -e "${GREEN}  ✓ Server antwortet auf Port ${PORT}${NC}"
else
    echo -e "${YELLOW}  ⚠ Server antwortet noch nicht (kann noch starten)${NC}"
    echo -e "${YELLOW}    Prüfe manuell: curl http://localhost:${PORT}/health${NC}"
fi

# ── Zusammenfassung ──
echo ""
echo -e "${CYAN}=================================================${NC}"
echo -e "${GREEN}  ✅ Deploy abgeschlossen!${NC}"
echo -e "${CYAN}=================================================${NC}"
echo ""
echo -e "  ${CYAN}Server:${NC}  http://localhost:${PORT}"
echo -e "  ${CYAN}Health:${NC}  http://localhost:${PORT}/health"
echo -e "  ${CYAN}Status:${NC}  http://localhost:${PORT}/api/status"
echo ""

if [ "$USE_DOCKER" = true ]; then
    echo -e "  ${CYAN}Logs:${NC}    docker compose logs -f"
elif [ "$USE_PM2" = true ]; then
    echo -e "  ${CYAN}Logs:${NC}    pm2 logs whatsapp-server"
else
    echo -e "  ${CYAN}Logs:${NC}    tail -f /var/log/whatsapp-server.log"
fi
echo ""
