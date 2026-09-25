export const MENTARI_MARK_VIEW_BOX = "0 0 64 64";

export function MentariMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MENTARI_MARK_VIEW_BOX}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="29" fill="currentColor" />
      <path
        d="M16 44V20h6l10 14 10-14h6v24h-7V31L32 43 23 31v13h-7Z"
        fill="var(--mentari-mark-ink, white)"
      />
      <circle cx="51" cy="13" r="5" fill="#F6B84A" />
    </svg>
  );
}
