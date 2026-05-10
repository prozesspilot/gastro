# M12 — DSGVO-Workflows

> **Status (2026-05-07):** ✅ implementiert. Spec wurde nachgezogen, weil das Modul ursprünglich nicht als eigene Spec geführt wurde.
> **Code:** `backend/src/modules/dsgvo/`
> **Paket:** alle (Basic / Standard / Pro)

---

## 1. Zweck

Erfüllt DSGVO-Pflichten gegenüber Endkunden des Tenants (Lieferanten, deren Daten in Belegen vorkommen) und gegenüber dem Tenant selbst (Auftragsverarbeitungs-Vertrag, Auskunftsrecht, Löschpflicht).

Ist **nicht** ein einzelner Workflow, sondern eine Gruppe verwandter Endpoints + UI-Funktionen.

## 2. Funktionsbereiche

| Bereich                          | Wer ist Subjekt        | Trigger                       |
|----------------------------------|------------------------|-------------------------------|
| Auskunftsersuchen (Art. 15)      | Lieferant in Belegen   | Manual via Webapp / API       |
| Berichtigung (Art. 16)           | Lieferant in Belegen   | Manual via Webapp             |
| Löschung (Art. 17)               | Lieferant / Tenant     | Manual + Cron für Aufbewahrungsfristen |
| Einschränkung (Art. 18)          | Lieferant              | Manual                        |
| Datenübertragbarkeit (Art. 20)   | Tenant                 | API-Endpoint                  |
| Tenant-Offboarding               | Tenant                 | Operator-Workflow             |
| Aufbewahrungsfristen             | alle Belege            | Cron (täglich)                |

## 3. Datenmodell-Bezug

Belege enthalten ggf. Personendaten von Lieferanten (Name, Anschrift, Steuernummer, IBAN). Lösch-/Auskunftsanfragen wirken auf:

- `receipts.extraction.supplier_*` — anonymisieren statt löschen (steuerliche Aufbewahrungspflicht!)
- `suppliers_global` — Eintrag entfernen, wenn keine Belege mehr referenzieren
- `customer_profile_history` — auf Anfrage redigieren
- `audit_log` — niemals löschen (gesetzlich vorgeschrieben für Wirtschaftsprüfung), aber bei Auskunftsersuchen offenlegen

**Wichtig:** Steuerliche Aufbewahrungspflichten (§ 147 AO, 10 Jahre) gehen DSGVO-Löschanspruch vor, solange Frist nicht abgelaufen.

## 4. Endpoints (Backend)

| Methode | Pfad                                              | Zweck                                       |
|---------|---------------------------------------------------|---------------------------------------------|
| POST    | `/api/v1/dsgvo/access-request`                    | Auskunftsersuchen anlegen                   |
| GET     | `/api/v1/dsgvo/access-request/:id`                | Ergebnis abrufen (PDF + JSON-Export)        |
| POST    | `/api/v1/dsgvo/erasure-request`                   | Löschanfrage anlegen                        |
| POST    | `/api/v1/dsgvo/rectification`                     | Korrektur einer Beleg-Position              |
| GET     | `/api/v1/dsgvo/retention-status/:customer_id`     | Welche Belege fallen aus der Aufbewahrungsfrist? |
| POST    | `/api/v1/dsgvo/tenant-offboarding/:customer_id`   | Tenant offboarden (alle Daten exportieren + löschen, soweit erlaubt) |

Alle authentifiziert (HMAC) + audit-pflichtig.

## 5. Cron-Jobs

| Workflow              | Frequenz | Aufgabe                                                    |
|-----------------------|----------|------------------------------------------------------------|
| `WF-CRON-DSGVO-RETENTION` | täglich  | Belege > 10 Jahre alt → markieren, Operator-Review-Liste   |

(Aktuell als Skeleton, noch kein eigener Workflow-File — als Sub-Routine in `WF-CRON-M08`.)

## 6. UI in der Webapp

- Tenant-Settings → "Datenschutz" → Liste eigener DSGVO-Anfragen + Status
- Operator-View → "DSGVO-Queue" → eingehende Anfragen abarbeiten
- Tenant-Offboarding-Wizard (4 Schritte: Datenexport → Bestätigung → Löschung-mit-Aufbewahrungsfrist → AVV-Kündigung)

## 7. Audit-Anforderungen

Jede DSGVO-Aktion erzeugt einen `audit_log`-Eintrag mit:

- `action`: `dsgvo.access_request.created` / `dsgvo.erasure.executed` etc.
- `actor`: User-ID des Operators
- `subject`: customer_id + ggf. supplier_id
- `details`: vollständige Anfrage + Ergebnis-Hash

`audit_log`-Einträge zu DSGVO sind selbst niemals löschbar (Begründung: Nachweis dass DSGVO erfüllt wurde).

## 8. Abhängigkeiten

- `audit_log`-Tabelle (Foundation)
- Mail-Service (Bestätigungs-E-Mails an Anfragesteller)
- PDF-Generator (Auskunftsdokument)
- Storage-Adapter (Export-Archive)

## 9. Bekannte Grenzen

- Lieferanten-Anfragen müssen aktuell vom Operator bearbeitet werden (kein Self-Service-Portal für Lieferanten)
- Multi-Tenant-übergreifende Lieferanten (gleicher Lieferant bei mehreren Kunden) → Lösch-Anfrage betrifft nur einen Tenant, technisch korrekt, aber Operator muss erkennen

## 10. Acceptance Criteria

- [x] Auskunftsersuchen-API liefert PDF + JSON-Export
- [x] Lösch-Anfrage prüft Aufbewahrungsfrist und blockiert ggf.
- [x] Audit-Log enthält jede DSGVO-Aktion
- [x] Tenant-Offboarding läuft 4-stufig
- [x] DSGVO-Anfrage-Antwortzeit ≤ 30 Tage technisch sichergestellt (kein 30-Tage-Stau möglich, weil Cron-Mahnung)
