/**
 * Payment lapse policy constants (Release 1 priority 7, D10).
 * Defaults:
 * - 7 days grace period: customers retain billing/dashboard access while past_due.
 * - 14 days hosting pause: website hosting is paused 14 days after payment was due.
 * - 30 days data retention: account data kept for 30 days before permanent erasure.
 */
export const LAPSE_GRACE_PERIOD_DAYS = 7;
export const LAPSE_HOSTING_PAUSE_DAYS = 14;
export const LAPSE_DATA_RETENTION_DAYS = 30;
