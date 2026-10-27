import { redirect } from "next/navigation";
import { REQUESTS_PATH } from "@/lib/requests/links";

/** The old list of tickets. Every ticket now opens in Requests with its whole history; this keeps old links working. */
export default function MySupportRequests(): never {
  redirect(REQUESTS_PATH);
}
