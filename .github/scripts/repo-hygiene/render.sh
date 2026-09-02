#!/usr/bin/env bash
# Render digest.json (plus an optional model summary) into repo-hygiene-digest.md.
set -euo pipefail

out="${OUT_FILE:-repo-hygiene-digest.md}"

{
  echo "## Repository hygiene digest"
  echo
  echo "_Read-only advisory. Nothing here was changed, deleted, or merged._"
  echo

  if [ -s summary.txt ]; then
    echo "### Summary"
    echo
    cat summary.txt
    echo
  elif [ -s summary.error ]; then
    echo "_Summary unavailable: $(cat summary.error)._"
    echo
  fi

  jq -r '
    def row($p): "| #\($p.number) | \($p.title | gsub("[|\n]"; " ")) | \($p.author) | \($p.age)d | \($p.checks) |";
    .[] |
    if .error then
      "### \(.repo)\n\nCould not read this repository: \(.error)\n"
    else
      "### \(.repo)\n\nDefault branch `\(.default_branch)`.\n"
      + (
          if .promotion == null then ""
          elif (.promotion.ahead // 0) == 0 then "\n**Promotion**: `develop` is level with `main`.\n"
          else "\n**Promotion candidate**: `develop` is \(.promotion.ahead) commit(s) ahead of `main`; last subject: \(.promotion.last | gsub("[|\n]"; " ")).\n"
          end
        )
      + (
          (.deletable // []) as $d |
          if ($d | length) == 0 then "\nNo branches whose pull request is already merged or closed.\n"
          else "\n**Deletion candidates** (PR merged or closed, branch still present) — listed only:\n\n"
               + ($d | map("- `\(.branch)` — PR #\(.pr) \(.state | ascii_downcase)") | join("\n")) + "\n"
          end
        )
      + (
          (.stale // []) as $s |
          if ($s | length) == 0 then ""
          else "\n**Stale branches** (no pull request, no commits recently):\n\n"
               + ($s | map("- `\(.branch)` — \(.days) days since last commit") | join("\n")) + "\n"
          end
        )
      + (
          (.prs // []) as $p |
          if ($p | length) == 0 then "\nNo open pull requests.\n"
          else "\n**Open pull requests** (\($p | length)):\n"
               + ([ ["ready", "mergeable and green"],
                    ["blocked", "blocked by checks"],
                    ["threads", "unresolved review threads"],
                    ["draft", "draft"],
                    ["bot", "bot-authored"] ]
                  | map(. as [$k, $label]
                        | ($p | map(select(.bucket == $k))) as $sel
                        | if ($sel | length) == 0 then empty
                          else "\n_\($label)_ (\($sel | length))\n\n| PR | Title | Author | Age | Checks |\n| --- | --- | --- | --- | --- |\n"
                               + ($sel | map(row(.)) | join("\n")) + "\n"
                          end)
                  | join(""))
          end
        )
    end
  ' digest.json
} > "$out"

cat "$out"
