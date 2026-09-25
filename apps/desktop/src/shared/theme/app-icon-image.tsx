import { useQuery } from "@tanstack/react-query";
import { getIdentifier } from "@tauri-apps/api/app";

import {
  hasDarkAppIconVariant,
  normalizeAppIconPreference,
  resolveAppIconName,
} from "./icon";
import type { ThemePreference } from "./resolve";

import { useConfigValue } from "~/shared/config";

// Renders the user's chosen App Icon (Settings → Appearance → App icon) as
// an <img>, following the same theme-aware light/dark variant selection as
// the real Dock icon (see resolveDockIconName in icon.ts) — for anywhere
// else in the app that should visually match the icon the user picked,
// like the floating Ask Mentari launcher.
export function AppIconImage({ className }: { className?: string }) {
  const appIconPreference = normalizeAppIconPreference(
    useConfigValue("app_icon"),
  );
  const storedTheme = useConfigValue("theme") as ThemePreference;
  const theme: ThemePreference =
    storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  const { data: appIdentifier = "com.hyprnote.stable" } = useQuery({
    queryKey: ["tauri", "app-identifier"],
    queryFn: getIdentifier,
    staleTime: Infinity,
  });

  const name = resolveAppIconName(appIconPreference, appIdentifier);
  const hasDarkVariant = hasDarkAppIconVariant(name);

  if (theme === "system" && hasDarkVariant) {
    return (
      <picture>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={`/assets/app-icons/${name}-dark.png`}
        />
        <img
          src={`/assets/app-icons/${name}-light.png`}
          alt=""
          draggable={false}
          className={className}
        />
      </picture>
    );
  }

  return (
    <img
      src={`/assets/app-icons/${name}${hasDarkVariant ? `-${theme}` : ""}.png`}
      alt=""
      draggable={false}
      className={className}
    />
  );
}
