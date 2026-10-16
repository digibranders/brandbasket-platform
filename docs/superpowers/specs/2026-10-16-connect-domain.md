# Connect your own domain

A customer who enters their own domain at step 04 is told: "We'll show you exactly what to change once your website is approved. We'll never ask for your login."
This is where that happens.

## What the customer sees

On **Your project**, once the project is `approved` and the domain is their own (not a free `*.CLIENT_SITE_BASE_DOMAIN` address), the "It goes live" stage opens
a **Connect your domain** card:

- the records to add at their registrar, with copy buttons: for a bare domain an `A` record for `@` to `76.76.21.21` and a `CNAME` for `www` to
  `cname.vercel-dns.com`; for any other subdomain one `CNAME` (`packages/shared/src/lib/onboarding/domain-dns.ts`);
- a warning to leave every other record, email especially, alone, and that an existing website at the address will switch to the new one;
- **Check my domain**, which looks up the DNS of the domain stored for the signed-in business (never a name typed into the form) and answers
  Connected, Not yet, or Points elsewhere, per record and overall (`lib/server/domain-check.ts`, `checkDomainAction`);
- an email-us link for customers who get stuck.

Nothing is stored: the check runs on request. Registrar logins are never collected.

## What staff still do

The customer's DNS only points the name at Vercel. For the site to answer, staff add the customer's domain (and `www.`) to the client site's Vercel project, then
mark the site live in the console. Adding the domain to Vercel can be automated later with Vercel's domains API; it is manual for now.

## Free addresses on Vercel

A free address such as `name.sites.fynix.digital` needs a wildcard record pointing at Vercel and the wildcard domain added to the Vercel project. Vercel issues wildcard
certificates only when it serves the zone's DNS, so check how `fynix.digital` is hosted before enabling `CLIENT_SITE_BASE_DOMAIN` in production.

## Assumption to confirm

The `76.76.21.21` and `cname.vercel-dns.com` values are Vercel's generic ones. If a project's Vercel dashboard shows different values for a domain, update the two
constants in `domain-dns.ts`.
