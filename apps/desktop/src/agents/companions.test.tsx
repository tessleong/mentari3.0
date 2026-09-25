import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  generate: vi.fn(),
  model: { modelId: "test-model" },
}));
vi.mock("~/ai/hooks/useLLMConnection", () => ({
  useLanguageModel: () => mocks.model,
}));
vi.mock("~/clinical/repository", () => ({
  searchClinicalEvidence: mocks.search,
}));
vi.mock("ai", () => ({ generateText: mocks.generate }));

import { AgentCompanions } from "./companions";
import { useScribe } from "./scribe";

function mount(selectedText = "") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AgentCompanions sessionId="note-a" selectedText={selectedText} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue([]);
  mocks.generate.mockResolvedValue({ text: "Meaning: a simple explanation." });
  useScribe.setState({ activeSessionId: null, memory: {}, status: "Paused" });
});
afterEach(cleanup);

it("opens the Research task with highlighted text and executes its lookup", async () => {
  mount("A scientific claim");
  expect(
    (
      (await screen.findByRole("textbox", {
        name: "Agent task",
      })) as HTMLTextAreaElement
    ).value,
  ).toBe("A scientific claim");
  expect(mocks.search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Do a task" }));
  await waitFor(() =>
    expect(mocks.search).toHaveBeenCalledWith("A scientific claim", 5),
  );
  expect(
    await screen.findByText(/No matching publications found/),
  ).toBeTruthy();
});

it("opens an agent task on right click and passes draft memory to Explainer", async () => {
  useScribe.setState({
    memory: {
      "note-a": {
        keywords: ["osmosis"],
        memories: ["The speaker asked about osmosis."],
        todos: [],
      },
    },
  });
  mount();
  fireEvent.contextMenu(
    screen.getByRole("button", { name: "Explainer Agent" }),
  );
  fireEvent.change(await screen.findByRole("textbox", { name: "Agent task" }), {
    target: { value: "Explain osmosis" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Do a task" }));
  expect(
    await screen.findByText("Meaning: a simple explanation."),
  ).toBeTruthy();
  const prompt = JSON.parse(mocks.generate.mock.calls[0][0].prompt);
  expect(prompt.provisionalMemory.memories).toEqual([
    "The speaker asked about osmosis.",
  ]);
});

it("starts and pauses the live Scribe for the current note", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Scribe Agent" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Start live Scribe" }),
  );
  expect(useScribe.getState().activeSessionId).toBe("note-a");
  fireEvent.click(screen.getByRole("button", { name: "Pause Scribe" }));
  expect(useScribe.getState().activeSessionId).toBeNull();
});
