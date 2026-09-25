import { resolveIsDarkMode, type ThemePreference } from "./resolve";

export type AppIconPreference =
  | "default"
  | "stable"
  | "anagram"
  | "dev"
  | "staging"
  | "journal"
  | "notepad"
  | "stone"
  | "typewriter-key"
  | "walnut"
  | "aurora"
  | "sunrise"
  | "ember"
  | "bloom"
  | "rainforest"
  | "ocean"
  | "twilight"
  | "orchid"
  | "ruby"
  | "amber"
  | "citrine"
  | "emerald"
  | "sapphire"
  | "indigo"
  | "amethyst";

export function normalizeAppIconPreference(
  value: string | null | undefined,
): AppIconPreference {
  switch (value) {
    case "stable":
    case "anagram":
    case "dev":
    case "staging":
    case "journal":
    case "notepad":
    case "stone":
    case "typewriter-key":
    case "walnut":
    case "aurora":
    case "sunrise":
    case "ember":
    case "bloom":
    case "rainforest":
    case "ocean":
    case "twilight":
    case "orchid":
    case "ruby":
    case "amber":
    case "citrine":
    case "emerald":
    case "sapphire":
    case "indigo":
    case "amethyst":
      return value;
    default:
      return "default";
  }
}

export function resolveAppIconName(
  icon: AppIconPreference,
  appIdentifier: string,
): Exclude<AppIconPreference, "default"> {
  if (icon !== "default") {
    return icon;
  }
  if (appIdentifier.endsWith(".dev")) {
    return "dev";
  }
  if (appIdentifier.endsWith(".staging")) {
    return "staging";
  }
  return "stable";
}

/** `systemIsDark` is the Dock's appearance, used when the theme follows the system. */
export function resolveDockIconName(
  icon: AppIconPreference,
  theme: ThemePreference,
  systemIsDark: boolean,
  appIdentifier: string,
): string {
  const name = resolveAppIconName(icon, appIdentifier);
  return hasDarkAppIconVariant(name) && resolveIsDarkMode(theme, systemIsDark)
    ? `${name}-dark`
    : name;
}

export function hasDarkAppIconVariant(
  name: Exclude<AppIconPreference, "default">,
): boolean {
  return (
    name === "stable" ||
    name === "anagram" ||
    name === "dev" ||
    name === "staging"
  );
}
