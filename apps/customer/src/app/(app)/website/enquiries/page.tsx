import { permanentRedirect } from "next/navigation";

/** Old address (plan 61, route map): the Enquiries page answers it. The destination checks access. */
export default function MovedToEnquiries(): never {
  permanentRedirect("/enquiries");
}
