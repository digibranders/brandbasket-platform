import { redirect } from "next/navigation";
import { readWebsiteNotice, websiteNoticeHref } from "@/lib/website/notices";
import { WEBSITE_PATH } from "@/lib/website/tabs";

/** `/project` is the old address of the Website page (plan 33). It keeps the preview responses that page still shows. */
export default async function ProjectPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const notice = readWebsiteNotice((await searchParams).response);
  redirect(notice === null ? WEBSITE_PATH : websiteNoticeHref(notice));
}
