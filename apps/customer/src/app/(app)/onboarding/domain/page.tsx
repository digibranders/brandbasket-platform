import { permanentRedirect } from "next/navigation";

/** The old setup steps are one checklist now. */
export default function OnboardingRedirect(): never {
  permanentRedirect("/checklist");
}
