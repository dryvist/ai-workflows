#!/usr/bin/env bash
set -euo pipefail
# Usage: render-prompt.sh <prompt-file> [VAR1 VAR2 ...]
# If variable names are provided, only those variables are substituted (prevents
# corrupting $VAR patterns in dynamic content like failure logs).
# If no variables provided, all environment variables are substituted.
prompt_file="$1"
shift
delimiter="PROMPT_$(openssl rand -hex 8)"

strip_frontmatter() {
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { in_frontmatter = 0; next }
    !in_frontmatter { print }
    END { if (in_frontmatter) exit 1 }
  ' "$1"
}

if [[ $# -gt 0 ]]; then
  # shellcheck disable=SC2016 # envsubst variable specifications are literal.
  var_spec=$(printf '${%s} ' "$@")
  rendered=$(strip_frontmatter "$prompt_file" | envsubst "$var_spec")
else
  rendered=$(strip_frontmatter "$prompt_file" | envsubst)
fi
{
  echo "content<<${delimiter}"
  echo "$rendered"
  echo "${delimiter}"
} >> "$GITHUB_OUTPUT"
