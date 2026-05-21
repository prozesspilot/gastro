/**
 * Regression-Test: Cookie `sameSite` darf nicht auf 'strict' stehen.
 *
 * Hintergrund: 'strict' verursacht eine Login-Loop bei Discord-OAuth,
 * weil das Cookie beim Top-Level-Redirect von discord.com zurück NICHT
 * mitgeschickt wird. 'lax' ist der OAuth-Standard und schützt weiter
 * vor CSRF (POST-Requests cross-site werden geblockt).
 *
 * Dieser Test ist absichtlich source-level (keine HTTP-Simulation),
 * damit er einen versehentlichen Refactor ("strict ist sicherer!") sofort
 * fängt — ohne den vollen Login-Flow zu mocken.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../modules/m14-auth');

const AUTH_FILES = ['auth.routes.ts', 'emergency-login.routes.ts'];

describe('M14 Auth Cookie sameSite-Regression', () => {
  for (const file of AUTH_FILES) {
    it(`${file} nutzt sameSite: 'lax', nicht 'strict'`, () => {
      const source = readFileSync(resolve(ROOT, file), 'utf-8');
      // Wir suchen nach setCookie-Aufrufen mit sameSite: 'strict'
      const strictPattern = /sameSite:\s*['"]strict['"]/g;
      const matches = source.match(strictPattern);
      expect(
        matches,
        `${file} enthält sameSite: 'strict' — Discord-OAuth-Loop! Auf 'lax' umstellen.`,
      ).toBeNull();

      // Sanity: sameSite: 'lax' muss tatsächlich vorhanden sein
      const laxPattern = /sameSite:\s*['"]lax['"]/g;
      const laxMatches = source.match(laxPattern);
      expect(
        laxMatches,
        `${file} setzt setCookie ohne sameSite: 'lax' — bitte explizit setzen.`,
      ).not.toBeNull();
    });
  }
});
