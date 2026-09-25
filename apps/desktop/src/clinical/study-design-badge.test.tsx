import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudyDesignBadge } from "./study-design-badge";

afterEach(cleanup);

describe("StudyDesignBadge", () => {
  it("renders a human-readable label for a known study design", () => {
    render(<StudyDesignBadge studyDesign="randomized_controlled_trial" />);

    expect(screen.getByText("RCT")).not.toBeNull();
  });

  it("renders nothing for the catch-all 'other' design", () => {
    const { container } = render(<StudyDesignBadge studyDesign="other" />);

    expect(container.textContent).toBe("");
  });

  it("renders nothing for an unrecognized value", () => {
    const { container } = render(<StudyDesignBadge studyDesign="bogus" />);

    expect(container.textContent).toBe("");
  });
});
