import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => "macos"),
  setAppIcon: vi.fn(),
  applyAppIconPreference: vi.fn(),
  appIcon: "default",
  theme: "system",
  appIdentifier: "com.hyprnote.stable" as string | undefined,
  billing: {
    isPro: true,
    isUpgradingToPro: false,
    upgradeToPro: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.appIdentifier }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: mocks.platform,
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: () => mocks.setAppIcon,
}));

vi.mock("~/auth/billing-context", () => ({
  useBillingAccess: () => mocks.billing,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) =>
    key === "theme" ? mocks.theme : mocks.appIcon,
}));

vi.mock("~/shared/theme/provider", () => ({
  applyAppIconPreference: mocks.applyAppIconPreference,
}));

import { AppIconSelector } from "./app-icon";

describe("AppIconSelector", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.platform.mockReturnValue("macos");
    mocks.appIcon = "default";
    mocks.theme = "system";
    mocks.appIdentifier = "com.hyprnote.stable";
    mocks.billing.isPro = true;
    mocks.billing.isUpgradingToPro = false;
  });

  const iconOptions = () =>
    within(screen.getByRole("radiogroup", { name: "App icon" })).getAllByRole(
      "radio",
    );

  it("applies and stores the selected icon", () => {
    render(<AppIconSelector />);

    const defaultOption = screen.getByRole("radio", { name: "Default" });
    expect(defaultOption.getAttribute("aria-checked")).toBe("true");
    expect(
      defaultOption
        .querySelector('source[media="(prefers-color-scheme: dark)"]')
        ?.getAttribute("srcset"),
    ).toBe("/assets/app-icons/stable-dark.png");
    expect(defaultOption.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/app-icons/stable-light.png",
    );
    expect(iconOptions()).toHaveLength(16);
    expect(screen.queryByRole("radio", { name: "Production" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Anagram" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Blueprint" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Sketch" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Field Journal" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Notepad" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Stone" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Typewriter Key" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Walnut" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Aurora" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Sunrise" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Ember" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Bloom" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Rainforest" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Ocean" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Twilight" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Orchid" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Ruby" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Amber" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Citrine" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Emerald" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Sapphire" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Indigo" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Amethyst" })).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "Aurora" }));

    expect(mocks.applyAppIconPreference).toHaveBeenCalledWith(
      "aurora",
      "system",
    );
    expect(mocks.setAppIcon).toHaveBeenCalledWith("aurora");
  });

  it("offers a Pro upgrade instead of changing icons on the free plan", () => {
    mocks.billing.isPro = false;

    render(<AppIconSelector />);

    const defaultOption = screen.getByRole("radio", { name: "Default" });
    const auroraOption = screen.getByRole("radio", { name: "Aurora" });
    expect(defaultOption.getAttribute("aria-disabled")).toBe("false");
    expect(auroraOption.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(auroraOption);

    expect(mocks.billing.upgradeToPro).toHaveBeenCalledOnce();
    expect(mocks.applyAppIconPreference).not.toHaveBeenCalled();
    expect(mocks.setAppIcon).not.toHaveBeenCalled();
  });

  it("previews both schemes for the system theme", () => {
    render(<AppIconSelector />);

    expect(
      screen
        .getByRole("radio", { name: "Default" })
        .querySelector('source[media="(prefers-color-scheme: dark)"]'),
    ).not.toBeNull();

    const auroraOption = screen.getByRole("radio", { name: "Aurora" });
    expect(auroraOption.querySelector("source")).toBeNull();
    expect(auroraOption.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/app-icons/aurora.png",
    );
  });

  it("uses the stable icon while the app identifier is loading", () => {
    mocks.appIdentifier = undefined;

    render(<AppIconSelector />);

    const defaultOption = screen.getByRole("radio", { name: "Default" });
    expect(defaultOption.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/app-icons/stable-light.png",
    );
  });

  it("pins previews to an explicit theme", () => {
    mocks.theme = "dark";

    render(<AppIconSelector />);

    const defaultOption = screen.getByRole("radio", { name: "Default" });
    expect(
      defaultOption.querySelector(
        'source[media="(prefers-color-scheme: dark)"]',
      ),
    ).toBeNull();
    expect(defaultOption.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/app-icons/stable-dark.png",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Aurora" }));

    expect(mocks.applyAppIconPreference).toHaveBeenCalledWith("aurora", "dark");
  });

  it("previews the current channel icon for the default option", () => {
    mocks.appIdentifier = "com.hyprnote.staging";

    render(<AppIconSelector />);

    const defaultOption = screen.getByRole("radio", { name: "Default" });
    expect(defaultOption.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/app-icons/staging-light.png",
    );
  });

  it("selects default for an equivalent channel-specific preference", () => {
    mocks.appIcon = "stable";

    render(<AppIconSelector />);

    expect(
      screen
        .getByRole("radio", { name: "Default" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("is hidden on platforms that cannot change the running app icon", () => {
    mocks.platform.mockReturnValue("windows");

    render(<AppIconSelector />);

    expect(screen.queryByText("App icon")).toBeNull();
  });
});
