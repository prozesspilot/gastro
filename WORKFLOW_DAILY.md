# Workflow-Anleitung für Steve & Andreas

> **Stand:** 2026-05-18
> **Für wen:** Steve und Andreas (Coding-Anfänger)
> **Zweck:** Damit wir nicht abdriften, uns nicht in die Quere kommen, und beide immer den gleichen Stand haben.
>
> **Goldene Regel:** Wenn du unsicher bist — lies hier nach, dann fragst du im Discord-Channel `#dev-coordination`. Nicht raten, nicht ignorieren.

---

## Die 3 Hauptregeln (auswendig lernen)

### Regel 1 — GitHub ist die Wahrheit
Alles was im Repo `prozesspilot/gastro` auf GitHub im **main**-Branch liegt, ist die offizielle Wahrheit. Konzepte, Code, Tasks — alles.

**Was nicht im Repo ist, existiert für den anderen nicht.** Wenn Steve etwas in seinem `/Documents/ProzessPilot/`-Hauptordner liegen hat (z.B. Andreas-Briefing-Files), sieht Andreas das nicht.

### Regel 2 — Niemals direkt auf main arbeiten
Wir machen unsere Arbeit immer auf einem **eigenen Branch**, dann **Pull Request**, dann **der andere review't und merged**.

GitHub blockiert direkte Pushes auf main eh — falls du eine Fehlermeldung bekommst die das sagt, ist das Absicht.

### Regel 3 — Vor jedem Coden: pullen. Nach jedem Coden: pushen.
Wenn du nicht pulled, arbeitest du auf altem Stand. Wenn du nicht pushst, weiß der andere nicht was du gemacht hast.

**Niemals nicht-committeten Code über Nacht auf dem Mac liegen lassen.**

---

## Tagesstart-Routine (3 Minuten)

Bevor du irgendwas Coding-Mäßiges machst:

```bash
# 1. In den Repo-Ordner wechseln
cd ~/Documents/ProzessPilot/prozesspilot

# 2. Auf den main-Branch wechseln
git checkout main

# 3. Neueste Änderungen vom Server holen
git pull origin main

# 4. Alte Remote-Branches lokal aufräumen
git fetch --prune
```

Danach: **Discord-Channel `#dev-coordination` öffnen und die letzten 24h durchlesen.** Das ist unser „Morgenmeeting ohne Meeting".

Du siehst jetzt:
- Was der andere gestern gemacht hat
- An welchem Branch er arbeitet
- Ob ein PR auf Review wartet

---

## Eine neue Task anfangen (Schritt für Schritt)

### Schritt 1 — Task aus dem Backlog wählen
Schau in den Ordner `tasks/_backlog/`. Dort liegen Tasks wie `T010-mitarbeiter-webapp-skeleton.md`.

Eine Task ist „frei" wenn:
- Sie noch im `_backlog/` liegt (nicht in `_in_progress/`)
- Niemand sie im Discord blockiert hat

### Schritt 2 — Task „locken" (markieren dass du dran bist)

```bash
# Beispiel: Andreas nimmt T012-caddy-setup
git checkout main
git pull
git checkout -b andreas/T012-caddy-setup

# Task-Datei verschieben
git mv tasks/_backlog/T012-caddy-setup.md tasks/_in_progress/T012-andreas-caddy-setup.md
```

Der Dateiname im `_in_progress/` enthält jetzt deinen Namen — der andere weiß: **Finger weg, Andreas hat das**.

### Schritt 3 — Im Discord ansagen

Kurzer Post in `#dev-coordination`:
> 🟢 Starte gerade T012 (Caddy-Setup auf IONOS) — Branch: `andreas/T012-caddy-setup` — geschätzt 2h

### Schritt 4 — Arbeiten

Während du arbeitest:
- **Kleine Commits** sind besser als ein Riesen-Commit am Ende
- Commit-Message-Format: `feat: kurze beschreibung was gemacht wurde`
- Bei Zwischenstand: `wip:`-Prefix (= work in progress, noch nicht fertig)

```bash
# Beispiel
git add -A
git commit -m "feat: caddyfile mit auto-tls für admin.prozesspilot.net"
git push -u origin andreas/T012-caddy-setup
```

Beim **ersten Push** brauchst du `-u origin <branchname>`. Bei jedem weiteren Push reicht `git push`.

---

