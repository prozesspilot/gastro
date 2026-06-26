---
name: tenants-write-rls-definer
description: "tenants-WRITES brauchen SECURITY DEFINER (Policy tenants_write_bypass = nur is_rls_bypassed()); Wizard-Writes via set_config('app.current_tenant') schlagen in Prod STILL fehl (0 rows) → onboarding_status bleibt 'pending', step_data wird nie in tenants promotet."
metadata: 
  node_type: memory
  type: project
  originSessionId: b749df69-51a1-4de6-af6f-6236162cb71a
---

**Verifiziert 2026-06-24 gegen Prod (87.106.8.111, DB prozesspilot).**

Die `tenants`-Tabelle hat eine ANDERE RLS-Policy als belege: `tenants_write_bypass` (010_tenants.sql:57-60) ist `FOR ALL USING is_rls_bypassed() WITH CHECK is_rls_bypassed()` — Schreiben NUR mit aktivem Bypass. Das Backend verbindet als Rolle `gastro_app` (in Prod per `pg_stat_activity` bestätigt), die ist `rolbypassrls=f` + `rolsuper=f`.

**Folge (Bug):** Der Wizard (`m16-wizard/services/wizard.repository.ts`) schreibt tenants mit dem belege-Muster `BEGIN; set_config('app.current_tenant', tenantId, true); UPDATE tenants …` (Zeilen ~80 wizard_started, ~189 wizard_done+Promotion, ~247 setup_premium). `set_config('app.current_tenant')` macht `is_rls_bypassed()` NICHT true → das `UPDATE tenants` matcht die WITH-CHECK-Policy nicht → **0 Zeilen, still, kein Error**. In Prod landet daher: kein onboarding_status-Fortschritt (bleibt `pending`), keine step_data-Promotion (advisor_system/input_channels/archive_provider/pos_system), kein setup_premium. **Live-Beweis:** der gelöschte Test-Tenant „Katja Bernhardt" stand trotz Sessions bei Schritt 2 auf `onboarding_status='pending'`.

**Warum lokal unsichtbar:** lokale DB-Rolle `pp` ist Superuser → umgeht RLS komplett, der Write „funktioniert" lokal. Tests MÜSSEN mit `PP_E2E=1` und gegen eine NOBYPASSRLS-Rolle (gastro_app), NICHT als pp/Superuser laufen, sonst bleibt der Bug verborgen. CI skippt DB-Tests still ohne PP_E2E=1.

**Fix-Muster:** alle tenants-WRITES über eine `SECURITY DEFINER`-Funktion (Owner-Rolle + `set_config('app.bypass_rls','on',true)` LOCAL, am Ende explizit 'off'), exakt wie `121_list_tenants_fn.sql` (Read) und `061_auth_audit_log_insert_fn` (Write). Gilt auch für den noch zu bauenden Aktiv-Setzen-Schritt (`onboarding_status: wizard_done → activated`) — sonst dieselbe stille Null-Wirkung. Audit-Insert in dieselbe DEFINER-TX (GoBD-Atomicity).

Verwandt: [[rls-guc-key-mismatch]] (T041, GUC-Key app.current_tenant), [[legacy-welt-schema-drift]] (still kaputte tenants-Writes durch DB-mockende Tests). Kontext: Onboarding-Wizard = Modul m16-wizard, Build-out Phase B.
