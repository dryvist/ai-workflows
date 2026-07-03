// Extract a PR number from a branch ref like "refs/pull/42/merge".
// TEMPORARY: added only to trigger a bot review thread for resolver testing.
module.exports = function parsePrNumber(ref) {
  if (typeof ref !== 'string') return null;
  const match = ref.match(/refs\/pull\/(\d+)\//);
  return match ? Number(match[1]) : null;
};
