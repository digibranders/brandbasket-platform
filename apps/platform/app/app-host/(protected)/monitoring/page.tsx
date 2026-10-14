import { redirect } from "next/navigation";

/**
 * Monitoring was retired on 2026-09-22.
 *
 * It promised "whether your website is reachable right now" and never made a request to find out: the status it
 * showed came from `deriveSiteStatus`, which is `project is live && billing is paid`. That is worth telling a
 * customer, but it is not monitoring, and a page that claims to watch a site it never contacts is worse than no
 * page. The same state now sits on Home as one figure among the others, under an honest label.
 *
 * Kept as a redirect because customers have this address bookmarked. Build real monitoring — a scheduled check
 * with a stored history — and this becomes a page again.
 */
export default function MonitoringPage(): never {
  redirect("/");
}
