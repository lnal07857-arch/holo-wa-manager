# ⚙️ Legacy-Datei: VPS-Deployment verwenden

Diese Datei bleibt aus Kompatibilitätsgründen bestehen.

Für das aktuelle Projekt bitte ausschließlich VPS-Deployment verwenden:
- `QUICK_VPS_SETUP.md` (Schnellstart)
- `VPS_DEPLOYMENT_GUIDE.md` (vollständige Anleitung)
- `DEBIAN_VPS_COMPLETE_SETUP.md` (End-to-End Setup)

## Erforderliche Server-URL

In den Backend-Funktions-Secrets:

```bash
VPS_SERVER_URL=https://wa-api.example.com
```

Verwende ausschließlich:

```bash
VPS_SERVER_URL=https://wa-api.example.com
```

## Health Check

```bash
curl https://wa-api.example.com/health
```

Erwartete Antwort:

```json
{"status":"OK","activeClients":0,"timestamp":"2026-..."}
```
