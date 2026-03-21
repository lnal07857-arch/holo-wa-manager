

# Auto-Willkommensnachricht

## Konzept

Wenn ein neuer Kontakt zum ersten Mal schreibt, wird automatisch ein Willkommenstext gesendet. Das System prüft anhand der `messages`-Tabelle, ob bereits Nachrichten von dieser Telefonnummer für diesen Account existieren — nur beim **allerersten Kontakt** wird die Willkommensnachricht verschickt.

## Änderungen

### 1. Datenbank: Neue Spalten auf `whatsapp_accounts`

- `auto_welcome_enabled` (boolean, default false) — Toggle pro Account
- `auto_welcome_message` (text, nullable) — Der Willkommenstext

### 2. VPS Server (`server.js`): Auto-Welcome Logik

Im bestehenden `message_create`-Handler (Zeile 306) wird nach dem Speichern einer eingehenden Nachricht geprüft:
1. Ist `auto_welcome_enabled` für diesen Account aktiv?
2. Gab es **vorher** bereits Nachrichten von dieser Telefonnummer? (SELECT COUNT auf `messages` wo `contact_phone = X` und `account_id = Y`)
3. Falls nein → Willkommensnachricht senden via `client.sendMessage()`
4. Kurze Verzögerung (1-3 Sek.) damit es natürlich wirkt

### 3. Frontend: Toggle + Textfeld in Accounts-View

Pro Account-Karte ein aufklappbarer Bereich:
- **Switch** "Auto-Willkommen" (aktiviert/deaktiviert)
- **Textarea** für den Willkommenstext mit Platzhalter-Vorschlag
- Speichern direkt via Supabase-Update auf `whatsapp_accounts`

### 4. Edge Function: Account-Settings an VPS liefern

Der VPS-Server cached die Welcome-Einstellungen pro Account aus der Datenbank. Bei `message_create` wird die Einstellung aus dem Cache oder per DB-Query geprüft.

## Ablauf

```text
Neuer Kontakt schreibt → message_create Event
  → Nachricht in DB speichern (existiert bereits)
  → Prüfe: auto_welcome_enabled?
  → Prüfe: Erste Nachricht von dieser Nummer? (COUNT = 1, nur die gerade gespeicherte)
  → Ja → client.sendMessage(welcomeText)
  → Willkommensnachricht wird auch als "outgoing" gespeichert
```

## Dateien

| Datei | Änderung |
|-------|----------|
| Migration | `auto_welcome_enabled`, `auto_welcome_message` Spalten |
| `whatsapp-server/server.js` | Welcome-Logik im `message_create` Handler |
| `src/components/views/Accounts.tsx` | Toggle + Textarea pro Account |
| `src/hooks/useWhatsAppAccounts.tsx` | Neue Felder im Interface |

