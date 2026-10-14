import { handleVideoUploadRequest } from "@/lib/server/listing-video-request";
import { videoRequestDeps } from "@/lib/server/listing-video-routes";

/**
 * A Premium member's videos: `POST /api/listing-videos` with `{ slot, size }` asks for an upload. We make an empty
 * unlisted video on Vimeo and answer with the address the browser sends the file to; the file never passes through us
 * (see handleVideoUploadRequest for the checks and their order, and lib/server/listing-videos.ts for the whole flow).
 * Under /api/ for the same reasons as /api/uploads: proxy.ts skips the prefix, and the handler checks the Host itself.
 */
export async function POST(request: Request): Promise<Response> {
  return handleVideoUploadRequest(request, videoRequestDeps());
}
