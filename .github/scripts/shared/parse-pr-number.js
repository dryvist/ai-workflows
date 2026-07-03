// Extract a PR number from a branch ref like "refs/pull/42/merge".
// TEMPORARY: added only to trigger a bot review thread for resolver testing.
module.exports = function parsePrNumber(ref) {
  const parts = ref.split('/');
  // Bug on purpose for the reviewer to flag: no validation that the segment
  // is numeric, and parseInt without a radix.
  return parseInt(parts[2]);
};
