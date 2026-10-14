import { redirect } from "next/navigation";

/** The old "Categories & authors" page. Both now have their own screens under Content; this keeps old links working. */
export default function BlogSettingsPage(): never {
  redirect("/content/categories");
}
