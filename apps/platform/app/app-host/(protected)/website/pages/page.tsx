import { redirect } from "next/navigation";

/** The Pages tab is gone: the two ways to change the site yourself are on the Overview. An old link or bookmark goes there. */
export default function WebsitePagesMovedPage(): never {
  redirect("/website");
}
