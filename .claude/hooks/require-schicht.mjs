#!/usr/bin/env node
// UserPromptSubmit-Gate: erzwingt /schicht vor Arbeitsbeginn (pro Session).
//
// Zweck: Bevor in diesem Projekt gearbeitet wird, muss erst /schicht laufen
// (holt den neuesten Stand + Team-Memory von GitHub). So startet niemand —
// auch nicht ein autonomer Run — versehentlich auf veraltetem Stand.
//
// Verhalten:
//   - Prompt enthaelt "/schicht"        -> Session entsperren (Marker setzen) + durchlassen
//   - Prompt enthaelt "schicht-skip"    -> Notausgang: entsperren + durchlassen
//   - Marker fuer diese Session existiert-> durchlassen
//   - sonst                             -> BLOCKIEREN (exit 2, Hinweis an den User)
//
// SICHERHEIT — FAIL-OPEN: Bei JEDEM internen Fehler (kein stdin, kaputtes JSON,
// FS-Problem) wird der Prompt durchgelassen (exit 0). Ein defekter Hook darf das
// Projekt niemals bricken. Der einzige Pfad, der blockiert, ist der explizite
// exit(2) unten.

import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function allow() {
  process.exit(0);
}

try {
  const raw = readFileSync(0, "utf8"); // stdin (vom Hook befuellt)
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    allow(); // unparsbares JSON -> durchlassen
  }

  const sessionId =
    String(data.session_id || "").replace(/[^a-zA-Z0-9_-]/g, "") || "unknown";
  const prompt = String(data.prompt || "");

  const lockDir = join(homedir(), ".claude", ".schicht-locks");
  const marker = join(lockDir, sessionId);

  const ranSchicht = /\/schicht\b/i.test(prompt); // matcht den Slash-Command /schicht
  const escape = /schicht-skip/i.test(prompt); // Notausgang

  if (ranSchicht || escape) {
    try {
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(marker, new Date().toISOString());
    } catch {
      // Marker-Schreiben fehlgeschlagen -> trotzdem durchlassen (fail-open)
    }
    allow();
  }

  if (existsSync(marker)) allow();

  // --- Einziger blockierender Pfad ---
  const reason =
    "🔒 /schicht-Sperre aktiv.\n\n" +
    "Bevor in diesem Projekt gearbeitet wird, muss erst /schicht laufen\n" +
    "(holt den neuesten Stand + Team-Memory von GitHub).\n\n" +
    "➡️  Tippe jetzt:  /schicht\n\n" +
    'Notausgang (falls noetig): schreibe „schicht-skip" in deine Nachricht.';
  process.stderr.write(reason + "\n");
  process.exit(2); // exit 2 = UserPromptSubmit blockieren, stderr wird dem User gezeigt
} catch {
  allow(); // alles andere -> fail-open
}
