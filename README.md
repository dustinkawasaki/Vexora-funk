# VEXORA Bot

Modularer Discord-Bot für Community- und Rollenspiel-Server.

## Aktueller Stand

- Grundgerüst mit Node.js und discord.js
- Slash-Command `/vexora-status`
- Serverseitige Berechtigungsprüfung anhand echter Discord-Rollen-IDs
- Moderationsscanner für konfigurierbare Begriffe mit manueller Teamprüfung
- Buttons für Verwarnen, Ignorieren, Kick und Bann mit Rollenprüfung
- Anzeigenamen und Nicknames werden ausdrücklich nicht als Berechtigungsnachweis verwendet
- Konfiguration über lokale Umgebungsvariablen

Der Bot ist noch nicht live gestartet oder mit einem Discord-Server getestet. Widerrufe, Fraktionsverwaltung und Anti-Raid sind noch nicht fertig.

## Voraussetzungen

- Node.js 20 oder neuer
- Eine Discord-Anwendung und ein Bot im Discord Developer Portal
- Bot-Einladung mit den nötigen Server- und Slash-Command-Berechtigungen
- Privilegierte Intents `Server Members Intent` und `Message Content Intent`, soweit benötigt

## Einrichtung

1. Repository herunterladen.
2. `npm install` ausführen.
3. `.env.example` nach `.env` kopieren.
4. `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` und `DISCORD_GUILD_ID` eintragen.
5. Die IDs der echten Discord-Rollen in `OWNER_ROLE_IDS` und `MODERATOR_ROLE_IDS` eintragen. Mehrere IDs durch Kommas trennen.
6. Die ID des privaten Team-Kanals in `LOG_CHANNEL_ID` eintragen.
7. Optional zu prüfende Begriffe in `BLOCKED_TERMS` als kommagetrennte Liste eintragen.
8. `npm start` ausführen.
9. Im Discord-Server `/vexora-status` testen.

## Sicherheit

- Niemals den Bot-Token oder die echte `.env`-Datei veröffentlichen.
- Keine Administrator-Berechtigung vergeben, wenn einzelne benötigte Rechte ausreichen.
- Rollen-IDs müssen aus dem eigenen Discord-Server stammen.
- Die Bot-Rolle muss in der Discord-Rollenhierarchie oberhalb der Rollen stehen, die der Bot verwalten soll.
- Moderationsmeldungen sind nur für den privaten Team-Kanal gedacht; richte dessen Sichtbarkeit passend ein.
