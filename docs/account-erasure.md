# Erasing deleted accounts (the 30-day step)

An owner who deletes their account (Settings → Delete account) is signed out and locked at once, and their plan is ended
with the month they paid for. Their data is kept, restorable, for 30 days after the service ends
(`account_closures.erase_after`). This is the job that erases it after that.

## What it does

`POST /api/internal/erase-closed-accounts` finds every open closure past its `erase_after` and, for each one:

1. **Checks it may be erased** and skips it (reporting why) if the plan is still running at the provider
   (`subscription-live`), the user is a staff member (`staff-account`), or the business has another member
   (`other-members`). Nothing is removed for a skipped account. Staff look at those by hand.
2. **Clears the website CMS** (blog posts, authors, categories, media and tenant for the business). If that fails the
   account is left open and the next run tries again.
3. **Erases the rows** in one transaction: patients, bookings, practitioners, the business's details, hours, content,
   directory listing, pictures, claims and deals, the sales lead and its setup links, the sign-in (sessions, accounts,
   verification tokens), the outbox emails and sign-up codes to that person. The person's row is scrubbed (name, email,
   phone and image), not deleted.
4. **Removes the stored files** (pictures and uploads) the erased rows pointed at. A file that cannot be removed is logged
   and counted in `filesNotRemoved`; it is unreferenced and cannot be served.

**Kept on purpose:** subscriptions, payments, charges, affiliate earnings and ad bids and wins, because the books must
stay whole. The business row stays, renamed "Deleted business", so they name nobody.

Add-ons are kept like payments: add-on subscriptions, the links from payments to them (`add_on_payments`) and press
releases stay as the record of what was sold.

**Billing details and tax invoices.** The billing details a customer gave for invoices (`billing_profiles`: legal name,
GSTIN, address, billing email and phone) are erased with the account. Issued tax invoices (`tax_invoices`) are kept: an
invoice is a financial record the law requires us to hold for 8 years (Companies Act s.128(5); CGST Act s.35 and s.36), and the table is insert only. It still
carries the legal name, address and GSTIN it was issued to, but never an email or phone, which the database refuses on
a recipient. The invoice number counter (`tax_invoice_series`) belongs to no business and is not touched.

A closure restored a moment before the run is never erased: the transaction re-reads it under a row lock.

## Running it

`ACCOUNT_ERASE_TOKEN` (at least 32 characters, `openssl rand -hex 32`) in the platform's environment is the route's own
secret, not `LEADS_API_TOKEN`. Unset, the route answers 503 to everything.

On the VPS the route is called every night at 03:30 IST by `brandbasket-erase.timer`, which runs
`/usr/local/sbin/brandbasket-erase` (both in `vps-setup/platform`). The script reads the token from the
platform's env file, calls the route on the server's own app port, prints the JSON report to the journal
(`journalctl -u brandbasket-erase`) and fails the unit if any account failed, so the next run retries.

Look first, change nothing:

```bash
sudo brandbasket-erase --dry-run
```

Each run erases at most 25 accounts. The report lists each closure as `erased`, `would-erase`, `skipped` (with a reason)
or `failed` (with the stage), by id only.

**After any restore of live data from a backup**, run it once by hand, then `pnpm retention:run`: accounts erased since
the backup was taken come back with the restore, and this erases them again. Backups expire within 90 days, so no
separate list of erased accounts is kept.

## Website visitor accounts

Visitor accounts (a name and a confirmed number, made when someone first reviews, comments or sends an enquiry) are
removed by the nightly retention run once nobody has used them for 12 months and they have no review or comment left
(`docs/operations/retention-schedule.md`). Staff can also delete one account from the admin's Directory > Visitors list,
for a request to erase it. Reviews, comments and enquiries a visitor sent keep their own copy of the name and number and
are deleted from their own lists.

## Not covered

Posted reviews and enquiries about a place are the place's public record and are kept. Backups are not touched.
