#!/usr/bin/env bash
# Mask the router base URL and its bare host in the run log.
#
# BASE_URL arrives as a secret, so Actions masks exact matches of it and nothing
# else. curl writes connection errors naming only the host, and that string is
# not the secret, so on a public repository a failed request would publish the
# endpoint. Register both forms before the first request.
#
# Source this rather than executing it; it produces no output of its own.
if [ -n "${BASE_URL:-}" ]; then
  echo "::add-mask::$BASE_URL"
  host="${BASE_URL#*://}"
  host="${host%%/*}"
  if [ -n "$host" ]; then
    echo "::add-mask::$host"
    echo "::add-mask::${host%%:*}"
  fi
fi
