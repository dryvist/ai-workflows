// Build the PR body (mechanical field edits) and the Vikunja task body
// (anything needing a human decision: delisting, ZDR loss, a new cheaper
// candidate). Pure string building — no network, no filesystem.

function renderPrBody(priceChanges) {
  if (priceChanges.length === 0) return null;
  const rows = priceChanges
    .map((c) => `| \`${c.entry.client_model_id}\` | \`${c.field}\` | ${c.oldValue} | ${c.newValue} |`)
    .join('\n');
  return [
    '## What changed',
    '',
    'OpenRouter pricing/context-diff sweep. Editing only `llm-models.d/*.yml`:',
    'each row below is a straight field replacement, no new entries added and',
    'nothing removed.',
    '',
    '| Model | Field | Old | New |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    'Automated pricing-discovery run (ai-workflows). No manual review of these',
    'values was performed beyond the mechanical diff above.',
  ].join('\n');
}

function renderVikunjaTaskBody(delistings, zdrRevocations, newCandidates) {
  if (delistings.length === 0 && zdrRevocations.length === 0 && newCandidates.length === 0) return null;
  const lines = ['Weekly pricing-discovery sweep found items needing a human decision:', ''];
  if (delistings.length > 0) {
    lines.push('**Delisted from OpenRouter** (outage in waiting for anything still routing to it):');
    for (const d of delistings) lines.push(`- \`${d.entry.client_model_id}\`: ${d.reason}`);
    lines.push('');
  }
  if (zdrRevocations.length > 0) {
    lines.push('**Lost its last ZDR provider** (this registry entry claims zero_data_retention):');
    for (const z of zdrRevocations) lines.push(`- \`${z.entry.client_model_id}\`: ${z.reason}`);
    lines.push('');
  }
  if (newCandidates.length > 0) {
    lines.push('**New candidate** (cheaper than the cheapest registered ZDR paid rung, or a new free tier) — never auto-added:');
    for (const c of newCandidates) {
      const gate = c.zdrGate || 'not attempted (no credential)';
      const vs = c.cheapestRegistered == null ? '' : ` vs ${c.cheapestRegistered}/token registered`;
      lines.push(`- \`${c.id}\`: ${c.totalPricePerToken}/token${vs} — ZDR gate: ${gate}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { renderPrBody, renderVikunjaTaskBody };
