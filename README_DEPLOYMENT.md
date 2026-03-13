# 🚀 Deployment-Optionen (VPS)

## Welche Option passt zu dir?

| Anforderung | Empfohlene Option | Anleitung |
|------------|-------------------|-----------|
| **Quick Start / Testing** | VPS Single-Node | `QUICK_VPS_SETUP.md` |
| **3-12 Accounts, einfach** | VPS Standard | `QUICK_VPS_SETUP.md` |
| **10+ Accounts** | VPS mit WireGuard | `VPS_DEPLOYMENT_GUIDE.md` |
| **Individuelle IPs pro Account** | VPS mit WireGuard | `MULLVAD_SETUP.md` |
| **Maximale Kontrolle** | VPS + Nginx + Systemd | `DEBIAN_VPS_COMPLETE_SETUP.md` |

---

## ✅ Empfehlung

Für diesen Use Case ist ein VPS die stabile Standard-Architektur:
- dauerhafter Prozess für WhatsApp-Clients
- persistente Sessions auf Dateisystem
- volle Kontrolle über Ressourcen & Monitoring

---

## 📚 Dokumentations-Übersicht

### Deployment
- **`QUICK_VPS_SETUP.md`** – Schnellstart in wenigen Minuten
- **`VPS_DEPLOYMENT_GUIDE.md`** – Vollständiges Deployment
- **`DEBIAN_VPS_COMPLETE_SETUP.md`** – End-to-End Debian Setup

### VPN/Proxy
- **`MULLVAD_SETUP.md`** – Mullvad WireGuard-Konfiguration
- **`whatsapp-server/setup-vps.sh`** – automatisches VPS-Bootstrap-Script

### Development
- **`WHATSAPP_SERVER_SETUP.md`** – lokaler/devnaher Server-Setup
- **`README.md`** – Projektüberblick

---

## 🔄 Migration & Konfiguration

Wenn dein Server unter einer neuen Domain läuft, setze in den Backend-Funktions-Secrets:

```bash
VPS_SERVER_URL=https://wa-api.example.com
```

(Optional kompatibel: `RAILWAY_SERVER_URL` wird weiterhin als Legacy-Fallback unterstützt.)

---

## 🆘 Support

- VPS-Probleme: `VPS_DEPLOYMENT_GUIDE.md`
- WireGuard/Mullvad: `MULLVAD_SETUP.md`
- Komplett-Setup Debian: `DEBIAN_VPS_COMPLETE_SETUP.md`
