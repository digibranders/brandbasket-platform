import "server-only";
import { getCustomerTenant } from "./customer-tenant";
import { getAppDb, getStaffDb } from "./db";
import { serverEnv } from "./env";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { checkVideoProgress, consumeVideoAllowance, listingVideoDeps, requestVideoUpload, videoUploadAccess } from "./listing-videos";
import type { VideoRequestDeps } from "./listing-video-request";
import { allowsAnyLocalHost } from "@/lib/surfaces";

/** The two video routes' dependencies, wired to the session, the database and Vimeo. */
export function videoRequestDeps(): VideoRequestDeps {
  const videos = listingVideoDeps(getStaffDb());
  return {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    videoAccess: (tenant) => videoUploadAccess(getAppDb(), tenant),
    consumeAllowance: (tenant) => consumeVideoAllowance(getAppDb(), tenant),
    requestUpload: (tenant, slot, size) => requestVideoUpload(videos, tenant, slot, size, new Date()),
    checkProgress: (tenant, videoId) => checkVideoProgress(videos, tenant, videoId, new Date()),
    log: (message, error) => {
      console.error(`[fynix:videos] ${message}`, errorLogInfo(error));
    },
  };
}
