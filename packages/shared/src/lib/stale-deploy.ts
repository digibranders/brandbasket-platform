/** Missing-action responses reject the submission before its server handler runs. */
export function isStaleDeployError(error: { readonly name?: string; readonly message?: string }): boolean {
  return error.name === "UnrecognizedActionError" || /Server Action .* was not found on the server/.test(error.message ?? "");
}

/** Fetch the current page only when the visitor chooses to reload. */
export function reloadForDeploymentUpdate(): void {
  window.location.reload();
}
