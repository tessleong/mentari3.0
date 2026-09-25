export const PARTICIPANT_ROLES = [
  "clinician",
  "patient",
  "family",
  "interpreter",
  "lecturer",
  "other",
] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export function isParticipantRole(value: string): value is ParticipantRole {
  return (PARTICIPANT_ROLES as readonly string[]).includes(value);
}

// Fixed English labels for LLM prompts (summary generation, transcript
// context) — distinct from the i18n-translated UI labels in
// role-badge.tsx, since prompts are always composed in English regardless
// of the user's display language.
const PARTICIPANT_ROLE_PROMPT_LABELS: Record<ParticipantRole, string> = {
  clinician: "clinician",
  patient: "patient",
  family: "family member",
  interpreter: "interpreter",
  lecturer: "lecturer",
  other: "other",
};

export function participantRolePromptLabel(role: string): string | null {
  return isParticipantRole(role) ? PARTICIPANT_ROLE_PROMPT_LABELS[role] : null;
}
