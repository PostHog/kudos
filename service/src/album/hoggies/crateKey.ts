const droppingKinds = ["weekly", "journey", "group", "unlock", "bought", "thoughtful", "level", "welcome", "team", "milestone", "forge", "quest", "hug-find"] as const;

export type CrateKind = (typeof droppingKinds)[number];

export type CrateKey = `${CrateKind}:${string}`;

export function crateKindOf(crate: string): string {
  return crate.slice(0, crate.indexOf(":"));
}

export function dropsAHoggie(crate: string): crate is CrateKey {
  return (droppingKinds as readonly string[]).includes(crateKindOf(crate));
}

export function kindOf(crate: CrateKey): CrateKind {
  return crateKindOf(crate) as CrateKind;
}
