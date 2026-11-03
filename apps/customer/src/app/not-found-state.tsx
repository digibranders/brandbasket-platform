import { EmptyState, LinkButton } from "@/ui";

/** What every 404 says. The root 404 wraps it in its own main; inside a frame that already has a main it stands alone. */
export function NotFoundState() {
  return (
    <EmptyState
      icon="MagnifyingGlass"
      title="This page does not exist"
      description="The address may be old or mistyped. Everything in your account is where you left it."
      action={
        <LinkButton href="/" variant="primary">
          Go to Home
        </LinkButton>
      }
    />
  );
}
