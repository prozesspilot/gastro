-- 001_extensions.sql
-- Foundation: Postgres-Extensions, die alle nachfolgenden Migrations benötigen.
--
-- pgcrypto    : gen_random_uuid() für UUID-PKs, encrypt()/decrypt() für Token-Storage
-- citext      : case-insensitive TEXT (z. B. E-Mail-Felder)
-- uuid-ossp   : Backup für UUID-Funktionen (optional, wird nicht überall verlangt)
--
-- Idempotent — kann mehrfach laufen (CREATE EXTENSION IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
