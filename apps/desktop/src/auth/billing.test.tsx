import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canStartTrial as canStartTrialApi,
  startTrial as startTrialApi,
} from "@anlg/api-client";
import { commands as authCommands } from "@anlg/plugin-auth";

import * as billingProviderModule from "./billing";
import { useBillingAccess } from "./billing-context";

const { BillingProvider } = billingProviderModule;

const refreshSession = vi.fn();
const authState = vi.hoisted(() => ({
  session: {
    access_token: "stale-token",
    user: { id: "user-1", email: "test@example.com" },
  } as
    | {
        access_token: string;
        user: { id: string; email: string };
      }
    | null
    | undefined,
}));
const settingsState = vi.hoisted(() => ({
  currentArch: "aarch64",
  currentPlatform: "macos",
  values: {
    current_llm_provider: undefined as string | undefined,
    current_stt_provider: undefined as string | undefined,
    current_stt_model: undefined as string | undefined,
  },
  setSettingValues: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({
    session: authState.session,
    getHeaders: () =>
      authState.session
        ? {
            Authorization: `Bearer ${authState.session.access_token}`,
          }
        : undefined,
    refreshSession,
  }),
}));

vi.mock("@anlg/api-client", () => ({
  canStartTrial: vi.fn(),
  startTrial: vi.fn(),
}));

vi.mock("@anlg/api-client/client", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@anlg/plugin-auth", () => ({
  commands: {
    decodeClaims: vi.fn(),
    getItem: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

vi.mock("@anlg/plugin-opener2", () => ({
  commands: {
    openUrl: vi.fn(),
  },
}));

vi.mock("@anlg/plugin-windows", () => ({
  openUrlWithInstruction: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  arch: () => settingsState.currentArch,
  platform: () => settingsState.currentPlatform,
}));

vi.mock("~/shared/config", () => ({
  useConfigValues: (keys: Array<keyof typeof settingsState.values>) =>
    Object.fromEntries(keys.map((key) => [key, settingsState.values[key]])),
}));

vi.mock("~/settings/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/settings/queries")>();
  return {
    ...actual,
    setSettingValues: settingsState.setSettingValues,
  };
});

vi.mock("~/shared/billing", () => ({
  waitForBillingUpdate: async (refreshSession: () => Promise<unknown>) =>
    refreshSession(),
}));

vi.mock("../billing/trial-ended-dialog", () => ({
  TrialEndedDialog: ({ open }: { open: boolean }) => (
    <div data-open={open ? "true" : "false"} data-testid="trial-ended-dialog" />
  ),
}));

vi.mock("../billing/trial-payment-reminder-dialog", () => ({
  TrialPaymentReminderDialog: ({
    open,
    daysRemaining,
  }: {
    open: boolean;
    daysRemaining: number;
  }) => (
    <div
      data-days-remaining={daysRemaining}
      data-open={open ? "true" : "false"}
      data-testid="trial-payment-reminder-dialog"
    />
  ),
}));

vi.mock("../billing/trial-started-dialog", () => ({
  TrialStartedDialog: ({ open }: { open: boolean }) => (
    <div
      data-open={open ? "true" : "false"}
      data-testid="trial-started-dialog"
    />
  ),
}));

function renderBillingProvider() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    view: render(billingTree(queryClient)),
  };
}

function billingTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <BillingProvider>
        <div>content</div>
        <BillingProbe />
      </BillingProvider>
    </QueryClientProvider>
  );
}

function BillingProbe() {
  const billing = useBillingAccess();
  return (
    <div
      data-is-paid={billing.isPaid ? "true" : "false"}
      data-is-ready={billing.isReady ? "true" : "false"}
      data-testid="billing-access"
    />
  );
}

function paidClaims(userId: string) {
  return {
    status: "ok" as const,
    data: {
      sub: userId,
      email: `${userId}@example.com`,
      entitlements: ["hyprnote_pro"],
      subscription_status: "active" as const,
      trial_end: null,
      has_payment_method: true,
    },
  };
}

