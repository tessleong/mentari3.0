# Agent runtime design

Date: 2026-09-13
Status: approved, implementation started

## Problem

The companions shipped as a single `generateText()` call per agent
(`src/agents/companions.tsx`). That is an LLM wrapper: the model answers once
and the product accepts whatever comes back. The goal is agents that keep
working a problem — planning, calling tools, checking their own output, and
continuing — until the goal is genuinely met.

Two UI problems come with it. The companion bar sits in a strip under the note
and collides with the selection formatting toolbar, and an agent panel cannot be
moved out of the way.

## Decisions

1. **Control flow lives in TypeScript, not in the model.** A policy may consult
   a model inside `plan` or `critique`, but the model never decides whether the
   loop continues. `critique().satisfied` and the budget do. This is what makes
   a run reproducible in tests against a fake model.
2. **Each agent is its own policy**, not one loop with different prompts. The
   kernel is shared; the search strategy, critic rubric and stopping rule are
   per agent.
3. **Convergence is the stop; the budget is a backstop.** Hitting the budget
   pauses and surfaces partial findings plus open questions. Nothing is
   discarded and a pause is resumable.
4. **PHI routing is part of the loop.** Every outbound call goes through
   `decidePhiRoute` / `auditPhiRoute`. A blocked call triggers replanning onto
   local sources rather than failing the round.
5. **Multiple floating panels.** Research and Explainer each get a draggable,
   z-ordered panel and run concurrently. Scribe stays headless with a status
   chip.

## The kernel

`src/agents/kernel/kernel.ts`

```
run(policy, goal, signal):
  s = policy.init(goal)
  loop:
    thought  = await policy.plan(s)        -> emit "think"
    calls    =       policy.act(s, thought)-> emit "act"
    results  = await runTools(calls)       -> emit "observe"
      blocked by PHI routing?
        -> policy.replanWithoutNetwork(s, blocked), run locally
    s        =       policy.observe(s, results)
    critique = await policy.critique(s)    -> emit "critique"
    if critique.satisfied      -> "satisfied"
    if budget exceeded         -> "budget_paused" (state + openQuestions kept)
```

`plan` and `critique` are async because they may call a model. `act` and
`observe` are synchronous and pure, so the interesting rules stay unit-testable.
Results are returned positionally and the kernel backfills each originating
`call` onto its result, so a policy can read back what it asked.

Outcomes: `satisfied` | `budget_paused` | `aborted` | `failed`. None of them
discard state.

## Policies

### Research — breadth-first expansion that argues against itself

`src/agents/kernel/research.ts`

Three rules are code rather than prompt text:

1. Every round issues at least one query prefixed `evidence against:`, aimed at
   refuting the current leading conclusion, whether or not the model proposed
   one.
2. A query never runs twice.
3. The run ends on saturation: a round that surfaces no new source, with no
   contradiction standing.

A claim supported and refuted by the gathered evidence is reported as a
contradiction, never averaged away. The raw claim is never used as a query — the
model returns de-identified scientific terms, so searches carry no PHI.

### Explainer — depth-first decomposition behind a rubric gate

`src/agents/kernel/explainer.ts`

Each leaf concept must pass three checks: readability (deterministic
heuristic), meaning preservation (model judge against the source), and no new
claims (deterministic entity/number diff against the source). A failing leaf is
decomposed further rather than reworded. Satisfied when every leaf passes.

### Scribe — continuous consolidation

`src/agents/kernel/scribe-policy.ts`

Moves from 15-second whole-transcript polling to delta-driven
consolidation using `clinical/reconciliation.ts` for contradictions. Never
"satisfied" only when it has caught up with the transcript, which is how it
yields between updates. Each new keyword warms the same evidence cache the
research agent reads, so research starts with results already in hand. A
statement whose substance matches one already held but whose polarity has
flipped replaces it and is recorded as a revision, so a patient who first
reported chest pain and later denied it does not leave both facts standing.

## UI

- `packages/editor/src/widgets/format-toolbar.tsx` takes a `trailingActions`
  slot so `apps/desktop` injects the agent picker into the existing selection
  toolbar. This avoids an `editor -> app` dependency and stops the two surfaces
  from overlapping. Markup mirrors the existing "Text style" dropdown.
- `NoteCompanions`' bottom strip is removed.
- `AgentPanelHost` renders draggable, z-ordered panels; position persists per
  agent. Drag uses pointer capture, clamped to the viewport.
- A panel streams the step log (`think 3/12`, `searching pubmed...`). On a
  budget pause it shows partial findings, the open questions, and
  `[Keep going] [Accept] [Stop]`.

## Testing

The kernel and policies run against a fake model and fake tools, so
disconfirmation, saturation, budget pause, resume, PHI-blocked replanning and
abort are all deterministic tests with no network. Panels get drag-math,
z-order and persistence tests, following the repo's existing
`className).toContain(...)` convention.

## PHI-aware tool runner

`src/agents/kernel/tool-runner.ts`

Every call that leaves the machine is routed through `decidePhiRoute` and
recorded with `auditPhiRoute` _before_ it is made, so a refusal is a decision in
the hash-chained audit log rather than a request that happened and was
regretted. A refused call returns `blocked`, which the kernel reads as a prompt
to replan locally rather than as a failure. A call that never leaves the machine
raises no routing question and is deliberately not written to the disclosure
log. A failed audit write never discards the agent's work.

## Model adapters

`src/agents/adapters.ts`

`proposeQueries`, `explain` and `extract` are the only places a model is called.
Each parses JSON defensively, because what an unreadable reply should mean
differs per agent: research falls back to no queries (the policy still issues its
disconfirming probe, so a bad round costs a round, not the run); the explainer
reports meaning as _not_ preserved, so the rubric fails the leaf instead of
passing an unknown; the scribe yields an empty draft rather than a guessed one,
because a scribe must never invent a clinical fact.

## Status

Done: kernel, all three policies, the panel store and the draggable panel
(`src/agents/agent-panel.tsx`, mounted in `main/shell-frame.tsx`), the
PHI-aware tool runner, the model adapters, and the toolbar picker
(`src/agents/agent-picker.tsx`, injected in `session/components/note-input/raw.tsx`).
90 tests.

The panel reuses `shared/hooks/use-floating-panel-layout`, the same hook behind
the Ask Mentari panel, so drag and per-agent position persistence came for free
and behave consistently. It has no viewport clamping — a panel dragged out of
reach is recovered with its "Reset position" control.

Next: the runtime glue. Every piece exists and is tested, but nothing yet joins
them — picking an agent opens its panel on the selected passage and records the
goal, and no `runAgent` call is made. That wiring is: build the tool runner from
the active provider's BAA and locality, build the adapters from
`useLanguageModel()`, call `runAgent` with the matching policy, and stream its
steps into the panel store via `appendStep`, registering `keepGoing`/`stop` as
the panel's controls.
