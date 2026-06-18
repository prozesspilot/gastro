-- Rollback für 122_onboarding_sessions.sql
DROP FUNCTION IF EXISTS get_onboarding_session_by_token(text);
DROP TABLE IF EXISTS onboarding_sessions;
ALTER TABLE tenants DROP COLUMN IF EXISTS onboarding_status;
ALTER TABLE tenants DROP COLUMN IF EXISTS setup_premium;
ALTER TABLE tenants DROP COLUMN IF EXISTS advisor_system;
ALTER TABLE tenants DROP COLUMN IF EXISTS input_channels;
ALTER TABLE tenants DROP COLUMN IF EXISTS archive_provider;
