# Privacy requests

Every rights request and complaint is a row in `privacy_requests`, worked in the staff console at **Privacy requests** (admin accounts only; linked from the Access log). Rows are added, never deleted.

**How a request arrives**
- On the website, `/privacy/request`: a code is texted to the number given and the request is filed once it is entered (`POST /api/privacy-requests/otp` and `/confirm`). The identity check is stamped on the row.
- By email or a call: staff log it on the Privacy requests page, with the day it actually arrived. The clock counts from that day.

**The clock.** Our target is 30 days from the day it arrived; the Act allows 90 at most (DPDP Act s.13, Rules 2025 r.14). The page flags a request from day 20 and as urgent from day 25.

**Emails** (to `PRIVACY_ALERT_EMAIL`, else `SUPPORT_ALERT_EMAIL`, else `support@firstfold.io`)
- *New request*: sent as soon as a website request is filed.
- *Due soon*: sent each night by the support maintenance command (`pnpm support:attachments:maintain`, run by `firstfold-support-maintenance.timer`; see `docs/deployment/vps.md`). It lists open requests the first night they reach day 20, day 25 or their due date, and every night after that while one is overdue. The stage already emailed is kept on the row (`reminder_stage`), so a request is not listed twice for the same stage.
- Neither email carries a name, number, address or anything the person wrote: only the reference, the kind and the date, with a link to the console.

**Until the timer is installed on the server** the "due soon" email does not go out. The page still flags requests, and the new-request email does not depend on the timer.

**Visitors deleting their own data.** On `/privacy/request` a person can choose "Delete my reviews, comments and enquiries". Once the code texted to their number is confirmed, the platform erases at once and files the request already closed (kind `visitor_erasure`, outcome fulfilled), so there is a record with a reference and the counts. It:
- deletes their visitor account (their browser is then signed out);
- makes their reviews anonymous: name "Erased visitor", number and words removed, star rating and highlights kept, shown publicly as "Anonymous";
- makes their comments anonymous and hides them;
- makes their enquiries anonymous (name, number and message removed);
- deletes any code still waiting for them and the website's texts to their number;
- marks their consent withdrawn (the record that it was given stays).

The tracker stores their number masked, and none of what they typed on the form. Staff screens show "Number erased" where a number used to be. Typing the same number later starts a new account with nothing carried over.

**Owners, in the app.** Settings, **Your privacy** (`/settings/privacy`) gives a signed-in owner:
- **Download my data**: one JSON file (`/settings/privacy/export`, at most six an hour) with their account, business details, billing records, support requests, sign-in history, consent records, who the data is shared with (`packages/shared/src/lib/privacy/recipients.ts`, checked against `processors.md` by a test) and a list of what is left out and why (their password, and the details of the people their business deals with).
- **A nominee** (DPDP Act s.14): a name and a **mobile number**, kept in `user_privacy_settings` under row-level security and deleted when the account is erased. Firstfold holds no email addresses, so the nominee has no email field either.
- A link to the website's request form for anything else (correct, delete, complain).

No part of this sends an email to a person: messages to people go by SMS, and Brevo sends alerts to staff only.
