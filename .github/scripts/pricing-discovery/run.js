#!/usr/bin/env node
// Driver: fetch OpenRouter + models.dev, diff against the registry, gate new
// candidates, render the PR/Vikunja bodies, and — unless DRY_RUN — apply the
// mechanical edits in place. Live fetches live here (thin, orchestration
// only); everything it calls is a pure, independently-tested function.
const fs = require('fs');
const { loadRegistry } = require('./registry.js');
const { compareOpenRouter, findNewCandidates, findNewFreeTierCandidates } = require('./compare.js');
const { applyEdits } = require('./apply-edits.js');
const { renderPrBody, renderVikunjaTaskBody } = require('./render.js');
const { zdrGateCandidate } = require('./zdr-gate.js');

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const registryDir = process.env.REGISTRY_DIR || 'llm-models.d';
  const dryRun = process.env.DRY_RUN === 'true';
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const authHeaders = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;

  const registryEntries = loadRegistry(registryDir);
  const { data: openrouterModels } = await fetchJson('https://openrouter.ai/api/v1/models', authHeaders);

  const endpointsById = {};
  const zdrIds = registryEntries
    .filter((e) => e.provider === 'openrouter' && e.zero_data_retention)
    .map((e) => e.upstream_model_id || e.client_model_id);
  for (const id of new Set(zdrIds)) {
    try {
      endpointsById[id] = await fetchJson(`https://openrouter.ai/api/v1/endpoints/${id}`, authHeaders);
    } catch (err) {
      console.log(`WARN: could not fetch endpoints for ${id}: ${err.message}`);
      endpointsById[id] = { data: { endpoints: [] } };
    }
  }

  let modelsDevCatalog = [];
  try {
    modelsDevCatalog = await fetchJson('https://models.dev/api.json');
  } catch (err) {
    console.log(`WARN: could not fetch models.dev catalog: ${err.message}`);
  }

  const { priceChanges, delistings, zdrRevocations } = compareOpenRouter(registryEntries, openrouterModels, endpointsById);
  const newCandidates = [
    ...findNewCandidates(registryEntries, openrouterModels),
    ...findNewFreeTierCandidates(registryEntries, modelsDevCatalog),
  ];
  for (const candidate of newCandidates) {
    candidate.zdrGate = await zdrGateCandidate(candidate.id, { apiKey });
  }

  const prBody = renderPrBody(priceChanges);
  const vikunjaBody = renderVikunjaTaskBody(delistings, zdrRevocations, newCandidates);
  if (prBody) fs.writeFileSync('pr-body.md', prBody);
  if (vikunjaBody) fs.writeFileSync('vikunja-body.md', vikunjaBody);

  console.log(`price/context changes: ${priceChanges.length}, delistings: ${delistings.length}, `
    + `ZDR revocations: ${zdrRevocations.length}, new candidates: ${newCandidates.length}`);

  if (!dryRun && priceChanges.length > 0) {
    const written = applyEdits(priceChanges, (msg) => console.log(`WARN: ${msg}`));
    console.log(`applied edits to: ${written.join(', ') || '(none — see warnings above)'}`);
  }

  const outFile = process.env.GITHUB_OUTPUT;
  if (outFile) {
    fs.appendFileSync(outFile, `has_pr_changes=${prBody && !dryRun ? 'true' : 'false'}\n`);
    fs.appendFileSync(outFile, `has_vikunja_task=${vikunjaBody && !dryRun ? 'true' : 'false'}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
