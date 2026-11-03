import { EmptyState, LinkButton } from "@/ui";

/** The branded 404. Rendered for unmatched addresses and notFound(), with a real 404 status. */
export default function NotFound() {
  return (
    <main id="page" className="flex min-h-dvh items-center justify-center bg-canvas px-4">
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
    </main>
  );
}
