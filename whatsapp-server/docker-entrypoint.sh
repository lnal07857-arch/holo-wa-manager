#!/bin/bash
set -e

echo "[WireGuard] Checking for WireGuard configuration..."

# Check if WireGuard config exists
if [ -f "/etc/wireguard/wg0.conf" ]; then
    echo "[WireGuard] ✅ Config found, starting WireGuard tunnel..."
    
    # Start WireGuard
    wg-quick up wg0 || true
    
    # Wait for interface to be ready
    sleep 2
    
    # Verify connection
    if ip link show wg0 &> /dev/null; then
        echo "[WireGuard] ✅ Tunnel active"
        
        # Get public IP through tunnel
        PUBLIC_IP=$(curl -s --max-time 5 https://api.mullvad.net/www/relays/all/ 2>/dev/null | head -n 1 || echo "unknown")
        echo "[WireGuard] Public IP: $PUBLIC_IP"
    else
        echo "[WireGuard] ⚠️ Warning: Tunnel not active, using direct connection"
    fi
else
    echo "[WireGuard] ℹ️ No config found, using direct connection"
fi

# Start application
echo "[App] Starting WhatsApp server..."
exec "$@"
