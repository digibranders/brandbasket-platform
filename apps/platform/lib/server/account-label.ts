import "server-only";
import type { SessionUser } from "@fynix/shared/lib/access";
import { displayPhone } from "@fynix/shared/server/phone-display";

/**
 * What an account is known by on screen: the mobile number it signs in with, or its email. An account opened with a
 * number has only a placeholder address, which is never shown.
 */
export function accountLabel(user: Pick<SessionUser, "email" | "phone">): string {
  return user.phone === null ? user.email : displayPhone(user.phone).text;
}
