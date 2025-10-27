# Mullvad VPN WireGuard-Konfiguration

## 🎯 Quick Start

### 1. Mullvad-Account erstellen

1. Gehe zu https://mullvad.net/
2. Klicke auf "Get Mullvad" → Account wird automatisch generiert
3. **Wichtig:** Notiere deine Account-Nummer (Format: `1234567890123456`)
4. Bezahle (5€/Monat, Bitcoin/Kreditkarte/PayPal)

### 2. WireGuard-Configs generieren

**Option A: Web-Interface (empfohlen)**

1. Login: https://mullvad.net/account/
2. Navigiere zu "WireGuard configuration"
3. Klicke "Generate key"
4. Wähle Server aus:
   - **Account 1**: Deutschland (de-fra-wg-001)
   - **Account 2**: Niederlande (nl-ams-wg-001)
   - **Account 3**: Schweden (se-sto-wg-001)
   - **Account 4**: Schweiz (ch-zrh-wg-001)
   - etc.
5. Download Config-Datei → Umbenennen in `account-X.conf`

**Option B: Mullvad CLI**

```bash
# Mullvad CLI installieren
curl -fsSLO https://mullvad.net/media/app/mullvad-vpn_2024.6_amd64.deb
sudo dpkg -i mullvad-vpn_2024.6_amd64.deb

# Einloggen
mullvad account login 1234567890123456

# WireGuard-Key generieren
mullvad relay set tunnel-protocol wireguard

# Config für Deutschland generieren
mullvad relay set location de fra
mullvad relay tunnel wireguard key regenerate

# Config exportieren
sudo cat /etc/mullvad-vpn/wireguard.conf > account-1.conf
```

### 3. Config-Struktur verstehen

Eine typische Mullvad WireGuard-Config sieht so aus:

```ini
[Interface]
PrivateKey = AAAA1234BBBBCCCCDDDDeeeeFFFF5678====
Address = 10.68.123.45/32,fc00:bbbb:bbbb:bb01::5:1234/128
DNS = 10.64.0.1

[Peer]
PublicKey = XXXX9876YYYYZZZZAAAAbbbb1234====
AllowedIPs = 0.0.0.0/0,::0/0
Endpoint = de-fra-wg-001.relays.mullvad.net:51820
```

**Wichtige Felder:**
- `PrivateKey`: Dein geheimer Schlüssel (nicht teilen!)
- `Address`: Deine zugewiesene VPN-IP
- `DNS`: Mullvad DNS-Server (optional)
- `Endpoint`: Mullvad-Server (Standort wichtig!)

## 🌍 Verfügbare Mullvad-Server

### Deutschland (DE)
```
de-ber-wg-001.relays.mullvad.net  # Berlin
de-fra-wg-001.relays.mullvad.net  # Frankfurt
de-dus-wg-001.relays.mullvad.net  # Düsseldorf
```

### Niederlande (NL)
```
nl-ams-wg-001.relays.mullvad.net  # Amsterdam
```

### Schweden (SE)
```
se-sto-wg-001.relays.mullvad.net  # Stockholm
se-got-wg-001.relays.mullvad.net  # Göteborg
se-mma-wg-001.relays.mullvad.net  # Malmö
```

### Schweiz (CH)
```
ch-zrh-wg-001.relays.mullvad.net  # Zürich
```

### Österreich (AT)
```
at-vie-wg-001.relays.mullvad.net  # Wien
```

### Frankreich (FR)
```
fr-par-wg-001.relays.mullvad.net  # Paris
```

### UK (GB)
```
gb-lon-wg-001.relays.mullvad.net  # London
```

### USA (US)
```
us-nyc-wg-001.relays.mullvad.net  # New York
us-dal-wg-001.relays.mullvad.net  # Dallas
us-lax-wg-001.relays.mullvad.net  # Los Angeles
```

**Tipp:** Wähle Server basierend auf:
1. **Latenz**: Näher = schneller
2. **Diversifikation**: Verschiedene Länder pro Account
3. **WhatsApp-Region**: Passe zu deiner Zielgruppe

## 🔧 Config für Docker anpassen

### Standard-Mullvad-Config

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.68.123.45/32,fc00::/128
DNS = 10.64.0.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 0.0.0.0/0,::0/0
Endpoint = de-fra-wg-001.relays.mullvad.net:51820
PersistentKeepalive = 25
```

### Docker-optimierte Config

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.68.123.45/32
DNS = 10.64.0.1,1.1.1.1

# Post-Up/Down Scripts für Docker
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 0.0.0.0/0
Endpoint = de-fra-wg-001.relays.mullvad.net:51820
PersistentKeepalive = 25
```

