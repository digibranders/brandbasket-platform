# Privacy requests

Every rights request and complaint is a row in `privacy_requests`, worked in the staff console at **Privacy requests** (admin accounts only; linked from the Access log). Rows are added, never deleted.

**How a request arrives**
- On the website, `/privacy/request`: a code is emailed to the address given and the request is filed once it is entered (`POST /api/privacy-requests/otp` and `/confirm`). The identity check is stamped on the row, and the address is its contact.
- By email or a call: staff log it on the Privacy requests page, with the day it actually arrived. The clock counts from that day.

**The clock.** Our target is 30 days from the day it arrived; the Act allows 90 at most (DPDP Act s.13, Rules 2025 r.14). The page flags a request from day 20 and as urgent from day 25.

**Emails** (to `PRIVACY_ALERT_EMAIL`, else `SUPPORT_ALERT_EMAIL`, else `support@brandbasket.in`)
- *New request*: sent as soon as a website request is filed.
- *Due soon*: sent each night by the support maintenance command (`pnpm support:attachments:maintain`, run by `brandbasket-maintenance.timer`; see `docs/deployment/brandbasket-vps.md`). It lists open requests the first night they reach day 20, day 25 or their due date, and every night after that while one is overdue. The stage already emailed is kept on the row (`reminder_stage`), so a request is not listed twice for the same stage.
- Neither email carries a name, number, address or anything the person wrote: only the reference, the kind and the date, with a link to the console.

**Until the timer is installed on the server** the "due soon" email does not go out. The page still flags requests, and the new-request email does not depend on the timer.

**Visitors deleting their own data (directory).** The automatic erasure of a visitor's directory account (kind `visitor_erasure`) proved a phone number with a texted code. Nothing is texted now, and an emailed code cannot prove a number, so the public form no longer offers it and old rows keep their kind. A visitor the website still recognises can delete one review or comment at once (`POST /api/privacy-requests/contribution`, closed record with the number masked); anything else is a request staff work by hand. The directory pages are closed in Brandbasket, so there are no new visitors.

**Owners, in the app.** Settings, **Your privacy** (`/settings/privacy`) gives a signed-in owner:
- **Download my data**: one JSON file (`/settings/privacy/export`, at most six an hour) with their account, business details, billing records, support requests, sign-in history, consent records, who the data is shared with (`packages/shared/src/lib/privacy/recipients.ts`, checked against `processors.md` by a test) and a list of what is left out and why (their password, and the details of the people their business deals with).
- **A nominee** (DPDP Act s.14): a name and a **phone number**, how staff reach them when they come forward, kept in `user_privacy_settings` under row-level security and deleted when the account is erased. Nothing is ever sent to it.
- A link to the website's request form for anything else (correct, delete, complain).

Brevo sends the codes people ask for (sign-up, a patient's booking, a privacy request) and the alerts to staff. Nothing goes to a phone.
