import type { ErrorOperation } from "@fynix/shared/lib/error-report";

/** The part of Next's error context this hook reads. */
export interface RequestErrorContext {
  readonly routeType: "render" | "route" | "action" | "proxy";
  readonly routePath: string;
}

export interface RequestErrorTargets {
  /** Sends the error to Sentry (a no-op without a DSN). */
  readonly sentry: () => void;
  /** Sends the filtered copy to the native staff inbox. Only called on the Node.js runtime. */
  readonly native: (operation: ErrorOperation) => Promise<unknown>;
}

const OPERATIONS: Readonly<Record<RequestErrorContext["routeType"], ErrorOperation>> = {
  action: "server_action",
  route: "server_route",
  proxy: "server_proxy",
  render: "server_render",
};

export function requestErrorOperation(routeType: RequestErrorContext["routeType"]): ErrorOperation {
  return OPERATIONS[routeType];
}

/**
 * Reports one server error to both places: Sentry and the native staff inbox. Each is tried on its own, so a failure
 * in one never stops the other and nothing here can replace the original error. The collector route is left out of
 * the native copy, so a failing collector cannot report itself in a loop.
 */
export async function reportRequestError(
  request: { readonly path: string },
  context: RequestErrorContext,
  runtime: string | undefined,
  targets: RequestErrorTargets,
): Promise<void> {
  try {
    targets.sentry();
  } catch {
    /* Monitoring failure must never replace the original failure. */
  }
  if (runtime !== "nodejs" || request.path.split("?", 1)[0] === "/api/error-reports") return;
  try {
    await targets.native(requestErrorOperation(context.routeType));
  } catch {
    /* Monitoring failure must never replace the original failure. */
  }
}
