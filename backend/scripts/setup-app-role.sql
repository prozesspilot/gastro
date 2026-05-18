-- setup-app-role.sql
-- ONE-TIME Setup-Skript für Production: legt die non-privileged Backend-Rolle
-- `gastro_app` an, vergibt die nötigen Privileges und konfiguriert
-- ALTER DEFAULT PRIVILEGES so, dass künftige Tabellen automatisch read+write
-- für gastro_app freigegeben werden.
--
-- Aufruf (als Postgres-Superuser oder gastro_owner):
--   psql "$DATABASE_URL_OWNER" \
--     -v app_password="'<starkes-passwort>'" \
--     -f backend/scripts/setup-app-role.sql
--
-- WICHTIG:
--   - Das Passwort als ':app_password' MUSS in einfachen Quotes übergeben
--     werden (siehe Beispiel oben).
--   - Niemals das echte Passwort in dieses File einchecken.
--   - In Dev/Lokal kann das Backend mit dem Owner-Account laufen
--     (Bequemlichkeit) — der Startup-Check (`role-check.ts`) warnt nur.
--   - In Production ERZWINGT der Startup-Check, dass diese Rolle existiert
--     und der Backend-Connection-User non-privileged ist.

BEGIN;

-- Rolle idempotent anlegen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gastro_app') THEN
    CREATE ROLE gastro_app WITH LOGIN PASSWORD :app_password
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
  ELSE
    -- Passwort rotieren — explizit gewollt bei jedem Setup-Run.
    EXECUTE format('ALTER ROLE gastro_app WITH LOGIN PASSWORD %L', :'app_password');
  END IF;
END $$;

-- Privileges auf vorhandene Objekte.
GRANT USAGE ON SCHEMA public TO gastro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gastro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gastro_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gastro_app;

-- Default-Privileges für künftige Migrationen.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gastro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gastro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO gastro_app;

COMMIT;

\echo ''
\echo 'gastro_app role created/updated. Use this in DATABASE_URL for the backend in Production:'
\echo '  postgres://gastro_app:<password>@<host>:5432/gastro_prod'
