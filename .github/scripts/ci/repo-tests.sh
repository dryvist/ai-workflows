#!/usr/bin/env bash
# Runs this repository's unit tests. The Tests workflow and the Merge Gate's Repo Tests check both call this
# script, so the prompt catalog pin and the test command are defined once. Bun dependencies must already be
# installed.
set -euo pipefail

# The catalog is public and read anonymously. The pin lives once, in the checkout-prompts composite action.
CATALOG_REPO="https://github.com/dryvist/ai-llm-prompts.git"
CATALOG_DIR=".ai-llm-prompts"

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

CATALOG_SHA="$(sed -n 's/^ *ref: \([0-9a-f]\{40\}\) .*/\1/p' .github/actions/checkout-prompts/action.yml)"
[[ $CATALOG_SHA =~ ^[0-9a-f]{40}$ ]] || { echo "no catalog pin in checkout-prompts" >&2; exit 1; }

rm -rf -- "$CATALOG_DIR"
git clone --quiet --filter=blob:none --no-checkout "$CATALOG_REPO" "$CATALOG_DIR"
git -C "$CATALOG_DIR" sparse-checkout set --cone automation
git -C "$CATALOG_DIR" checkout --quiet --detach "$CATALOG_SHA"

bun test
