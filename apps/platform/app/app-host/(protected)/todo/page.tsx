import { redirect } from "next/navigation";

/**
 * To do is gone: what we need from the customer is asked on Home and, for Social and Local SEO, in a card on that service's
 * page. An old link, from a bookmark or an email already sent, goes Home.
 */
export default function TodoMovedPage(): never {
  redirect("/");
}
