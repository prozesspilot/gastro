---
description: Schließt die aktuelle Task ab. Führt Tests, Lint, Type-Check aus, schreibt PR-Description, pusht Branch, eröffnet Pull-Request via GitHub-MCP und sendet Discord-Notification.
---

# /finish-task

Schließe die aktuelle Task ab. Voraussetzung: aktueller Branch ist `<owner>/T<ID>-...`.

## Schritt 1: Status-Check

```bash
git status
git branch --show-current
```

Prüfe:
- Sind alle Akzeptanz-Kriterien aus der Task-Datei erfüllt? (in Datei abgehakt)
- Sind alle Änderungen committed?

Falls nicht erfüllt: Stoppen mit Liste der offenen Punkte.

## Schritt 2: Lokale Quality-Gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Bei Fehler: STOPPEN, Fehler-Liste anzeigen, fragen ob automatisch gefixt werden soll.

## Schritt 3: Coverage prüfen

```bash
npm run test:coverage
```

Bei Coverage < 80% für geänderte Dateien: warnen + fragen ob Tests ergänzt werden sollen.

## Schritt 3.5: MANUELLE_AUFGABEN.md aktualisieren

**Vor dem Push und PR — prüfen ob die Task neue manuelle Aufgaben für Steve oder Andreas generiert hat.**

Typische Quellen für manuelle Aufgaben:
- Neue ENV-Variablen (z.B. `SUMUP_CLIENT_ID`) → muss in `.env` + GitHub-Secrets + IONOS gesetzt werden
- Externe Account-Setups (Discord-App, SumUp-App, Stripe, IONOS-Server)
- Production-Migrations die manuell laufen müssen
- DNS-Records, TLS-Zertifikate, Firewall-Regeln
- Vertrags-/Legal-Themen (AGB, AVV, SCCs)
- Bootstrap-Scripts die manuell ausgeführt werden müssen
- Pilot-Wirt-Setup-Schritte

Vorgehen:
1. Lies `tasks/MANUELLE_AUFGABEN.md`
2. Vergleiche mit den neu eingeführten Anforderungen aus dem aktuellen Branch
3. Wenn neue Aufgaben anfallen: in die passende Sektion einsortieren (Steve / Andreas / Beide)
4. Format pro Aufgabe:
   ```
   ### ⏳ <Kurzer Titel> (Tx Quelle)
   - **Priorität:** P0/P1/P2
   - **Was:** <einzeilige Beschreibung>
   - **Schritte:** nummerierte Liste
   - **Output:** welche ENV-Vars/Daten dabei rauskommen (falls relevant)
   - **Dependencies:** falls vorhanden
   ```
5. Falls KEINE neuen manuellen Aufgaben: diesen Schritt überspringen, ohne zu committen
6. Falls JA: zusätzlichen Commit auf demselben Branch:
   ```bash
   git add tasks/MANUELLE_AUFGABEN.md
   git commit -m "docs: T<ID> — manuelle Aufgaben für <Owner> ergänzt

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

**Wichtig:** Nur Aufgaben aufnehmen die WIRKLICH außerhalb des Codes erledigt werden müssen. Keine Code-TODOs (die gehören in Backlog-Tasks).

## Schritt 4: Branch pushen

```bash
git push -u origin <branch-name>
```

## Schritt 5: PR-Description generieren

Aus der Task-Datei generieren:

```markdown
## Task

T<ID> - <Titel>

## Was wurde implementiert

<Zusammenfassung in 3-5 Sätzen>

## Akzeptanz-Kriterien

<Checkliste aus Task, alle abgehakt>

## Tests

- Unit-Tests: <Anzahl> Tests, Coverage <X>%
- Integration-Tests: <Anzahl>
- E2E-Tests: <Anzahl falls vorhanden>

## Geänderte Dateien

<Liste, gruppiert nach Bereich>

## Spec-Referenzen

<aus Task-Datei kopiert>

## Manuelle Aufgaben

<Falls in Schritt 3.5 welche ergänzt wurden: hier verlinken — z.B. "→ siehe `tasks/MANUELLE_AUFGABEN.md` Sektion 'Steve': N neue Aufgaben">
<Falls keine: "Keine manuellen Schritte für diese Task.">

## Review-Bitte

@<anderer-Mensch> bitte mit `/review-pr <number>` reviewen.
```

## Schritt 6: PR via GitHub-MCP eröffnen

Nutze GitHub-MCP um PR zu eröffnen:
- Base: `main`
- Head: aktueller Branch
- Title: `T<ID>: <Titel>`
- Body: PR-Description aus Schritt 5
- Reviewers: der jeweils andere (Steve oder Andreas)

## Schritt 7: Discord-Notification

```bash
curl -X POST $DISCORD_DEV_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🔵 **<Owner>** hat **PR #<Nummer>** eröffnet: <Titel>\n<URL>\n@<Reviewer> bitte reviewen mit `/review-pr <Nummer>`"
  }'
```

## Schritt 8: Status-Übersicht

Sag dem User:
- ✅ PR eröffnet: <URL>
- ✅ CI-Pipeline läuft (Discord-Notification bei Ergebnis)
- 🔄 Warte auf Review von <Reviewer>

Task-Datei bleibt vorerst in `_in_progress/`. Erst nach Merge wird sie nach `_done/` verschoben (passiert via merge-Webhook).
