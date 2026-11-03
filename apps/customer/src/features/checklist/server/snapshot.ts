import "server-only";
import {
  findOpenProject,
  getBusinessHours,
  getBusinessProfile,
  getPrimaryDomain,
  getProjectBrief,
  listMediaAssets,
  listServices,
  listStepProgress,
  type ScopedTransaction,
} from "@brandbasket/db";
import { completedStepKeys, isOnboardingLocked, openingHoursFromRows, type OnboardingSnapshot } from "../rules-snapshot";

/** Reads everything the customer has sent so far. Takes the caller's tenant-scoped transaction; a failed read throws. */
export async function readOnboardingSnapshot(tx: ScopedTransaction): Promise<OnboardingSnapshot> {
  const project = await findOpenProject(tx);
  const locked = isOnboardingLocked(project);
  const progress = project === null ? [] : await listStepProgress(tx, project.id);
  const profile = await getBusinessProfile(tx);
  const hours = openingHoursFromRows(await getBusinessHours(tx));
  const services = await listServices(tx);
  const brief = project === null ? null : await getProjectBrief(tx, project.id);
  const domain = await getPrimaryDomain(tx);
  const logos = await listMediaAssets(tx, "logo");
  const photos = await listMediaAssets(tx, "photo");
  return {
    project,
    locked,
    completed: completedStepKeys(progress, locked),
    profile,
    hours,
    services,
    brief,
    domain,
    // Uploading a logo replaces the old one; if two ever overlap, the newest is the one the customer last chose.
    logo: logos.at(-1) ?? null,
    photos,
  };
}
