import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSettingValues: vi.fn(),
  authenticate: vi.fn(),
  refreshAvailability: vi.fn(),
  lockApp: vi.fn(),
  available: true as boolean | null,
  authenticating: false,
  platform: "macos" as string,
  values: {
    telemetry_consent: true,
    crash_reporting_consent: false,
    lock_app: false,
    baa_approved_ai_providers: "[]",
    current_llm_provider: "openai" as string | undefined,
    current_stt_provider: undefined as string | undefined,
    current_stt_model: undefined as string | undefined,
  },
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => mocks.platform,
}));

const queryState = vi.hoisted(() => ({ isLoading: false }));

vi.mock("~/settings/queries", () => ({
  useSetSettingValues: () => mocks.setSettingValues,
  useStoredSettingValuesQuery: () =>
    queryState.isLoading
      ? { data: undefined, isLoading: true, error: null }
      : {
          data: {
            values: mocks.values,
            hasValues: new Set([
              "telemetry_consent",
              "crash_reporting_consent",
              "lock_app",
              "baa_approved_ai_providers",
              "current_llm_provider",
            ]),
          },
          isLoading: false,
          error: null,
        },
}));

vi.mock("~/settings/providers", () => ({
  // The real useAiProvider calls real hooks internally (useLiveQuery,
  // useQuery), which participate in React's hook-order bookkeeping for
  // whatever component calls it. A mock that just returns a value with no
  // hook call of its own would silently hide any hook-order bug in the
  // caller, so this stub calls useState to faithfully occupy a hook slot.
  useAiProvider: () => {
    useState(undefined);
    return undefined;
  },
}));

vi.mock("~/lock/store", () => ({
  useAppLock: (selector: (state: typeof mocks) => unknown) =>
    selector({
      available: mocks.available,
      authenticating: mocks.authenticating,
      authenticate: mocks.authenticate,
      refreshAvailability: mocks.refreshAvailability,
      lockApp: mocks.lockApp,
    } as never),
}));

import { SettingsPrivacy } from ".";

describe("SettingsPrivacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.telemetry_consent = true;
    mocks.values.crash_reporting_consent = false;
    mocks.values.lock_app = false;
    mocks.values.baa_approved_ai_providers = "[]";
    mocks.values.current_llm_provider = "openai";
    mocks.values.current_stt_provider = undefined;
    mocks.values.current_stt_model = undefined;
    mocks.available = true;
    mocks.authenticating = false;
    mocks.platform = "macos";
    mocks.authenticate.mockResolvedValue(true);
    mocks.refreshAvailability.mockResolvedValue(true);
    queryState.isLoading = false;
  });

  afterEach(cleanup);

  it("controls PostHog and Sentry independently", () => {
    render(<SettingsPrivacy />);

    const posthog = screen.getByRole("switch", {
      name: "Share usage data (PostHog)",
    });
    const sentry = screen.getByRole("switch", { name: "Sentry" });

    expect(posthog.getAttribute("data-state")).toBe("checked");
    expect(sentry.getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(posthog);
    fireEvent.click(sentry);

    expect(mocks.setSettingValues).toHaveBeenNthCalledWith(1, {
      telemetry_consent: false,
    });
    expect(mocks.setSettingValues).toHaveBeenNthCalledWith(2, {
      crash_reporting_consent: true,
    });
  });

  it("requires device authentication before locking the app", async () => {
    render(<SettingsPrivacy />);

    fireEvent.click(screen.getByRole("switch", { name: "Lock app" }));

    await waitFor(() => {
      expect(mocks.authenticate).toHaveBeenCalled();
      expect(mocks.setSettingValues).toHaveBeenCalledWith({ lock_app: true });
      expect(mocks.lockApp).toHaveBeenCalled();
    });
  });

  it("stores an exact provider and service approval", () => {
    render(<SettingsPrivacy />);

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Approve OpenAI for clinical language model data",
      }),
    );

    expect(mocks.setSettingValues).toHaveBeenCalledWith({
      baa_approved_ai_providers: '["llm:openai"]',
    });
  });

  it("does not crash when the settings query briefly re-enters a loading state after a toggle", () => {
    // Regression test: toggling a switch writes through useSetSettingValues,
    // and the underlying live query can transiently report isLoading with
    // no data before the write settles. Every hook in this component must
    // still run in the same order across that transition — previously
    // useAiProvider was called after an early loading-state return, which
    // crashed the whole screen the moment this exact transition occurred.
    const view = render(<SettingsPrivacy />);

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Approve OpenAI for clinical language model data",
      }),
    );

    queryState.isLoading = true;
    expect(() => view.rerender(<SettingsPrivacy />)).not.toThrow();

    queryState.isLoading = false;
    expect(() => view.rerender(<SettingsPrivacy />)).not.toThrow();

    expect(
      screen.getByRole("switch", {
        name: "Approve OpenAI for clinical language model data",
      }),
    ).toBeTruthy();
  });
});
