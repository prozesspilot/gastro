/**
 * M15 — Kassensystem-Connector (SumUp OAuth + Token-Storage)
 *
 * Öffentliche Exporte für app.ts und andere Module.
 *
 * T004-Scope: OAuth-Flow + Token-Storage (NICHT Daily-Pull → T005)
 *
 * Setup für Wirte (SumUp Developer Portal):
 *   1. Account anlegen: https://developer.sumup.com
 *   2. App registrieren: "ProzessPilot POS-Connector"
 *   3. OAuth-Redirect-URI eintragen: ${SUMUP_REDIRECT_URI}
 *   4. Scopes: transactions.history.read, user.profile_readonly
 *   5. Client-ID + Secret in .env:
 *      SUMUP_CLIENT_ID=<aus Developer Portal>
 *      SUMUP_CLIENT_SECRET=<aus Developer Portal>
 *
 * T005 (noch fehlend — Daily-Pull):
 *   - POST /m15/pull/:tenant_id (Daily-Pull-Endpoint)
 *   - n8n-Workflow WF-CRON-DAILY-POS-PULL
 *   - MwSt-Splitting-Logik (19%/7%/0%)
 *   - pos_daily_close Tabelle (Migration 023)
 */

// Routes
export { sumupOauthRoutes } from './oauth.routes';

// Repository
export {
  deletePosCredentials,
  getPosCredentials,
  markPosInactive,
  updatePosTokens,
  upsertPosCredentials,
} from './pos.repository';

// Service
export {
  SUMUP_REQUIRED_SCOPES,
  SumUpApiError,
  buildSumUpAuthUrl,
  exchangeCodeForTokens,
  fetchSumUpUserInfo,
  refreshAccessToken,
} from './sumup.service';

// Token-Helper
export { getSumUpAccessToken } from './pos-token-helper';
