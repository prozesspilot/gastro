# 00 — Naming-Konvention: Gastro vs. ProzessPilot

> **Status:** Verbindlich seit 2026-05-15
> **Zielgruppe:** Alle (Steve, Andreas, Claude Code, Anwalt, Vertriebsagentur)

---

## Die Regel in einem Satz

**Code/System/Tech = Gastro · Firma/Brand/Außen = ProzessPilot**

---

## Wann welcher Name?

### Gastro verwenden in:

| Bereich | Beispiel |
|---|---|
| GitHub-Repo-Name | `<org>/gastro` |
| Code-interne Bezeichnungen | `GastroBackend`, `gastroService` |
| ENV-Variablen | `GASTRO_DATABASE_URL`, `GASTRO_REDIS_URL` |
| Datenbank-Namen | `gastro_dev`, `gastro_test`, `gastro_prod` |
| npm-Package-Namen | `@gastro/backend`, `@gastro/webapp`, `@gastro/discord-bot` |
| Discord-Server-Name (intern) | "Gastro Team" |
| Discord-Channel-Bezeichnungen | "#gastro-dev-log" möglich, aber unkritisch |
| Tech-Doku (Modulkonzept, Architektur) | "Das Gastro-Backend..." |
| Code-Kommentare + JSDoc | "Gastro receipt processing logic" |
| README.md, CONTRIBUTING.md, STRUCTURE.md | Code-Name "Gastro" |
| Sub-Agent Namen + Slash-Commands | unverändert (sind tech-intern) |
| Test-Beschreibungen | "Gastro should reject invalid tenant_id" |
| Logs (interne) | `[gastro][m01] Receipt processed` |

### ProzessPilot verwenden in:

| Bereich | Beispiel |
|---|---|
| Firmenname auf Rechnungen | "ProzessPilot, Inhaber Steve Bernhardt" |
| AGB-Vertragspartner | "Die Firma ProzessPilot..." |
| Vertriebsagentur-Vertrag | "ProzessPilot" als Auftraggeber |
| Marketing-Domain | `prozesspilot.net` |
| Customer-Subdomains | `admin.prozesspilot.net`, `setup.prozesspilot.net`, `chat.prozesspilot.net` |
| E-Mails an Customer | `support@prozesspilot.net`, `datenschutz@prozesspilot.net` |
| Marketing-Website-Texte | "ProzessPilot senkt Ihre..." |
| Sales-Pitch-Deck | "ProzessPilot" als Produkt-Name |
| WhatsApp-Bot-Texte an Wirt | "Hier deine ProzessPilot-Bilanz..." |
| Web-Chat-Widget-Header | "ProzessPilot Chat" |
| Onboarding-Wizard-Header | "Willkommen bei ProzessPilot" |
| Anwalts-Dokumente | "ProzessPilot" als Vertragspartner |
| Subunternehmer-Auflistung | "Verarbeitet im Auftrag der ProzessPilot..." |
| Logos + Brand-Assets | ProzessPilot-Logo |

### Beide Namen nebeneinander (Tech-Doku mit Außen-Bezug):

| Beispiel-Satz | Begründung |
|---|---|
| "Das Gastro-Backend (vermarktet als ProzessPilot) läuft auf IONOS." | Tech-Beschreibung mit Brand-Referenz |
| "Der ProzessPilot-Customer-Chat-Widget rendert HTML aus dem Gastro-Frontend." | Customer-Touchpoint hat Brand-Header, Code-Basis ist Gastro |
| "Die Vertriebsagentur vermittelt ProzessPilot-Kunden, die im Gastro-System angelegt werden." | Außen vs. Code-System |

---

## Beispiele was falsch wäre

| Falsch | Richtig | Warum |
|---|---|---|
| `prozesspilot.io` als Code-Domain | `gastro.io` (falls je nötig) oder Subpfad in `prozesspilot.net` | Domain ist Brand |
| "Gastro-AGB" in Konzept-Doku | "ProzessPilot-AGB" | AGB ist Außen-Kommunikation |
| ENV-Var `PROZESSPILOT_DATABASE_URL` | `GASTRO_DATABASE_URL` | ENV ist intern |
| Wirt-Mail "Vielen Dank fürs Gastro-Setup" | "Vielen Dank fürs ProzessPilot-Setup" | Wirt kennt nur Brand |
| GitHub-Issue "ProzessPilot-Backend repariert" | "Gastro-Backend repariert" | Issue ist intern |
| Discord-Channel "ProzessPilot-Production" | "Gastro-Production" oder neutral "#deployment" | Discord ist intern |

---

## Warum diese Trennung?

1. **Klare Identität in Sales:** Endkunden hören nur einen Namen — "ProzessPilot". Kein Verwirrung mit Code-Namen.
2. **Kurzer interner Name:** "Gastro" ist 4 Buchstaben statt 12, passt in Variablen, ENV-Names, DB-Namen, Verzeichnis-Pfade.
3. **Brand-Schutz:** ProzessPilot als Marke ist schon eingeführt, GitHub-Searches nach "ProzessPilot" finden öffentlich nichts Internes.
4. **Spätere Skalierung:** Falls je ein zweites Produkt entsteht (z.B. "Friseur", "Werkstatt"), bleibt ProzessPilot die Dach-Brand, jedes Produkt hat eigenen Code-Namen.

---

## Sonderfälle

### Bestehende Code-Pfade (Migration)

Manche existierende Code-Pfade enthalten "prozesspilot" — z.B. der lokale Ordner-Name `~/Documents/ProzessPilot/prozesspilot/`. Diese müssen **nicht** zwangsweise umbenannt werden. Wichtig ist:

- **GitHub-Repo-Name:** `gastro` (neu)
- **Neue Files / Code:** "gastro" verwenden
- **Bestehende Pfade in Doku/Anleitung:** ok zu belassen oder gleichzeitig "prozesspilot" und "gastro" erlauben

### Im _archive/

Files im `_archive/`-Ordner werden **nicht** umbenannt. Sie sind historische Referenz aus der Pre-Reboot-Phase.

### Bei Anwalts-Dokumenten

Die `legal/`-Vorlagen verwenden "ProzessPilot" (Firma + Brand), das ist korrekt. Sie müssen **nicht** angefasst werden.

---

## Wenn du unsicher bist

Daumenregel:

- **Sieht der Endkunde das?** → ProzessPilot
- **Liest das nur ein Entwickler / läuft es im Code?** → Gastro
- **Geht es um den Vertrag, die Firma, eine Marke?** → ProzessPilot
- **Geht es um die Datenbank, ein Modul, einen Service?** → Gastro

---

**Stand:** 2026-05-15
**Verantwortlich:** Steve (Brand-Entscheidung) + Andreas (Code-Konsistenz)
