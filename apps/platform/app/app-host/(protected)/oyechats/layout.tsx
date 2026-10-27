import type { ReactElement, ReactNode } from "react";
import { WebsiteFrame } from "@/components/website/website-frame";
import { requireWebsiteClient } from "@/lib/server/customer-access";

/** Every page here sits inside the Website frame. Each page still checks access itself. */
export default async function Layout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await requireWebsiteClient();
  return <WebsiteFrame>{children}</WebsiteFrame>;
}
