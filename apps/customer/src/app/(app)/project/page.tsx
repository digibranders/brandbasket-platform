import { permanentRedirect } from "next/navigation";
import { readWebsiteNotice, websiteNoticeHref } from "@/features/website/rules/notices";
import { WEBSITE_PATH } from "@/features/website/rules/paths";

/** Old address of the Website page (plan 61, route map). Keeps `?response=`; the destination checks access. */
export default async function MovedToWebsite({ searchParams }: { readonly searchParams: Promise<{ readonly response?: string | string[] }> }): Promise<never> {
  const notice = readWebsiteNotice((await searchParams).response);
  permanentRedirect(notice === null ? WEBSITE_PATH : websiteNoticeHref(notice));
}
