import { permanentRedirect } from "next/navigation";

/**
 * The old Business page's address. It reads nothing and shows nothing, so it needs no guard of its own; `/business` guards
 * itself. A URL fragment (#hours and the like) is never sent to the server and cannot be carried over.
 */
export default function DetailsRedirect(): never {
  permanentRedirect("/business");
}
