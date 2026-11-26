/**
 * What a customer is told to do when the team has added her as a tester for Instagram or Facebook, in one place so the email and the banner
 * always say the same. The menu names differ by network and by which Meta app the posting service uses (`classic`: the first app, Instagram
 * testers by Instagram username; `unified`: the verified company's app, where Instagram goes through Facebook Login and the tester role is on a
 * Facebook account).
 */
export type MetaAppMode = "classic" | "unified";
export type LinkNetwork = "instagram" | "facebook";

/** The mode from the META_APP_MODE setting; the first app when it is unset or anything else. */
export function metaAppModeOf(setting: string | undefined): MetaAppMode {
  return setting?.trim().toLowerCase() === "unified" ? "unified" : "classic";
}

/** The networks that need the personal Facebook profile of the person who manages the account, from PERSON_PROFILE_NETWORKS (a comma list). */
export function personProfileNetworksOf(setting: string | undefined): readonly LinkNetwork[] {
  const networks: LinkNetwork[] = [];
  for (const part of (setting ?? "").split(",")) {
    const name = part.trim().toLowerCase();
    if ((name === "instagram" || name === "facebook") && !networks.includes(name)) networks.push(name);
  }
  return networks;
}

/**
 * Where the invite waits, for each network and app mode. PLACEHOLDER: `confirmed: false` entries are our best guess at Meta's menu names
 * and must be checked on Meta's current screens by the owner before customers see them. Change the wording here only.
 */
const MENUS: Readonly<Record<LinkNetwork, Readonly<Record<MetaAppMode, { readonly where: string; readonly confirmed: boolean }>>>> = {
  instagram: {
    classic: { where: "Instagram, then Settings, then Website permissions, then Apps and websites, then Tester invites", confirmed: false },
    unified: { where: "Facebook, then Settings, then Business integrations, then Pending invites (the Facebook account linked to your Instagram)", confirmed: false },
  },
  facebook: {
    classic: { where: "Facebook, then Settings, then Business integrations, then Pending invites", confirmed: false },
    unified: { where: "Facebook, then Settings, then Business integrations, then Pending invites", confirmed: false },
  },
};

export const NETWORK_LABELS: Readonly<Record<LinkNetwork, string>> = { instagram: "Instagram", facebook: "Facebook" };

export interface InviteSteps {
  readonly heading: string;
  readonly steps: readonly string[];
  /** False while Meta's menu names for this pair are still a placeholder. */
  readonly confirmed: boolean;
}

/** The steps for one network in one app mode: accept the invite, press Allow here, press Allow on Meta's screen. */
export function inviteSteps(network: LinkNetwork, mode: MetaAppMode): InviteSteps {
  const label = NETWORK_LABELS[network];
  const menu = MENUS[network][mode];
  return {
    heading: `Your ${label} is ready to connect`,
    steps: [
      `Accept the invite from Meta. It waits in ${menu.where}.`,
      `Come back to Brandbasket, open Social media, and press Allow ${label}.`,
      `Meta shows a permission screen. Press Allow there too.`,
    ],
    confirmed: menu.confirmed,
  };
}

/** Every network and mode whose menu names are not confirmed yet, for the owner's checklist. */
export function unconfirmedMenus(): readonly string[] {
  return (Object.keys(MENUS) as LinkNetwork[]).flatMap((network) => (Object.keys(MENUS[network]) as MetaAppMode[]).filter((mode) => !MENUS[network][mode].confirmed).map((mode) => `${network}:${mode}`));
}
