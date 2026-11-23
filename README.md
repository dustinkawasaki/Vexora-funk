# VEXORA Discord Bot

Modularer Discord-Bot für die VEXORA-Community und den Funk-Rollenspielserver.

## Aktueller Stand

- Grundgerüst mit Node.js und discord.js
- Slash-Command `/vexora-status`
- Serverseitige Berechtigungsprüfung anhand echter Discord-Rollen-IDs
- Anzeigenamen und Nicknames werden ausdrücklich nicht als Berechtigungsnachweis verwendet
- Konfiguration über lokale Umgebungsvariablen

Kick/Bann, Widerrufe, Fraktionsverwaltung, Moderationsmeldungen und Anti-Raid sind noch nicht implementiert.

## Voraussetzungen

- Node.js 20 oder neuer
- Eine Discord-Anwendung und ein Bot im Discord Developer Portal
- Bot-Einladung mit den nötigen Server- und Slash-Command-Berechtigungen

## Einrichtung

1. Repository herunterladen.
2. `npm install` ausführen.
3. `.env.example` nach `.env` kopieren.
4. `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` und `DISCORD_GUILD_ID` eintragen.
5. Die IDs der echten Discord-Rollen in `OWNER_ROLE_IDS` und `MODERATOR_ROLE_IDS` eintragen. Mehrere IDs durch Kommas trennen.
6. `npm start` ausführen.
7. Im Discord-Server `/vexora-status` testen.

## Sicherheit

- Niemals den Bot-Token oder die echte `.env`-Datei veröffentlichen.
- Keine Administrator-Berechtigung vergeben, wenn einzelne benötigte Rechte ausreichen.
- Rollen-IDs müssen aus dem eigenen Discord-Server stammen.
- Die Bot-Rolle muss in der Discord-Rollenhierarchie oberhalb der Rollen stehen, die der Bot verwalten soll.
- Moderationsaktionen werden erst ergänzt, wenn die Berechtigungen und Audit-Protokolle vollständig abgesichert sind.
