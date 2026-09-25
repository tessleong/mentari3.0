#!/bin/bash
# Weekly Rust build-cache cleanup for mentari2.0, run by the
# com.mentari.cargo-cleanup LaunchAgent (~/Library/LaunchAgents).
#
# Safe by design: cargo-sweep only removes build artifacts untouched in the
# last N days (never source, never in-progress work), and cargo-cache only
# clears the downloaded-crate cache (~/.cargo/registry), which re-downloads
# on demand. Neither touches git history, uncommitted changes, or anything
# outside Cargo's own rebuildable caches.

set -euo pipefail

SWEEP_DAYS=14
REPO_ROOT="/Users/evitachi/Desktop/mentari2.0"

export PATH="$HOME/.cargo/bin:$PATH"

echo "=== cargo-cleanup run: $(date) ==="

for target_dir in "$REPO_ROOT" "$REPO_ROOT/apps/desktop/src-tauri"; do
  if [ -d "$target_dir/target" ]; then
    echo "--- sweeping $target_dir/target (untouched >${SWEEP_DAYS}d) ---"
    (cd "$target_dir" && cargo sweep --time "$SWEEP_DAYS") || echo "sweep failed for $target_dir, continuing"
  fi
done

echo "--- cleaning cargo registry cache ---"
cargo cache --autoclean || echo "cargo cache autoclean failed, continuing"

echo "=== done: $(date) ==="
df -h / | tail -1
