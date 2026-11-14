import { displayPhone } from "@brandbasket/shared/server/phone-display";
import type { Metadata } from "next";
import { Panel } from "@/components";
import { BRAND } from "@/features/entry/rules/brand";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { roleLabel } from "@/features/team/rules";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Settings" };

/** Settings, Profile. Open to every member of a business, whatever its billing. */
export default async function SettingsPage() {
  const customer = await requireCustomer();
  const { user, role } = customer;
  return (
    <>
      <SettingsHeader current="/settings" showTeam={role === "owner"} showSocial={customer.services.includes("social")} />
      <Panel title="Your profile">
        <ProfileForm
          name={user.name}
          // An account opened with a number holds only a placeholder address, which is never shown.
          email={user.phone === null ? user.email : null}
          mobile={user.phone === null ? null : displayPhone(user.phone).text}
          role={roleLabel(role)}
          supportEmail={BRAND.contactEmail}
        />
      </Panel>
    </>
  );
}
