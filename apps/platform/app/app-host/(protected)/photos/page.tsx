import { redirect } from "next/navigation";
import { profileHref } from "@/lib/business-profile-notices";

/**
 * The old Photos page. The featured photo is now on the Business profile's Photos tab, and the ad picture on the
 * Advertise page (docs/superpowers/specs/2026-10-01-business-profile-design.md), so old links and bookmarks go there.
 */
export default function PhotosScreen(): never {
  redirect(profileHref("photos"));
}