## Eine Task fertig machen (Schritt für Schritt)

### Schritt 1 — Alle Akzeptanz-Kriterien erfüllt?
Schau in deine Task-Datei in `tasks/_in_progress/T012-andreas-caddy-setup.md` — sind alle Checkboxen abgehakt?

Falls nein: zurück zu „Arbeiten".

### Schritt 2 — Letzter Commit + Push

```bash
git add -A
git commit -m "feat: T012 caddy setup komplett — health-check antwortet 200"
git push
```

### Schritt 3 — Pull Request aufmachen

Im Browser auf https://github.com/prozesspilot/gastro/pulls → grüner Button **„New pull request"** → deinen Branch wählen → Titel und Beschreibung eintragen.

**Oder per Terminal mit `gh` (schneller):**

```bash
gh pr create \
  --title "T012: Caddy-Setup auf IONOS" \
  --body "Health-Check antwortet 200. TLS-Zertifikate auto-renewed. Siehe tasks/_in_progress/T012-andreas-caddy-setup.md"
```

### Schritt 4 — Im Discord ansagen

Post in `#dev-coordination`:
> 🟡 PR #17 ist offen — bitte reviewen: T012 Caddy-Setup
> https://github.com/prozesspilot/gastro/pull/17

### Schritt 5 — Auf Review warten

**Der andere** review't deinen PR (nicht du selbst!). Er klickt:
- „Files changed" → Code durchschauen
- Wenn OK: „Review changes" → „Approve" → „Submit review"
- Wenn Probleme: „Request changes" → Kommentare hinterlassen → du fixt → push → er review't erneut

### Schritt 6 — Merge (durch den Reviewer)

Wenn approved, der **Reviewer** (nicht du) klickt:
- „Merge pull request" → „Confirm merge" → „Delete branch"

### Schritt 7 — Lokal aufräumen (du, der die Task gemacht hat)

```bash
git checkout main
git pull
git branch -d andreas/T012-caddy-setup
```

### Schritt 8 — Task-Datei nach `_done/` verschieben

Das macht der **Reviewer mit beim Merge** oder du im nächsten kleinen Cleanup-Commit:

```bash
git mv tasks/_in_progress/T012-andreas-caddy-setup.md tasks/_done/T012-andreas-caddy-setup.md
git commit -m "chore: T012 nach _done verschoben"
git push origin main  # OK weil pure Datei-Verschiebung
```

---

## Tagesende-Routine (5 Minuten)

Bevor du Mac zuklappst:

### a) Stand committen — auch wenn nicht fertig

```bash
git add -A
git commit -m "wip: T012 caddy — tls läuft, fehlt noch grafana-route"
git push
```

Der `wip:`-Prefix signalisiert: nicht reviewen, work in progress. Aber: **Code muss auf GitHub liegen**, nicht nur auf deinem Mac.

### b) Discord-Post in `#dev-coordination` (3 Zeilen)

Format:
```
✅ Heute: Caddy installiert, healthcheck-route gebaut
🔄 Branch: andreas/T012-caddy-setup — work in progress
⏭️ Morgen: TLS auto-renew testen + grafana-subroute
```

So weiß der andere beim nächsten Login direkt was Sache ist.

---

## Quere-kommen vermeiden — die Konflikt-Regeln

### Wenn du eine Datei ändern willst, die der andere auch ändert
**Vorher** im Discord pingen:
> „@steve nehm die nächsten 2h `M12_DSGVO.md` zur Bearbeitung — OK?"

Erst wenn er bestätigt, anfangen.

### Wenn du einen Merge-Konflikt bekommst
Das ist nicht schlimm. Das passiert wenn beide an derselben Datei gearbeitet haben.

```bash
# Wenn beim Pull ein Konflikt kommt:
git pull
# → "CONFLICT (content): Merge conflict in datei.md"

# Datei öffnen, die Konflikt-Markierungen findest du so:
# <<<<<<< HEAD
# (dein Code)
# =======
# (Code vom anderen)
# >>>>>>> origin/main

# Du entscheidest welche Version bleibt (oder kombinierst beide).
# Konflikt-Markierungen <<<<<<< ======= >>>>>>> alle rauslöschen.

# Dann:
git add datei.md
git commit -m "fix: merge-konflikt in datei.md gelöst"
git push
```

Wenn unsicher: **Sofort im Discord pingen, zu zweit lösen.** Niemals raten.

