export const FLOATING_BAR_INSET = 4;
export const FLOATING_BAR_COMPACT_HEIGHT = 38;
export const FLOATING_BAR_COMPACT_STOP_WIDTH = 62;
export const FLOATING_BAR_COMPACT_SOLO_STOP_WIDTH = 68;
export const FLOATING_BAR_COMPACT_ICON_SIZE = 30;
export const FLOATING_BAR_COMPACT_GAP = 3;
export const FLOATING_BAR_COMPACT_HORIZONTAL_PADDING = 4;
export const FLOATING_BAR_LOGO_WIDTH = 16;
export const FLOATING_BAR_LOGO_HEIGHT = 12;
export const FLOATING_BAR_EXPANDED_WIDTH = 360;
export const FLOATING_BAR_EXPANDED_HEIGHT = 430;
export const FLOATING_BAR_HOVER_HANDLE_HEIGHT = 12;
export const FLOATING_BAR_HOVER_HANDLE_TOP_PADDING = 7;
export const FLOATING_BAR_HOVER_HANDLE_GAP = 2;
export const FLOATING_BAR_HOVER_HANDLE_RESERVED_HEIGHT =
  FLOATING_BAR_HOVER_HANDLE_TOP_PADDING +
  FLOATING_BAR_HOVER_HANDLE_HEIGHT +
  FLOATING_BAR_HOVER_HANDLE_GAP;
export const FLOATING_BAR_CONTROL_RADIUS = 10;
export const FLOATING_BAR_COMPACT_RADIUS = 14;
export const FLOATING_BAR_EXPANDED_RADIUS = 21;

export function compactControlsWidth(showsExpand: boolean) {
  return showsExpand
    ? FLOATING_BAR_COMPACT_STOP_WIDTH +
        FLOATING_BAR_COMPACT_GAP +
        FLOATING_BAR_COMPACT_ICON_SIZE
    : FLOATING_BAR_COMPACT_SOLO_STOP_WIDTH;
}

// The logo only appears in the compact pill (the expanded panel already
// shows the note title as its own brand context), so it's kept out of
// compactControlsWidth — that width is shared with the expanded panel's
// trailing control reservation, which has no logo to make room for.
export function compactPillContentWidth(showsExpand: boolean) {
  return (
    FLOATING_BAR_LOGO_WIDTH +
    FLOATING_BAR_COMPACT_GAP +
    compactControlsWidth(showsExpand)
  );
}

export function compactWidth(showsExpand: boolean) {
  return (
    compactPillContentWidth(showsExpand) +
    FLOATING_BAR_COMPACT_HORIZONTAL_PADDING * 2
  );
}

// The expanded panel additionally shows a settings button, so it reserves
// more control-row width than the compact pill (which never shows it).
export function expandedControlsWidth(showsExpand: boolean) {
  return (
    compactControlsWidth(showsExpand) +
    FLOATING_BAR_COMPACT_GAP +
    FLOATING_BAR_COMPACT_ICON_SIZE
  );
}
