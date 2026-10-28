import { redirect } from "next/navigation";
import { CHATBOT_PATH } from "@/lib/chatbots-view";

/** The chatbot's name is now on the OyeChats page itself; an old link goes there. */
export default function OyeChatsNamePage(): never {
  redirect(CHATBOT_PATH);
}