**Änderungen:**
- IPv6 entfernt (optional, für Stabilität)
- Backup-DNS hinzugefügt (1.1.1.1)
- iptables-Regeln für Docker-Routing

## ✅ Config-Validierung

### Vor dem Deployment testen

```bash
# Config-Syntax prüfen
wg-quick up ./account-1.conf

# Verbindung testen
curl -s https://am.i.mullvad.net/connected

# IP prüfen
curl -s https://api.mullvad.net/www/relays/all/ | head -n 1

# WireGuard-Status
wg show

# Aufräumen
wg-quick down wg0
```

**Erwartetes Ergebnis:**
- "You are connected to Mullvad" ✅
- IP zeigt Mullvad-Server ✅
- Keine Fehler in `wg show` ✅

## 🔐 Sicherheit

### Best Practices

1. **Private Keys schützen**
```bash
# Configs nur für Root lesbar
chmod 600 wireguard-configs/*.conf
chown root:root wireguard-configs/*.conf
```

2. **Regelmäßige Key-Rotation**
```bash
# Alle 3 Monate neue Keys generieren
# Alte Configs auf Mullvad-Dashboard löschen
```

3. **Kill Switch aktivieren**
```ini
# In Config hinzufügen (bereits in Docker-Version):
PostUp = iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT
PostDown = iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT
```

## 🧪 Troubleshooting

### Problem: Verbindung schlägt fehl

```bash
# DNS-Problem?
ping de-fra-wg-001.relays.mullvad.net

# Firewall blockiert Port 51820?
sudo ufw allow 51820/udp

# WireGuard-Modul geladen?
lsmod | grep wireguard

# Mullvad-Server erreichbar?
nc -zvu de-fra-wg-001.relays.mullvad.net 51820
```

### Problem: Langsame Verbindung

```bash
# Latenz testen
ping -c 10 10.64.0.1

# Anderen Server probieren:
# In Config Endpoint ändern zu näherem Server
# z.B. de-ber-wg-001 → de-fra-wg-001
```

### Problem: "Address already in use"

```bash
# Alten Tunnel beenden
wg-quick down wg0

# Oder alle WireGuard-Interfaces
for i in $(ip link show | grep wg | cut -d: -f2); do
  wg-quick down $i
done
```

## 📊 Performance-Vergleich

| Server | Latenz (DE) | Durchsatz |
|--------|-------------|-----------|
| de-fra | ~5ms | ~900 Mbps |
| de-ber | ~8ms | ~850 Mbps |
| nl-ams | ~12ms | ~800 Mbps |
| se-sto | ~25ms | ~700 Mbps |
| ch-zrh | ~15ms | ~750 Mbps |

**Tipp:** Wähle Server mit <20ms Latenz für beste Performance.

## 🎓 Erweiterte Konfiguration

### Multi-Hop (über 2 Server)

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.68.1.1/32

[Peer]
PublicKey = SERVER1_PUBLIC_KEY
Endpoint = de-fra-wg-001.relays.mullvad.net:51820
AllowedIPs = 10.68.2.0/24

[Peer]
PublicKey = SERVER2_PUBLIC_KEY
Endpoint = nl-ams-wg-001.relays.mullvad.net:51820
AllowedIPs = 0.0.0.0/0
```

### Split-Tunneling (nur WhatsApp über VPN)

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY
Address = 10.68.1.1/32

[Peer]
PublicKey = SERVER_PUBLIC_KEY
Endpoint = de-fra-wg-001.relays.mullvad.net:51820
# Nur WhatsApp-Server IPs
AllowedIPs = 31.13.64.0/18, 157.240.0.0/16
```

## 💡 Tipps & Tricks

1. **Port-Forwarding** (falls benötigt):
   - Mullvad Dashboard → "Port forwarding"
   - Port notieren und in Config verwenden

2. **IPv6 deaktivieren** (für Stabilität):
   ```ini
   # IPv6-Adresse aus [Interface] entfernen
   # Nur IPv4 in AllowedIPs
   AllowedIPs = 0.0.0.0/0
   ```

3. **DNS-Leaks verhindern**:
   ```ini
   # In [Interface]:
   DNS = 10.64.0.1
   # Test: https://dnsleaktest.com/
   ```

## 📞 Support

- **Mullvad Support**: support@mullvad.net
- **Status-Page**: https://mullvad.net/status
- **Config-Generator**: https://mullvad.net/account/wireguard-config
