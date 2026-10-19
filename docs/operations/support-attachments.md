# Private support screenshot storage

Support screenshots are served only through the platform and staff attachment routes. They must never use the public media bucket, a CDN URL, or the public `MediaStorage` adapter.

Set `BRANDBASKET_SUPPORT_ROOT` to the same absolute private directory in the platform and admin environments for local storage. The directory must sit outside `BRANDBASKET_MEDIA_ROOT` and any static/web server root. The server creates screenshot files with mode `0600` and directories with mode `0700`. Preserve this directory with the application database in backups.

Optional object storage uses **all four** dedicated variables: `SUPPORT_R2_ACCOUNT_ID`, `SUPPORT_R2_ACCESS_KEY_ID`, `SUPPORT_R2_SECRET_ACCESS_KEY`, and `SUPPORT_R2_BUCKET`. The bucket must be private with public access and custom public domains disabled. Use a scoped credential for only this bucket. It must differ from `R2_BUCKET`; public media credentials are never reused automatically. No public URL variable exists. The application cannot verify a bucket's dashboard public-access settings, so verify those settings before enabling the configuration. Partial configuration fails rather than falling back to disk.

Each request accepts at most three PNG/JPEG/WebP images, 4 MiB per file and 12 MiB combined. MIME and magic bytes must agree. Sharp rejects animated or excessive-pixel images and reencodes to WebP without source metadata. The upload budget is twenty screenshots per user per hour, including failed attempts. Signed-in affiliates and users awaiting payment have the same support access. Closing accounts cannot upload.

Staged screenshots expire after 24 hours unless a ticket/message transaction attaches them. Schedule `pnpm support:attachments:maintain` (a daily timer is enough) on a host that has the same private storage and `DATABASE_URL_STAFF`. The command processes at most 100 expired/pending objects and 100 retained-ticket objects per run, and exits unsuccessfully if any deletion fails; the next run retries. Run additional batches when the deletion backlog exceeds 100 objects.

A screenshot removed from a draft is immediately unattachable. The removal endpoint returns 204 when storage deletion succeeds, or 202 when its durable cleanup record will be retried.

Uploads and account erasure serialize on the same per-user advisory lock. Staging metadata commits independently before the private object write so a lock transaction failure cannot roll back its deletion manifest. The closing-account check repeats after acquiring the lock.

Cleanup first marks rows `deleting`; every attachment read excludes that state. It deletes the object before marking the row `deleted`. Storage or database failures leave the deleting metadata in place for retries. Never delete attachment rows or erase the requesting user while private objects remain: account erasure must retain its deletion manifest and retry the private storage purge before deleting the final support records. Public media deletion must not receive support keys.

Verify a staged object remains unavailable through customer GET, another requester cannot read an attached object, internal-message attachments cannot be read by customers, and a removed staff member cannot read a staff attachment. Every response carries `private, no-store`, `nosniff`, a restrictive CSP, and same-origin resource policy.


Closed ticket content, internal notes, contextual details, error links, read state, and screenshots are removed 24 calendar months after the ticket's last change, the period in the retention schedule (`docs/operations/retention-schedule.md`). `SUPPORT_TICKET_RETENTION_MONTHS` may set another whole number of months from 1 to 120; any other value, 0 included, is refused so a typo cannot purge data early or turn the schedule off. This does not change financial record retention. Resolved tickets remain available; only closed tickets enter this pass. A claimed ticket cannot receive new replies or changes while its objects are being removed. Its content is retained when any object delete fails, and removed only after every associated object is marked deleted. No customer-identifying analytics are preserved by this command.

The same command also removes resolved automatic error issues 90 days after resolution (see `docs/operations/automatic-errors.md`). `docs/deployment/brandbasket-droplet.md` describes how to schedule it.

## Where customer text can be stored

- The application database: tickets, messages, notes and screenshot metadata. Erasing an account removes them.
- Private screenshot storage (local directory or the private R2 bucket). Erasing an account removes them first.
- The staff Outbox (`email_messages`): support alerts keep only the reference, category, status and a link. They never hold ticket text, names, emails or phones.
- The support mailbox (`SUPPORT_ALERT_EMAIL`), when Brevo is configured: alert emails sent through Brevo carry the request text and the requester's name, email and phone, so staff can triage. This mailbox, and Brevo's own delivery logs, are outside the database and are not reached by account erasure. Remove alerts from the mailbox when a customer asks for erasure.

The account erasure runner also marks every requester-owned support object deleting, including screenshots uploaded by staff to that request. It uses the same private store and waits for successful deletion before the database transaction removes support content and scrubs account identity. Retry the ordinary account erasure run when private storage is unavailable; the open closure and support manifest remain in place. Public media storage keys are handled independently by the existing erasure stage.
