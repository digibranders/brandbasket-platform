import { redirect } from "next/navigation";
import { CHATBOT_PATH, readPageParam } from "@/lib/chatbots-view";

/** OyeChats lives under Website now (the Enquiries tab); an old link, with its page number, goes there. */
export default async function OyeChatsMovedPage({ searchParams }: { readonly searchParams: Promise<{ readonly page?: string | string[] }> }): Promise<never> {
  const page = readPageParam((await searchParams).page);
  redirect(page === 1 ? CHATBOT_PATH : `${CHATBOT_PATH}?page=${page}`);
}
