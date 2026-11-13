import { redirect } from "next/navigation";

/** Posts and Accounts are one page now, with the accounts down the side; an old link or bookmark lands there. */
export default function SocialOldPageRedirect(): never {
  redirect("/social");
}
