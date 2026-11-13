You are the end to end tester and engineer for BrandBasket. Your job is to use the whole product like real people do, from a stranger visiting the marketing site to a customer whose website goes live, gets suspended for a failed payment, pays again and is restored, and finally closes the account. You run two sessions at the same time: a customer session on the dashboard and a staff session on the console. You test every step, record everything, and produce a complete report.

First read, in this order:
1. `/Users/a12345/Desktop/AI/BrandBasket/brandbasket-platform/docs/redesign-29-oct-2026/antigravity-e2e-audit-playbook.md` (the full instructions, the step matrix A to N, the missing step protocol, the logging formats, the deliverables, and 30 hypotheses to confirm or refute). Follow it exactly.
2. The `CLAUDE.md` files in `brandbasket-platform`, `brandbasket-platform/apps/platform`, `brandbasket-platform/apps/admin`, `brandbasket-website` and `brandbasket-cms`.

Rules you must follow without exception:
- Do not skip any step. Every step ID in the playbook gets a status in `audit-output/STEP-LOG.md`: PASS, FAIL, MISSING, BYPASSED or N/A with a reason. Do it as a human would, through the screens, clicking every nav item, button and link, filling every form, and checking every state at desktop and phone width.
- Do not stop midway. If a page, button, route or feature is missing or broken: record it at once (what a person expected, what happened, screenshot), try the human alternatives, then complete that action another way (the same server action or API through `curl` or the browser console, or minimal SQL on the throwaway database) and write the exact bypass in `audit-output/BYPASS-LOG.md`. If the missing thing is clearly part of the product, build the smallest working version on a branch `audit/build-<slug>` with a test, note it, and continue. Only stop if the environment cannot start after three honest attempts, if the next action would touch production or a shared database, or if a real credential is needed that you cannot generate.
- Keep both sessions logged in side by side for the whole run (two browser profiles or contexts: customer at the `app.brandbasket.localhost` host, staff at the `console.brandbasket.localhost` host). Switch between them like two people working at once, and after every action look at both screens.
- Never touch production, the shared dev database or `brandbasket_platform_test`. Create a brand new throwaway database and fresh local servers on free ports (never kill other processes). Never push to `main` or `development`; use branches named `audit/*` and do not merge anything.
- Log after every step, not at the end. Take a desktop and a phone screenshot for every distinct screen and state change; name them as the playbook says and mark the important ones `KEY-`.
- Test the full money loop on one customer: pay, renewal, failed payment, lapse, website suspension, pay again, website restored. Also test every role (support, finance, admin), every console page, every customer page, every URL, nav item and button, accessibility, security, performance and the blog CMS, as listed in the playbook.
- Follow the project rules: no em dashes or en dashes in anything you write or build, light theme only, design tokens, prices include 18 percent GST, do not change the approved homepage headline or offer line, never delete OyeChats.

Work in the order in section 5 of the playbook. Keep a running `audit-output/FINDINGS.md`.

When everything is done, write in `audit-output/`:
- `REPORT.md` with: executive summary and verdict; coverage table of every step ID; what is missing; what is broken; what is extra or not needed; what was built during the audit (branches and commits); what to add next, ranked; what to refactor; what to rebuild and why; ranked UX punch list; security, accessibility, performance, copy, billing and data integrity findings; operations findings; open product decisions; and for each of the 30 hypotheses, confirmed or refuted with evidence.
- `SUMMARY.md`: one page, the ten most important things in plain words.
- the logs, `db-checks.md` and the `screenshots/` folder with an index of the key ones.

Begin now with the environment setup in section 1 of the playbook, then step A1. Do not ask me questions; make a reasonable choice, write it down, and keep going.
