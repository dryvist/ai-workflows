#!/usr/bin/env bash
# Collect the merged commit's diff and only the documentation that plausibly
# describes it. Writes: diff.txt, docs.txt, changed.txt
#
# Selection, not everything: a doc file is included only when it mentions one of
# the changed paths, a path component, or a top-level identifier the diff added
# or removed. Sending the whole docs tree would cost tokens on every merge and
# bury the signal.
set -euo pipefail

max_diff_kb="${MAX_DIFF_KB:-150}"
max_docs_kb="${MAX_DOCS_KB:-200}"
docs_globs="${DOCS_GLOBS:-README.md,AGENTS.md,CLAUDE.md,docs/**/*.md}"

# --- the merged change -------------------------------------------------------
if git rev-parse --verify -q HEAD~1 > /dev/null; then
  git diff HEAD~1..HEAD > diff.full.txt
  git diff --name-only HEAD~1..HEAD > changed.txt
else
  # A root commit has no parent, so `git diff HEAD` would be empty; `git show`
  # diffs it against the empty tree instead.
  git show --format= HEAD > diff.full.txt
  git show --name-only --format= HEAD > changed.txt
fi

head -c "$((max_diff_kb * 1024))" diff.full.txt > diff.txt
if [ "$(wc -c < diff.full.txt)" -gt "$((max_diff_kb * 1024))" ]; then
  printf '\n[diff truncated at %s KiB]\n' "$max_diff_kb" >> diff.txt
fi
rm -f diff.full.txt

# --- terms that a doc would use to talk about this change --------------------
{
  # changed paths, plus each path component and basename-without-extension
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    printf '%s\n' "$p"
    base="${p##*/}"
    printf '%s\n%s\n' "$base" "${base%.*}"
    printf '%s\n' "$p" | tr '/' '\n'
  done < changed.txt
  # identifiers on added/removed lines: shell functions, yaml keys, exported names
  grep -E '^[+-][^+-]' diff.txt 2>/dev/null |
    grep -oE '[A-Za-z_][A-Za-z0-9_.-]{4,}' || true
} | sed -e 's/[[:space:]]//g' | { grep -E '^[A-Za-z0-9_.-]{4,}$' || true; } | sort -u > terms.txt

# --- the candidate documentation set ----------------------------------------
: > docsfiles.txt
IFS=',' read -r -a globs <<< "$docs_globs"
for g in "${globs[@]}"; do
  g="$(printf '%s' "$g" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -n "$g" ] || continue
  # `find` expresses the globs portably; ** means "at any depth".
  case "$g" in
    */'**'/*)
      root="${g%%/**}"
      pat="${g##*/}"
      [ -d "$root" ] && find "$root" -type f -name "$pat" >> docsfiles.txt
      ;;
    *)
      [ -f "$g" ] && printf '%s\n' "$g" >> docsfiles.txt
      ;;
  esac
done
sort -u -o docsfiles.txt docsfiles.txt

: > docs.txt
budget=$((max_docs_kb * 1024))
selected=0
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  # Skip a doc the merge itself already rewrote — it cannot be stale about itself.
  grep -qxF "$f" changed.txt && continue
  [ -s terms.txt ] || continue
  grep -qFf terms.txt "$f" 2>/dev/null || continue
  size="$(wc -c < "$f")"
  [ "$size" -le "$budget" ] || continue
  {
    printf '\n===== FILE: %s =====\n' "$f"
    cat "$f"
  } >> docs.txt
  budget=$((budget - size))
  selected=$((selected + 1))
done < docsfiles.txt

echo "changed files: $(wc -l < changed.txt), docs candidates: $(wc -l < docsfiles.txt), docs selected: $selected"
if [ "$selected" -eq 0 ]; then
  echo "no documentation mentions this change" > drift.skip
fi
