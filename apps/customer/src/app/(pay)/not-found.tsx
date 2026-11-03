import { NotFoundState } from "../not-found-state";

/** notFound() inside this frame: the frame already has the page's main, so the 404 adds none of its own. */
export default function NotFound() {
  return (
    <div className="flex justify-center py-12">
      <NotFoundState />
    </div>
  );
}
