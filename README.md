# VEXORA Bot

Discord-Bot für VEXORA RP mit Moderation, Fraktionsverwaltung, Funk und Server-Logs.

## Funktionen
- Slash-Befehle: `/vexora-status`, `/vexora-hilfe`, `/warn`, `/kick`, `/ban`, `/clear`
- Personalverwaltung: `/promote`, `/demote`, `/einstellen`, `/feuern`
- Fraktionen: Polizei, Rettungsdienst und Feuerwehr über Discord-Rollen
- Funk: `/funk` sendet in den konfigurierten Funkkanal
- Willkommen und Abschied
- Logs für Beitritte, Austritte, gelöschte/bearbeitete Nachrichten, Bans, Rollen und Kanäle
- Begriffscanner meldet Treffer zur manuellen Prüfung; keine automatische Strafe
- Owner-/Moderator-Zugriff über Rollen-IDs; Banns nur durch Owner
- Rollenrang und Bot-Rollenhierarchie werden geprüft

## Einrichtung
Node.js 20 oder neuer. Nach dem GitHub-Update muss der Bot-Host neu deployen bzw. neu starten. Slash-Befehle werden beim Start registriert.

Environment-Variablen im Host-Dashboard:
`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`,
`OWNER_ROLE_IDS`, `MODERATOR_ROLE_IDS`,
`LOG_CHANNEL_ID`, `WELCOME_CHANNEL_ID`, `GOODBYE_CHANNEL_ID`, `FUNK_CHANNEL_ID`,
`POLICE_ROLE_ID`, `EMS_ROLE_ID`, `FIRE_ROLE_ID`, optional `BLOCKED_TERMS`.

Aktiviere im Discord Developer Portal die Intents `Server Members Intent` und `Message Content Intent`. Die Bot-Rolle muss oberhalb der Rollen liegen, die sie verwalten soll. Vergib nur notwendige Rechte.

**Token niemals in Chats oder GitHub veröffentlichen.** Geheimnisse ausschließlich als Secret/Environment Variable beim Hoster speichern.

## Grenzen
- Der Bot verwaltet nur diesen Discord-Server und nur innerhalb seiner Rechte.
- Discord löscht per Bulk-Delete keine Nachrichten, die älter als 14 Tage sind.
- Ein KI-Modul benötigt zusätzlich einen KI-Anbieter, einen privaten API-Schlüssel und klare Grenzen; es ist noch nicht aktiviert.
- Verwarnungen und Logs werden im Log-Kanal protokolliert; dauerhafte Fallakten-Datenbank ist noch nicht integriert.
