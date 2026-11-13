import { NotFoundState } from "./not-found-state";

/** The branded 404 for unmatched addresses, with a real 404 status. notFound() inside the workspace or the pay frame has its own. */
export default function NotFound() {
  return (
    <main id="page" className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <NotFoundState />
    </main>
  );
}
