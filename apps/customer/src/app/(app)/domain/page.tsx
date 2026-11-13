import { permanentRedirect } from "next/navigation";
import { WEBSITE_DOMAIN_PATH } from "@/features/website/rules/paths";

/** Old address (plan 61, route map), still in sent "domain ready" emails. The destination checks access. */
export default function MovedToWebsiteDomain(): never {
  permanentRedirect(WEBSITE_DOMAIN_PATH);
}
