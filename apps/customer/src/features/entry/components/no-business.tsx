import { BRAND } from "../rules/brand";
import { EntryScreen } from "./entry-screen";
import { SignOutButton } from "./sign-out-button";

/** Someone signed in whose account has no business yet: sign out, or write to us. */
export function NoBusiness({ label }: { readonly label: string }) {
  return (
    <EntryScreen title="Almost there." lede={`${label} is signed in, but it isn’t linked to a business yet. Contact ${BRAND.name} and we’ll sort it out.`}>
      <div className="flex flex-wrap items-center gap-4">
        <SignOutButton />
        <a href={`mailto:${BRAND.contactEmail}`} className="type-body">
          Contact {BRAND.name}
        </a>
      </div>
    </EntryScreen>
  );
}
