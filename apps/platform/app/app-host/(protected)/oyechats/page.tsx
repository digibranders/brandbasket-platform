import { redirect } from "next/navigation";
import { CHATBOT_LEADS_PATH } from "@/lib/chatbots-view";

/** OyeChats has two pages, Leads and Chatbot name; the bare address, from an old link, goes to the leads. */
export default function OyeChatsIndexPage(): never {
  redirect(CHATBOT_LEADS_PATH);
}
