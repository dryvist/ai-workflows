#!/usr/bin/env bash
set -euo pipefail

validate() {
  local permission_profile="${PERMISSION_PROFILE:-}"
  case "$permission_profile" in
    read-only|workspace) permission_profile=":$permission_profile" ;;
  esac

  case "$AGENT" in
    claude)
      if [[ -z "$ANTHROPIC_API_KEY" ]]; then
        echo "::error::anthropic_api_key is required when agent is claude"
        exit 1
      fi
      ;;
    codex)
      if [[ -z "$OPENAI_API_KEY" ]]; then
        echo "::error::openai_api_key is required when agent is codex"
        exit 1
      fi
      if [[ -z "$permission_profile" ]]; then
        echo "::error::permission_profile is required when agent is codex"
        exit 1
      fi
      ;;
    *)
      echo "::error::agent must be claude or codex"
      exit 1
      ;;
  esac

  echo "permission-profile=$permission_profile" >> "$GITHUB_OUTPUT"

  local args="$CLAUDE_ARGS"
  local quoted
  if [[ -n "$ALLOWED_TOOLS" ]]; then
    printf -v quoted '%q' "$ALLOWED_TOOLS"
    args="${args:+$args }--allowedTools $quoted"
  fi
  if [[ -n "$CLAUDE_MODEL" ]]; then
    printf -v quoted '%q' "$CLAUDE_MODEL"
    args="${args:+$args }--model $quoted"
  fi
  echo "claude-args=$args" >> "$GITHUB_OUTPUT"
}

inject() {
  local source_file="$INSTRUCTION_SOURCE/AGENTS.md"
  if [[ ! -f "$source_file" ]]; then
    echo "::warning::canonical instructions unavailable; skipping injection"
    return
  fi

  mkdir -p "$HOME/.claude" "$CODEX_HOME"
  {
    cat "$source_file"
    if [[ -d "$INSTRUCTION_SOURCE/agentsmd/rules" ]]; then
      while IFS= read -r rule; do
        printf '\n'
        cat "$rule"
      done < <(find "$INSTRUCTION_SOURCE/agentsmd/rules" -type f -name '*.md' -print | sort)
    fi
  } | tee "$HOME/.claude/CLAUDE.md" > "$CODEX_HOME/AGENTS.md"
}

cleanup() {
  rm -rf -- "$GITHUB_WORKSPACE/.ai-instructions"
}

case "${1:-}" in
  validate) validate ;;
  inject) inject ;;
  cleanup) cleanup ;;
  *) echo "usage: prepare.sh {validate|inject|cleanup}" >&2; exit 2 ;;
esac
