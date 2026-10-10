#!/usr/bin/env bash
# Runs this repository's unit tests. The Tests workflow and the Merge Gate's Repo Tests check both call this
# script, so the prompt catalog pin and the test command are defined once. Bun dependencies must already be
# installed.
set -euo pipefail

# The catalog is public and read anonymously. CATALOG_SHA is the only copy of this pin.
CATALOG_REPO="https://github.com/dryvist/ai-llm-prompts.git"
CATALOG_SHA="0431be6994d51169b9f705ddeba958eb8a4d0fc4"
CATALOG_DIR=".ai-llm-prompts"

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

rm -rf -- "$CATALOG_DIR"
git clone --quiet --filter=blob:none --no-checkout "$CATALOG_REPO" "$CATALOG_DIR"
git -C "$CATALOG_DIR" sparse-checkout set --cone automation
git -C "$CATALOG_DIR" checkout --quiet --detach "$CATALOG_SHA"

bun test
