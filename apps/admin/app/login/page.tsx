import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { TurnstileScope } from "@brandbasket/shared/ui/turnstile-scope";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import { QuietFrame } from "@/components/console/quiet-frame";
import { signOut } from "@/lib/server/sign-out";
import { getStaffAccess } from "@/lib/server/staff-access";
import { adminBrand } from "@/lib/brand";
import { signInStaff } from "./actions";
import { AuthFrame } from "@/components/auth/auth-frame";
import { StaffSignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage({ searchParams }: {
  readonly searchParams: Promise<{ readonly notice?: string | string[] }>;
}): Promise<ReactElement> {
  const brand = adminBrand();
  const access = await getStaffAccess();
  if (access.kind === "granted") redirect("/");

  if (access.kind === "not-staff") {
    return (
      <QuietFrame
        title={
          <>
            This sign in cannot <em>open the console.</em>
          </>
        }
        lede={`${access.user.email} is not an active ${brand.name} staff account, so nothing here is shown. Sign out and use your staff account, or ask the person who runs ${brand.name} to check it.`}
      >
        <div className="flex justify-center py-2">
          <SignOutButton signOut={signOut} />
        </div>
      </QuietFrame>
    );
  }

  return (
    <AuthFrame title="Staff sign in" description="Use your staff email and password.">
      <TurnstileScope>
        <StaffSignInForm action={signInStaff} passwordChanged={(await searchParams).notice === "password-changed"} />
      </TurnstileScope>
    </AuthFrame>
  );
}
