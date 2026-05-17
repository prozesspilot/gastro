# Ergänzung zur Datenschutzerklärung Marketing-Website

> **Stand:** 2026-05-15
> **Bezug:** Diese Ergänzung erweitert den vom Anwalt am 28.10.2025 gelieferten Entwurf "Process Pilot Datenschutzerklärung Website Entwurf v 28.10.2025.odt".
> **Zweck:** Die fehlenden Punkte ergänzen, Platzhalter ausfüllen, neue Themen aufnehmen.

---

## 1. Was im Anwalts-Entwurf vom 28.10.2025 brauchbar ist

✅ **Standard-Aufbau gemäß Art. 13 DSGVO** — Struktur ist passend
✅ **Webseiten-Logging-Klausel** — solid formuliert
✅ **Betroffenen-Rechte** — vollständig (Auskunft, Widerspruch, Berichtigung, Löschung, Einschränkung, Beschwerde, Datenübertragbarkeit)
✅ **Aufsichtsbehörde Niedersachsen** — passt zum Sitz Schneverdingen

---

## 2. Was unausgefüllt ist (Platzhalter)

Folgende Platzhalter im Entwurf müssen ausgefüllt werden:

### 2.1 Verantwortlicher

```
ALT: [Name, Postadresse, E-Mail-Adresse des Verantwortlichen]

NEU: [Firmenname ProzessPilot]
     [Adresse Schneverdingen]
     E-Mail: datenschutz@prozesspilot.net
     Vertreten durch: Steve Bernhardt
```

### 2.2 Datenschutzbeauftragter

```
ALT: [E-Mail-Adresse des Datenschutzbeauftragten]
     [ggf. auch die Postadresse des Datenschutzbeauftragten]

NEU: Aktuell ist die Bestellung eines Datenschutzbeauftragten gesetzlich
     nicht erforderlich (weniger als 20 Mitarbeiter, keine umfangreiche
     Verarbeitung sensibler Daten). Anfragen zum Datenschutz richten Sie
     bitte an: datenschutz@prozesspilot.net
```

### 2.3 Hoster

```
ALT: [Name, Postadresse, E-Mail-Adresse des Hosters]

NEU: Hetzner Online GmbH
     Industriestraße 25, 91710 Gunzenhausen, Deutschland
     E-Mail: info@hetzner.com
     Datenschutzerklärung: https://www.hetzner.com/de/rechtliches/datenschutz
```

---

## 3. Was im Anwalts-Entwurf komplett fehlt

Folgende Themen müssen ergänzt werden:

### 3.1 Cookies

Auch wenn die Marketing-Website nur essentielle Cookies setzt, ist eine entsprechende Klausel Pflicht:

**Vorgeschlagene Klausel:**

```
3. Cookies

Diese Website verwendet ausschließlich technisch erforderliche Cookies, die
für den Betrieb der Website notwendig sind. Es werden keine Tracking-,
Analyse- oder Marketing-Cookies eingesetzt.

Folgende Cookies werden verwendet:
- pp_session: Session-Cookie für Formular-Interaktionen, Lebensdauer: Sitzung
- pp_csrf: CSRF-Schutz, Lebensdauer: Sitzung

Da nur essentielle Cookies eingesetzt werden, ist kein Cookie-Banner mit
Einwilligung erforderlich. Sie können Cookies in Ihren Browser-Einstellungen
deaktivieren; dies kann jedoch die Funktionalität der Website einschränken.

Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) sowie
§ 25 Abs. 2 Nr. 2 TTDSG.
```

### 3.2 SSL-Verschlüsselung

```
4. SSL-Verschlüsselung

Diese Website nutzt aus Sicherheitsgründen und zum Schutz der Übertragung
vertraulicher Inhalte eine SSL-Verschlüsselung (TLS 1.3). Eine verschlüsselte
Verbindung erkennen Sie daran, dass die Adresszeile des Browsers von "http://"
auf "https://" wechselt und an dem Schloss-Symbol in Ihrer Browserzeile.

Wenn die SSL-Verschlüsselung aktiviert ist, können die Daten, die Sie an uns
übermitteln, nicht von Dritten mitgelesen werden.
```

### 3.3 Kontaktformular (falls vorhanden)

```
5. Kontaktformular

Wenn Sie uns per Kontaktformular Anfragen zukommen lassen, werden Ihre
Angaben aus dem Formular inkl. der von Ihnen dort angegebenen Kontaktdaten
zwecks Bearbeitung der Anfrage und für den Fall von Anschlussfragen bei uns
gespeichert.

Erhobene Daten:
- Name
- E-Mail-Adresse
- Optional: Telefonnummer, Firma
- Inhalt der Nachricht

Diese Daten geben wir nicht ohne Ihre Einwilligung weiter.

Die Verarbeitung dieser Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b
DSGVO (Vertragsanbahnung) bzw. Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
Interesse).

Speicherdauer: Die von Ihnen im Kontaktformular eingegebenen Daten verbleiben
bei uns, bis Sie uns zur Löschung auffordern oder der Zweck für die Daten-
speicherung entfällt (z.B. nach abgeschlossener Bearbeitung Ihrer Anfrage).

Empfänger: Hetzner Online GmbH (Hosting), Postmark (Transaktionsmail-Versand)
```

### 3.4 Newsletter (falls geplant)

```
6. Newsletter

Aktuell wird kein Newsletter angeboten. Falls dies in Zukunft eingeführt wird,
erfolgt die Anmeldung ausschließlich nach dem Double-Opt-In-Verfahren mit
Bestätigungs-Mail. Eine Abmeldung ist jederzeit möglich.
```

