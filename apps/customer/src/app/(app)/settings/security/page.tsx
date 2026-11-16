import type { Metadata } from "next";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { SettingsCard } from "@/features/settings/components/settings-card";
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
      <div className="flex flex-col gap-6">
        <SettingsCard title="Change password" tone="focal">
          <ChangePasswordForm />
        </SettingsCard>
        <SettingsCard title="Where you are signed in">
          <div className="flex flex-col items-start gap-3">
            <p className="type-body text-ink-2">Sign out of every device except this one.</p>
            <SignOutOtherDevices />
          </div>
        </SettingsCard>
      </div>
    </>
  );
}
