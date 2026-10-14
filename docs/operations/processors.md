# Processors and sub-processors

Every outside service that receives personal data from Fynix. Update this file before a new vendor receives any data.

**Standing fact (owner, 2026-10-13):** Fynix takes no email addresses from customers, businesses, visitors, patients or affiliates, only mobile numbers, and Brevo sends alerts to Fynix staff only. A message to a person goes by SMS. Do not add email flows for people. The one exception is the website's Contact form, which asks for an email with the enquiry and saves it as a lead for staff.

**Why:** DPDP Act s.8(2) allows a processor only under a valid contract, and Rules r.6(1)(f) put security terms in it. A person's right to know who their data was shared with (s.11(1)(b)) is answered from this list. The Customer Data Processing Addendum draws its sub-processor schedule from it. Review it every six months.

**Adding a vendor:**
1. Write down what personal data it would receive and why.
2. Check where it stores data, and whether it can store it in India.
3. Accept or sign its data processing terms, with a 24-hour breach notice and erasure on exit.
4. Turn on two-step sign-in for the account.
5. Add a row here, then connect it.

"Contract" says what is on file. **Unconfirmed** means nobody has checked yet; it is not a statement that no contract exists.

| Vendor | Service | Personal data it receives | Where | Contract | Where it is configured |
|---|---|---|---|---|---|
| Hostinger International | VPS, database, media disk | Everything | Mumbai, India | Unconfirmed | `vps-setup/README.md` |
| Cloudflare, Inc. | Proxy and TLS (all traffic in clear at the edge), DNS; R2 for encrypted backups and public media; Turnstile robot check on the sign-in, sign-up, password, setup and enquiry forms (the visitor's IP address and browser signals, sent from the browser and with the server's check) | All web traffic; encrypted backups; public media | Global edge; R2 jurisdiction left at the default | Unconfirmed | `vps-setup/CLOUDFLARE.md` |
| MSG91 (Walkover Web Solutions) | SMS codes | Mobile number, code | India | Unconfirmed | `apps/platform/lib/server/sms/msg91-sender.ts` |
| Brevo (Sendinblue SAS) | Alerts to the Fynix team only: support and feedback requests, new leads, automatic error and security alerts, new and due privacy requests | The text of a support request with the requester's name and number; a new lead from the website contact form (name, business, email, phone, message); privacy and security alerts carry no customer data. No email goes to customers | European Union | Unconfirmed | `packages/email/src/brevo.ts` |
| Razorpay Software Private Limited | Payments | Owner mobile number (prefill); payment method details returned to us | India | Merchant agreement; data terms unconfirmed | `packages/billing/src/razorpay-provider.ts` |
| Functional Software, Inc. (Sentry) | Error monitoring | Error reports with personal details removed: URL path, browser, stack trace | United States | Unconfirmed | `apps/platform/lib/sentry-scrub.ts` |
| Zoho Corporation | Support and grievance mailbox | Anything people write to us | India | Unconfirmed | `vps-setup/README.md` (MX records) |
| Calendly LLC | Call booking on the website | Name, email (and the message text until the website change that stops sending it) | United States | Unconfirmed | `the marketing website/lib/calendly.ts` |
| OyeChats (group company) | Chat on the website's Contact page | Chat messages, IP address | Unconfirmed | Unconfirmed | `the marketing website/components/contact-chat.tsx` |
| GitHub, Inc. | Source code and deploy statuses | Masked deploy log tails; no customer data by design | United States | Standard terms | `vps-setup/deploy-status/` |
| Google LLC | Optional Business Profile import (the owner's choice); YouTube thumbnails | The owner's Google token and business data; visitor IP for thumbnails | United States | Google API terms | `apps/platform/lib/server/google-business.ts` |

## Not processors

These receive data because the person chose to use them, and are separate data fiduciaries: WhatsApp or Meta when a visitor taps a wa.me link, Google Maps when a visitor opens directions, and the listed business, which receives an enquiry sent to it. The Privacy Notice tells people about them.

## What this file does not yet record

The Vimeo video hosting added in migration 0139 is not listed here, because its data terms and location have not been checked. Add it when they have.