### 3.5 Tracking-Tools

```
7. Tracking und Webanalyse

Diese Website verwendet keine Tracking- oder Webanalyse-Tools wie Google
Analytics, Facebook-Pixel, Hotjar oder vergleichbare Dienste.

Es findet keine personenbezogene Auswertung Ihres Surfverhaltens statt.
```

Optional, falls **Plausible Analytics** (cookieless) eingesetzt wird:

```
7. Webanalyse mit Plausible

Diese Website verwendet Plausible Analytics, einen cookielosen, datenschutz-
freundlichen Webanalyse-Dienst der Plausible Insights OÜ (Estland, EU).

Plausible verwendet keine Cookies und sammelt keine persönlich identifizier-
baren Daten. Es werden lediglich anonymisierte Aggregate gesammelt:
- Anzahl Besuche pro Seite
- Verweildauer
- Browser, Betriebssystem
- Land (basierend auf anonymisierter IP)

Die anonymisierten Daten werden auf Servern in der EU gespeichert.

Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
nutzerfreundlichen Website-Gestaltung).

Datenschutzerklärung Plausible: https://plausible.io/data-policy
```

### 3.6 Verlinkung auf Plattform-Datenschutz

```
8. Datenschutz für die ProzessPilot-Plattform

Diese Datenschutzerklärung gilt nur für die Marketing-Website prozesspilot.net.

Für die ProzessPilot-Plattform (Mitarbeiter-Webapp, Onboarding-Wizard,
Web-Chat-Widget) gelten gesonderte Datenschutz-Hinweise:
- Datenschutz-Hinweise Mitarbeiter-Webapp: https://admin.prozesspilot.net/datenschutz
- Datenschutz-Hinweise Onboarding-Wizard: https://setup.prozesspilot.net/datenschutz
- Datenschutz-Hinweise Web-Chat-Widget: https://chat.prozesspilot.net/datenschutz
```

### 3.7 Social-Media-Plugins (falls vorhanden)

```
9. Social-Media-Plugins

Diese Website verwendet keine Social-Media-Plugins (Facebook-Like-Button,
Twitter-Button, Instagram-Embeds o.ä.).

Verlinkungen zu unseren Social-Media-Profilen erfolgen ausschließlich als
einfache Hyperlinks ohne Tracking-Funktion.
```

### 3.8 Hostinger / CDN (falls vorhanden)

```
10. Content-Delivery-Network

Aktuell wird kein externes CDN eingesetzt. Statische Inhalte (Bilder, Skripte,
Stylesheets) werden direkt vom Hetzner-Server ausgeliefert.

Falls in Zukunft ein CDN eingesetzt wird (z.B. Cloudflare), wird die
Datenschutzerklärung entsprechend ergänzt.
```

---

## 4. Ergänzte Aufsichtsbehörden-Information

Im Entwurf wurde die Aufsichtsbehörde nur namentlich genannt. Vollständige Adresse ergänzen:

```
ALT: Landesbeauftragte für Datenschutz und Informationsfreiheit Niedersachsen.

NEU: Landesbeauftragte für den Datenschutz Niedersachsen
     Prinzenstraße 5
     30159 Hannover
     Telefon: 0511 / 120-4500
     E-Mail: poststelle@lfd.niedersachsen.de
     Website: https://lfd.niedersachsen.de
```

---

## 5. Speicherdauer-Klarstellung

Im Entwurf steht "Protokolldateien werden [..., maximal bis zu 24 Stunden] direkt und ausschließlich für Administratoren zugänglich aufbewahrt." Die Platzhalter sollten ausgefüllt werden:

```
NEU: Die Protokolldateien werden bis zu 24 Stunden direkt und ausschließlich
für Administratoren zugänglich aufbewahrt. Danach sind sie nur noch indirekt
über die Rekonstruktion von Sicherungsbändern verfügbar und werden innerhalb
maximal vier Wochen endgültig gelöscht.
```

---

## 6. Vollständige Reihenfolge des überarbeiteten Dokuments

Der überarbeitete Datenschutz-Erklärung-Aufbau:

1. Verantwortlicher und Datenschutzbeauftragter (ausgefüllt)
2. Daten zur Bereitstellung der Website (aus Original)
3. Cookies (NEU)
4. SSL-Verschlüsselung (NEU)
5. Kontaktformular (NEU, falls vorhanden)
6. Newsletter (NEU, Hinweis auch wenn aktuell nicht angeboten)
7. Tracking und Webanalyse (NEU)
8. Datenschutz für die ProzessPilot-Plattform (NEU)
9. Social-Media-Plugins (NEU)
10. Content-Delivery-Network (NEU)
11. Betroffenenrechte (aus Original)
12. Recht auf Widerspruch (aus Original)
13. Aufsichtsbehörde (ergänzt mit voller Adresse)

---

## 7. Maßnahmen zur Umsetzung

| Aufgabe | Verantwortlich |
|---|---|
| Anwalt liefert finalisierte Version basierend auf Original + diese Ergänzungen | Anwalt |
| Steve prüft auf Vollständigkeit | Steve |
| Steve veröffentlicht auf prozesspilot.net/datenschutz | Steve / Andreas |
| Footer-Link auf jeder Seite der Website | Andreas |
| Bei Änderungen (z.B. neues Tracking-Tool): erneute Anwaltsprüfung | Steve |

---

**Stand:** 2026-05-15 (Ergänzung zur Anwalts-Vorlage 28.10.2025)
**Verantwortlich:** Steve Bernhardt