### Wenn du was kaputt machst (kommt vor, ist OK)
Solange dein Code auf einem **eigenen Branch** liegt und nicht auf main: kein Problem. Branch löschen, neuer Branch, von vorn.

```bash
git checkout main
git branch -D dein-kaputter-branch
git checkout -b deine-zweite-chance
```

---

## Aufgaben-Verteilung (wer macht was)

| Bereich | Verantwortlich | Warum |
|---|---|---|
| Backend (M01–M15, Services, Datenbank) | Andreas | Tech-Tiefe, Konsistenz |
| Infrastructure (Docker, CI/CD, IONOS) | Andreas | Ops-Kompetenz |
| n8n-Workflows | Andreas | eng mit Backend |
| Mitarbeiter-Webapp Frontend | Steve | Sichtbar, du nutzt es täglich |
| Onboarding-Wizard Frontend | Steve | Customer-facing |
| Web-Chat-Widget Frontend | Steve | Customer-UX |
| Discord-Bot | Steve | Du bist Discord-Admin |
| Legal-Texte (AGB, AVV, Datenschutz) | Steve | Vertragliche Verantwortung |
| Sales-Material (Pitch-Deck, Rechner) | Steve | Vertriebs-Know-How |

**Cross-Review-Pflicht:** Andreas review't Steve's PRs, Steve review't Andreas's PRs. Niemals Self-Merge.

---

## Was wir NIEMALS machen

❌ **Direkt auf main pushen** — Branch-Protection blockt das, falls du es versuchst hast du was falsch gemacht
❌ **Eigenen PR selbst mergen** — immer der andere
❌ **Secrets (Passwörter, API-Keys, Tokens) in Git committen** — niemals, nicht mal kurz. Wenn passiert: sofort im Discord melden, Token revoken, neuen erstellen
❌ **`git push --force`** ohne vorher den anderen zu fragen — kann Arbeit überschreiben
❌ **Tippen auf dem Server (IONOS) direkt** ohne dass es im Repo ist — alles geht über Git, sonst geht es bei nächstem Deploy verloren
❌ **Über Nacht nicht-committet liegen lassen** — siehe Tagesende-Routine
❌ **Diskutieren wir machen das jetzt anders, ohne den anderen zu fragen** — Workflow-Änderungen brauchen Abstimmung

---

## Quick-Reference (Befehle zum Copy-Paste)

```bash
# Tagesstart
cd ~/Documents/ProzessPilot/prozesspilot
git checkout main && git pull && git fetch --prune

# Neue Task starten (Beispiel)
git checkout -b dein-name/T0XX-kurzbeschreibung
git mv tasks/_backlog/T0XX-*.md tasks/_in_progress/T0XX-dein-name-*.md

# Arbeiten + speichern
git add -A
git commit -m "feat: beschreibung"
git push

# Erster Push eines neuen Branches
git push -u origin dein-name/T0XX-kurzbeschreibung

# Pull Request aufmachen
gh pr create --title "TXXX: kurz" --body "beschreibung"

# Tagesende
git add -A
git commit -m "wip: stand am end des tages"
git push

# Nach Merge: aufräumen
git checkout main && git pull
git branch -d dein-name/T0XX-...
```

---

## Wenn was unklar ist — Eskalations-Reihenfolge

1. **Diese Anleitung lesen** — wahrscheinlich steht's hier
2. **Discord `#dev-coordination` fragen** — der andere hilft
3. **Claude Code fragen** — `claude` im Terminal starten und beschreiben was du tun willst
4. **Stopp und gemeinsam klären** — wenn beide unsicher sind, lieber ein 15-Min-Call als 2h falsch arbeiten

---

## Fragen zu dieser Anleitung

Wenn diese Anleitung etwas nicht abdeckt oder unklar ist:
- Ergänzung als PR vorschlagen (Bonus-Punkte!)
- Oder im Discord `#dev-coordination` fragen, dann gemeinsam updaten

**Diese Anleitung ist ein lebendes Dokument.** Wenn ihr merkt etwas funktioniert nicht in der Praxis → updaten.

---

**Letztes Update:** 2026-05-18 nach Foundation-Setup (GitHub, Discord, IONOS, DNS, Secrets, IONOS-Rebrand). Nächste Etappe: Caddy + erster echter Deploy + erste Module.
