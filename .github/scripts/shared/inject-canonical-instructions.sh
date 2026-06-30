#!/usr/bin/env bash
set -euo pipefail
# Assemble the canonical org agent instructions (dryvist/ai-assistant-instructions:
# AGENTS.md + agentsmd/rules/) into the runner's Claude Code USER memory at
# ~/.claude/CLAUDE.md, so a CI Claude run loads the same user-level layer a local
# dev machine gets via nix. The consumer repo's own CLAUDE.md still auto-loads as
# project memory on top.
#
# Usage: inject-canonical-instructions.sh <path-to-ai-assistant-instructions-checkout>
src="${1:?path to ai-assistant-instructions checkout is required}"

if [ ! -f "$src/AGENTS.md" ]; then
  echo "::warning::AGENTS.md not found under '$src' — skipping canonical-instruction injection."
  exit 0
fi

dest_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
dest="$dest_dir/CLAUDE.md"
mkdir -p "$dest_dir"

# The sentinel line lets a probe run confirm this memory actually loaded.
{
  echo "<!-- canonical-instructions-loaded:dryvist/ai-assistant-instructions@main -->"
  echo "# Canonical org agent instructions (CI-injected)"
  echo
  echo "Injected into CI user memory from dryvist/ai-assistant-instructions@main so this"
  echo "automated run shares the same baseline instructions as a local dev machine. The"
  echo "repository's own CLAUDE.md / AGENTS.md still applies on top as project memory."
  echo
  echo "---"
  echo
  cat "$src/AGENTS.md"

  if [ -d "$src/agentsmd/rules" ]; then
    while IFS= read -r -d '' rule; do
      printf '\n\n---\n\n'
      cat "$rule"
    done < <(find "$src/agentsmd/rules" -type f -name '*.md' -print0 | sort -z)
  fi
} >"$dest"

echo "Injected canonical instructions into $dest ($(wc -c <"$dest") bytes)."
