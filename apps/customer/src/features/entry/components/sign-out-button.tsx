import { Button } from "@/ui";
import { signOutAction } from "../actions";

/** Signs this device out. A form, so it works before the page's script has loaded. */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" icon="SignOut">
        Sign out
      </Button>
    </form>
  );
}
