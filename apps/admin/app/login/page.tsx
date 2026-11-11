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
            No staff <em>access.</em>
          </>
        }
        lede={`${access.user.email} is signed in, but it isn’t a ${brand.name} staff account. Sign out and use your staff account instead.`}
      >
        <div className="flex justify-center py-2">
          <SignOutButton signOut={signOut} />
        </div>
      </QuietFrame>
    );
  }

  return (
    <AuthFrame title="Welcome back." description="Sign in to keep good things moving.">
      <TurnstileScope>
        <StaffSignInForm action={signInStaff} passwordChanged={(await searchParams).notice === "password-changed"} />
      </TurnstileScope>
    </AuthFrame>
  );
}
