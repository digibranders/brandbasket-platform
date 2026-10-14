import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { SignInForm } from "@fynix/shared/ui/panel/sign-in-form";
import { TurnstileScope } from "@fynix/shared/ui/turnstile-scope";
import { SignOutButton } from "@fynix/shared/ui/panel/sign-out-button";
import { QuietFrame } from "@/components/console/quiet-frame";
import { signOut } from "@/lib/server/sign-out";
import { getStaffAccess } from "@/lib/server/staff-access";
import { adminBrand } from "@/lib/brand";
import { signInStaff } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage(): Promise<ReactElement> {
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
    <QuietFrame
      title={
        <>
          Staff <em>sign-in.</em>
        </>
      }
      lede={`For the ${brand.name} team. Customers sign in to their own dashboard.`}
    >
      <TurnstileScope>
        <SignInForm action={signInStaff} turnstileAction="staff_sign_in" submitLabel="Sign in" />
      </TurnstileScope>
    </QuietFrame>
  );
}
