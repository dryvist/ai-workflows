#!/usr/bin/env bash
set -euo pipefail
# Build the claude_args string for anthropics/claude-code-action@v1, optionally
# appending the canonical org instructions to Claude's system prompt.
#
# Why: claude-code-action@v1 exposes no append_system_prompt input and does NOT
# load the runner's user-level CLAUDE.md (~/.claude). So the canonical layer that
# a local machine gets via nix-loaded user memory (dryvist/ai-assistant-instructions:
# AGENTS.md + agentsmd/rules) is delivered here as `--append-system-prompt`, which
# appends to — does not replace — Claude Code's default system prompt. The repo's
# own CLAUDE.md still auto-loads as project memory on top.
#
# Reads env: ALLOWED_TOOLS, MODEL, INSTRUCTIONS_DIR (optional), GITHUB_OUTPUT.
# Emits `claude_args` (multiline) to $GITHUB_OUTPUT.
: "${ALLOWED_TOOLS:?ALLOWED_TOOLS is required}"
: "${MODEL:?MODEL is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
instr_dir="${INSTRUCTIONS_DIR:-}"

args="--allowedTools \"${ALLOWED_TOOLS}\" --model ${MODEL}"

if [ -n "$instr_dir" ] && [ -f "$instr_dir/AGENTS.md" ]; then
  canonical="$(
    printf '%s\n' "You are running in CI. Below are the canonical org-wide agent instructions (from dryvist/ai-assistant-instructions@main) — the same baseline a local dev machine loads as user memory. The repository's own CLAUDE.md / AGENTS.md still applies on top as project memory. Sentinel: canonical-instructions-loaded."
    printf '\n'
    cat "$instr_dir/AGENTS.md"
    if [ -d "$instr_dir/agentsmd/rules" ]; then
      while IFS= read -r f; do
        printf '\n\n---\n\n'
        cat "$f"
      done < <(find "$instr_dir/agentsmd/rules" -type f -name '*.md' | sort)
    fi
  )"
  # Escape ONLY backslash then double-quote for embedding inside a double-quoted
  # claude_args token. claude-code-action parses claude_args with a shell-words
  # splitter (no shell evaluation), so backticks / $ / () inside the quotes are
  # literal and must NOT be escaped.
  canonical="${canonical//\\/\\\\}"
  canonical="${canonical//\"/\\\"}"
  args="${args} --append-system-prompt \"${canonical}\""
  echo "Appended canonical instructions to system prompt ($(printf '%s' "$canonical" | wc -c) bytes)."
else
  echo "No canonical instructions injected (INSTRUCTIONS_DIR unset or AGENTS.md missing)."
fi

{
  echo "claude_args<<__CCARGS_EOF__"
  printf '%s\n' "$args"
  echo "__CCARGS_EOF__"
} >>"$GITHUB_OUTPUT"
