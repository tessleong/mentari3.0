// Curated seeds for the procedural gradient avatar (@anlg/ui's `Avatar`), picked
// for good hue spread so the options in the picker read as visually distinct.
export const AGENT_AVATAR_SEEDS = [
  "mentari-agent-21",
  "mentari-agent-2",
  "mentari-agent-35",
  "mentari-agent-30",
  "mentari-agent-12",
  "mentari-agent-17",
  "mentari-agent-9",
  "mentari-agent-22",
] as const;

export type AgentAvatarSeed = (typeof AGENT_AVATAR_SEEDS)[number];

export const DEFAULT_AGENT_AVATAR_SEED: AgentAvatarSeed = "mentari-agent-21";

export function normalizeAgentAvatarSeed(
  value: string | null | undefined,
): AgentAvatarSeed {
  return (AGENT_AVATAR_SEEDS as readonly string[]).includes(value ?? "")
    ? (value as AgentAvatarSeed)
    : DEFAULT_AGENT_AVATAR_SEED;
}
