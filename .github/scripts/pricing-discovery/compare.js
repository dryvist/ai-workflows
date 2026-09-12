// Pure diff logic: registry entries vs. fetched upstream catalogs. No network,
// no filesystem — everything here takes plain objects so it is fully
// unit-testable (tests/pricing-discovery-compare.test.js).
const EPS = 1e-12;

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// OpenRouter's endpoint-ZDR field name: unconfirmed against a live sample.
// Checks every plausible shape and returns 'unknown' rather than guessing,
// since a false PASS is the exact failure mode (a delisted ZDR provider)
// this exists to catch.
function endpointIsZdr(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return 'unknown';
  if (typeof endpoint.zero_data_retention === 'boolean') return endpoint.zero_data_retention ? 'yes' : 'no';
  if (typeof endpoint.zdr === 'boolean') return endpoint.zdr ? 'yes' : 'no';
  const policy = endpoint.data_policy || endpoint.dataPolicy;
  if (policy && typeof policy.dataRetention === 'string') {
    return policy.dataRetention.toLowerCase() === 'none' ? 'yes' : 'no';
  }
  return 'unknown';
}

// Registry entries whose upstream price, context window, or ZDR-provider
// availability changed, or that have disappeared from OpenRouter's catalog.
function compareOpenRouter(registryEntries, openrouterModels, endpointsById) {
  const byId = new Map((openrouterModels || []).map((m) => [m.id, m]));
  const priceChanges = [];
  const delistings = [];
  const zdrRevocations = [];

  for (const entry of registryEntries) {
    if (entry.provider !== 'openrouter' || entry.enabled === false) continue;
    const upstreamId = entry.upstream_model_id || entry.client_model_id;
    const model = byId.get(upstreamId);
    if (!model) {
      delistings.push({ entry, reason: `${upstreamId} no longer appears in /api/v1/models` });
      continue;
    }

    const newIn = num(model.pricing && model.pricing.prompt);
    const newOut = num(model.pricing && model.pricing.completion);
    const oldIn = num(entry.input_cost_per_token);
    const oldOut = num(entry.output_cost_per_token);
    if (newIn !== null && oldIn !== null && Math.abs(newIn - oldIn) > EPS) {
      priceChanges.push({ entry, field: 'input_cost_per_token', oldValue: oldIn, newValue: newIn });
    }
    if (newOut !== null && oldOut !== null && Math.abs(newOut - oldOut) > EPS) {
      priceChanges.push({ entry, field: 'output_cost_per_token', oldValue: oldOut, newValue: newOut });
    }
    const newCtx = model.context_length;
    if (typeof newCtx === 'number' && entry.context_window && newCtx !== entry.context_window) {
      priceChanges.push({ entry, field: 'context_window', oldValue: entry.context_window, newValue: newCtx });
    }

    if (entry.zero_data_retention) {
      const endpoints = (endpointsById && endpointsById[upstreamId] && endpointsById[upstreamId].data
        && endpointsById[upstreamId].data.endpoints) || [];
      const verdicts = endpoints.map(endpointIsZdr);
      if (endpoints.length === 0) {
        zdrRevocations.push({ entry, reason: `no endpoints returned for ${upstreamId} — cannot confirm any ZDR provider remains` });
      } else if (verdicts.every((v) => v === 'no')) {
        zdrRevocations.push({ entry, reason: `every endpoint for ${upstreamId} reports data_retention (no ZDR provider left)` });
      } else if (verdicts.every((v) => v === 'unknown')) {
        zdrRevocations.push({ entry, reason: `${upstreamId}'s endpoint response did not match any known ZDR field — verify by hand` });
      }
      // At least one 'yes' verdict: ZDR still available, nothing to report.
    }
  }
  return { priceChanges, delistings, zdrRevocations };
}

// Any OpenRouter id NOT already in the registry whose price undercuts the
// cheapest ZDR-flagged paid rung already registered. Never auto-added — only
// reported, with a ZDR-gate result the caller attaches after a live probe.
function findNewCandidates(registryEntries, openrouterModels) {
  const zdrPaid = registryEntries.filter(
    (e) => e.zero_data_retention && num(e.input_cost_per_token) > 0 && e.enabled !== false,
  );
  if (zdrPaid.length === 0) return [];
  const cheapest = Math.min(...zdrPaid.map((e) => num(e.input_cost_per_token) + num(e.output_cost_per_token)));
  const known = new Set(registryEntries.map((e) => e.upstream_model_id || e.client_model_id));
  const candidates = [];
  for (const model of openrouterModels || []) {
    if (known.has(model.id)) continue;
    const total = num(model.pricing && model.pricing.prompt) + num(model.pricing && model.pricing.completion);
    if (Number.isFinite(total) && total > 0 && total < cheapest) {
      candidates.push({ id: model.id, totalPricePerToken: total, cheapestRegistered: cheapest });
    }
  }
  return candidates;
}

// models.dev's exact field shape is not verified against a live response
// (no network from here) — checks both `cost.input` and `pricing.input`
// rather than assuming one, since guessing wrong here would silently report
// nothing forever.
function freeTierCost(entry) {
  const cost = entry.cost || entry.pricing;
  return cost ? num(cost.input) : null;
}

// OpenCode Zen free-tier ids not already in the registry (design doc S3 item
// 3). Reported only — never auto-added, same posture as findNewCandidates.
function findNewFreeTierCandidates(registryEntries, modelsDevCatalog) {
  const known = new Set(registryEntries.map((e) => e.upstream_model_id || e.client_model_id));
  const entries = Array.isArray(modelsDevCatalog)
    ? modelsDevCatalog
    : Object.values(modelsDevCatalog || {});
  const candidates = [];
  for (const entry of entries) {
    if (!entry || !entry.id) continue;
    const provider = (entry.provider || '').toLowerCase();
    if (!provider.startsWith('opencode')) continue;
    if (known.has(entry.id)) continue;
    if (freeTierCost(entry) === 0) candidates.push({ id: entry.id, totalPricePerToken: 0, cheapestRegistered: null });
  }
  return candidates;
}

module.exports = {
  compareOpenRouter,
  findNewCandidates,
  findNewFreeTierCandidates,
  endpointIsZdr,
  num,
};
