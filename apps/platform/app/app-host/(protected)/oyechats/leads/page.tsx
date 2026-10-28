import { redirect } from "next/navigation";
import { CHATBOT_PATH, readPageParam } from "@/lib/chatbots-view";

/** The leads used to have a page of their own; an old link, with its page number, goes to the OyeChats page. */
export default async function OyeChatsLeadsPage({ searchParams }: { readonly searchParams: Promise<{ readonly page?: string | string[] }> }): Promise<never> {
  const page = readPageParam((await searchParams).page);
  redirect(page === 1 ? CHATBOT_PATH : `${CHATBOT_PATH}?page=${page}`);
}
