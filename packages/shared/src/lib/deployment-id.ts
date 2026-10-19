/**
 * The id of the release this build is part of, for Next's version skew protection (`deploymentId`). The VPS unpacks
 * every deploy into /srv/brandbasket/releases/<commit>[+rebuild], builds there and runs from there, so the commit in the working
 * directory is the same at build time and at run time, on every instance. Elsewhere (a laptop, CI) there is none, and
 * protection stays off. NEXT_DEPLOYMENT_ID, when set, wins.
 */
const RELEASE_DIRECTORY = /\/releases\/([0-9a-f]{7,40})(?:\+(\d+))?(?:\/|$)/;

export function deploymentIdOf(workingDirectory: string, configured: string | undefined): string | undefined {
  const fromEnvironment = configured?.trim();
  if (fromEnvironment) return fromEnvironment;
  const release = RELEASE_DIRECTORY.exec(workingDirectory);
  if (!release) return undefined;
  return release[2] === undefined ? release[1] : `${release[1]}-${release[2]}`;
}
