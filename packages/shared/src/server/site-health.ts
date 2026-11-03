import { connect } from "node:tls";
import { findSiteCheckState, insertSiteCheck, listLiveWebsites, PHONE_SPEED_FAILED, type Database, type SiteHealthWebsite } from "@brandbasket/db";
import { siteDownAlertEmail, type EmailTransport } from "@brandbasket/email";
import {
  alertTimeWords,
  CERTIFICATE_TIMEOUT_MS,
  errorText,
  fetchFailureText,
  HTTP_TIMEOUT_MS,
  inPool,
  PAGESPEED_TIMEOUT_MS,
  pageSpeedRequestUrl,
  parsePageSpeed,
  resultFromHttpStatus,
  SITE_CHECK_CONCURRENCY,
  siteUrl,
  speedDue,
  startsOutage,
  type PhoneSpeed,
  type SiteResult,
} from "./site-health-rules";

/*
 * The site health job (plan 61, Phase 12): every live customer website is fetched over https, its certificate's end date is
 * read, and once a day its phone speed comes from Google PageSpeed Insights. Each check is one site_checks row. A site that
 * goes from up to down for two checks in a row sends staff one email. Run by apps/platform/scripts/site-health-run.ts on the
 * staff connection. It imports nothing server-only, so a plain script can run it.
 */

const USER_AGENT = "BrandbasketSiteHealth/1.0 (+https://brandbasket.in)";

/** The network, injected so the job is tested without it. */
export interface SiteHealthProbes {
  readonly fetch: typeof fetch;
  readonly certificateExpiry: (hostname: string) => Promise<Date>;
}

export interface SiteHealthConfig {
  readonly transport: EmailTransport;
  /** The team mailbox the down alert goes to. */
  readonly alertTo: string;
  /** The console's origin, for the link to the client. */
  readonly adminOrigin: string;
  readonly pageSpeedKey: string | null;
  readonly now?: () => Date;
  readonly probes?: SiteHealthProbes;
}

export interface SiteHealthReport {
  readonly sites: number;
  readonly up: number;
  readonly down: number;
  /** Sites whose check failed on our side (stored as status error, or not stored at all). */
  readonly errors: number;
  readonly speedChecks: number;
  readonly alertsSent: number;
  readonly alertsFailed: number;
}

/** Reads the end date of the certificate the site presents. It does not judge the certificate: an expired one is still read. */
export function readCertificateExpiry(hostname: string): Promise<Date> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: CERTIFICATE_TIMEOUT_MS }, () => {
      const validTo = socket.getPeerCertificate().valid_to;
      socket.end();
      const expiresAt = new Date(validTo);
      if (Number.isNaN(expiresAt.getTime())) reject(new Error("The certificate has no end date"));
      else resolve(expiresAt);
    });
    socket.on("timeout", () => socket.destroy(new Error(`Timed out after ${String(CERTIFICATE_TIMEOUT_MS / 1000)} seconds`)));
    socket.on("error", reject);
  });
}

const NETWORK: SiteHealthProbes = { fetch: (input, init) => fetch(input, init), certificateExpiry: readCertificateExpiry };

interface HttpProbe {
  readonly result: SiteResult;
  readonly httpStatus: number | null;
  readonly responseMs: number | null;
  readonly failure: string | null;
}

async function probeHttp(probes: SiteHealthProbes, url: string): Promise<HttpProbe> {
  const started = performance.now();
  try {
    const response = await probes.fetch(url, { redirect: "follow", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: { "user-agent": USER_AGENT } });
    const responseMs = Math.round(performance.now() - started);
    await response.body?.cancel();
    return { result: resultFromHttpStatus(response.status), httpStatus: response.status, responseMs, failure: null };
  } catch (error) {
    // No answer at all (timeout, DNS, refused, a certificate the fetch rejects): the site is down for its visitors.
    return { result: "down", httpStatus: null, responseMs: null, failure: fetchFailureText(error) };
  }
}

