import { handleVideoFinishRequest } from "@/lib/server/listing-video-request";
import { videoRequestDeps } from "@/lib/server/listing-video-routes";

/**
 * `POST /api/listing-videos/<id>/finish`: where a video's upload stands. The dashboard asks every few seconds after it
 * has sent the file to Vimeo, until the video is live or has been given up. The last answer takes the video live, so
 * this is a POST (Origin-checked like the other upload routes), not a GET.
 */
export async function POST(request: Request, context: RouteContext<"/api/listing-videos/[videoId]/finish">): Promise<Response> {
  const { videoId } = await context.params;
  return handleVideoFinishRequest(request, videoRequestDeps(), videoId);
}
