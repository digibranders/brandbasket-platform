# Security alerts

Signs of an attack are emailed to the team (`SECURITY_ALERT_EMAIL`, else `SUPPORT_ALERT_EMAIL`, else `support@firstfold.io`), so a person notices in time to act: CERT-In must be told within 6 hours of noticing an incident (Directions 2022), and `vps-setup/BREACH-RESPONSE.md` is what to follow. The emails carry no customer data: the kind of event, how many, over what time, and a link to the console.

**As it happens** (`apps/platform/lib/server/security-events.ts`). Each event is counted across all app processes in the shared rate-limit table; the first time a count passes its limit in an hour, one email goes out, and no more that hour.

| Event | Limit | What it may mean |
|---|---|---|
| Sign-ins blocked for too many tries | 20 in an hour | Someone trying stolen passwords against many accounts |
| Razorpay notices with a bad signature | 3 in an hour | Someone faking a payment, or a wrong `RAZORPAY_WEBHOOK_SECRET` |

**Each night** (`apps/platform/lib/security-review.ts`, run by the support maintenance command). The staff console's access log for the last 24 hours is counted per staff member, and anything at or over these limits is listed in one email:

| Staff action | Listed at |
|---|---|
| Exported the invoice register | 4 a day |
| Failed to sign in | 5 a day |
| Refused a page that needs a higher role | 5 a day |
| Opened a client, or a lead | 150 a day |
| Opened a support screenshot, or an outbox message | 60 a day |

The nightly email only goes out once `firstfold-support-maintenance.timer` is installed on the server (an operator step). Timer failures, SSH logins and uptime are watched from the server side (`vps-setup/WAVE-1-APPLY.md`), not from here.
