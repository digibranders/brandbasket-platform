import { permanentRedirect } from "next/navigation";

/** The old Support list: emails already sent point here. */
export default function SupportRedirect() {
  permanentRedirect("/requests");
}
