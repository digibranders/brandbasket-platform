export function supportSubmissionsEnabled(mode: string | undefined, accountIds: string | undefined, userId: string | null): boolean {
  if (mode === undefined || mode === "on") return true;
  if (mode !== "internal" || userId === null) return false;
  return (accountIds ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}
