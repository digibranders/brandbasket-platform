import type { ReactElement } from "react";
import Link from "next/link";
import { buttonSecondary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { TrustedMark, VerifiedMark } from "@/components/directory-tag-marks";
import { giveClientTrustedAction, giveClientVerifiedAction, removeClientTrustedAction } from "@/app/(protected)/clients/[businessId]/actions";
import { CLIENT_TAG_NOTICES, type ClientTagNotice } from "@/lib/client-tags";

interface ClientListingTagsProps {
  readonly businessId: string;
  /** The name to look the business up under in the Directory's Verified list. */
  readonly businessName: string;
  /** Whether staff verified the listing (a row in the Verified list). A paying client is shown as verified without one. */
  readonly staffVerified: boolean;
  /** Whether staff gave the Trusted tag. */
  readonly trusted: boolean;
  readonly notice: ClientTagNotice | null;
}

const ROW = "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line py-4";
const BUTTON = "px-4 py-1.5";

/**
 * The Verified and Trusted tags for one client's listing, given by hand from here with no checks: the direct route
 * (the website also earns Trusted from a licence on the profile). A paying client is shown as Verified on its own, so
 * Verified is offered for a client that is not one; Trusted works for every client with a listing.
 */
export function ClientListingTags({ businessId, businessName, staffVerified, trusted, notice }: ClientListingTagsProps): ReactElement {
  const payload = <input type="hidden" name="businessId" value={businessId} />;
  return (
    <div className="max-w-2xl">
      <h3 className="font-serif text-lg">Tags</h3>
      {notice === null ? null : (
        <Notice tone={CLIENT_TAG_NOTICES[notice].ok ? "ok" : "problem"} className="mt-3">
          {CLIENT_TAG_NOTICES[notice].text}
        </Notice>
      )}
      <ul className="mt-3 border-b border-line">
        <li className={ROW}>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[0.98rem] font-semibold">
              <VerifiedMark /> Verified
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {staffVerified ? "Given by staff." : "Shown automatically once the client is paying."}
            </p>
          </div>
          {staffVerified ? (
            <Link href={`/directory?show=verified&q=${encodeURIComponent(businessName)}`} className="link-underline text-sm">
              Manage in Directory
            </Link>
          ) : (
            <form action={giveClientVerifiedAction}>
              {payload}
              <button type="submit" className={`${buttonSecondary} ${BUTTON}`}>
                Give Verified
              </button>
            </form>
          )}
        </li>
        <li className={ROW}>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[0.98rem] font-semibold">
              <TrustedMark /> Trusted
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {trusted ? "Given by staff." : "Not given. A licence on their profile also earns it."}
            </p>
          </div>
          <form action={trusted ? removeClientTrustedAction : giveClientTrustedAction}>
            {payload}
            <button type="submit" className={`${buttonSecondary} ${BUTTON}`}>
              {trusted ? "Take away Trusted" : "Give Trusted"}
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
