import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSessionParticipantRole: vi.fn(),
}));

vi.mock("~/session/queries", () => ({
  updateSessionParticipantRole: mocks.updateSessionParticipantRole,
}));

import { ParticipantRoleBadge } from "./role-badge";

describe("ParticipantRoleBadge", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a neutral placeholder when no role is set", () => {
    render(<ParticipantRoleBadge mappingId="mapping-1" role="" />);

    expect(
      screen.getByRole("button", { name: "Set participant role" }).textContent,
    ).toBe("+ Role");
  });

  it("shows the short label for a stored role", () => {
    render(<ParticipantRoleBadge mappingId="mapping-1" role="clinician" />);

    expect(
      screen.getByRole("button", { name: "Set participant role" }).textContent,
    ).toBe("MD");
  });

  it("treats an unrecognized stored role as unset", () => {
    render(<ParticipantRoleBadge mappingId="mapping-1" role="nurse" />);

    expect(
      screen.getByRole("button", { name: "Set participant role" }).textContent,
    ).toBe("+ Role");
  });

  it("persists a chosen role", () => {
    render(<ParticipantRoleBadge mappingId="mapping-1" role="" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Set participant role" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Patient" }));

    expect(mocks.updateSessionParticipantRole).toHaveBeenCalledWith(
      "mapping-1",
      "patient",
    );
  });

  it("clears a role back to none", () => {
    render(<ParticipantRoleBadge mappingId="mapping-1" role="family" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Set participant role" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "None" }));

    expect(mocks.updateSessionParticipantRole).toHaveBeenCalledWith(
      "mapping-1",
      "",
    );
  });
});
