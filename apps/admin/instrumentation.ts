import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // A console real staff can reach must not start with settings missing or the code bypass set.
  const { assertRuntimeEnvironment } = await import("@fynix/shared/server/runtime-environment");
  const { runtimeRequirements } = await import("@fynix/shared/lib/production-requirements");
  assertRuntimeEnvironment(process.env, runtimeRequirements("admin"));
  // The robot check on the staff sign-in stays off, with a note in the log, until its keys are set.
  const { warnIfTurnstileUnconfigured } = await import("@fynix/shared/server/turnstile-request");
  warnIfTurnstileUnconfigured();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || request.path.split("?", 1)[0] === "/api/error-reports") return;
  try {
    const { reportServerError } = await import("./lib/server/error-report");
    const operation = context.routeType === "action" ? "server_action" : context.routeType === "route" ? "server_route" : context.routeType === "proxy" ? "server_proxy" : "server_render";
    await reportServerError(error, { app: "admin", operation, route: context.routePath });
  } catch { /* Monitoring failure must never replace the original failure. */ }
};

