import { redirect } from "next/navigation";

/** Calls became a card on Today (console redesign CD-1). Old links, bookmarks and stored notices land on Today. */
export default function CallsPage(): never {
  redirect("/");
}
