# Console redesign: rulings on the open mock questions

The owner approved the console v2 mocks and the plan defaults (CD-1 to CD-21) on 2026-11-17 and did not rule on the individual mock questions, so the recommended default applies to each. Build agents follow this file where the mock notes ask a question. Change a ruling only with the owner's yes.

| # | Question | Ruling |
|---|---|---|
| 1 | Today "Active clients" tile has no data source | Drop it. Use "Open requests" (has a source). No data source, no element |
| 2 | Kickoff row verb | "Call completed" (D31) |
| 3 | Today group names | Late, Due today, Waiting on someone. Google items fold into the System filter |
| 4 | Filter membership | Reports to review under Customers, signed up not paid under Enquiries |
| 5 | Rail colour | `#23242A` (language file, as R2-08 shipped) |
| 6 | DESIGN.md versus the language file | The premium language wins: white secondary buttons with a border on white surfaces, soft fill on paper; popover shadow allowed on panels, menus, toasts and the command bar. CR-00 rewrites `apps/admin/DESIGN.md` to match |
| 7 | Extra shortcuts | Keep `u` undo, `g o` Compliance, `g s` System. Shift-extend and Ctrl A select-all allowed in the bulk set. `e` runs the row verb everywhere (no `c`) |
| 8 | Payments tiles | Three tiles as in the plan; cut Refunded |
| 9 | "Stayed" offer on Leaving | Not shown (no discounts rule) |
| 10 | Figures form | Paid Ads fields only (three ad fields); drop the Social fields |
| 11 | Overview exception priority | A failed renewal outranks a late first preview; a late kickoff stays the first exception when no payment failed |
| 12 | Chatbot (OyeChats) form | Lives on the Services tab |
| 13 | Local SEO + AEO figures | Retire (no matching sold service) |
| 14 | "Extend by 30 days" | Behind a confirm |
| 15 | Silent preview threshold | 5 days, shown on Today and the client strip |
| 16 | Setup answers on Account | Show intake answers now; the setup-answers read ships with D14b |
| 17 | Error toasts | Persist until dismissed. Plain toasts 4 seconds, Undo toasts 10 seconds |
| 18 | Buttons at 390 | 44px high on phone, 36px on desktop (as the customer app) |
| 19 | Row context menu | Opens on right click only on the dots column |
| 20 | Compact rows | 36px only for Invoices and Access log; every other list 44px |
| 21 | Id formats | Use the real formats from the code; the mocks' `#REQ-0000` and `INV-0000` are placeholders |
| 22 | Retention offer, status vocabulary, derived tints | CR-00 settles the status vocabulary and registers the sage and error washes as tokens |

New staff wording in the mocks and notes is still listed per package for the owner's approval before it ships.
