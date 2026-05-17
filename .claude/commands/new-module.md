---
description: Generiert das Skelett für ein neues Modul. Spec-Datei + Backend-Folder + n8n-Workflow-Stub + Migration. Verwendung - /new-module M16 lieferanten-crowdsourcing
---

# /new-module <ID> <name-kebab>

Generiere ein vollständiges neues Modul-Skelett.

## Schritt 1: Validation

- ID muss Form `M<NN>` haben
- Name muss `kebab-case` sein
- ID darf nicht existieren in `Modulkonzept/Konzeptentwicklung/modules/`

## Schritt 2: Modul-Spec generieren

Erstelle `Modulkonzept/Konzeptentwicklung/modules/M<NN>_<NameInTitle>.md` nach Vorlage von M01:

```markdown
# M<NN> — <Titel>

## 1. Überblick

<Kurzbeschreibung in 2-3 Sätzen>

## 2. Aktivierung

| Paket | Aktiv? |
|---|---|
| Solo | nein |
| Standard | ja |
| Pro | ja |
| Filiale | ja |

Trigger: <Cron / Webhook / Manual>

## 3. Datenmodell

(neue Tabellen, Erweiterungen)

## 4. API-Endpoints

| Methode | Pfad | Beschreibung |
| ... |

## 5. n8n-Workflow

`WF-M<NN>-<VARIANT>.json`

## 6. Externe Abhängigkeiten

- (z.B. SumUp API)

## 7. Tests

(Unit + Integration + E2E)

## 8. Sonderfälle / Edge-Cases
```

## Schritt 3: Backend-Folder

```bash
mkdir -p backend/src/modules/m<nn>-<name-kebab>
cat > backend/src/modules/m<nn>-<name-kebab>/index.ts << 'EOF'
// M<NN> - <Titel>
// Spec: Modulkonzept/Konzeptentwicklung/modules/M<NN>_<NameInTitle>.md

export * from './service';
export * from './routes';
EOF

# Skelett-Files
touch backend/src/modules/m<nn>-<name-kebab>/service.ts
touch backend/src/modules/m<nn>-<name-kebab>/service.test.ts
touch backend/src/modules/m<nn>-<name-kebab>/routes.ts
touch backend/src/modules/m<nn>-<name-kebab>/types.ts
```

## Schritt 4: Migration-Stub

```bash
NEXT_NUM=$(ls migrations/*.sql 2>/dev/null | tail -1 | grep -oE '[0-9]+' | head -1)
NEXT_NUM=$((NEXT_NUM + 1))
PADDED=$(printf "%03d" $NEXT_NUM)
touch migrations/${PADDED}_m<nn>_<name>.sql
touch migrations/${PADDED}_m<nn>_<name>.down.sql
```

## Schritt 5: n8n-Workflow-Stub

```bash
cat > n8n/workflows/WF-M<NN>-<VARIANT>.json << 'EOF'
{
  "name": "WF-M<NN>-<VARIANT>",
  "nodes": [],
  "connections": {}
}
EOF
```

## Schritt 6: Modul-Index aktualisieren

In `00_Architektur_Hauptdokument.md` Abschnitt 6 (Modul-Index): neuen Eintrag M<NN> einfügen.

## Schritt 7: Backlog-Tasks erstellen

Optional: 5–7 Backlog-Tasks für die Modul-Implementation:
- T<XXX>: M<NN> Datenmodell + Migration
- T<XXX>: M<NN> Backend-Service
- T<XXX>: M<NN> API-Endpoints
- T<XXX>: M<NN> n8n-Workflow
- T<XXX>: M<NN> Tests
- T<XXX>: M<NN> Docs

Frage User ob er das gleich generieren will.
