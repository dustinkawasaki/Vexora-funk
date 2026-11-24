# VEXORA Bot

Discord-Bot und Dashboard für VEXORA.

## Funktionen

- Slash-Befehle: `/vexora-status`, `/vexora-hilfe`, `/warn`, `/kick`, `/ban`, `/clear`
- Personalverwaltung: `/promote`, `/demote`, `/einstellen`, `/feuern`
- Fraktionen: Polizei, Rettungsdienst und Feuerwehr über Discord-Rollen
- Funk: `/funk` sendet in den konfigurierten Funkkanal
- Willkommens- und Abschiedsnachrichten
- Logs für Beitritte, Austritte, gelöschte/bearbeitete Nachrichten, Bans, Rollen und Kanäle
- Nachrichtenfilter meldet konfigurierte Begriffe zur Teamprüfung
- Spam- und Raid-Schutz erkennen ungewöhnliche Aktivität und senden Teamhinweise; es gibt keine automatische Bestrafung
- Owner-/Moderator-Zugriff und Prüfung der Rollen-Hierarchie

## Architektur

- Das Dashboard speichert Server-Einstellungen in Supabase.
- Der Cloudflare Worker verarbeitet Discord-Interaktionen, OAuth und die Dashboard-API.
- Das Gateway-Programm in `src/index.js` verbindet sich dauerhaft mit Discord und führt Live-Ereignisse aus.
- Der Gateway-Prozess muss separat auf einem dauerhaft laufenden Node.js-Host gestartet werden. Ein normaler request-basierter Worker hält keine Discord-Gateway-Verbindung offen.
- Der Gateway-Prozess liest die Server-Einstellungen aus Supabase und aktualisiert seinen Cache alle 10 Sekunden.

## Gateway-Host einrichten

Node.js 20 oder neuer wird benötigt. Startbefehl:

```bash
npm install
npm start
```

Diese Variablen müssen im privaten Host-Dashboard gesetzt werden:

- `DISCORD_TOKEN` – Bot-Token
- `DISCORD_CLIENT_ID` – Discord Application ID
- `DISCORD_GUILD_ID` – Server-ID, auf dem die Slash-Befehle registriert werden
- `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` – nur für den Gateway-Prozess, niemals im Browser
- `OWNER_ROLE_IDS` und optional `MODERATOR_ROLE_IDS`
- optional `LOG_CHANNEL_ID`, `WELCOME_CHANNEL_ID`, `GOODBYE_CHANNEL_ID`, `FUNK_CHANNEL_ID`
- optional `POLICE_ROLE_ID`, `EMS_ROLE_ID`, `FIRE_ROLE_ID`
- optional `BLOCKED_TERMS` als Komma-getrennte Standardliste

Die im Dashboard gespeicherten Kanal-, Moderatorrollen- und Filterwerte überschreiben die entsprechenden Standardwerte für den ausgewählten Server.

Aktiviere im Discord Developer Portal die Intents `Server Members Intent` und `Message Content Intent`. Die Bot-Rolle muss oberhalb der Rollen liegen, die sie verwalten soll. Vergib nur notwendige Discord-Berechtigungen.

**Geheimnisse niemals in Chats oder GitHub veröffentlichen.** Tokens und Service-Role-Keys gehören ausschließlich in die Secret-/Environment-Einstellungen des Hosts.

## Hinweis zu kostenlosem Hosting

Ein dauerhaft verbundener Discord-Gateway-Bot benötigt einen Prozess, der durchgehend laufen kann. Kostenlose Web-Hosting-Stufen können solche Prozesse pausieren oder neu starten. Prüfe die aktuellen Bedingungen des Hosts, bevor du dich darauf verlässt.

## Grenzen

- Der Bot kann nur Aktionen ausführen, für die er auf dem jeweiligen Server Rechte besitzt.
- Spam- und Raid-Erkennung melden verdächtige Aktivität; sie bannen oder kicken niemanden automatisch.
- Discord-Bulk-Delete überspringt Nachrichten, die älter als 14 Tage sind.
- Eine dauerhafte Fallakten-Datenbank ist noch nicht integriert.