function freeClaims(userId: string) {
  return {
    status: "ok" as const,
    data: {
      sub: userId,
      email: `${userId}@example.com`,
      entitlements: [],
      subscription_status: null,
      trial_end: null,
      has_payment_method: null,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("BillingProvider", () => {
  it("keeps the provider module compatible with Fast Refresh", () => {
    expect(Object.keys(billingProviderModule)).toEqual(["BillingProvider"]);
  });

  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });

    refreshSession.mockReset().mockResolvedValue(null);
    authState.session = {
      access_token: "stale-token",
      user: { id: "user-1", email: "test@example.com" },
    };
    settingsState.currentPlatform = "macos";
    settingsState.currentArch = "aarch64";
    settingsState.values.current_llm_provider = undefined;
    settingsState.values.current_stt_provider = undefined;
    settingsState.values.current_stt_model = undefined;
    settingsState.setSettingValues.mockReset().mockResolvedValue(undefined);

    vi.mocked(authCommands.decodeClaims)
      .mockReset()
      .mockResolvedValue({
        status: "ok",
        data: {
          sub: "user-1",
          email: "test@example.com",
          entitlements: [],
          subscription_status: null,
          trial_end: null,
          has_payment_method: null,
        },
      });

    vi.mocked(canStartTrialApi).mockResolvedValue({
      data: { canStartTrial: false, reason: "not_eligible" as const },
      error: undefined,
      request: new Request("https://api.example.test/can-start-trial"),
      response: new Response(),
    });
    vi.mocked(startTrialApi)
      .mockReset()
      .mockResolvedValue({
        data: { started: true, reason: "started" as const },
        error: undefined,
        request: new Request("https://api.example.test/start-trial"),
        response: new Response(),
      });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps paid access while the same user's refreshed token is decoded", async () => {
    const refreshedClaims =
      deferred<Awaited<ReturnType<typeof authCommands.decodeClaims>>>();
    vi.mocked(authCommands.decodeClaims)
      .mockResolvedValueOnce(paidClaims("user-1"))
      .mockReturnValueOnce(refreshedClaims.promise);
    const { queryClient, view } = renderBillingProvider();

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-access").getAttribute("data-is-paid"),
      ).toBe("true");
    });

    authState.session = {
      ...authState.session!,
      access_token: "refreshed-token",
    };
    view.rerender(billingTree(queryClient));

    await waitFor(() => {
      expect(authCommands.decodeClaims).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByTestId("billing-access").getAttribute("data-is-paid"),
    ).toBe("true");
    expect(
      screen.getByTestId("billing-access").getAttribute("data-is-ready"),
    ).toBe("true");

    refreshedClaims.resolve(paidClaims("user-1"));
  });

  it("defers transcription repair until the refreshed claims settle", async () => {
    settingsState.currentPlatform = "windows";
    const refreshedClaims =
      deferred<Awaited<ReturnType<typeof authCommands.decodeClaims>>>();
    vi.mocked(authCommands.decodeClaims)
      .mockResolvedValueOnce(paidClaims("user-1"))
      .mockReturnValueOnce(refreshedClaims.promise);
    const { queryClient, view } = renderBillingProvider();

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-access").getAttribute("data-is-paid"),
      ).toBe("true");
    });
    settingsState.setSettingValues.mockClear();

    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";
    authState.session = {
      ...authState.session!,
      access_token: "refreshed-token",
    };
    view.rerender(billingTree(queryClient));

    await waitFor(() => {
      expect(authCommands.decodeClaims).toHaveBeenCalledTimes(2);
    });
    expect(settingsState.setSettingValues).not.toHaveBeenCalled();

    // Mentari has no free tier, so even claims with no entitlements still
    // resolve to the paid repair target below.
    refreshedClaims.resolve(freeClaims("user-1"));

    await waitFor(() => {
      expect(settingsState.setSettingValues).toHaveBeenCalledWith({
        current_stt_provider: "anarlog",
        current_stt_model: "cloud",
      });
    });
  });

  it("does not retain stale claims across account switches", async () => {
    const switchedClaims =
      deferred<Awaited<ReturnType<typeof authCommands.decodeClaims>>>();
    vi.mocked(authCommands.decodeClaims)
      .mockResolvedValueOnce(paidClaims("user-1"))
      .mockReturnValueOnce(switchedClaims.promise);
    const { queryClient, view } = renderBillingProvider();

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-access").getAttribute("data-is-ready"),
      ).toBe("true");
    });

    authState.session = {
      access_token: "user-2-token",
      user: { id: "user-2", email: "user-2@example.com" },
    };
    view.rerender(billingTree(queryClient));

    await waitFor(() => {
      expect(authCommands.decodeClaims).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByTestId("billing-access").getAttribute("data-is-ready"),
    ).toBe("false");

    switchedClaims.resolve(paidClaims("user-2"));
  });

  it.each(["windows", "linux"])(
    "repairs Apple-local transcription to hosted transcription for paid users on %s",
    async (currentPlatform) => {
      settingsState.currentPlatform = currentPlatform;
      settingsState.values.current_stt_provider = "anarlog";
      settingsState.values.current_stt_model = "soniqo-parakeet-streaming";
      vi.mocked(authCommands.decodeClaims).mockResolvedValue(
        paidClaims("user-1"),
      );

      renderBillingProvider();

      await waitFor(() => {
        expect(settingsState.setSettingValues).toHaveBeenCalledWith({
          current_stt_provider: "anarlog",
          current_stt_model: "cloud",
        });
      });
    },
  );

  it("repairs Intel Mac local transcription to hosted transcription", async () => {
    settingsState.currentPlatform = "macos";
    settingsState.currentArch = "x86_64";
    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";

    renderBillingProvider();

    await waitFor(() => {
      expect(settingsState.setSettingValues).toHaveBeenCalledWith({
        current_stt_provider: "anarlog",
        current_stt_model: "cloud",
      });
    });
  });

  it("preserves local transcription on Apple Silicon", async () => {
    settingsState.currentPlatform = "macos";
    settingsState.currentArch = "aarch64";
    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";

    renderBillingProvider();

    await waitFor(() => {
      expect(authCommands.decodeClaims).toHaveBeenCalled();
    });
    expect(settingsState.setSettingValues).not.toHaveBeenCalled();
  });

  it("preserves Apple-local transcription until paid auth finishes loading", async () => {
    authState.session = undefined;
    settingsState.currentPlatform = "windows";
    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";
    vi.mocked(authCommands.decodeClaims).mockResolvedValue(
      paidClaims("user-1"),
    );
    const { queryClient, view } = renderBillingProvider();

    expect(settingsState.setSettingValues).not.toHaveBeenCalled();

    authState.session = {
      access_token: "paid-token",
      user: { id: "user-1", email: "test@example.com" },
    };
    view.rerender(billingTree(queryClient));

    await waitFor(() => {
      expect(settingsState.setSettingValues).toHaveBeenCalledWith({
        current_stt_provider: "anarlog",
        current_stt_model: "cloud",
      });
    });
    expect(settingsState.setSettingValues).not.toHaveBeenCalledWith({
      current_stt_provider: "",
      current_stt_model: "",
    });
  });

  it("requires provider selection for signed-out Windows users with Apple-local transcription", async () => {
    authState.session = undefined;
    settingsState.currentPlatform = "windows";
    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";
    const { queryClient, view } = renderBillingProvider();

    expect(settingsState.setSettingValues).not.toHaveBeenCalled();

    authState.session = null;
    view.rerender(billingTree(queryClient));

    await waitFor(() => {
      expect(settingsState.setSettingValues).toHaveBeenCalledWith({
        current_stt_provider: "",
        current_stt_model: "",
      });
    });
    expect(settingsState.setSettingValues).toHaveBeenCalledTimes(1);
  });

  it("defers Windows transcription repair when authenticated billing claims fail", async () => {
    settingsState.currentPlatform = "windows";
    settingsState.values.current_stt_provider = "anarlog";
    settingsState.values.current_stt_model = "soniqo-parakeet-streaming";
    vi.mocked(authCommands.decodeClaims).mockResolvedValue({
      status: "error",
      error: "claims unavailable",
    });

    renderBillingProvider();

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-access").getAttribute("data-is-ready"),
      ).toBe("false");
    });
    expect(settingsState.setSettingValues).not.toHaveBeenCalled();
  });
});
