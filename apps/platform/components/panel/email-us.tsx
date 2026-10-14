import type { ReactElement } from "react";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";

/** The address to write to for help, as a link: the brand the request's host is sold under has its own. */
export async function EmailUs(): Promise<ReactElement> {
  const email = supportEmailOf(await requestBrand());
  return (
    <a href={`mailto:${email}`} className="link-underline text-ink">
      {email}
    </a>
  );
}
