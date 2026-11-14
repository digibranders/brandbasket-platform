import type { Metadata } from "next";
import { Panel } from "@/components";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { SettingsHeader } from "@/features/settings/components/settings-header";
import { SignOutOtherDevices } from "@/features/settings/components/sign-out-other-devices";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Sign-in and security" };

/** Settings, Sign-in and security: change the password, and sign every other device out. */
export default async function SecurityPage() {
  const customer = await requireCustomer();
  const { role } = customer;
  return (
    <>
      <SettingsHeader current="/settings/security" showTeam={role === "owner"} showSocial={customer.services.includes("social")} />
      <div className="flex flex-col gap-4">
        <Panel title="Change password">
          <ChangePasswordForm />
        </Panel>
        <Panel title="Where you are signed in">
          <div className="flex flex-col items-start gap-3">
            <p className="type-body text-ink-2">Sign out of every device except this one.</p>
            <SignOutOtherDevices />
          </div>
        </Panel>
      </div>
    </>
  );
}
