# Retention schedule

How long Fynix keeps each kind of personal data, and what removes it. Approved by the owner on 13 October 2026
(item M1 in `Fynix/docs/privacy/PRIVACY-PLAN.md`). DPDP Act s.8(7) asks that personal data is erased once its purpose
is served; each period below is that purpose, written down. The Privacy Policy states the same periods.

| Data | Kept for | Removed by |
|---|---|---|
| Contact form leads that did not become customers | 12 months after the last change | nightly run (`retention.ts`) |
| Directory enquiries | 12 months | nightly run |
| Directory visitor accounts with no review or comment left | 12 months after last seen | nightly run |
| Reviews and comments | until the person deletes them or the listing is removed | the person (N13), staff |
| Account exit feedback | 12 months | nightly run |
| Closed support tickets, with notes and screenshots | 24 months after closing | nightly run (`support-retention.ts`) |
| Outbox emails | 90 days; sign-in links 1 day | nightly run (`emails.ts`) |
| Closed customer accounts | 30 days after the paid period ends; invoices kept | account erase job (`docs/account-erasure.md`, item M2) |
| Clinic patients and appointments | until the clinic deletes them, or with the clinic's account | the clinic, the account erase job |
| Closed privacy requests | 3 years after closing | nightly run |
| Closed breach records | 5 years after the last change | nightly run |
| Staff access log | 400 days | nightly run |
| Consent records | 3 years after the data they cover is gone | nightly run |
| Tax invoices, payments, affiliate payouts | 8 years (Companies Act s.128(5); CGST Act s.35 and s.36) | not yet: the first fall due in 2034 |
| Server and access logs on the VPS | 400 days (DPDP Rules r.8(3) asks for at least one year) | journald and logrotate (`vps-setup`) |
| Backups | on the server 14 daily and 8 weekly copies; offsite daily copies 35 days, weekly 90 days | the backup script and the R2 lifecycle rule (`vps-setup`) |
| Sessions, tokens, emailed codes, rate-limit windows | a day or less after they expire | nightly run |

## How the nightly run decides

- **Leads**: a lead whose status is `account_created` or `paid`, or that is attached to a business, belongs to an account
  and is left to the account erase job. Any other lead goes once `updated_at` is 12 months old, with its setup invite.
- **Visitor accounts**: a review or comment, published or hidden, keeps its author's account, because the person may
  still want to delete it. Visitors link to their posts by phone number.
- **Consent records**: each night, a record whose subject is gone (the lead, enquiry, visitor or patient row deleted, the
  enquiry erased in place, or the account erased) is marked with `subject_erased_at`. Three years after the mark, it is
  deleted. The three years cover a claim about how the data was used.

## Enforced by the database

The staff access log, privacy requests, the breach register and consent records were add-only. Migration 0162 lets the
staff role delete from them only rows past their period, measured on the database clock, so not even the staff
connection can remove a recent record. A consent record's `subject_erased_at` may be set once, to the current time, and
nothing else on the row can change.

## Running it

It runs inside the nightly support maintenance (`fynix-maintenance.timer`, 03:00 IST). To preview or run it
by hand, see `retention-run.md`. Its output is counts only.

After any restore from backup, run the account erase job and `pnpm retention:run` once, so data erased since the backup
was taken is erased again.
