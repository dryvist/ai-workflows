// ZDR gate for a NEW candidate (not yet a router deployment, so this cannot go
// through the internal LiteLLM router the way an already-registered model's
// traffic does — there is no deployment to route through yet). Calls
// OpenRouter directly with the same extra_body.provider shape
// model-list.yaml.j2 renders for a registered ZDR entry: a live 200 is the
// only evidence that a real ZDR-compliant provider actually serves this id
// today, matching the same "N of N attempts served" bar 40-hermes-cloud.yml
// already sets for the free rung.
async function zdrGateCandidate(id, { apiKey, fetchFn = fetch, timeoutMs = 15000 } = {}) {
  if (!apiKey) return 'not attempted (no OPENROUTER_API_KEY)';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: id,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
        provider: { zdr: true, data_collection: 'deny' },
      }),
      signal: controller.signal,
    });
    return res.ok ? 'PASSED (live 200)' : `FAILED (HTTP ${res.status})`;
  } catch (err) {
    return `FAILED (${err && err.message ? err.message : 'request error'})`;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { zdrGateCandidate };