async function measurePhoneSpeed(probes: SiteHealthProbes, url: string, key: string | null): Promise<PhoneSpeed> {
  const response = await probes.fetch(pageSpeedRequestUrl(url, key), { signal: AbortSignal.timeout(PAGESPEED_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`PageSpeed answered ${String(response.status)}`);
  return parsePageSpeed(await response.json());
}

type Outcome = { readonly kind: "checked"; readonly result: SiteResult; readonly speed: boolean; readonly alert: "sent" | "failed" | null } | { readonly kind: "error" };

async function sendDownAlert(config: SiteHealthConfig, site: SiteHealthWebsite, url: string, downSince: Date, latest: HttpProbe): Promise<"sent" | "failed"> {
  try {
    await config.transport.send(
      siteDownAlertEmail({
        to: config.alertTo,
        businessName: site.businessName,
        url,
        downSince: alertTimeWords(downSince),
        lastResult: latest.httpStatus === null ? (latest.failure ?? "No answer") : `HTTP ${String(latest.httpStatus)}`,
        clientUrl: new URL(`/clients/${site.businessId}`, config.adminOrigin).toString(),
      }),
    );
    return "sent";
  } catch (error) {
    console.error("[site-health] The down alert was not sent", { businessId: site.businessId, error: error instanceof Error ? error.message : String(error) });
    return "failed";
  }
}

async function checkSite(db: Database, config: SiteHealthConfig, probes: SiteHealthProbes, site: SiteHealthWebsite): Promise<Outcome> {
  const now = (config.now ?? (() => new Date()))();
  const url = siteUrl(site.hostname);
  try {
    const state = await findSiteCheckState(db, site.businessId);
    const [http, certificate] = await Promise.all([
      probeHttp(probes, url),
      probes.certificateExpiry(site.hostname).then(
        (expiresAt) => ({ expiresAt, failure: null }),
        (error: unknown) => ({ expiresAt: null, failure: `Certificate read failed: ${error instanceof Error ? error.message : String(error)}` }),
      ),
    ]);
    let speed: PhoneSpeed | null = null;
    let speedFailure: string | null = null;
    const speedTried = http.result === "up" && speedDue(state.lastSpeedAttemptAt, now);
    if (speedTried) {
      try {
        speed = await measurePhoneSpeed(probes, url, config.pageSpeedKey);
      } catch (error) {
        speedFailure = `${PHONE_SPEED_FAILED}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    await insertSiteCheck(db, {
      businessId: site.businessId,
      checkedAt: now,
      url,
      status: http.result,
      httpStatus: http.httpStatus,
      responseMs: http.responseMs,
      sslExpiresAt: certificate.expiresAt,
      phoneSpeedScore: speed?.score ?? null,
      phoneLcpMs: speed?.lcpMs ?? null,
      error: errorText([http.failure, certificate.failure, speedFailure]),
    });
    const previous = state.recent[0];
    const alert =
      previous !== undefined && startsOutage([http.result, ...state.recent.map((row) => row.status)]) ? await sendDownAlert(config, site, url, previous.checkedAt, http) : null;
    return { kind: "checked", result: http.result, speed: speedTried, alert };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[site-health] Check failed", { businessId: site.businessId, error: message });
    try {
      await insertSiteCheck(db, { businessId: site.businessId, checkedAt: now, url, status: "error", error: errorText([message]) });
    } catch (recordError) {
      console.error("[site-health] The failed check was not recorded", { businessId: site.businessId, error: recordError instanceof Error ? recordError.message : String(recordError) });
    }
    return { kind: "error" };
  }
}

/** Checks every live website, four at a time. A failure for one site is stored as its error row and never stops the run. */
export async function runSiteHealth(db: Database, config: SiteHealthConfig): Promise<SiteHealthReport> {
  const probes = config.probes ?? NETWORK;
  const sites = await listLiveWebsites(db);
  const outcomes = await inPool(sites, SITE_CHECK_CONCURRENCY, (site) => checkSite(db, config, probes, site));
  const checked = outcomes.filter((outcome) => outcome.kind === "checked");
  return {
    sites: sites.length,
    up: checked.filter((outcome) => outcome.result === "up").length,
    down: checked.filter((outcome) => outcome.result === "down").length,
    errors: outcomes.length - checked.length,
    speedChecks: checked.filter((outcome) => outcome.speed).length,
    alertsSent: checked.filter((outcome) => outcome.alert === "sent").length,
    alertsFailed: checked.filter((outcome) => outcome.alert === "failed").length,
  };
}
