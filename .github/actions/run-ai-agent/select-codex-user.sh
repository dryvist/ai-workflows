#!/usr/bin/env bash
# Choose how the Codex action drops privilege.
#
# drop-sudo refuses to run as root. On a root runner, Codex therefore runs as a
# dedicated non-root user through the unprivileged-user strategy, which runs
# `sudo -u <user> -- codex exec`. A non-root runner keeps drop-sudo.
#
# Inputs (environment): CODEX_HOME_DIR, CODEX_WORK_DIR. Outputs: appended to
# $GITHUB_OUTPUT as safety-strategy and codex-user.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "safety-strategy=drop-sudo" >> "$GITHUB_OUTPUT"
  echo "codex-user=" >> "$GITHUB_OUTPUT"
  exit 0
fi

user=ai-codex
id "$user" >/dev/null 2>&1 || useradd --create-home --shell /usr/sbin/nologin "$user"
mkdir -p "$CODEX_HOME_DIR"
# The checkout and the Codex home are created by root; the agent user must be
# able to write both.
chown -R "$user" "$CODEX_HOME_DIR" "$CODEX_WORK_DIR"
echo "safety-strategy=unprivileged-user" >> "$GITHUB_OUTPUT"
echo "codex-user=$user" >> "$GITHUB_OUTPUT"
