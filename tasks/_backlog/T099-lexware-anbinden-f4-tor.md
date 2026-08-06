# T099 — Lexware Office anbinden + volles F4-Tor schließen (Schritt 4 von 4)

**ID:** T099
**Verantwortlich:** Steve (Kontakt zur Steuerberaterin) — Andreas bei Mapping/ENV
**Priorität:** **P1** — schließt die Kette, hängt aber an einer externen Person
**Branch:** `server/T099-lexware-f4-tor`
**Geschätzt:** 1 Tag verteilte Arbeit + externe Wartezeit
**Dependencies:** **T096**, **T097**, **T098** müssen erledigt sein
**Ziel-Meilenstein:** **F4-Tor geschlossen**
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Die letzte Stufe anschließen: den fertig kategorisierten Beleg an **Lexware Office**
der Pilot-Steuerberaterin übergeben — und danach `qa-smoke.sh` **ohne**
`PP_SMOKE_SKIP_EXPORT` mit **Exit-Code 0** durchlaufen lassen.

Damit ist die vollständige Kette bewiesen:
```
Upload → OCR → Kategorisieren → Lexware Office
```

Schritt **4 von 4**: T096 → T097 → T098 → **T099 (diese)**.

---

## ⚠️ Diese Task hat externe Wartezeit — früh anstoßen

Der API-Token kommt von der **Steuerberaterin des Pilot-Wirts**. Das ist kein
Konto, das ihr euch selbst anlegen könnt. Terminabsprache, Erklärung, ggf.
Datenschutz-Rückfragen — **Lead-Zeit einplanen.**

Deshalb steht T098 bewusst **vor** dieser Task: Die Kernkette ist unabhängig davon
beweisbar. Trotzdem gilt: **Kontakt aufnehmen, sobald T096 läuft** — nicht erst,
wenn T098 grün ist. Die Wartezeit läuft dann parallel.

---

## Schritte

### 1. Kontenrahmen klären — **zuerst**, alles andere hängt daran (T052)
Frage an die Steuerberaterin: **SKR03 oder SKR04?**

Das ist keine Formalie. Die Kategorisierung ordnet jedem Beleg ein SKR-Konto zu;
bei falschem Kontenrahmen sind **alle** Zuordnungen falsch — plausibel aussehend,
aber unbrauchbar. Nicht raten (§7.4). Ergebnis in der Tenant-Config hinterlegen,
**nicht** hardcoden (§3.6: keine `if tenant == pilot`-Hardcodes).

### 2. API-Token besorgen (T009)
Lexware-Office-API-Token der Steuerberaterin einholen und über den vorgesehenen
Weg hinterlegen (`booking_credentials`, verschlüsselt via `pgcrypto` — §6.6).

Hilfsmittel im Repo: `backend/scripts/bootstrap-lexware-token.ts`.

### 3. Kategorie-Mapping gegen den echten Account verifizieren (T054)
Migration 120 hat `lexoffice_category_map` eingeführt (SKR-Konto → Lexware-`categoryId`-UUID,
inkl. Heuristik). Die UUIDs sind **account-spezifisch** — das Mapping muss gegen den
echten Account der Steuerberaterin geprüft werden, nicht gegen Annahmen.

### 4. Steuerberater-Mail hinterlegen (T089)
Pro Pilot-Mandant die Empfänger-Adresse für die Monats-Übergabe eintragen.

### 5. Vollen Smoke-Test fahren
```bash
BASE_URL=https://api.prozesspilot.net \
PP_SMOKE_TENANT_ID=<echte-tenant-uuid> \
PP_SMOKE_EMAIL=steve@prozesspilot.net \
PP_SMOKE_PASSWORD='<gf-passwort>' \
PP_SMOKE_TOTP_SECRET='<base32-secret>' \
./scripts/qa-smoke.sh
```
(**ohne** `PP_SMOKE_SKIP_EXPORT` — das ist der Unterschied zu T098)

---

## Akzeptanz-Kriterien

- [ ] Kontenrahmen (SKR03/SKR04) **schriftlich** von der Steuerberaterin bestätigt
- [ ] Kontenrahmen in der **Tenant-Config** hinterlegt — kein Hardcode
- [ ] Lexware-API-Token in `booking_credentials`, verschlüsselt, **nicht** im Repo/Log
- [ ] `lexoffice_category_map` gegen den echten Account verifiziert (Stichprobe: mind. 5 Kategorien)
- [ ] Steuerberater-Mail pro Pilot-Mandant hinterlegt
- [ ] `POST /api/v1/exports/lexware/batch` → Erfolg, Eintrag in `export_log`
- [ ] **Der Beleg ist in Lexware Office sichtbar** — von der Steuerberaterin oder im Lexware-UI bestätigt (nicht nur „API sagte 200")
- [ ] Kategorie **und** SKR-Konto in Lexware sind fachlich korrekt (menschliche Prüfung)
- [ ] **`qa-smoke.sh` ohne `PP_SMOKE_SKIP_EXPORT` → Exit-Code 0**
- [ ] `MANUELLE_AUFGABEN.md`: T009, T052, T054, T089 und T050 abgehakt
- [ ] `.claude/CLAUDE.md` §3 aktualisiert — **F4-Tor geschlossen**, mit Datum

---

## Spec-Referenzen

- `Modulkonzept/Konzeptentwicklung/modules/M05_Lexoffice_Integration.md` — Export-Vertrag
- `scripts/qa-smoke.README.md` — Export-Stufe des F4-Tors
- `.claude/CLAUDE.md` §3.3 — T052/T054-Historie (SKR-Divergenz, Kategorie-Mapping)
- `.claude/CLAUDE.md` §5.6 / §6.6 — Idempotenz, Secrets verschlüsselt
- `tasks/MANUELLE_AUFGABEN.md` — Einträge T009, T052, T054, T089, T050

---

## Notes

**Ein grüner Exit-Code ist nicht das eigentliche Ziel.**
Das Ziel ist, dass die **Steuerberaterin** den Beleg in ihrem Lexware Office sieht und
sagt: „Ja, so kann ich damit arbeiten." Ein API-`200` beweist, dass Daten ankamen —
nicht, dass sie brauchbar sind. Deshalb steht die fachliche Prüfung ausdrücklich in
den Kriterien.

**Danach ist der Pilot-Pfad bewiesen — nicht das Produkt fertig.**
Offen bleiben Phase D und E der Roadmap: E-Mail-Eingang (M11), WhatsApp (M10),
Lieferanten-Kommunikation (M09), Archiv (M02), DATEV (M04), sevDesk (M06),
Steuerberater-Portal (M13). Und rechtlich: **AGB und Datenschutzerklärung** sind
noch nicht geschrieben — die braucht es, bevor ein echter Wirt echte Belege schickt.

---

## Offene Fragen (während der Bearbeitung)

<hier dokumentieren, was die Steuerberaterin an Rückfragen aufwirft>

---

## Lessons Learned (nach Abschluss)

<nach Abschluss ausfüllen>
