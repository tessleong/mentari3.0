import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MedicalTermHoverCard } from "./medical-term-hover";

const mocks = vi.hoisted(() => ({
  explainMedicalTerm: vi.fn(),
}));

vi.mock("~/clinical/patient-explain", () => ({
  explainMedicalTerm: mocks.explainMedicalTerm,
}));

function renderCard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicalTermHoverCard sessionId="session-1" term="hypertension">
        <span>hypertension</span>
      </MedicalTermHoverCard>
    </QueryClientProvider>,
  );
}

describe("MedicalTermHoverCard", () => {
  afterEach(() => {
    cleanup();
    mocks.explainMedicalTerm.mockReset();
    vi.useRealTimers();
  });

  it("does not look anything up before the word is hovered", () => {
    renderCard();

    expect(mocks.explainMedicalTerm).not.toHaveBeenCalled();
  });

  it("looks up the term after a hover delay and renders what was said and found", async () => {
    mocks.explainMedicalTerm.mockResolvedValue({
      term: "hypertension",
      encounterSources: [
        {
          segmentId: "seg-1",
          speaker: "Dr. Lee",
          startMs: 0,
          endMs: 1000,
          text: "Your blood pressure has been running high.",
        },
      ],
      medicalSources: [
        {
          pmid: "12345",
          doi: "",
          title: "Managing hypertension in primary care",
          journal: "BMJ",
          publicationYear: 2022,
          excerpt: "",
          sourceUrl: "",
        },
      ],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderCard();
    fireEvent.mouseEnter(screen.getByText("hypertension"));
    vi.advanceTimersByTime(400);

    await waitFor(() =>
      expect(mocks.explainMedicalTerm).toHaveBeenCalledWith(
        "session-1",
        "hypertension",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/blood pressure has been running high/),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText("Managing hypertension in primary care"),
    ).toBeTruthy();
  });

  it("shows honest empty states instead of fabricating content", async () => {
    mocks.explainMedicalTerm.mockResolvedValue({
      term: "hypertension",
      encounterSources: [],
      medicalSources: [],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderCard();
    fireEvent.mouseEnter(screen.getByText("hypertension"));
    vi.advanceTimersByTime(400);

    await waitFor(() =>
      expect(
        screen.getByText("Not directly mentioned in this transcript."),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText("No local reference material for this term yet."),
    ).toBeTruthy();
  });

  it("does not open until the hover delay has elapsed", () => {
    mocks.explainMedicalTerm.mockResolvedValue({
      term: "hypertension",
      encounterSources: [],
      medicalSources: [],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderCard();
    fireEvent.mouseEnter(screen.getByText("hypertension"));
    vi.advanceTimersByTime(100);

    expect(mocks.explainMedicalTerm).not.toHaveBeenCalled();
  });
});
