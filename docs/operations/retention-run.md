# The scheduled purge (`retention:run`)

**Why:** DPDP Act s.8(7) asks that personal data is erased once its purpose is served. The periods are in
`retention-schedule.md`, approved by the owner on 13 October 2026.

**What it removes**, nightly (it runs inside the support maintenance run, `brandbasket-maintenance.timer`; see
`docs/deployment/brandbasket-vps.md`):

| What | Removed when |
|---|---|
| Sessions | A day after they expire |
| Reset and confirmation tokens (`verifications`) | A day after they expire |
| Rate-limit windows | When over two days old. Their keys hold phone numbers and addresses. |
| Account codes (`account_otps`) | An hour after they expire |
| Leads that did not become customers, with their setup invites | 12 months after the last change |
| Directory enquiries | 12 months |
| Directory visitor accounts with no review or comment left | 12 months after last seen |
| Account exit feedback | 12 months |
| Closed privacy requests | 3 years after closing |
| Closed breach records | 5 years after the last change |
| Staff access log | 400 days |
| Consent records | 3 years after the data they cover is gone |

The same nightly run also removes closed support tickets after 24 months and outbox emails after 90 days. Booking codes
and directory review codes have their own purges. Closed accounts are erased by the account erase job
(`docs/account-erasure.md`).

**Preview or run by hand:** `pnpm retention:run --dry-run` prints how many rows each kind would lose and removes nothing;
without the flag it removes them. Output is counts only, never what was in a row. A dry run counts only consent records
already marked as past their subject, since marking happens in a real run.

After any restore from backup, run it once, with the account erase job.
