import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { SocialView } from "@/components/social/social-view";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSocial } from "@/lib/server/social";
import { loadTodo } from "@/lib/server/todo";
import { setupAsks } from "@/lib/setup-asks";
import { connectNoticeLine, socialNoticeLine } from "@/lib/social/notices";

export const metadata: Metadata = { title: "Social media" };

interface SocialPageProps {
  readonly searchParams: Promise<{ readonly notice?: string | readonly string[]; readonly social?: string | readonly string[]; readonly channel?: string | readonly string[] }>;
}

export default async function SocialPage({ searchParams }: SocialPageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  // This is for paid accounts; the home page tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  const now = new Date();
  const [data, { notice, social, channel }, todo] = await Promise.all([loadSocial(tenant, now), searchParams, loadTodo(tenant)]);
  // Not bought: Your plan is where Social media is added.
  if (data === null) redirect(ADD_ONS_PATH);
  return <SocialView data={data} notice={socialNoticeLine(notice) ?? connectNoticeLine(social, channel)} now={now} setup={setupAsks(todo.items, todo.answers, "social", billing.plan?.currency ?? "INR")} />;
}
